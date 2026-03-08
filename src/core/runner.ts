import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { outro, spinner } from '@clack/prompts';
import pc from 'picocolors';

import { DEFAULT_CONFIG, mergeConfig, parseArgs, readConfigFile, resolveConfigPath, validateConfig, writeConfigFile } from './config.js';
import { buildModelArticlePhrases } from './githubModels.js';
import {
  promptForConfigName,
  promptForInteractiveOverrides,
  promptForPostDryRunAction,
  promptForStaticSchedulerAfterDryRun,
} from './interactive.js';
import { cacheModelResults, clearModelCache, getMergedPhrases, isSourceStale, markSourceFetched, partitionArticlesByModelCache, storePhrases } from './phraseCache.js';
import { DEFAULT_SCHEDULER_INTERVAL_SECONDS, formatConfigPathForDisplay, getInstalledSchedulerInfo } from './scheduler.js';
import { dynamicSources } from './sourceCatalog.js';
import { getStaticPackByPath } from './staticPacks.js';
import { TaskHealthTracker } from './taskHealth.js';
import { formatArticlePhrase } from './phraseFormats.js';
import type { ArticleItem, Config } from './types.js';
import { dedupePhrases, loadDotEnv, logInfo, resolveSettingsPath, truncate } from './utils.js';

import { hydrateArticleContent } from '../sources/rss.js';
import { buildStockPhrase } from '../sources/stocks.js';
import { removeVsCodeThinkingPhrases, writeVsCodeSettings } from '../sinks/vscodeSettings.js';

function buildBasicArticlePhrase(article: ArticleItem, config: Config): string | null {
	if (article.displayPhrase?.trim()) {
		return truncate(article.displayPhrase.trim(), config.phraseFormatting.maxLength);
	}

  if (!article.title?.trim()) {
    return null;
  }

  return truncate(
    formatArticlePhrase(
      { source: article.source, title: article.title, time: article.time },
      {
        includeSource: config.phraseFormatting.includeSource,
        includeTime: config.phraseFormatting.includeTime,
        template: config.phraseFormatting.templates?.article,
      },
    ),
    config.phraseFormatting.maxLength,
  );
}

function buildBasicArticlePhrases(articles: ArticleItem[], config: Config): string[] {
  return dedupePhrases(
    articles
      .map(article => buildBasicArticlePhrase(article, config))
      .filter((phrase): phrase is string => Boolean(phrase)),
  );
}

function installMacScheduler(intervalSeconds: number, configPath?: string): void {
  const installerPath = resolve(process.cwd(), 'scripts/install-rss-updater.zsh');
  const args = [installerPath, String(intervalSeconds)];
  if (configPath) {
    args.push(configPath);
  }

  execFileSync('zsh', args, { stdio: 'inherit' });
}

function uninstallMacScheduler(): void {
  const uninstallPath = resolve(process.cwd(), 'scripts/uninstall-rss-updater.zsh');
  execFileSync('zsh', [uninstallPath], { stdio: 'inherit' });
}

function triggerMacSchedulerNow(): void {
  const triggerPath = resolve(process.cwd(), 'scripts/trigger-thinking-phrases-scheduler.zsh');
  execFileSync('zsh', [triggerPath], { stdio: 'inherit' });
}

function syncGitHubLookbackToScheduler(config: Config, intervalSeconds: number): Config {
  if (!config.githubActivity.enabled) {
    return config;
  }

	// Use the scheduler cadence as a hint, not a razor-thin filter.
	// A 5 minute schedule should not mean we only look back 5 minutes,
	// because bursty sources can easily produce zero items in that window.
  const derivedLookbackHours = Math.max(intervalSeconds / 3600, 1);

  return {
    ...config,
    githubActivity: {
      ...config.githubActivity,
      sinceHours: derivedLookbackHours,
    },
  };
}

