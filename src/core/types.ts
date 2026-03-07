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
}

export interface PhraseFormatting {
	includeSource: boolean;
	includeTime: boolean;
	maxLength: number;
}

export interface GitHubModelsConfig {
	enabled: boolean;
	model: string;
	tokenEnvVar: string;
	maxInputItems: number;
	maxTokens: number;
	maxPhrasesPerArticle: number;
	temperature: number;
	fetchArticleContent: boolean;
	maxArticleContentLength: number;
	systemPrompt?: string;
}

export interface StockQuoteConfig {
	enabled: boolean;
	symbols: string[];
	includeMarketState: boolean;
}

export interface HackerNewsConfig {
	enabled: boolean;
	feed: HackerNewsFeed;
	maxItems: number;
	minScore: number;
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
}

export interface WeatherAlertsConfig {
	enabled: boolean;
	zipCode?: string;
	area?: string;
	minimumSeverity: WeatherSeverity;
	limit: number;
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
}

export interface Config {
	feeds: FeedConfig[];
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
	githubActivity: GitHubActivityConfig;
}

export interface CliOverrides extends Partial<Config> {
	dryRun?: boolean;
	interactive?: boolean;
	uninstall?: boolean;
	createNewConfig?: boolean;
	installScheduler?: boolean;
	uninstallScheduler?: boolean;
	schedulerIntervalSeconds?: number;
	configPath?: string;
	schedulerConfigPath?: string;
	staticPackPath?: string;
}

export interface GitHubModelsResponse {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
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

