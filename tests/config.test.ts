import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DEFAULT_CONFIG,
  mergeConfig,
  parseArgs,
  validateConfig,
  readConfigFile,
  writeConfigFile,
  resolveConfigPath,
} from '../src/core/config.js';
import type { Config } from '../src/core/types.js';

const tmpDir = join(tmpdir(), 'thinking-phrases-test-config');

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── parseArgs ─────────────────────────────────────────────────────────
describe('parseArgs', () => {
  it('parses --dry-run flag', () => {
    const result = parseArgs(['--dry-run']);
    expect(result.dryRun).toBe(true);
  });

  it('parses --interactive and -i', () => {
    expect(parseArgs(['--interactive']).interactive).toBe(true);
    expect(parseArgs(['-i']).interactive).toBe(true);
  });

  it('parses --verbose and --debug', () => {
    expect(parseArgs(['--verbose']).verbose).toBe(true);
    const debug = parseArgs(['--debug']);
    expect(debug.debug).toBe(true);
    expect(debug.verbose).toBe(true);
  });

  it('parses --feed urls', () => {
    const result = parseArgs(['--feed', 'https://example.com/feed']);
    expect(result.feeds).toEqual([{ url: 'https://example.com/feed' }]);
  });

  it('parses multiple --feed urls', () => {
    const result = parseArgs([
      '--feed', 'https://a.com/feed',
      '--feed', 'https://b.com/feed',
    ]);
    expect(result.feeds).toEqual([
      { url: 'https://a.com/feed' },
      { url: 'https://b.com/feed' },
    ]);
  });

  it('parses --limit', () => {
    expect(parseArgs(['--limit', '50']).limit).toBe(50);
  });

  it('parses --mode', () => {
    expect(parseArgs(['--mode', 'append']).mode).toBe('append');
    expect(parseArgs(['--mode', 'replace']).mode).toBe('replace');
  });

  it('parses --target', () => {
    expect(parseArgs(['--target', 'insiders']).target).toBe('insiders');
    expect(parseArgs(['--target', 'stable']).target).toBe('stable');
    expect(parseArgs(['--target', 'auto']).target).toBe('auto');
  });

  it('parses --use-models and --no-models', () => {
    expect(parseArgs(['--use-models']).githubModels?.enabled).toBe(true);
    expect(parseArgs(['--no-models']).githubModels?.enabled).toBe(false);
  });

  it('parses --model', () => {
    expect(parseArgs(['--model', 'gpt-4']).githubModels?.model).toBe('gpt-4');
  });

  it('parses --config', () => {
    expect(parseArgs(['--config', 'my-config.json']).configPath).toBe('my-config.json');
  });

  it('parses --uninstall', () => {
    expect(parseArgs(['--uninstall']).uninstall).toBe(true);
  });

  it('parses --use-hacker-news', () => {
    expect(parseArgs(['--use-hacker-news']).hackerNews?.enabled).toBe(true);
  });

  it('parses --hn-feed', () => {
    expect(parseArgs(['--hn-feed', 'best']).hackerNews?.feed).toBe('best');
  });

  it('parses --hn-max-items', () => {
    const result = parseArgs(['--hn-max-items', '20']);
    expect(result.hackerNews?.maxItems).toBe(20);
    expect(result.hackerNews?.enabled).toBe(true);
  });

  it('parses --use-earthquakes', () => {
    expect(parseArgs(['--use-earthquakes']).earthquakes?.enabled).toBe(true);
  });

  it('parses --use-weather-alerts', () => {
    expect(parseArgs(['--use-weather-alerts']).weatherAlerts?.enabled).toBe(true);
  });

  it('parses --use-custom-json', () => {
    expect(parseArgs(['--use-custom-json']).customJson?.enabled).toBe(true);
  });

  it('parses --use-github', () => {
    expect(parseArgs(['--use-github']).githubActivity?.enabled).toBe(true);
  });

  it('parses --github-mode', () => {
    expect(parseArgs(['--github-mode', 'feed']).githubActivity?.mode).toBe('feed');
  });

  it('parses --github-repo', () => {
    expect(parseArgs(['--github-repo', 'microsoft/vscode']).githubActivity?.repo).toBe('microsoft/vscode');
  });

  it('parses --stocks', () => {
    const result = parseArgs(['--stocks', 'MSFT,NVDA,AMD']);
    expect(result.stockQuotes?.enabled).toBe(true);
    expect(result.stockQuotes?.symbols).toEqual(['MSFT', 'NVDA', 'AMD']);
  });

  it('parses --no-source and --no-time', () => {
    expect(parseArgs(['--no-source']).phraseFormatting?.includeSource).toBe(false);
    expect(parseArgs(['--no-time']).phraseFormatting?.includeTime).toBe(false);
  });

  it('parses --max-length', () => {
    expect(parseArgs(['--max-length', '200']).phraseFormatting?.maxLength).toBe(200);
  });

  it('parses --static-pack', () => {
    expect(parseArgs(['--static-pack', 'out/wow.json']).staticPackPath).toBe('out/wow.json');
  });
});