export async function runDynamicPhrases(): Promise<void> {
  loadDotEnv(resolve(process.cwd(), '.env'));

  const args = parseArgs(process.argv.slice(2));
  const isInteractive = Boolean(args.interactive);
  let uninstall = Boolean(args.uninstall);
  const clearCache = Boolean(args.clearCache);
  let triggerSchedulerNow = Boolean(args.triggerSchedulerNow);
  let createNewConfig = Boolean(args.createNewConfig);
  let dryRun = Boolean(args.dryRun);
  let installScheduler = Boolean(args.installScheduler);
  let uninstallScheduler = Boolean(args.uninstallScheduler);
  let schedulerIntervalSeconds = args.schedulerIntervalSeconds ?? DEFAULT_SCHEDULER_INTERVAL_SECONDS;
  let schedulerConfigPath = args.schedulerConfigPath;
  let staticPackPath = args.staticPackPath;
  let configPath: string | undefined = resolveConfigPath(args.configPath);
  let fileConfig = configPath ? readConfigFile(configPath) : {};
  let config = mergeConfig(DEFAULT_CONFIG, fileConfig, args);

  if (clearCache) {
    clearModelCache();
    logInfo(config, 'Model cache cleared');
  }

  let interactivePass = 0;
  const interactiveSpinner = isInteractive ? spinner({ indicator: 'timer' }) : null;
  let interactiveSpinnerActive = false;

  const startInteractiveProgress = (message: string): void => {
    if (!interactiveSpinner) {
      return;
    }

    if (interactiveSpinnerActive) {
      interactiveSpinner.message(message);
      return;
    }

    interactiveSpinner.start(message);
    interactiveSpinnerActive = true;
  };

  const stopInteractiveProgress = (message: string): void => {
    if (!interactiveSpinner || !interactiveSpinnerActive) {
      return;
    }

    interactiveSpinner.stop(message);
    interactiveSpinnerActive = false;
  };

  const failInteractiveProgress = (message: string): void => {
    if (!interactiveSpinner || !interactiveSpinnerActive) {
      return;
    }

    interactiveSpinner.error(message);
    interactiveSpinnerActive = false;
  };

  while (true) {
    if (isInteractive) {
      const interactiveOverrides = await promptForInteractiveOverrides(config, {
        showIntro: interactivePass === 0,
        preferredConfigPath: createNewConfig ? undefined : configPath,
        preferredNewConfig: createNewConfig,
      });

      if (!interactiveOverrides) {
        return;
      }

      interactivePass += 1;
      uninstall = Boolean(interactiveOverrides.uninstall);
      triggerSchedulerNow = Boolean(interactiveOverrides.triggerSchedulerNow);
      createNewConfig = Boolean(interactiveOverrides.createNewConfig);
      dryRun = Boolean(interactiveOverrides.dryRun);
      installScheduler = Boolean(interactiveOverrides.installScheduler);
      uninstallScheduler = Boolean(interactiveOverrides.uninstallScheduler);
      schedulerIntervalSeconds = interactiveOverrides.schedulerIntervalSeconds ?? DEFAULT_SCHEDULER_INTERVAL_SECONDS;
      schedulerConfigPath = interactiveOverrides.schedulerConfigPath;
      staticPackPath = interactiveOverrides.staticPackPath;
      configPath = createNewConfig ? undefined : resolveConfigPath(interactiveOverrides.configPath ?? args.configPath);
      fileConfig = configPath ? readConfigFile(configPath) : {};
      config = mergeConfig(DEFAULT_CONFIG, fileConfig, interactiveOverrides);
    }

    const settingsPath = resolveSettingsPath(config.target, config.settingsPath);

    if (triggerSchedulerNow) {
      if (process.platform !== 'darwin') {
        throw new Error('Scheduler triggering is currently only available on macOS.');
      }

      const installedScheduler = getInstalledSchedulerInfo();
      if (!installedScheduler.installed) {
        throw new Error('No macOS scheduler is currently installed.');
      }

      console.log(pc.cyan('Triggering macOS launchd scheduler now...'));
      triggerMacSchedulerNow();
      return;
    }

    if (uninstall) {
      const removedThinkingPhrases = removeVsCodeThinkingPhrases(settingsPath);
      if (removedThinkingPhrases) {
        console.log(pc.green(`Removed chat.agent.thinking.phrases from "${settingsPath}"`));
      } else {
        console.log(pc.dim(`No chat.agent.thinking.phrases entry found in "${settingsPath}"`));
      }

      if (process.platform === 'darwin') {
        const installedScheduler = getInstalledSchedulerInfo();
        if (installedScheduler.installed) {
          console.log(pc.cyan('Uninstalling macOS launchd scheduler...'));
          uninstallMacScheduler();
          console.log(pc.green('Scheduler uninstalled.'));
        } else {
          console.log(pc.dim('No macOS scheduler was installed.'));
        }
      }

      return;
    }

    if (staticPackPath) {
      const pack = getStaticPackByPath(staticPackPath);
      if (!pack) {
        throw new Error(`Static pack not found: ${staticPackPath}`);
      }

      if (dryRun) {
        console.log(pc.bold(pc.cyan(`Dry run only — would write ${pack.phrases.length} phrases from ${pack.name} to "${settingsPath}"`)));
        console.log(pc.dim('Preview:'));
        for (const phrase of pack.phrases.slice(0, 5)) {
          console.log(`${pc.green('•')} ${phrase}`);
        }

        if (!isInteractive) {
          return;
        }

        const nextAction = await promptForPostDryRunAction('static pack');
        if (!nextAction || nextAction === 'exit') {
          outro(pc.yellow('Interactive run finished after preview. No settings were changed.'));
          return;
        }

        if (nextAction === 'edit') {
          continue;
        }

        dryRun = false;
        if (process.platform === 'darwin' && getInstalledSchedulerInfo().installed) {
          const nextUninstallScheduler = await promptForStaticSchedulerAfterDryRun();
          if (nextUninstallScheduler === null) {
            return;
          }

          uninstallScheduler = nextUninstallScheduler;
        }

        outro(pc.green('Installing static pack…'));
      }

      writeVsCodeSettings(settingsPath, pack.phrases, pack.mode);
      console.log(pc.green(`Updated "${settingsPath}"`));
      console.log(pc.bold(`Installed static pack ${pack.name} with ${pack.phrases.length} phrases.`));

      if (uninstallScheduler && process.platform === 'darwin') {
        console.log(pc.cyan('Uninstalling macOS launchd scheduler so it does not overwrite this static pack...'));
        uninstallMacScheduler();
        console.log(pc.green('Scheduler uninstalled.'));
      }

      if (process.platform === 'darwin') {
        const installedScheduler = getInstalledSchedulerInfo();
        if (installedScheduler.installed) {
          console.log(pc.dim(`Scheduler still installed → ${formatConfigPathForDisplay(installedScheduler.configPath ?? configPath ?? resolveConfigPath(args.configPath))}`));
        }
      }

      return;
    }

    validateConfig(config);

    const healthTracker = new TaskHealthTracker({
      dryRun,
      configPath,
      settingsPath,
    });

    try {
      const enabledSources = dynamicSources.filter(source => source.isEnabled(config));
      // In dry-run or interactive mode, fetch everything regardless of intervals
      const respectIntervals = !dryRun && !isInteractive;
      const sourcesToFetch = respectIntervals
        ? enabledSources.filter(source => {
            const stale = isSourceStale(source.type, config);
            if (!stale) {
              logInfo(config, `Skipping ${source.type} — interval not elapsed`);
            }

            return stale;
          })
        : enabledSources;

      healthTracker.setSources(enabledSources.map(source => source.type));
      healthTracker.setPhase('fetching-sources', `Running ${sourcesToFetch.length} of ${enabledSources.length} source${enabledSources.length === 1 ? '' : 's'}`);
      logInfo(config, `Running ${sourcesToFetch.length} of ${enabledSources.length} enabled source(s) (${enabledSources.length - sourcesToFetch.length} skipped — not yet stale)`);

      startInteractiveProgress(`Fetching ${sourcesToFetch.length} dynamic source${sourcesToFetch.length === 1 ? '' : 's'}`);
      const sourceResults = await Promise.all(
        sourcesToFetch.map(async source => {
          healthTracker.startSource(source.type);
          try {
            const items = await source.fetch(config);
            markSourceFetched(source.type);
            healthTracker.completeSource(source.type, items.length);
            return { type: source.type, items };
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            healthTracker.failSource(source.type, message);
            throw error;
          }
        }),
      );

      // Build phrases per-source and persist to the phrase store
      let totalArticles = 0;
      let totalStocks = 0;
      for (const { type, items } of sourceResults) {
        const articles = items.filter((item): item is ArticleItem => item.type === 'article');
        const stocks = items.filter(item => item.type === 'stock');
        totalArticles += articles.length;
        totalStocks += stocks.length;

        startInteractiveProgress(`Preparing ${items.length} item${items.length === 1 ? '' : 's'} from ${type}`);
        healthTracker.setPhase('formatting-phrases', `Preparing ${items.length} item${items.length === 1 ? '' : 's'} from ${type}`);

        const stockPhrases = dedupePhrases(stocks.map(stock => buildStockPhrase(stock, config)));

        // Articles with skipModelRewrite keep their displayPhrase as-is (e.g. weather conditions)
        const modelEligible = articles.filter(a => !a.skipModelRewrite);
        const preFormatted = articles.filter(a => a.skipModelRewrite);
        const preFormattedPhrases = buildBasicArticlePhrases(preFormatted, config);

        const hydratedArticles = config.githubModels.enabled && config.githubModels.fetchArticleContent
          ? await hydrateArticleContent(modelEligible, config)
          : modelEligible;

        const fallbackArticlePhrases = buildBasicArticlePhrases(hydratedArticles, config);
        let articlePhrases: string[];
        if (config.githubModels.enabled && hydratedArticles.length > 0) {
          const { uncached, cachedPhrases } = partitionArticlesByModelCache(hydratedArticles, config);
          if (uncached.length === 0) {
            logInfo(config, `All ${type} articles already in model cache — skipping GitHub Models API`);
            articlePhrases = cachedPhrases.length > 0 ? cachedPhrases : fallbackArticlePhrases;
          } else {
            try {
              const newPhrases = await buildModelArticlePhrases(uncached, config, {
                sourceType: type,
                onProgress: (message: string) => {
                  startInteractiveProgress(message);
                  healthTracker.setPhase('formatting-phrases', message);
                },
                onPhrases: (phrases: string[]) => {
                  const latest = phrases[phrases.length - 1];
                  if (latest) {
                    const truncated = latest.length > 100 ? latest.slice(0, 100) + '…' : latest;
                    startInteractiveProgress(`${pc.dim('•')} ${truncated}`);
                  }
                },
              });
              cacheModelResults(uncached, newPhrases, config);
              articlePhrases = [...cachedPhrases, ...newPhrases];
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              const warning = `GitHub Models formatting skipped for ${type} — ${message}`;
              logInfo(config, warning);
              healthTracker.addWarning(warning);
              startInteractiveProgress('GitHub Models unavailable, falling back to feed phrases');
              healthTracker.setPhase('formatting-phrases', 'GitHub Models unavailable, falling back to feed phrases');
              articlePhrases = cachedPhrases.length > 0 ? [...cachedPhrases, ...fallbackArticlePhrases] : fallbackArticlePhrases;
            }
          }
        } else {
          articlePhrases = fallbackArticlePhrases;
        }

        articlePhrases = dedupePhrases([...preFormattedPhrases, ...articlePhrases]);
        const sourcePhrases = dedupePhrases([...stockPhrases, ...articlePhrases]);
        storePhrases(type, sourcePhrases);
        logInfo(config, `Stored ${sourcePhrases.length} phrases for ${type}`);
      }

      // Merge all stored phrases (freshly fetched + retained from previous runs)
      // Fair round-robin ensures every source gets representation
      const phrases = dedupePhrases(getMergedPhrases(config.limit));
      stopInteractiveProgress(dryRun ? `Dry run ready — generated ${phrases.length} phrases` : `Generated ${phrases.length} phrases`);
      if (phrases.length === 0 && sourcesToFetch.length === 0) {
        logInfo(config, 'All sources still fresh — nothing to update this cycle');
        healthTracker.succeed({ sourceCount: 0, articleCount: 0, stockCount: 0, phraseCount: 0 }, 'All sources still fresh');
        return;
      }

      if (phrases.length === 0) {
        throw new Error('No thinking phrases were generated from the configured sources.');
      }

      const summary = {
        sourceCount: enabledSources.length,
        articleCount: totalArticles,
        stockCount: totalStocks,
        phraseCount: phrases.length,
      };

      if (dryRun) {
        console.log(pc.bold(pc.cyan(`Dry run only — would write ${phrases.length} phrases to "${settingsPath}"`)));
        console.log(pc.dim('Preview:'));
        for (const phrase of phrases.slice(0, 5)) {
          console.log(`${pc.green('•')} ${phrase}`);
        }

        if (!isInteractive) {
          healthTracker.succeed(summary, `Dry run generated ${phrases.length} phrases`);
          return;
        }

        const nextAction = await promptForPostDryRunAction('dynamic phrases');
        if (!nextAction || nextAction === 'exit') {
          healthTracker.succeed(summary, `Dry run generated ${phrases.length} phrases`);
          outro(pc.yellow('Interactive run finished after preview. No settings were changed.'));
          return;
        }

        if (nextAction === 'edit') {
          healthTracker.succeed(summary, `Dry run generated ${phrases.length} phrases`);
          continue;
        }

        dryRun = false;
        healthTracker.setDryRun(false);
        // Scheduler config was already collected upfront in promptForInteractiveOverrides
        config = syncGitHubLookbackToScheduler(config, schedulerIntervalSeconds);

        outro(pc.green('Installing dynamic phrases…'));
      }

      if (isInteractive) {
        if (createNewConfig) {
          const namedConfigPath = await promptForConfigName(config);
          if (!namedConfigPath) {
            outro(pc.yellow('Interactive run cancelled. No settings were changed.'));
            return;
          }

          configPath = resolveConfigPath(namedConfigPath);
          schedulerConfigPath = namedConfigPath;
          createNewConfig = false;
        }

        if (!configPath) {
          throw new Error('Interactive config path was not resolved before save.');
        }

        writeConfigFile(configPath, config);
        console.log(pc.dim(`Saved dynamic config → ${formatConfigPathForDisplay(configPath)}`));
      }

      healthTracker.setPhase('writing-settings', `Writing ${phrases.length} phrases to VS Code settings`);
      writeVsCodeSettings(settingsPath, phrases, config.mode);
      console.log(pc.green(`Updated "${settingsPath}"`));
      console.log(
        pc.bold(
          `Replaced thinking phrases with ${phrases.length} phrases from ${enabledSources.length} source(s)${config.githubModels.enabled ? ' using GitHub Models formatting when available' : ''}`,
        ),
      );

      if (installScheduler && process.platform === 'darwin') {
        healthTracker.setPhase('updating-scheduler', `Installing macOS scheduler for every ${schedulerIntervalSeconds} seconds`);
        config = syncGitHubLookbackToScheduler(config, schedulerIntervalSeconds);
        const resolvedSchedulerConfigPath = resolveConfigPath(schedulerConfigPath ?? configPath ?? args.configPath);
        writeConfigFile(resolvedSchedulerConfigPath, config);
        console.log(pc.cyan(`Installing macOS launchd scheduler for every ${schedulerIntervalSeconds} seconds...`));
        installMacScheduler(schedulerIntervalSeconds, resolvedSchedulerConfigPath);
        console.log(pc.green(`Scheduler installed for every ${schedulerIntervalSeconds} seconds using ${resolvedSchedulerConfigPath}.`));
      }

      if (process.platform === 'darwin') {
        const installedScheduler = getInstalledSchedulerInfo();
        if (installedScheduler.installed) {
          console.log(
            pc.dim(
              `Scheduler status: installed${installedScheduler.intervalSeconds ? ` every ${installedScheduler.intervalSeconds}s` : ''} → ${formatConfigPathForDisplay(installedScheduler.configPath ?? configPath ?? resolveConfigPath(args.configPath))}`,
            ),
          );
        }
      }

      healthTracker.succeed(summary, `Completed run with ${phrases.length} phrases from ${enabledSources.length} source(s)`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failInteractiveProgress('Dynamic run failed');
      healthTracker.fail(message);
      throw error;
    }
  }
}
