import type { ArticleItem, PhraseSource } from '../core/types.js';
import { fetchJson, logInfo, relativeTime, stripHtml } from '../core/utils.js';

interface HackerNewsItem {
  by?: string;
  descendants?: number;
  id: number;
  score?: number;
  text?: string;
  time?: number;
  title?: string;
  type?: string;
  url?: string;
}

const HN_ENDPOINTS = {
  top: 'topstories',
  new: 'newstories',
  best: 'beststories',
  ask: 'askstories',
  show: 'showstories',
  jobs: 'jobstories',
} as const;

function buildHackerNewsLink(id: number, explicitUrl?: string): string {
  return explicitUrl?.trim() || `https://news.ycombinator.com/item?id=${id}`;
}

export async function fetchHackerNewsArticles(config: import('../core/types.js').Config): Promise<ArticleItem[]> {
  if (!config.hackerNews.enabled) {
    return [];
  }

  const listName = HN_ENDPOINTS[config.hackerNews.feed];
  const ids = await fetchJson<number[]>(`https://hacker-news.firebaseio.com/v0/${listName}.json`);
  const fetchCount = Math.min(Math.max(config.hackerNews.maxItems * 3, config.hackerNews.maxItems), 60);
  const candidateIds = ids.slice(0, fetchCount);

  logInfo(config, `Fetching ${candidateIds.length} Hacker News items from ${config.hackerNews.feed}`);

  const rawItems = await Promise.all(
    candidateIds.map(id => fetchJson<HackerNewsItem>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null)),
  );

  return rawItems
    .filter((item): item is HackerNewsItem => Boolean(item?.title))
    .filter(item => (item.score ?? 0) >= config.hackerNews.minScore)
    .slice(0, config.hackerNews.maxItems)
    .map(item => {
      const datetime = item.time ? new Date(item.time * 1000).toISOString() : undefined;
      const score = typeof item.score === 'number' ? `${item.score} points` : undefined;
      const comments = typeof item.descendants === 'number' ? `${item.descendants} comments` : undefined;
      const title = [item.title?.trim(), [score, comments].filter(Boolean).join(' • ')].filter(Boolean).join(' — ');

      return {
        type: 'article' as const,
        id: `hacker-news:${item.id}`,
        title,
        link: buildHackerNewsLink(item.id, item.url),
        source: 'Hacker News',
        datetime,
        time: relativeTime(datetime),
        content: stripHtml(item.text),
        articleContent: stripHtml(item.text),
      };
    });
}

export const hackerNewsSource: PhraseSource = {
  type: 'hacker-news',
  isEnabled: config => config.hackerNews.enabled,
  fetch: fetchHackerNewsArticles,
};