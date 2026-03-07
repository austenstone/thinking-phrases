import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import type {
  CliOverrides,
  Config,
  CustomJsonConfig,
  EarthquakeConfig,
  GitHubActivityConfig,
  GitHubModelsConfig,
  HackerNewsConfig,
  PhraseFormatting,
  StockQuoteConfig,
  WeatherAlertsConfig,
} from './types.js';
import { expandHome, isValidUsZipCode, normalizeSymbols, normalizeUsZipCode } from './utils.js';

export const CONFIG_PATH = resolve(process.cwd(), 'configs/rss-settings.config.json');

export function resolveConfigPath(configPath?: string): string {
  if (!configPath?.trim()) {
    return CONFIG_PATH;
  }

  const expandedPath = expandHome(configPath.trim());
  return resolve(process.cwd(), expandedPath);
}

export const DEFAULT_CONFIG: Config = {
  feeds: [],
  rssFetchIntervalSeconds: 21600,
  limit: 25,
  mode: 'replace',
  target: 'auto',
  phraseFormatting: {
    includeSource: true,
    includeTime: true,
    maxLength: 140,
    templates: {
      article: '%source% — %title% — %time%',
      hackerNews: 'HN: %title% — %score% — %time%',
      stock: '%symbol% %price% %change% %market%',
      githubCommit: '%headline% (%delta%) %repo%@%sha% - @%author% %time%',
      githubFeed: '@%handle% %action% — %time%',
    },
  },
  githubModels: {
    enabled: false,
    endpoint: 'https://models.github.ai/inference',
    model: 'openai/gpt-4o-mini',
    tokenEnvVar: 'GITHUB_MODELS_TOKEN',
    maxInputItems: 10,
    maxInputTokens: 16000,
    maxTokens: 500,
    maxConcurrency: 3,
    maxPhrasesPerArticle: 2,
    temperature: 0.2,
    fetchArticleContent: true,
    maxArticleContentLength: 6000,
    cacheTtlSeconds: 604800,
  },
  stockQuotes: {
    enabled: false,
    symbols: ['MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'AMD'],
    includeMarketState: true,
    fetchIntervalSeconds: 60,
  },
  hackerNews: {
    enabled: false,
    feed: 'top',
    maxItems: 10,
    minScore: 50,
    fetchIntervalSeconds: 300,
  },
  earthquakes: {
    enabled: false,
    zipCode: '',
    minMagnitude: 4,
    windowHours: 24,
    limit: 10,
    radiusKm: 500,
    orderBy: 'time',
    fetchIntervalSeconds: 1800,
  },
  weatherAlerts: {
    enabled: false,
    zipCode: '',
    area: '',
    minimumSeverity: 'moderate',
    limit: 10,
    fetchIntervalSeconds: 1800,
  },
  customJson: {
    enabled: false,
    url: '',
    itemsPath: '',
    titleField: 'title',
    contentField: 'summary',
    linkField: 'url',
    sourceField: '',
    sourceLabel: '',
    dateField: 'publishedAt',
    idField: 'id',
    maxItems: 10,
    fetchIntervalSeconds: 3600,
  },
  githubActivity: {
    enabled: false,
    mode: 'repo-commits',
    repo: 'microsoft/vscode',
    org: 'github',
    branch: '',
    feedKind: 'timeline',
    feedUrl: '',
    maxItems: 10,
    sinceHours: 24,
    tokenEnvVar: 'GITHUB_TOKEN',
    fetchIntervalSeconds: 300,
  },
};

export function readConfigFile(configPath = CONFIG_PATH): Partial<Config> {
  if (!existsSync(configPath)) {
    return {};
  }

  return JSON.parse(readFileSync(configPath, 'utf8')) as Partial<Config>;
}

export function writeConfigFile(configPath: string, config: Config): void {
  const persistedConfig: Config = {
    ...config,
    verbose: false,
    debug: false,
  };

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(persistedConfig, null, 2)}\n`, 'utf8');
}

export function parseArgs(argv: string[]): CliOverrides {
  const feedUrls: string[] = [];
  const overrides: CliOverrides = {};

  const setModels = (patch: Partial<GitHubModelsConfig>) => {
    overrides.githubModels = {
      ...(overrides.githubModels ?? {}),
      ...patch,
    } as GitHubModelsConfig;
  };

  const setFormatting = (patch: Partial<PhraseFormatting>) => {
    overrides.phraseFormatting = {
      ...(overrides.phraseFormatting ?? {}),
      ...patch,
    } as PhraseFormatting;
  };

  const setStocks = (patch: Partial<StockQuoteConfig>) => {
    overrides.stockQuotes = {
      ...(overrides.stockQuotes ?? {}),
      ...patch,
    } as StockQuoteConfig;
  };

  const setHackerNews = (patch: Partial<HackerNewsConfig>) => {
    overrides.hackerNews = {
      ...(overrides.hackerNews ?? {}),
      ...patch,
    } as HackerNewsConfig;
  };

  const setEarthquakes = (patch: Partial<EarthquakeConfig>) => {
    overrides.earthquakes = {
      ...(overrides.earthquakes ?? {}),
      ...patch,
    } as EarthquakeConfig;
  };

  const setWeatherAlerts = (patch: Partial<WeatherAlertsConfig>) => {
    overrides.weatherAlerts = {
      ...(overrides.weatherAlerts ?? {}),
      ...patch,
    } as WeatherAlertsConfig;
  };

  const setCustomJson = (patch: Partial<CustomJsonConfig>) => {
    overrides.customJson = {
      ...(overrides.customJson ?? {}),
      ...patch,
    } as CustomJsonConfig;
  };

  const setGitHubActivity = (patch: Partial<GitHubActivityConfig>) => {
    overrides.githubActivity = {
      ...(overrides.githubActivity ?? {}),
      ...patch,
    } as GitHubActivityConfig;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case '--feed':
      case '--url':
        if (next) {
          feedUrls.push(next);
          index += 1;
        }
        break;
      case '--limit':
        if (next) {
          overrides.limit = Number(next);
          index += 1;
        }
        break;
      case '--mode':
        if (next === 'append' || next === 'replace') {
          overrides.mode = next;
          index += 1;
        }
        break;
      case '--target':
        if (next === 'auto' || next === 'insiders' || next === 'stable') {
          overrides.target = next;
          index += 1;
        }
        break;
      case '--settings':
        if (next) {
          overrides.settingsPath = next;
          index += 1;
        }
        break;
      case '--config':
        if (next) {
          overrides.configPath = next;
          index += 1;
        }
        break;
      case '--dry-run':
        overrides.dryRun = true;
        break;
      case '--static-pack':
        if (next) {
          overrides.staticPackPath = next;
          index += 1;
        }
        break;
      case '--uninstall-scheduler':
        overrides.uninstallScheduler = true;
        break;
      case '--uninstall':
        overrides.uninstall = true;
        break;
      case '--interactive':
      case '-i':
        overrides.interactive = true;
        break;
      case '--verbose':
        overrides.verbose = true;
        break;
      case '--debug':
        overrides.verbose = true;
        overrides.debug = true;
        break;
      case '--use-models':
        setModels({ enabled: true });
        break;
      case '--no-models':
        setModels({ enabled: false });
        break;
      case '--model':
        if (next) {
          setModels({ model: next });
          index += 1;
        }
        break;
      case '--models-token-env':
        if (next) {
          setModels({ tokenEnvVar: next });
          index += 1;
        }
        break;
      case '--models-max-input-items':
        if (next) {
          setModels({ maxInputItems: Number(next) });
          index += 1;
        }
        break;
      case '--models-max-input-tokens':
        if (next) {
          setModels({ maxInputTokens: Number(next) });
          index += 1;
        }
        break;
      case '--models-max-tokens':
        if (next) {
          setModels({ maxTokens: Number(next) });
          index += 1;
        }
        break;
      case '--models-max-phrases-per-article':
        if (next) {
          setModels({ maxPhrasesPerArticle: Number(next) });
          index += 1;
        }
        break;
      case '--models-temperature':
        if (next) {
          setModels({ temperature: Number(next) });
          index += 1;
        }
        break;
      case '--models-endpoint':
        if (next) {
          setModels({ endpoint: next });
          index += 1;
        }
        break;
      case '--models-max-concurrency':
        if (next) {
          setModels({ maxConcurrency: Number(next) });
          index += 1;
        }
        break;
      case '--fetch-article-content':
        setModels({ fetchArticleContent: true });
        break;
      case '--no-fetch-article-content':
        setModels({ fetchArticleContent: false });
        break;
      case '--max-article-content-length':
        if (next) {
          setModels({ maxArticleContentLength: Number(next) });
          index += 1;
        }
        break;
      case '--no-source':
        setFormatting({ includeSource: false });
        break;
      case '--no-time':
        setFormatting({ includeTime: false });
        break;
      case '--max-length':
        if (next) {
          setFormatting({ maxLength: Number(next) });
          index += 1;
        }
        break;
      case '--stocks':
        if (next) {
          setStocks({
            enabled: true,
            symbols: normalizeSymbols(next.split(/[\s,]+/)),
          });
          index += 1;
        }
        break;
      case '--use-hacker-news':
        setHackerNews({ enabled: true });
        break;
      case '--hn-feed':
        if (next === 'top' || next === 'new' || next === 'best' || next === 'ask' || next === 'show' || next === 'jobs') {
          setHackerNews({ feed: next });
          index += 1;
        }
        break;
      case '--hn-max-items':
        if (next) {
          setHackerNews({ maxItems: Number(next), enabled: true });
          index += 1;
        }
        break;
      case '--hn-min-score':
        if (next) {
          setHackerNews({ minScore: Number(next), enabled: true });
          index += 1;
        }
        break;
      case '--use-earthquakes':
        setEarthquakes({ enabled: true });
        break;
      case '--quake-min-magnitude':
        if (next) {
          setEarthquakes({ minMagnitude: Number(next), enabled: true });
          index += 1;
        }
        break;
      case '--quake-zip':
        if (next) {
          setEarthquakes({ zipCode: normalizeUsZipCode(next) ?? next, enabled: true });
          index += 1;
        }
        break;
      case '--quake-hours':
        if (next) {
          setEarthquakes({ windowHours: Number(next), enabled: true });
          index += 1;
        }
        break;
      case '--quake-radius-km':
        if (next) {
          setEarthquakes({ radiusKm: Number(next), enabled: true });
          index += 1;
        }
        break;
      case '--quake-limit':
        if (next) {
          setEarthquakes({ limit: Number(next), enabled: true });
          index += 1;
        }
        break;
      case '--quake-place':
        if (next) {
          setEarthquakes({ place: next, enabled: true });
          index += 1;
        }
        break;
      case '--quake-order':
        if (next === 'time' || next === 'magnitude') {
          setEarthquakes({ orderBy: next, enabled: true });
          index += 1;
        }
        break;
      case '--use-weather-alerts':
        setWeatherAlerts({ enabled: true });
        break;
      case '--weather-area':
        if (next) {
          setWeatherAlerts({ area: next, enabled: true });
          index += 1;
        }
        break;
      case '--weather-zip':
        if (next) {
          setWeatherAlerts({ zipCode: normalizeUsZipCode(next) ?? next, enabled: true });
          index += 1;
        }
        break;
      case '--weather-severity':
        if (next === 'minor' || next === 'moderate' || next === 'severe' || next === 'extreme') {
          setWeatherAlerts({ minimumSeverity: next, enabled: true });
          index += 1;
        }
        break;
      case '--weather-limit':
        if (next) {
          setWeatherAlerts({ limit: Number(next), enabled: true });
          index += 1;
        }
        break;
      case '--use-custom-json':
        setCustomJson({ enabled: true });
        break;
      case '--use-github':
        setGitHubActivity({ enabled: true });
        break;
      case '--github-mode':
        if (next === 'repo-commits' || next === 'org-commits' || next === 'feed') {
          setGitHubActivity({ mode: next, enabled: true });
          index += 1;
        }
        break;
      case '--github-repo':
        if (next) {
          setGitHubActivity({ repo: next, enabled: true });
          index += 1;
        }
        break;
      case '--github-org':
        if (next) {
          setGitHubActivity({ org: next, enabled: true });
          index += 1;
        }
        break;
      case '--github-branch':
        if (next) {
          setGitHubActivity({ branch: next, enabled: true });
          index += 1;
        }
        break;
      case '--github-feed-kind':
        if (next === 'timeline' || next === 'current-user-public' || next === 'current-user' || next === 'current-user-actor' || next === 'security-advisories' || next === 'organization' || next === 'custom-url') {
          setGitHubActivity({ feedKind: next, enabled: true, mode: 'feed' });
          index += 1;
        }
        break;
      case '--github-feed-url':
        if (next) {
          setGitHubActivity({ feedUrl: next, enabled: true, mode: 'feed' });
          index += 1;
        }
        break;
      case '--github-max-items':
        if (next) {
          setGitHubActivity({ maxItems: Number(next), enabled: true });
          index += 1;
        }
        break;
      case '--github-since-hours':
        if (next) {
          setGitHubActivity({ sinceHours: Number(next), enabled: true });
          index += 1;
        }
        break;
      case '--github-token-env':
        if (next) {
          setGitHubActivity({ tokenEnvVar: next, enabled: true });
          index += 1;
        }
        break;
      case '--json-url':
        if (next) {
          setCustomJson({ url: next, enabled: true });
          index += 1;
        }
        break;
      case '--json-items-path':
        if (next) {
          setCustomJson({ itemsPath: next, enabled: true });
          index += 1;
        }
        break;
      case '--json-title-field':
        if (next) {
          setCustomJson({ titleField: next, enabled: true });
          index += 1;
        }
        break;
      case '--json-content-field':
        if (next) {
          setCustomJson({ contentField: next, enabled: true });
          index += 1;
        }
        break;
      case '--json-link-field':
        if (next) {
          setCustomJson({ linkField: next, enabled: true });
          index += 1;
        }
        break;
      case '--json-source-field':
        if (next) {
          setCustomJson({ sourceField: next, enabled: true });
          index += 1;
        }
        break;
      case '--json-source-label':
        if (next) {
          setCustomJson({ sourceLabel: next, enabled: true });
          index += 1;
        }
        break;
      case '--json-date-field':
        if (next) {
          setCustomJson({ dateField: next, enabled: true });
          index += 1;
        }
        break;
      case '--json-id-field':
        if (next) {
          setCustomJson({ idField: next, enabled: true });
          index += 1;
        }
        break;
      case '--json-max-items':
        if (next) {
          setCustomJson({ maxItems: Number(next), enabled: true });
          index += 1;
        }
        break;
      case '--use-stocks':
        setStocks({ enabled: true });
        break;
      case '--no-stocks':
        setStocks({ enabled: false });
        break;
      case '--no-market-state':
        setStocks({ includeMarketState: false });
        break;
      default:
        break;
    }
  }

  if (feedUrls.length > 0) {
    overrides.feeds = feedUrls.map(url => ({ url }));
  }

  return overrides;
}

export function mergeConfig(base: Config, fileConfig: Partial<Config>, argConfig: Partial<Config>): Config {
  return {
    limit: argConfig.limit ?? fileConfig.limit ?? base.limit,
    mode: argConfig.mode ?? fileConfig.mode ?? base.mode,
    target: argConfig.target ?? fileConfig.target ?? base.target,
    settingsPath: argConfig.settingsPath ?? fileConfig.settingsPath ?? base.settingsPath,
    verbose: argConfig.verbose ?? fileConfig.verbose ?? base.verbose,
    debug: argConfig.debug ?? fileConfig.debug ?? base.debug,
    feeds: argConfig.feeds ?? fileConfig.feeds ?? base.feeds,
    rssFetchIntervalSeconds: argConfig.rssFetchIntervalSeconds ?? fileConfig.rssFetchIntervalSeconds ?? base.rssFetchIntervalSeconds,
    phraseFormatting: {
      ...base.phraseFormatting,
      ...(fileConfig.phraseFormatting ?? {}),
      ...(argConfig.phraseFormatting ?? {}),
    },
    githubModels: {
      ...base.githubModels,
      ...(fileConfig.githubModels ?? {}),
      ...(argConfig.githubModels ?? {}),
    },
    stockQuotes: {
      ...base.stockQuotes,
      ...(fileConfig.stockQuotes ?? {}),
      ...(argConfig.stockQuotes ?? {}),
    },
    hackerNews: {
      ...base.hackerNews,
      ...(fileConfig.hackerNews ?? {}),
      ...(argConfig.hackerNews ?? {}),
    },
    earthquakes: {
      ...base.earthquakes,
      ...(fileConfig.earthquakes ?? {}),
      ...(argConfig.earthquakes ?? {}),
    },
    weatherAlerts: {
      ...base.weatherAlerts,
      ...(fileConfig.weatherAlerts ?? {}),
      ...(argConfig.weatherAlerts ?? {}),
    },
    customJson: {
      ...base.customJson,
      ...(fileConfig.customJson ?? {}),
      ...(argConfig.customJson ?? {}),
    },
    customJsonSources: argConfig.customJsonSources ?? fileConfig.customJsonSources ?? base.customJsonSources,
    githubActivity: {
      ...base.githubActivity,
      ...(fileConfig.githubActivity ?? {}),
      ...(argConfig.githubActivity ?? {}),
    },
  };
}

export function validateConfig(config: Config): void {
  if (
    config.feeds.length === 0
    && !config.stockQuotes.enabled
    && !config.hackerNews.enabled
    && !config.earthquakes.enabled
    && !config.weatherAlerts.enabled
    && !config.customJson.enabled
    && !(config.customJsonSources ?? []).some(s => s.enabled)
    && !config.githubActivity.enabled
  ) {
    throw new Error('Configure at least one source before running dynamic phrases.');
  }

  for (const [name, value] of [
    ['limit', config.limit],
    ['githubModels.maxInputItems', config.githubModels.maxInputItems],
    ['githubModels.maxTokens', config.githubModels.maxTokens],
    ['githubModels.maxPhrasesPerArticle', config.githubModels.maxPhrasesPerArticle],
    ['githubModels.maxArticleContentLength', config.githubModels.maxArticleContentLength],
    ['phraseFormatting.maxLength', config.phraseFormatting.maxLength],
    ['hackerNews.maxItems', config.hackerNews.maxItems],
    ['earthquakes.windowHours', config.earthquakes.windowHours],
    ['earthquakes.limit', config.earthquakes.limit],
    ['earthquakes.radiusKm', config.earthquakes.radiusKm],
    ['weatherAlerts.limit', config.weatherAlerts.limit],
    ['customJson.maxItems', config.customJson.maxItems],
    ['githubActivity.maxItems', config.githubActivity.maxItems],
    ['githubActivity.sinceHours', config.githubActivity.sinceHours],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive number. Received: ${value}`);
    }
  }

  if (config.githubModels.temperature < 0 || config.githubModels.temperature > 1) {
    throw new Error(`githubModels.temperature must be between 0 and 1. Received: ${config.githubModels.temperature}`);
  }

  if (!Number.isFinite(config.githubModels.maxConcurrency) || config.githubModels.maxConcurrency < 1) {
    throw new Error(`githubModels.maxConcurrency must be at least 1. Received: ${config.githubModels.maxConcurrency}`);
  }

  if (config.githubModels.endpoint && !/^https?:\/\//u.test(config.githubModels.endpoint)) {
    throw new Error(`githubModels.endpoint must be a valid HTTP(S) URL. Received: ${config.githubModels.endpoint}`);
  }

  const invalidFeed = config.feeds.find(feed => !feed.url.trim());
  if (invalidFeed) {
    throw new Error('Every feed entry must include a non-empty url.');
  }

  if (config.stockQuotes.enabled && normalizeSymbols(config.stockQuotes.symbols).length === 0) {
    throw new Error('stockQuotes.symbols must contain at least one ticker when stockQuotes is enabled.');
  }

  if (!Number.isFinite(config.hackerNews.minScore) || config.hackerNews.minScore < 0) {
    throw new Error(`hackerNews.minScore must be zero or greater. Received: ${config.hackerNews.minScore}`);
  }

  if (!Number.isFinite(config.earthquakes.minMagnitude) || config.earthquakes.minMagnitude < 0) {
    throw new Error(`earthquakes.minMagnitude must be zero or greater. Received: ${config.earthquakes.minMagnitude}`);
  }

  if (config.earthquakes.zipCode?.trim() && !isValidUsZipCode(config.earthquakes.zipCode)) {
    throw new Error(`earthquakes.zipCode must be a valid 5-digit US ZIP code. Received: ${config.earthquakes.zipCode}`);
  }

  if (config.weatherAlerts.zipCode?.trim() && !isValidUsZipCode(config.weatherAlerts.zipCode)) {
    throw new Error(`weatherAlerts.zipCode must be a valid 5-digit US ZIP code. Received: ${config.weatherAlerts.zipCode}`);
  }

  if (config.customJson.enabled) {
    if (!config.customJson.url.trim()) {
      throw new Error('customJson.url must be set when customJson is enabled.');
    }

    if (!config.customJson.titleField.trim()) {
      throw new Error('customJson.titleField must be set when customJson is enabled.');
    }
  }

  for (const [index, source] of (config.customJsonSources ?? []).entries()) {
    if (!source.enabled) {
      continue;
    }

    if (!source.url.trim()) {
      throw new Error(`customJsonSources[${index}].url must be set when enabled.`);
    }

    if (!source.titleField.trim()) {
      throw new Error(`customJsonSources[${index}].titleField must be set when enabled.`);
    }
  }

  if (config.githubActivity.enabled) {
    if (config.githubActivity.mode === 'repo-commits' && !config.githubActivity.repo?.trim()) {
      throw new Error('githubActivity.repo must be set when githubActivity.mode is repo-commits.');
    }

    if (config.githubActivity.mode === 'org-commits' && !config.githubActivity.org?.trim()) {
      throw new Error('githubActivity.org must be set when githubActivity.mode is org-commits.');
    }

    if (config.githubActivity.mode === 'feed') {
      if (config.githubActivity.feedKind === 'custom-url' && !config.githubActivity.feedUrl?.trim()) {
        throw new Error('githubActivity.feedUrl must be set when githubActivity.feedKind is custom-url.');
      }

      if (config.githubActivity.feedKind === 'organization' && !config.githubActivity.org?.trim()) {
        throw new Error('githubActivity.org must be set when githubActivity.feedKind is organization.');
      }
    }
  }
}
