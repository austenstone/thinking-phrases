import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchHackerNewsArticles, hackerNewsSource } from '../src/sources/hackerNews.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import type { Config } from '../src/core/types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function buildHnConfig(overrides: Partial<Config['hackerNews']> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    hackerNews: {
      ...DEFAULT_CONFIG.hackerNews,
      enabled: true,
      maxItems: 3,
      minScore: 0,
      ...overrides,
    },
  };
}

describe('hackerNewsSource.isEnabled', () => {
  it('returns true when enabled', () => {
    expect(hackerNewsSource.isEnabled(buildHnConfig())).toBe(true);
  });

  it('returns false when disabled', () => {
    expect(hackerNewsSource.isEnabled(DEFAULT_CONFIG)).toBe(false);
  });
});

describe('fetchHackerNewsArticles', () => {
  it('returns empty array when disabled', async () => {
    const result = await fetchHackerNewsArticles(DEFAULT_CONFIG);
    expect(result).toEqual([]);
  });

  it('fetches and returns articles', async () => {
    const mockIds = [1001, 1002, 1003];
    const mockItems = [
      { id: 1001, title: 'First HN Story', score: 100, time: Math.floor(Date.now() / 1000) - 3600, url: 'https://example.com/1' },
      { id: 1002, title: 'Second HN Story', score: 200, time: Math.floor(Date.now() / 1000) - 7200 },
      { id: 1003, title: 'Third HN Story', score: 50, time: Math.floor(Date.now() / 1000) - 600, url: 'https://example.com/3' },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

      if (url.includes('topstories.json')) {
        return new Response(JSON.stringify(mockIds));
      }

      const match = url.match(/item\/(\d+)\.json/);
      if (match) {
        const item = mockItems.find(i => i.id === Number(match[1]));
        return new Response(JSON.stringify(item ?? null));
      }

      return new Response('not found', { status: 404 });
    });

    const result = await fetchHackerNewsArticles(buildHnConfig());
    expect(result).toHaveLength(3);
    expect(result[0].title).toBe('First HN Story');
    expect(result[0].source).toBe('Hacker News');
    expect(result[0].link).toBe('https://example.com/1');
    // Second item has no URL, should use HN item URL
    expect(result[1].link).toBe('https://news.ycombinator.com/item?id=1002');
    expect(result[0].displayPhrase).toContain('HN:');
  });

  it('filters by minScore', async () => {
    const mockIds = [2001, 2002];
    const mockItems = [
      { id: 2001, title: 'High Score', score: 150, time: Math.floor(Date.now() / 1000) },
      { id: 2002, title: 'Low Score', score: 5, time: Math.floor(Date.now() / 1000) },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

      if (url.includes('topstories.json')) {
        return new Response(JSON.stringify(mockIds));
      }

      const match = url.match(/item\/(\d+)\.json/);
      if (match) {
        const item = mockItems.find(i => i.id === Number(match[1]));
        return new Response(JSON.stringify(item ?? null));
      }

      return new Response('not found', { status: 404 });
    });

    const result = await fetchHackerNewsArticles(buildHnConfig({ minScore: 100 }));
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('High Score');
  });
});
