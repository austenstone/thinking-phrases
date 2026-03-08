export type Mode = 'append' | 'replace';
export type Target = 'auto' | 'insiders' | 'stable';
export type HackerNewsFeed = 'top' | 'new' | 'best' | 'ask' | 'show' | 'jobs';
export type EarthquakeOrder = 'time' | 'magnitude';
export type WeatherSeverity = 'minor' | 'moderate' | 'severe' | 'extreme';
export type GitHubActivityMode = 'repo-commits' | 'org-commits' | 'feed';
export type GitHubFeedKind = 'timeline' | 'current-user-public' | 'current-user' | 'current-user-actor' | 'security-advisories' | 'organization' | 'custom-url';

export interface FeedConfig {
	url: string;
	source?: string;
	fetchIntervalSeconds?: number;
}

export interface PhraseFormatTemplates {
	article?: string;
	hackerNews?: string;
	stock?: string;
	githubCommit?: string;
	githubFeed?: string;
}

export interface PhraseFormatting {
	includeSource: boolean;
	includeTime: boolean;
	maxLength: number;
	templates?: PhraseFormatTemplates;
}

export interface GitHubModelsConfig {
	enabled: boolean;
	endpoint: string;
	model: string;
	tokenEnvVar: string;
	maxInputItems: number;
	maxInputTokens: number;
	maxTokens: number;
	maxConcurrency: number;
	maxPhrasesPerArticle: number;
	temperature: number;
	fetchArticleContent: boolean;
	maxArticleContentLength: number;
	/** Default prompt used when no source-specific prompt exists */
	systemPrompt?: string;
	/** Per-source prompts keyed by source type (rss, hacker-news, github-activity, earthquakes, custom-json) */
	prompts?: Record<string, string>;
	cacheTtlSeconds?: number;
}

export interface StockQuoteConfig {
	enabled: boolean;
	symbols: string[];
	includeMarketState: boolean;
	showClosed?: boolean;
	fetchIntervalSeconds?: number;
}

export interface HackerNewsConfig {
	enabled: boolean;
	feed: HackerNewsFeed;
	maxItems: number;
	minScore: number;
	fetchIntervalSeconds?: number;
}

export interface EarthquakeConfig {
	enabled: boolean;
	zipCode?: string;
	minMagnitude: number;
	windowHours: number;
	limit: number;
	place?: string;
	radiusKm: number;
	orderBy: EarthquakeOrder;
	fetchIntervalSeconds?: number;
}

export interface WeatherAlertsConfig {
	enabled: boolean;
	zipCode?: string;
	area?: string;
	minimumSeverity: WeatherSeverity;
	limit: number;
	fetchIntervalSeconds?: number;
}

export interface CustomJsonConfig {
	enabled: boolean;
	url: string;
	itemsPath?: string;
	titleField: string;
	contentField?: string;
	linkField?: string;
	sourceField?: string;
	sourceLabel?: string;
	dateField?: string;
	idField?: string;
	maxItems: number;
	fetchIntervalSeconds?: number;
}

export interface GitHubActivityConfig {
	enabled: boolean;
	mode: GitHubActivityMode;
	repo?: string;
	org?: string;
	branch?: string;
	feedKind: GitHubFeedKind;
	feedUrl?: string;
	maxItems: number;
	sinceHours: number;
	tokenEnvVar: string;
	fetchIntervalSeconds?: number;
}

export interface Config {
	feeds: FeedConfig[];
	rssFetchIntervalSeconds: number;
	limit: number;
	mode: Mode;
	target: Target;
	settingsPath?: string;
	verbose?: boolean;
	debug?: boolean;
	phraseFormatting: PhraseFormatting;
	githubModels: GitHubModelsConfig;
	stockQuotes: StockQuoteConfig;
	hackerNews: HackerNewsConfig;
	earthquakes: EarthquakeConfig;
	weatherAlerts: WeatherAlertsConfig;
	customJson: CustomJsonConfig;
	customJsonSources?: CustomJsonConfig[];
	githubActivity: GitHubActivityConfig;
}

export interface CliOverrides extends Partial<Config> {
	dryRun?: boolean;
	interactive?: boolean;
	uninstall?: boolean;
	triggerSchedulerNow?: boolean;
	createNewConfig?: boolean;
	installScheduler?: boolean;
	uninstallScheduler?: boolean;
	schedulerIntervalSeconds?: number;
	configPath?: string;
	schedulerConfigPath?: string;
	staticPackPath?: string;
}

export interface ArticleItem {
	type: 'article';
	id: string;
	title?: string;
	displayPhrase?: string;
	link?: string;
	source?: string;
	datetime?: string;
	time?: string;
	content?: string;
	articleContent?: string;
	/** Source-specific metadata for suffix display (e.g. HN score, commit delta) */
	metadata?: Record<string, string | undefined>;
	/** When true, the article's displayPhrase is final and should not be rewritten by AI models */
	skipModelRewrite?: boolean;
}

export interface StockItem {
	type: 'stock';
	id: string;
	symbol: string;
	price: number;
	currency?: string;
	changePercent?: number;
	marketLabel?: string;
}

export type PhraseItem = ArticleItem | StockItem;

export interface PhraseSource {
	type: string;
	isEnabled(config: Config): boolean;
	fetch(config: Config): Promise<PhraseItem[]>;
}

export interface InstalledSchedulerInfo {
	installed: boolean;
	label: string;
	plistPath: string;
	intervalSeconds?: number;
	configPath?: string;
}

export interface StaticPackInfo {
	name: string;
	fileName: string;
	path: string;
	mode: Mode;
	phrases: string[];
}

