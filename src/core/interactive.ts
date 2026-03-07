import { existsSync } from 'node:fs';
import { confirm, intro, isCancel, multiselect, note, outro, select, text } from '@clack/prompts';
import pc from 'picocolors';
import { CONFIG_PATH, DEFAULT_CONFIG, mergeConfig, readConfigFile, resolveConfigPath } from './config.js';
import { discoverConfigProfiles, formatConfigPathForDisplay, getInstalledSchedulerInfo } from './scheduler.js';
import { discoverStaticPacks } from './staticPacks.js';
import type { CliOverrides, Config, FeedConfig } from './types.js';
import { isValidUsZipCode, normalizeSymbols, normalizeUsZipCode } from './utils.js';

interface InteractivePromptOptions {
	showIntro?: boolean;
	preferredConfigPath?: string;
	preferredNewConfig?: boolean;
}

export type PostDryRunAction = 'write' | 'edit' | 'exit';

function parseCsv(value: string): string[] {
	return value
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);
}

function parseSymbolInput(value: string): string[] {
	return value
		.split(/[\s,]+/)
		.map(item => item.trim())
		.filter(Boolean);
}

function keepExistingValue(value: string | undefined, fallback: string): string {
	const trimmed = value?.trim();
	return trimmed ? trimmed : fallback;
}

function buildConfigPathFromName(value: string): string {
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/\.config\.json$/i, '')
		.replace(/\.json$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return `configs/${normalized}.config.json`;
}

function slugifyLabel(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function buildFeedLabel(url: string): string | null {
	try {
		const parsedUrl = new URL(url);
		const hostname = parsedUrl.hostname.replace(/^www\./, '').replace(/\.(com|net|org|io|co|dev)$/i, '');
		const topicMatch = parsedUrl.pathname.match(/\/topic\/([^/?]+)/i);
		const sectionMatch = parsedUrl.pathname.match(/\/section\/topic\/([^/?]+)/i);
		const queryTopic = parsedUrl.searchParams.get('q');
		const topic = queryTopic ?? sectionMatch?.[1] ?? topicMatch?.[1];

		if (hostname.includes('news.google') && topic) {
			return slugifyLabel(`google-${topic}`);
		}

		const pathTail = parsedUrl.pathname
			.split('/')
			.filter(Boolean)
			.slice(-1)[0];
		const pieces = [hostname, topic ?? pathTail].filter(Boolean).map(part => slugifyLabel(part));
		const label = pieces.join('-');
		return label || null;
	} catch {
		return null;
	}
}

function buildJsonSourceDisplayLabel(url: string, sourceLabel?: string): string | null {
	if (sourceLabel?.trim()) {
		return sourceLabel.trim();
	}

	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return null;
	}
}

function buildSuggestedConfigName(config: Pick<Config, 'feeds' | 'stockQuotes' | 'hackerNews' | 'earthquakes' | 'weatherAlerts' | 'customJson' | 'githubActivity'>): string {
	const parts: string[] = [];

	if (config.feeds.length > 0) {
		parts.push(buildFeedLabel(config.feeds[0]?.url ?? '') ?? 'rss');
	}

	if (config.stockQuotes.enabled && config.stockQuotes.symbols.length > 0) {
		const stockLabel = config.stockQuotes.symbols.slice(0, 3).join('-');
		parts.push(slugifyLabel(stockLabel ? `${stockLabel}-stocks` : 'stocks'));
	}

	if (config.hackerNews.enabled) {
		parts.push(slugifyLabel(`hn-${config.hackerNews.feed}`));
	}

	if (config.earthquakes.enabled) {
		parts.push(slugifyLabel(config.earthquakes.zipCode ? `${config.earthquakes.zipCode}-earthquakes` : config.earthquakes.place ? `${config.earthquakes.place}-earthquakes` : 'earthquakes'));
	}

	if (config.weatherAlerts.enabled) {
		parts.push(slugifyLabel(config.weatherAlerts.zipCode ? `${config.weatherAlerts.zipCode}-weather` : config.weatherAlerts.area ? `${config.weatherAlerts.area}-weather` : 'weather-alerts'));
	}

	if (config.customJson.enabled && config.customJson.url.trim()) {
		parts.push(slugifyLabel(buildJsonSourceDisplayLabel(config.customJson.url, config.customJson.sourceLabel) ?? 'custom-json'));
	}

	if (config.githubActivity.enabled) {
		if (config.githubActivity.mode === 'repo-commits' && config.githubActivity.repo?.trim()) {
			parts.push(slugifyLabel(`${config.githubActivity.repo}-commits`));
		} else if (config.githubActivity.mode === 'org-commits' && config.githubActivity.org?.trim()) {
			parts.push(slugifyLabel(`${config.githubActivity.org}-commits`));
		} else if (config.githubActivity.mode === 'feed') {
			parts.push(slugifyLabel(config.githubActivity.feedKind === 'organization'
				? `${config.githubActivity.org ?? 'github'}-feed`
				: `github-${config.githubActivity.feedKind}`));
		}
	}

	return slugifyLabel(parts.slice(0, 3).join('-')) || 'thinking-phrases';
}

