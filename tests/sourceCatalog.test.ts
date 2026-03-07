import { describe, it, expect } from 'vitest';
import { dynamicSources } from '../src/core/sourceCatalog.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';

describe('sourceCatalog', () => {
  it('exports all source types', () => {
    const types = dynamicSources.map(s => s.type);
    expect(types).toContain('rss');
    expect(types).toContain('stocks');
    expect(types).toContain('hacker-news');
    expect(types).toContain('earthquakes');
    expect(types).toContain('weather-alerts');
    expect(types).toContain('custom-json');
    expect(types).toContain('github-activity');
  });

  it('each source has type, isEnabled, and fetch', () => {
    for (const source of dynamicSources) {
      expect(typeof source.type).toBe('string');
      expect(typeof source.isEnabled).toBe('function');
      expect(typeof source.fetch).toBe('function');
    }
  });

  it('no sources are enabled with DEFAULT_CONFIG', () => {
    const enabled = dynamicSources.filter(s => s.isEnabled(DEFAULT_CONFIG));
    expect(enabled).toHaveLength(0);
  });
});
