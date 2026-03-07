import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchCustomJsonArticles, customJsonSource } from '../src/sources/customJson.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import type { Config } from '../src/core/types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function buildCustomJsonConfig(overrides: Partial<Config['customJson']> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    customJson: {
      ...DEFAULT_CONFIG.customJson,
      enabled: true,
      url: 'https://api.example.com/data',
      titleField: 'title',
      maxItems: 5,
      ...overrides,
    },
  };
}

describe('customJsonSource.isEnabled', () => {
  it('returns true when enabled', () => {
    expect(customJsonSource.isEnabled(buildCustomJsonConfig())).toBe(true);
  });

  it('returns false when disabled', () => {
    expect(customJsonSource.isEnabled(DEFAULT_CONFIG)).toBe(false);
  });
});

describe('fetchCustomJsonArticles', () => {
  it('returns empty array when disabled', async () => {
    const result = await fetchCustomJsonArticles(DEFAULT_CONFIG);
    expect(result).toEqual([]);
  });

  it('parses flat array response', async () => {
    const mockData = [
      { title: 'Item 1', url: 'https://example.com/1' },
      { title: 'Item 2', url: 'https://example.com/2' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockData)),
    );

    const result = await fetchCustomJsonArticles(buildCustomJsonConfig({
      linkField: 'url',
    }));

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Item 1');
    expect(result[0].link).toBe('https://example.com/1');
    expect(result[0].id).toContain('custom-json:');
  });

  it('parses nested items via itemsPath', async () => {
    const mockData = {
      response: {
        results: [
          { title: 'Nested Item', link: 'https://example.com/nested' },
        ],
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockData)),
    );

    const result = await fetchCustomJsonArticles(buildCustomJsonConfig({
      itemsPath: 'response.results',
      linkField: 'link',
    }));

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Nested Item');
  });

  it('skips items without title', async () => {
    const mockData = [
      { title: 'Has Title' },
      { noTitle: true },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockData)),
    );

    const result = await fetchCustomJsonArticles(buildCustomJsonConfig());
    expect(result).toHaveLength(1);
  });

  it('uses sourceLabel as default source', async () => {
    const mockData = [{ title: 'Test' }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockData)),
    );

    const result = await fetchCustomJsonArticles(buildCustomJsonConfig({ sourceLabel: 'My API' }));
    expect(result[0].source).toBe('My API');
  });

  it('converts unix timestamps in dateField', async () => {
    const now = Math.floor(Date.now() / 1000);
    const mockData = [{ title: 'With Date', created_at: now }];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockData)),
    );

    const result = await fetchCustomJsonArticles(buildCustomJsonConfig({
      dateField: 'created_at',
    }));

    expect(result[0].datetime).toBeTruthy();
    expect(result[0].time).toMatch(/\d+m ago/);
  });

  it('respects maxItems', async () => {
    const mockData = Array.from({ length: 20 }, (_, i) => ({ title: `Item ${i}` }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockData)),
    );

    const result = await fetchCustomJsonArticles(buildCustomJsonConfig({ maxItems: 3 }));
    expect(result).toHaveLength(3);
  });
});