// ── mergeConfig ──────────────────────────────────────────────────────
describe('mergeConfig', () => {
  it('uses base config when no overrides', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {}, {});
    expect(result.limit).toBe(DEFAULT_CONFIG.limit);
    expect(result.mode).toBe(DEFAULT_CONFIG.mode);
  });

  it('argConfig overrides fileConfig', () => {
    const result = mergeConfig(DEFAULT_CONFIG, { limit: 10 }, { limit: 50 });
    expect(result.limit).toBe(50);
  });

  it('fileConfig overrides base', () => {
    const result = mergeConfig(DEFAULT_CONFIG, { limit: 10 }, {});
    expect(result.limit).toBe(10);
  });

  it('deep merges nested objects', () => {
    const result = mergeConfig(
      DEFAULT_CONFIG,
      { hackerNews: { enabled: true } as Config['hackerNews'] },
      { hackerNews: { feed: 'best' } as Config['hackerNews'] },
    );
    expect(result.hackerNews.enabled).toBe(true);
    expect(result.hackerNews.feed).toBe('best');
    // base value preserved
    expect(result.hackerNews.minScore).toBe(DEFAULT_CONFIG.hackerNews.minScore);
  });
});

// ── validateConfig ──────────────────────────────────────────────────
describe('validateConfig', () => {
  const validConfig: Config = {
    ...DEFAULT_CONFIG,
    feeds: [{ url: 'https://example.com/feed' }],
  };

  it('passes for valid config with at least one source', () => {
    expect(() => validateConfig(validConfig)).not.toThrow();
  });

  it('throws when no sources are enabled', () => {
    expect(() => validateConfig(DEFAULT_CONFIG)).toThrow('at least one source');
  });

  it('throws for non-positive limit', () => {
    expect(() => validateConfig({ ...validConfig, limit: 0 })).toThrow('limit must be a positive number');
  });

  it('throws for invalid temperature', () => {
    expect(() =>
      validateConfig({
        ...validConfig,
        githubModels: { ...validConfig.githubModels, temperature: 2 },
      }),
    ).toThrow('temperature');
  });

  it('throws for empty feed url', () => {
    expect(() =>
      validateConfig({ ...validConfig, feeds: [{ url: '' }] }),
    ).toThrow('non-empty url');
  });

  it('throws for stocks enabled with no symbols', () => {
    expect(() =>
      validateConfig({
        ...validConfig,
        stockQuotes: { ...validConfig.stockQuotes, enabled: true, symbols: [] },
      }),
    ).toThrow('symbols');
  });

  it('throws for invalid earthquake zip', () => {
    expect(() =>
      validateConfig({
        ...validConfig,
        earthquakes: { ...validConfig.earthquakes, enabled: true, zipCode: 'abc' },
      }),
    ).toThrow('ZIP code');
  });

  it('throws for custom json enabled without url', () => {
    expect(() =>
      validateConfig({
        ...validConfig,
        customJson: { ...validConfig.customJson, enabled: true, url: '' },
      }),
    ).toThrow('customJson.url');
  });

  it('throws for github repo-commits without repo', () => {
    expect(() =>
      validateConfig({
        ...validConfig,
        githubActivity: {
          ...validConfig.githubActivity,
          enabled: true,
          mode: 'repo-commits',
          repo: '',
        },
      }),
    ).toThrow('githubActivity.repo');
  });
});

// ── readConfigFile / writeConfigFile ─────────────────────────────────
describe('readConfigFile / writeConfigFile', () => {
  it('returns empty object if file does not exist', () => {
    expect(readConfigFile(join(tmpDir, 'nonexistent.json'))).toEqual({});
  });

  it('round-trips config through write and read', () => {
    const configPath = join(tmpDir, 'test.config.json');
    writeConfigFile(configPath, DEFAULT_CONFIG);

    expect(existsSync(configPath)).toBe(true);
    const loaded = readConfigFile(configPath) as Config;
    expect(loaded.limit).toBe(DEFAULT_CONFIG.limit);
    expect(loaded.mode).toBe(DEFAULT_CONFIG.mode);
    // verbose/debug should be persisted as false
    expect(loaded.verbose).toBe(false);
    expect(loaded.debug).toBe(false);
  });
});

// ── resolveConfigPath ────────────────────────────────────────────────
describe('resolveConfigPath', () => {
  it('returns default path for empty input', () => {
    const result = resolveConfigPath('');
    expect(result).toBeTruthy();
    expect(result.endsWith('.json')).toBe(true);
  });

  it('resolves relative paths', () => {
    const result = resolveConfigPath('my-config.json');
    expect(result).toContain('my-config.json');
    expect(result.startsWith('/')).toBe(true);
  });
});
