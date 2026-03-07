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

// ── Multiple Custom JSON Sources ─────────────────────────────────────
describe('fetchCustomJsonArticles with customJsonSources', () => {
  it('fetches from multiple sources', async () => {
    const api1Data = [{ title: 'API 1 Item', url: 'https://api1.com/1' }];
    const api2Data = [{ title: 'API 2 Item', url: 'https://api2.com/1' }];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes('api1')) {
        return new Response(JSON.stringify(api1Data));
      }
      return new Response(JSON.stringify(api2Data));
    });

    const config: Config = {
      ...DEFAULT_CONFIG,
      customJson: { ...DEFAULT_CONFIG.customJson, enabled: false },
      customJsonSources: [
        { ...DEFAULT_CONFIG.customJson, enabled: true, url: 'https://api1.com/data', titleField: 'title', linkField: 'url', maxItems: 5 },
        { ...DEFAULT_CONFIG.customJson, enabled: true, url: 'https://api2.com/data', titleField: 'title', linkField: 'url', maxItems: 5 },
      ],
    };

    const result = await fetchCustomJsonArticles(config);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('API 1 Item');
    expect(result[1].title).toBe('API 2 Item');
  });

  it('merges primary customJson with customJsonSources', async () => {
    const primaryData = [{ title: 'Primary Item' }];
    const extraData = [{ title: 'Extra Item' }];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes('primary')) {
        return new Response(JSON.stringify(primaryData));
      }
      return new Response(JSON.stringify(extraData));
    });

    const config: Config = {
      ...DEFAULT_CONFIG,
      customJson: { ...DEFAULT_CONFIG.customJson, enabled: true, url: 'https://primary.com/data', titleField: 'title', maxItems: 5 },
      customJsonSources: [
        { ...DEFAULT_CONFIG.customJson, enabled: true, url: 'https://extra.com/data', titleField: 'title', maxItems: 5 },
      ],
    };

    const result = await fetchCustomJsonArticles(config);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Primary Item');
    expect(result[1].title).toBe('Extra Item');
  });

  it('skips disabled sources in customJsonSources', async () => {
    const enabledData = [{ title: 'Enabled Item' }];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(enabledData)),
    );

    const config: Config = {
      ...DEFAULT_CONFIG,
      customJson: { ...DEFAULT_CONFIG.customJson, enabled: false },
      customJsonSources: [
        { ...DEFAULT_CONFIG.customJson, enabled: false, url: 'https://disabled.com/data', titleField: 'title', maxItems: 5 },
        { ...DEFAULT_CONFIG.customJson, enabled: true, url: 'https://enabled.com/data', titleField: 'title', maxItems: 5 },
      ],
    };

    const result = await fetchCustomJsonArticles(config);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Enabled Item');
  });

  it('returns empty when all sources disabled', async () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      customJson: { ...DEFAULT_CONFIG.customJson, enabled: false },
      customJsonSources: [
        { ...DEFAULT_CONFIG.customJson, enabled: false, url: 'https://disabled.com', titleField: 'title', maxItems: 5 },
      ],
    };

    const result = await fetchCustomJsonArticles(config);
    expect(result).toEqual([]);
  });

  it('works with empty customJsonSources array', async () => {
    const primaryData = [{ title: 'Only Primary' }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(primaryData)),
    );

    const config: Config = {
      ...DEFAULT_CONFIG,
      customJson: { ...DEFAULT_CONFIG.customJson, enabled: true, url: 'https://primary.com', titleField: 'title', maxItems: 5 },
      customJsonSources: [],
    };

    const result = await fetchCustomJsonArticles(config);
    expect(result).toHaveLength(1);
  });
});