function ensureUniqueConfigPath(configName: string): string {
	const basePath = buildConfigPathFromName(configName);
	if (!existsSync(resolveConfigPath(basePath))) {
		return basePath;
	}

	let suffix = 2;
	while (true) {
		const candidatePath = buildConfigPathFromName(`${configName}-${suffix}`);
		if (!existsSync(resolveConfigPath(candidatePath))) {
			return candidatePath;
		}

		suffix += 1;
	}
}

function isMissingConfigName(value: string | undefined): boolean {
	return buildConfigPathFromName(value ?? '') === 'configs/.config.json';
}

function cancelFlow(message: string): null {
	outro(pc.yellow(message));
	return null;
}

function finishFlow<T>(value: T, message = 'Launching thinking phrases…', closeSession = true): T {
	if (closeSession) {
		outro(pc.green(message));
	} else {
		note(pc.green(message), 'Next step');
	}

	return value;
}

export async function promptForInteractiveOverrides(config: Config, options: InteractivePromptOptions = {}): Promise<CliOverrides | null> {
	if (options.showIntro ?? true) {
		intro(pc.bgCyan(pc.black(' thinking-phrases ')) + pc.cyan(' interactive mode'));
	}

	const installedScheduler = process.platform === 'darwin' ? getInstalledSchedulerInfo() : null;
	const availableConfigs = discoverConfigProfiles();
	const staticPacks = discoverStaticPacks();
	const currentConfigDisplay = formatConfigPathForDisplay(CONFIG_PATH);
	const preferredConfigDisplay = options.preferredConfigPath ? formatConfigPathForDisplay(options.preferredConfigPath) : currentConfigDisplay;
	const defaultConfigExists = existsSync(CONFIG_PATH);
	const installedConfigDisplay = installedScheduler?.configPath && existsSync(resolveConfigPath(installedScheduler.configPath))
		? formatConfigPathForDisplay(installedScheduler.configPath)
		: undefined;

	if (installedScheduler?.installed) {
		note(
			[
				`${pc.bold('Installed')}  ${pc.green('yes')}`,
				`${pc.bold('Interval')}   ${installedScheduler.intervalSeconds ? pc.cyan(`${installedScheduler.intervalSeconds}s`) : pc.dim('unknown')}`,
				`${pc.bold('Config')}     ${pc.yellow(formatConfigPathForDisplay(installedScheduler.configPath ?? CONFIG_PATH))}`,
			].join('\n'),
			'Current scheduler',
		);
	} else if (process.platform === 'darwin') {
		note(
			[
				`${pc.bold('Installed')}  ${pc.dim('no')}`,
				`${pc.bold('Config')}     ${pc.yellow(currentConfigDisplay)}`,
			].join('\n'),
			'Current scheduler',
		);
	}

	const installKind = await select({
		message: 'What kind of thinking phrases do you want to install?',
		initialValue: 'dynamic',
		options: [
			{ value: 'dynamic', label: 'Dynamic phrases', hint: 'RSS, stocks, models, scheduler support' },
			{ value: 'static', label: 'Static pack', hint: `${staticPacks.length} static packs available` },
			{ value: 'uninstall', label: 'Uninstall', hint: 'Remove thinking phrases and scheduler' },
		],
	});

	if (isCancel(installKind)) {
		return cancelFlow('Interactive run cancelled. No settings were changed.');
	}

	if (installKind === 'uninstall') {
		note(
			[
				`${pc.bold('Action')}    ${pc.yellow('uninstall thinking phrases')}`,
				`${pc.bold('Scheduler')} ${process.platform === 'darwin' ? pc.yellow('remove if installed') : pc.dim('not applicable')}`,
			].join('\n'),
			'Run summary',
		);

		return finishFlow({ uninstall: true }, 'Uninstalling thinking phrases…');
	}

	if (installKind === 'static') {
		if (staticPacks.length === 0) {
			note(pc.yellow('No static packs were found in out/. Run npm run build first.'), 'Static packs');
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const selectedPack = await select({
			message: 'Which static pack do you want to use?',
			initialValue: staticPacks[0]?.path,
			options: staticPacks.map(pack => ({
				value: pack.path,
				label: pack.name,
				hint: `${pack.phrases.length} phrases • ${pack.mode}`,
			})),
		});

		if (isCancel(selectedPack)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const runMode = await select({
			message: 'What do you want to do with this static pack?',
			initialValue: 'write',
			options: [
				{ value: 'dry-run', label: 'Preview only', hint: 'Show a few phrases' },
				{ value: 'write', label: 'Write to VS Code settings' },
			],
		});

		if (isCancel(runMode)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const overrides: CliOverrides = {
			staticPackPath: selectedPack,
			dryRun: runMode === 'dry-run',
		};

		if (runMode === 'write' && installedScheduler?.installed && process.platform === 'darwin') {
			const uninstallScheduler = await confirm({
				message: 'A scheduler is installed and may overwrite this static pack later. Uninstall it?',
				initialValue: true,
			});

			if (isCancel(uninstallScheduler)) {
				return cancelFlow('Interactive run cancelled. No settings were changed.');
			}

			overrides.uninstallScheduler = uninstallScheduler;
		}

		const selectedPackInfo = staticPacks.find(pack => pack.path === selectedPack);
		note(
			[
				`${pc.bold('Type')}      ${pc.green('static pack')}`,
				`${pc.bold('Pack')}      ${pc.cyan(selectedPackInfo?.name ?? selectedPack)}`,
				`${pc.bold('Phrases')}   ${pc.yellow(String(selectedPackInfo?.phrases.length ?? 0))}`,
				`${pc.bold('Mode')}      ${pc.yellow(selectedPackInfo?.mode ?? 'append')}`,
				`${pc.bold('Action')}    ${overrides.dryRun ? pc.blue('preview only') : pc.green('write settings')}`,
				`${pc.bold('Scheduler')} ${overrides.uninstallScheduler ? pc.yellow('uninstall current scheduler') : pc.dim(installedScheduler?.installed ? 'keep current scheduler' : 'none installed')}`,
			].join('\n'),
			'Run summary',
		);

		return finishFlow(overrides, overrides.dryRun ? 'Running static pack dry run…' : 'Installing static pack…', !overrides.dryRun);
	}

	const configOptions = Array.from(
		new Set([
			...availableConfigs,
			...(defaultConfigExists ? [currentConfigDisplay] : []),
			...(installedConfigDisplay ? [installedConfigDisplay] : []),
		]),
	).map(configPath => ({
		value: configPath,
		label: configPath,
		hint: configPath === installedConfigDisplay ? 'currently installed' : undefined,
	}));

	const selectedConfigOption = await select({
		message: 'Which dynamic config do you want to use?',
		initialValue: options.preferredNewConfig
			? '__new__'
			: configOptions.some(option => option.value === preferredConfigDisplay)
			? preferredConfigDisplay
			: configOptions.some(option => option.value === currentConfigDisplay)
				? currentConfigDisplay
				: configOptions[0]?.value,
		options: [
			...configOptions,
			{ value: '__new__', label: 'Create new config…', hint: 'Add another profile' },
		],
	});

	if (isCancel(selectedConfigOption)) {
		return cancelFlow('Interactive run cancelled. No settings were changed.');
	}

	const isNewConfig = selectedConfigOption === '__new__';
	const selectedConfigPath = isNewConfig ? undefined : selectedConfigOption;
	let selectedConfig = selectedConfigPath
		? mergeConfig(DEFAULT_CONFIG, readConfigFile(resolveConfigPath(selectedConfigPath)), {})
		: DEFAULT_CONFIG;
	let startWithNoSourcesSelected = isNewConfig;

	const selectedSources = await multiselect({
		message: 'Which sources do you want to use?',
		initialValues: startWithNoSourcesSelected
			? []
			: [
				...(selectedConfig.feeds.length > 0 ? ['rss'] : []),
				...(selectedConfig.stockQuotes.enabled ? ['stocks'] : []),
				...(selectedConfig.hackerNews.enabled ? ['hacker-news'] : []),
				...(selectedConfig.earthquakes.enabled ? ['earthquakes'] : []),
				...(selectedConfig.weatherAlerts.enabled ? ['weather-alerts'] : []),
				...(selectedConfig.customJson.enabled ? ['custom-json'] : []),
				...(selectedConfig.githubActivity.enabled ? ['github-activity'] : []),
			],
		options: [
			{ value: 'rss', label: 'RSS / Atom feeds', hint: `${selectedConfig.feeds.length} configured` },
			{ value: 'stocks', label: 'Live stock quotes', hint: selectedConfig.stockQuotes.symbols.join(', ') || 'none' },
			{ value: 'hacker-news', label: 'Hacker News', hint: `${selectedConfig.hackerNews.feed} feed` },
			{ value: 'earthquakes', label: 'Earthquakes', hint: selectedConfig.earthquakes.zipCode?.trim() || `M${selectedConfig.earthquakes.minMagnitude}+ nearby` },
			{ value: 'weather-alerts', label: 'Weather alerts', hint: selectedConfig.weatherAlerts.zipCode?.trim() || selectedConfig.weatherAlerts.area?.trim() || 'nationwide' },
			{ value: 'custom-json', label: 'Custom JSON API', hint: buildJsonSourceDisplayLabel(selectedConfig.customJson.url, selectedConfig.customJson.sourceLabel) || 'bring your own endpoint' },
			{ value: 'github-activity', label: 'GitHub activity', hint: selectedConfig.githubActivity.mode === 'repo-commits' ? (selectedConfig.githubActivity.repo?.trim() || 'repo commits') : selectedConfig.githubActivity.mode === 'org-commits' ? (selectedConfig.githubActivity.org?.trim() || 'org commits') : `feed • ${selectedConfig.githubActivity.feedKind}` },
		],
		required: true,
	});

	if (isCancel(selectedSources)) {
		return cancelFlow('Interactive run cancelled. No settings were changed.');
	}

	const useRss = selectedSources.includes('rss');
	const useStocks = selectedSources.includes('stocks');
	const useHackerNews = selectedSources.includes('hacker-news');
	const useEarthquakes = selectedSources.includes('earthquakes');
	const useWeatherAlerts = selectedSources.includes('weather-alerts');
	const useCustomJson = selectedSources.includes('custom-json');
	const useGitHubActivity = selectedSources.includes('github-activity');
	const usesArticleSources = useRss || useHackerNews || useEarthquakes || useWeatherAlerts || useCustomJson || useGitHubActivity;
	const overrides: CliOverrides = {
		createNewConfig: isNewConfig,
		configPath: selectedConfigPath,
		feeds: useRss ? selectedConfig.feeds : [],
		stockQuotes: {
			...selectedConfig.stockQuotes,
			enabled: useStocks,
		},
		hackerNews: {
			...selectedConfig.hackerNews,
			enabled: useHackerNews,
		},
		earthquakes: {
			...selectedConfig.earthquakes,
			enabled: useEarthquakes,
		},
		weatherAlerts: {
			...selectedConfig.weatherAlerts,
			enabled: useWeatherAlerts,
		},
		customJson: {
			...selectedConfig.customJson,
			enabled: useCustomJson,
		},
		githubActivity: {
			...selectedConfig.githubActivity,
			enabled: useGitHubActivity,
		},
		githubModels: {
			...selectedConfig.githubModels,
			enabled: usesArticleSources ? selectedConfig.githubModels.enabled : false,
		},
		phraseFormatting: { ...selectedConfig.phraseFormatting },
	};

	if (useRss) {
		const existingFeeds = selectedConfig.feeds.map(feed => feed.url).join(', ');
		const feedInput = await text({
			message: 'Comma-separated RSS / Atom feed URLs',
			placeholder: 'https://github.blog/feed/',
			initialValue: existingFeeds,
			validate(value) {
				const feeds = parseCsv(keepExistingValue(value, existingFeeds));
				return feeds.length > 0 ? undefined : 'Enter at least one feed URL or disable RSS above.';
			},
		});

		if (isCancel(feedInput)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		overrides.feeds = parseCsv(keepExistingValue(feedInput, existingFeeds)).map(url => ({ url } satisfies FeedConfig));

	}

	if (useStocks) {
		const existingSymbols = selectedConfig.stockQuotes.symbols.join(', ');
		const symbolInput = await text({
			message: 'Stock symbols',
			placeholder: existingSymbols || 'MSFT NVDA TSLA',
			validate(value) {
				return normalizeSymbols(parseSymbolInput(keepExistingValue(value, existingSymbols))).length > 0
					? undefined
					: 'Enter at least one stock symbol.';
			},
		});

		if (isCancel(symbolInput)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const includeMarketState = await confirm({
			message: 'Include market state labels like close / after-hours?',
			initialValue: selectedConfig.stockQuotes.includeMarketState,
		});

		if (isCancel(includeMarketState)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		overrides.stockQuotes = {
			...overrides.stockQuotes,
			enabled: true,
			symbols: normalizeSymbols(parseSymbolInput(keepExistingValue(symbolInput, existingSymbols))),
			includeMarketState,
		};
	}

	let resolvedZipCode: string | undefined;
	if (useEarthquakes || useWeatherAlerts) {
		const existingZipCode = selectedConfig.earthquakes.zipCode?.trim()
			|| selectedConfig.weatherAlerts.zipCode?.trim()
			|| '';
		const zipCodeInput = await text({
			message: useEarthquakes && useWeatherAlerts ? 'ZIP code for local earthquake + weather lookups' : useEarthquakes ? 'ZIP code for local earthquake lookups' : 'ZIP code for local weather lookups',
			placeholder: existingZipCode || '33312',
			validate(value) {
				const zipCode = normalizeUsZipCode(keepExistingValue(value, existingZipCode));
				return zipCode && isValidUsZipCode(zipCode) ? undefined : 'Enter a valid 5-digit US ZIP code.';
			},
		});

		if (isCancel(zipCodeInput)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		resolvedZipCode = normalizeUsZipCode(keepExistingValue(zipCodeInput, existingZipCode));
	}

	if (useHackerNews) {
		const hackerNewsFeed = await select({
			message: 'Which Hacker News feed do you want?',
			initialValue: selectedConfig.hackerNews.feed,
			options: [
				{ value: 'top', label: 'Top stories' },
				{ value: 'new', label: 'New stories' },
				{ value: 'best', label: 'Best stories' },
				{ value: 'ask', label: 'Ask HN' },
				{ value: 'show', label: 'Show HN' },
				{ value: 'jobs', label: 'Jobs' },
			],
		});

		if (isCancel(hackerNewsFeed)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const existingHnItems = String(selectedConfig.hackerNews.maxItems);
		const hackerNewsItems = await text({
			message: 'How many Hacker News items should be included?',
			placeholder: existingHnItems,
			initialValue: existingHnItems,
			validate(value) {
				const parsed = Number(keepExistingValue(value, existingHnItems));
				return Number.isInteger(parsed) && parsed > 0 ? undefined : 'Enter a positive integer.';
			},
		});

		if (isCancel(hackerNewsItems)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const existingHnScore = String(selectedConfig.hackerNews.minScore);
		const hackerNewsScore = await text({
			message: 'Minimum Hacker News score',
			placeholder: existingHnScore,
			initialValue: existingHnScore,
			validate(value) {
				const parsed = Number(keepExistingValue(value, existingHnScore));
				return Number.isFinite(parsed) && parsed >= 0 ? undefined : 'Enter zero or a positive number.';
			},
		});

		if (isCancel(hackerNewsScore)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		overrides.hackerNews = {
			...overrides.hackerNews,
			enabled: true,
			feed: hackerNewsFeed,
			maxItems: Number(keepExistingValue(hackerNewsItems, existingHnItems)),
			minScore: Number(keepExistingValue(hackerNewsScore, existingHnScore)),
		};
	}

	if (useEarthquakes) {
		overrides.earthquakes = {
			...selectedConfig.earthquakes,
			...overrides.earthquakes,
			enabled: true,
			zipCode: resolvedZipCode,
			place: undefined,
		};
	}

	if (useWeatherAlerts) {
		overrides.weatherAlerts = {
			...selectedConfig.weatherAlerts,
			...overrides.weatherAlerts,
			enabled: true,
			zipCode: resolvedZipCode,
			area: undefined,
		};
	}

	if (useCustomJson) {
		const existingJsonUrl = selectedConfig.customJson.url;
		const customJsonUrl = await text({
			message: 'JSON endpoint URL',
			placeholder: existingJsonUrl || 'https://example.com/api/articles.json',
			validate(value) {
				const resolvedValue = keepExistingValue(value, existingJsonUrl);
				if (!resolvedValue.trim()) {
					return 'Enter a JSON endpoint URL.';
				}

				try {
					new URL(resolvedValue);
					return undefined;
				} catch {
					return 'Enter a valid URL.';
				}
			},
		});

		if (isCancel(customJsonUrl)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const existingItemsPath = selectedConfig.customJson.itemsPath ?? '';
		const customJsonItemsPath = await text({
			message: 'Array path inside the JSON payload',
			placeholder: existingItemsPath || 'items',
		});

		if (isCancel(customJsonItemsPath)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const existingTitleField = selectedConfig.customJson.titleField;
		const customJsonTitleField = await text({
			message: 'Title field path',
			placeholder: existingTitleField || 'title',
			validate(value) {
				return keepExistingValue(value, existingTitleField).trim() ? undefined : 'Enter a field path for the title.';
			},
		});

		if (isCancel(customJsonTitleField)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const existingContentField = selectedConfig.customJson.contentField ?? '';
		const customJsonContentField = await text({
			message: 'Optional content field path',
			placeholder: existingContentField || 'summary',
		});

		if (isCancel(customJsonContentField)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const existingLinkField = selectedConfig.customJson.linkField ?? '';
		const customJsonLinkField = await text({
			message: 'Optional link field path',
			placeholder: existingLinkField || 'url',
		});

		if (isCancel(customJsonLinkField)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const existingSourceField = selectedConfig.customJson.sourceField ?? '';
		const customJsonSourceField = await text({
			message: 'Optional source field path',
			placeholder: existingSourceField || 'source.name',
		});

		if (isCancel(customJsonSourceField)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const existingSourceLabel = selectedConfig.customJson.sourceLabel ?? '';
		const customJsonSourceLabel = await text({
			message: 'Fallback source label',
			placeholder: existingSourceLabel || 'My API',
		});

		if (isCancel(customJsonSourceLabel)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const existingDateField = selectedConfig.customJson.dateField ?? '';
		const customJsonDateField = await text({
			message: 'Optional published date field path',
			placeholder: existingDateField || 'publishedAt',
		});

		if (isCancel(customJsonDateField)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const existingIdField = selectedConfig.customJson.idField ?? '';
		const customJsonIdField = await text({
			message: 'Optional unique ID field path',
			placeholder: existingIdField || 'id',
		});

		if (isCancel(customJsonIdField)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const existingJsonLimit = String(selectedConfig.customJson.maxItems);
		const customJsonLimit = await text({
			message: 'How many JSON items should be included?',
			placeholder: existingJsonLimit,
			validate(value) {
				const parsed = Number(keepExistingValue(value, existingJsonLimit));
				return Number.isInteger(parsed) && parsed > 0 ? undefined : 'Enter a positive integer.';
			},
		});

		if (isCancel(customJsonLimit)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		overrides.customJson = {
			...overrides.customJson,
			enabled: true,
			url: keepExistingValue(customJsonUrl, existingJsonUrl),
			itemsPath: keepExistingValue(customJsonItemsPath, existingItemsPath) || undefined,
			titleField: keepExistingValue(customJsonTitleField, existingTitleField),
			contentField: keepExistingValue(customJsonContentField, existingContentField) || undefined,
			linkField: keepExistingValue(customJsonLinkField, existingLinkField) || undefined,
			sourceField: keepExistingValue(customJsonSourceField, existingSourceField) || undefined,
			sourceLabel: keepExistingValue(customJsonSourceLabel, existingSourceLabel) || undefined,
			dateField: keepExistingValue(customJsonDateField, existingDateField) || undefined,
			idField: keepExistingValue(customJsonIdField, existingIdField) || undefined,
			maxItems: Number(keepExistingValue(customJsonLimit, existingJsonLimit)),
		};
	}

	if (useGitHubActivity) {
		const githubMode = await select({
			message: 'What kind of GitHub activity do you want?',
			initialValue: selectedConfig.githubActivity.mode,
			options: [
				{ value: 'repo-commits', label: 'Repo commits', hint: 'Recent commits from one repository' },
				{ value: 'org-commits', label: 'Org commits', hint: 'Recent public push activity across an org' },
				{ value: 'feed', label: 'GitHub feed', hint: 'Atom feeds from GitHub feed discovery or a custom URL' },
			],
		});

		if (isCancel(githubMode)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const existingGitHubItems = String(selectedConfig.githubActivity.maxItems);
		const githubItemsInput = await text({
			message: 'How many GitHub items should be included?',
			placeholder: existingGitHubItems,
			initialValue: existingGitHubItems,
			validate(value) {
				const parsed = Number(keepExistingValue(value, existingGitHubItems));
				return Number.isInteger(parsed) && parsed > 0 ? undefined : 'Enter a positive integer.';
			},
		});

		if (isCancel(githubItemsInput)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		const nextGitHubActivity = {
			...selectedConfig.githubActivity,
			...overrides.githubActivity,
			enabled: true,
			mode: githubMode,
			maxItems: Number(keepExistingValue(githubItemsInput, existingGitHubItems)),
		};

		if (githubMode === 'repo-commits') {
			const existingRepo = selectedConfig.githubActivity.repo?.trim() || 'microsoft/vscode';
			const repoInput = await text({
				message: 'Repository in owner/name format',
				placeholder: existingRepo,
				initialValue: existingRepo,
				validate(value) {
					return /^[^/\s]+\/[^/\s]+$/.test(keepExistingValue(value, existingRepo)) ? undefined : 'Enter a repo like owner/name.';
				},
			});

			if (isCancel(repoInput)) {
				return cancelFlow('Interactive run cancelled. No settings were changed.');
			}

			const existingBranch = selectedConfig.githubActivity.branch?.trim() || '';
			const branchInput = await text({
				message: 'Optional branch or SHA filter',
				placeholder: existingBranch || 'main',
				initialValue: existingBranch,
			});

			if (isCancel(branchInput)) {
				return cancelFlow('Interactive run cancelled. No settings were changed.');
			}

			overrides.githubActivity = {
				...nextGitHubActivity,
				repo: keepExistingValue(repoInput, existingRepo),
				branch: keepExistingValue(branchInput, existingBranch) || undefined,
				org: undefined,
				feedUrl: undefined,
			};
		} else if (githubMode === 'org-commits') {
			const existingOrg = selectedConfig.githubActivity.org?.trim() || 'github';
			const orgInput = await text({
				message: 'GitHub organization name',
				placeholder: existingOrg,
				initialValue: existingOrg,
				validate(value) {
					return keepExistingValue(value, existingOrg).trim() ? undefined : 'Enter an organization name.';
				},
			});

			if (isCancel(orgInput)) {
				return cancelFlow('Interactive run cancelled. No settings were changed.');
			}

			overrides.githubActivity = {
				...nextGitHubActivity,
				org: keepExistingValue(orgInput, existingOrg),
				repo: undefined,
				branch: undefined,
				feedUrl: undefined,
			};
		} else {
			const feedKind = await select({
				message: 'Which GitHub feed do you want?',
				initialValue: selectedConfig.githubActivity.feedKind,
				options: [
					{ value: 'timeline', label: 'Timeline' },
					{ value: 'current-user-public', label: 'Current user public' },
					{ value: 'current-user', label: 'Current user' },
					{ value: 'current-user-actor', label: 'Current user actor' },
					{ value: 'security-advisories', label: 'Security advisories' },
					{ value: 'organization', label: 'Organization feed' },
					{ value: 'custom-url', label: 'Custom Atom/RSS URL' },
				],
			});

			if (isCancel(feedKind)) {
				return cancelFlow('Interactive run cancelled. No settings were changed.');
			}

			let org = selectedConfig.githubActivity.org;
			if (feedKind === 'organization') {
				const existingOrg = selectedConfig.githubActivity.org?.trim() || 'github';
				const orgInput = await text({
					message: 'GitHub organization for the feed',
					placeholder: existingOrg,
					initialValue: existingOrg,
					validate(value) {
						return keepExistingValue(value, existingOrg).trim() ? undefined : 'Enter an organization name.';
					},
				});

				if (isCancel(orgInput)) {
					return cancelFlow('Interactive run cancelled. No settings were changed.');
				}

				org = keepExistingValue(orgInput, existingOrg);
			}

			let feedUrl = selectedConfig.githubActivity.feedUrl;
			if (feedKind === 'custom-url') {
				const existingFeedUrl = selectedConfig.githubActivity.feedUrl?.trim() || '';
				const feedUrlInput = await text({
					message: 'GitHub feed URL',
					placeholder: existingFeedUrl || 'https://github.com/security-advisories.atom',
					initialValue: existingFeedUrl,
					validate(value) {
						const resolvedValue = keepExistingValue(value, existingFeedUrl);
						if (!resolvedValue.trim()) {
							return 'Enter a GitHub feed URL.';
						}

						try {
							new URL(resolvedValue);
							return undefined;
						} catch {
							return 'Enter a valid URL.';
						}
					},
				});

				if (isCancel(feedUrlInput)) {
					return cancelFlow('Interactive run cancelled. No settings were changed.');
				}

				feedUrl = keepExistingValue(feedUrlInput, existingFeedUrl);
			}

			overrides.githubActivity = {
				...nextGitHubActivity,
				feedKind,
				org: feedKind === 'organization' ? org : undefined,
				feedUrl: feedKind === 'custom-url' ? feedUrl : undefined,
				repo: undefined,
				branch: undefined,
			};
		}

		overrides.githubActivity = {
			...overrides.githubActivity,
			tokenEnvVar: selectedConfig.githubActivity.tokenEnvVar || 'GITHUB_TOKEN',
		};
	}

	if (usesArticleSources) {
		const modelMode = await select({
			message: 'How should GitHub Models help with fetched content?',
			initialValue: selectedConfig.githubModels.enabled
				? (selectedConfig.githubModels.fetchArticleContent ? 'rewrite-with-context' : 'rewrite-only')
				: 'off',
			options: [
				{ value: 'off', label: 'Off', hint: 'Use the normal formatter only' },
				{ value: 'rewrite-only', label: 'Rewrite items', hint: 'Use GitHub Models on fetched items only' },
				{ value: 'rewrite-with-context', label: 'Rewrite with extra context', hint: 'Also fetch extra source content when available' },
			],
		});

		if (isCancel(modelMode)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		overrides.githubModels = {
			...(overrides.githubModels ?? selectedConfig.githubModels),
			enabled: modelMode !== 'off',
			fetchArticleContent: modelMode === 'rewrite-with-context',
		};
	}

	if (useRss) {
		const existingLimit = String(selectedConfig.limit);
		const limitInput = await text({
			message: 'How many RSS items should be considered?',
			initialValue: existingLimit,
			validate(value) {
				const parsed = Number(keepExistingValue(value, existingLimit));
				return Number.isInteger(parsed) && parsed > 0 ? undefined : 'Enter a positive integer.';
			},
		});

		if (isCancel(limitInput)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		overrides.limit = Number(keepExistingValue(limitInput, existingLimit));
	}

	overrides.mode = 'replace';

	const shouldDryRun = await confirm({
		message: 'Do you want to do a dry run first?',
		initialValue: true,
	});

	if (isCancel(shouldDryRun)) {
		return cancelFlow('Interactive run cancelled. No settings were changed.');
	}

	overrides.dryRun = shouldDryRun;

	if (!overrides.dryRun && process.platform === 'darwin') {
		overrides.installScheduler = true;
		overrides.schedulerConfigPath = selectedConfigPath;

		const existingInterval = String(installedScheduler?.intervalSeconds ?? 300);
		const intervalInput = await text({
			message: installedScheduler?.installed
				? 'How often should the scheduler run? Enter interval in seconds'
				: 'How often should it run? Enter interval in seconds',
			placeholder: '300',
			initialValue: existingInterval,
			validate(value) {
				const parsed = Number(keepExistingValue(value, existingInterval));
				return Number.isInteger(parsed) && parsed > 0 ? undefined : 'Enter a positive integer in seconds.';
			},
		});

		if (isCancel(intervalInput)) {
			return cancelFlow('Interactive run cancelled. No settings were changed.');
		}

		overrides.schedulerIntervalSeconds = Number(keepExistingValue(intervalInput, existingInterval));
	} else if (!overrides.dryRun && process.platform !== 'darwin') {
		note(
			pc.dim('Scheduler install is currently only wired for macOS launchd. Settings will still be written.'),
			'Scheduler',
		);
	}

	note(
		[
			`${pc.bold('Sources')}  ${[
				useRss ? pc.cyan(`RSS (${overrides.feeds?.length ?? 0})`) : pc.dim('RSS off'),
				useStocks ? pc.green(`Stocks (${overrides.stockQuotes?.symbols.length ?? 0})`) : pc.dim('Stocks off'),
				useHackerNews ? pc.magenta(`HN (${overrides.hackerNews?.feed ?? selectedConfig.hackerNews.feed})`) : pc.dim('HN off'),
				useEarthquakes ? pc.yellow(`Quakes (${overrides.earthquakes?.zipCode ?? selectedConfig.earthquakes.zipCode ?? 'nearby'})`) : pc.dim('Quakes off'),
				useWeatherAlerts ? pc.blue(`Weather (${overrides.weatherAlerts?.zipCode ?? selectedConfig.weatherAlerts.zipCode ?? selectedConfig.weatherAlerts.area ?? 'US'})`) : pc.dim('Weather off'),
				useCustomJson ? pc.white(`JSON (${buildJsonSourceDisplayLabel(overrides.customJson?.url ?? selectedConfig.customJson.url, overrides.customJson?.sourceLabel ?? selectedConfig.customJson.sourceLabel) ?? 'custom'})`) : pc.dim('JSON off'),
				useGitHubActivity ? pc.green(`GitHub (${overrides.githubActivity?.mode ?? selectedConfig.githubActivity.mode})`) : pc.dim('GitHub off'),
			].join(pc.dim('  •  '))}`,
			`${pc.bold('Models')}   ${overrides.githubModels?.enabled ? pc.magenta('enabled') : pc.dim('disabled')}`,
				`${pc.bold('Mode')}     ${pc.yellow(overrides.mode ?? selectedConfig.mode)}`,
			`${pc.bold('Action')}   ${overrides.dryRun ? pc.blue('preview only') : pc.green('write settings')}`,
			`${pc.bold('Schedule')} ${overrides.installScheduler ? pc.green(`every ${overrides.schedulerIntervalSeconds ?? 300}s`) : pc.dim('not installing')}`,
			`${pc.bold('Config')}   ${isNewConfig ? pc.cyan('new config (auto-name if blank)') : pc.cyan(selectedConfigPath ?? '')}`,
		].join('\n'),
		'Run summary',
	);

	return finishFlow(overrides, overrides.dryRun ? 'Running dynamic dry run…' : 'Installing dynamic phrases…', !overrides.dryRun);
}

export async function promptForPostDryRunAction(subject: 'dynamic phrases' | 'static pack'): Promise<PostDryRunAction | null> {
	const nextAction = await select({
		message: `Dry run complete for ${subject}. What do you want to do next?`,
		initialValue: 'write',
		options: [
			{ value: 'write', label: 'Write to VS Code settings now' },
			{ value: 'edit', label: 'Edit options again' },
			{ value: 'exit', label: 'Exit without changing settings' },
		],
	});

	if (isCancel(nextAction)) {
		return null;
	}

	return nextAction as PostDryRunAction;
}

export async function promptForConfigName(config: Pick<Config, 'feeds' | 'stockQuotes' | 'hackerNews' | 'earthquakes' | 'weatherAlerts' | 'customJson' | 'githubActivity'>): Promise<string | null> {
	const suggestedName = buildSuggestedConfigName(config);
	const configName = await text({
		message: 'Config name',
		placeholder: suggestedName,
		validate(value) {
			return value?.trim() && isMissingConfigName(value) ? 'Enter a valid config name.' : undefined;
		},
	});

	if (isCancel(configName)) {
		return null;
	}

	return ensureUniqueConfigPath(configName?.trim() ? configName : suggestedName);
}

export async function promptForDynamicSchedulerAfterDryRun(): Promise<Pick<CliOverrides, 'installScheduler' | 'schedulerIntervalSeconds'> | null> {
	const installedScheduler = process.platform === 'darwin' ? getInstalledSchedulerInfo() : null;

	const existingInterval = String(installedScheduler?.intervalSeconds ?? 300);
	const intervalInput = await text({
		message: installedScheduler?.installed
			? 'How often should the scheduler run? Enter interval in seconds'
			: 'How often should it run? Enter interval in seconds',
		placeholder: '300',
		initialValue: existingInterval,
		validate(value) {
			const parsed = Number(keepExistingValue(value, existingInterval));
			return Number.isInteger(parsed) && parsed > 0 ? undefined : 'Enter a positive integer in seconds.';
		},
	});

	if (isCancel(intervalInput)) {
		return null;
	}

	return {
		installScheduler: true,
		schedulerIntervalSeconds: Number(keepExistingValue(intervalInput, existingInterval)),
	};
}

export async function promptForStaticSchedulerAfterDryRun(): Promise<boolean | null> {
	const uninstallScheduler = await confirm({
		message: 'A scheduler is installed and may overwrite this static pack later. Uninstall it?',
		initialValue: true,
	});

	if (isCancel(uninstallScheduler)) {
		return null;
	}

	return uninstallScheduler;
}