import type { PhraseSource } from './types.js';
import { rssSource } from '../sources/rss.js';
import { stockSource } from '../sources/stocks.js';
import { hackerNewsSource } from '../sources/hackerNews.js';
import { earthquakeSource } from '../sources/earthquakes.js';
import { weatherAlertsSource } from '../sources/weatherAlerts.js';
import { customJsonSource } from '../sources/customJson.js';
import { githubActivitySource } from '../sources/githubActivity.js';

export const dynamicSources: PhraseSource[] = [
  rssSource,
  stockSource,
  hackerNewsSource,
  earthquakeSource,
  weatherAlertsSource,
  customJsonSource,
  githubActivitySource,
];