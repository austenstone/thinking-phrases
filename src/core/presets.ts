import type { Config } from './types.js';

type ConfigPresetConfig = {
  [K in keyof Config]?: Config[K] extends (infer T)[]
    ? T[]
    : Config[K] extends object
      ? Partial<Config[K]>
      : Config[K];
};

export interface ConfigPreset {
  id: string;
  label: string;
  hint: string;
  config: ConfigPresetConfig;
}

export const dynamicConfigPresets: ConfigPreset[] = [
  {
    id: 'dev-pulse',
    label: 'Dev Pulse',
    hint: 'Google Tech + Hacker News',
    config: {
      feeds: [{ url: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en' }],
      limit: 10,
      hackerNews: {
        enabled: true,
        feed: 'top',
        maxItems: 8,
        minScore: 80,
      },
    },
  },
  {
    id: 'market-watch',
    label: 'Market Watch',
    hint: 'Big-tech stocks with fast-refresh defaults',
    config: {
      feeds: [],
      stockQuotes: {
        enabled: true,
        symbols: ['MSFT', 'NVDA', 'AMZN', 'GOOGL', 'AMD', 'TSLA'],
        includeMarketState: true,
      },
      githubModels: {
        enabled: false,
      },
    },
  },
  {
    id: 'world-signals',
    label: 'World Signals',
    hint: 'Earthquakes + severe weather + Hacker News',
    config: {
      feeds: [],
      hackerNews: {
        enabled: true,
        feed: 'best',
        maxItems: 5,
        minScore: 120,
      },
      earthquakes: {
        enabled: true,
        minMagnitude: 4.5,
        windowHours: 24,
        limit: 8,
        orderBy: 'magnitude',
      },
      weatherAlerts: {
        enabled: true,
        area: '',
        minimumSeverity: 'severe',
        limit: 8,
      },
    },
  },
];