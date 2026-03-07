import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const noop = () => { /* empty */ };

import {
  truncate,
  singleLine,
  decodeHtmlEntities,
  stripHtml,
  relativeTime,
  dedupePhrases,
  normalizeSymbols,
  normalizeUsZipCode,
  isValidUsZipCode,
  formatPrice,
  formatSignedPercent,
  expandHome,
  resolveSettingsPath,
  fetchUsZipLocation,
  logInfo,
  logDebug,
  loadDotEnv,
  fetchText,
  fetchJson,
} from '../src/core/utils.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

// ── truncate ──────────────────────────────────────────────────────────
describe('truncate', () => {
  it('returns input unchanged when under maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates and adds ellipsis when over maxLength', () => {
    expect(truncate('hello world', 6)).toBe('hello…');
  });

  it('returns exact-length strings unchanged', () => {
    expect(truncate('abc', 3)).toBe('abc');
  });

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('handles maxLength of 1', () => {
    expect(truncate('hello', 1)).toBe('…');
  });
});

// ── singleLine ────────────────────────────────────────────────────────
describe('singleLine', () => {
  it('collapses whitespace into single spaces', () => {
    expect(singleLine('hello   world')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(singleLine('  hello  ')).toBe('hello');
  });

  it('collapses newlines', () => {
    expect(singleLine('hello\n\nworld')).toBe('hello world');
  });

  it('truncates when maxLength provided', () => {
    expect(singleLine('hello world foo bar', 6)).toBe('hello…');
  });
});

// ── decodeHtmlEntities ───────────────────────────────────────────────
describe('decodeHtmlEntities', () => {
  it('decodes named entities', () => {
    expect(decodeHtmlEntities('&amp;')).toBe('&');
    expect(decodeHtmlEntities('&lt;')).toBe('<');
    expect(decodeHtmlEntities('&gt;')).toBe('>');
    expect(decodeHtmlEntities('&quot;')).toBe('"');
    expect(decodeHtmlEntities('&apos;')).toBe("'");
    expect(decodeHtmlEntities('&nbsp;')).toBe(' ');
  });

  it('decodes numeric entities', () => {
    expect(decodeHtmlEntities('&#65;')).toBe('A');
  });

  it('decodes hex entities', () => {
    expect(decodeHtmlEntities('&#x41;')).toBe('A');
  });

  it('passes through unknown entities', () => {
    expect(decodeHtmlEntities('&foo;')).toBe('&foo;');
  });

  it('handles mixed content', () => {
    expect(decodeHtmlEntities('Hello &amp; goodbye &lt;world&gt;')).toBe('Hello & goodbye <world>');
  });
});

// ── stripHtml ─────────────────────────────────────────────────────────
describe('stripHtml', () => {
  it('returns undefined for empty/falsy input', () => {
    expect(stripHtml('')).toBeUndefined();
    expect(stripHtml(undefined)).toBeUndefined();
  });

  it('strips HTML tags', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('strips script tags and content', () => {
    expect(stripHtml('before<script>alert("x")</script>after')).toBe('before after');
  });

  it('strips style tags and content', () => {
    expect(stripHtml('before<style>body{color:red}</style>after')).toBe('before after');
  });

  it('decodes HTML entities in result', () => {
    expect(stripHtml('<p>A &amp; B</p>')).toBe('A & B');
  });
});

// ── relativeTime ─────────────────────────────────────────────────────
describe('relativeTime', () => {
  it('returns undefined for missing input', () => {
    expect(relativeTime(undefined)).toBeUndefined();
    expect(relativeTime('')).toBeUndefined();
  });

  it('returns undefined for invalid dates', () => {
    expect(relativeTime('not-a-date')).toBeUndefined();
  });

  it('returns minutes ago for recent times', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeTime(fiveMinutesAgo)).toBe('5m ago');
  });

  it('returns hours ago for hour-old times', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(relativeTime(threeHoursAgo)).toBe('3h ago');
  });

  it('returns days ago for day-old times', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    expect(relativeTime(twoDaysAgo)).toBe('2d ago');
  });
});

// ── dedupePhrases ────────────────────────────────────────────────────
describe('dedupePhrases', () => {
  it('removes case-insensitive duplicates', () => {
    expect(dedupePhrases(['Hello', 'hello', 'HELLO'])).toEqual(['Hello']);
  });

  it('preserves order of first occurrence', () => {
    expect(dedupePhrases(['B', 'A', 'b'])).toEqual(['B', 'A']);
  });

  it('handles empty array', () => {
    expect(dedupePhrases([])).toEqual([]);
  });
});

// ── normalizeSymbols ─────────────────────────────────────────────────
describe('normalizeSymbols', () => {
  it('uppercases and deduplicates', () => {
    expect(normalizeSymbols(['msft', 'MSFT', '  nvda  '])).toEqual(['MSFT', 'NVDA']);
  });

  it('filters out empty strings', () => {
    expect(normalizeSymbols(['', ' ', 'AMD'])).toEqual(['AMD']);
  });
});

// ── normalizeUsZipCode ───────────────────────────────────────────────
describe('normalizeUsZipCode', () => {
  it('returns 5-digit zip', () => {
    expect(normalizeUsZipCode('33312')).toBe('33312');
  });

  it('strips non-digits and returns first 5', () => {
    expect(normalizeUsZipCode('333-12')).toBe('33312');
  });

  it('returns undefined for short zips', () => {
    expect(normalizeUsZipCode('333')).toBeUndefined();
  });

  it('returns undefined for empty/undefined', () => {
    expect(normalizeUsZipCode(undefined)).toBeUndefined();
    expect(normalizeUsZipCode('')).toBeUndefined();
  });
});

// ── isValidUsZipCode ─────────────────────────────────────────────────
describe('isValidUsZipCode', () => {
  it('returns true for valid zips', () => {
    expect(isValidUsZipCode('33312')).toBe(true);
  });

  it('returns false for invalid zips', () => {
    expect(isValidUsZipCode('abc')).toBe(false);
    expect(isValidUsZipCode(undefined)).toBe(false);
  });
});

// ── formatPrice ──────────────────────────────────────────────────────
describe('formatPrice', () => {
  it('formats USD by default', () => {
    expect(formatPrice(100)).toBe('$100.00');
  });

  it('formats sub-dollar with 4 decimal places', () => {
    const result = formatPrice(0.1234);
    expect(result).toBe('$0.1234');
  });

  it('respects explicit currency', () => {
    const result = formatPrice(100, 'EUR');
    expect(result).toContain('100');
  });

  it('handles invalid currency gracefully', () => {
    const result = formatPrice(100, 'INVALID_CURRENCY');
    expect(result).toContain('100');
  });
});

// ── formatSignedPercent ──────────────────────────────────────────────
describe('formatSignedPercent', () => {
  it('shows up arrow for positive', () => {
    expect(formatSignedPercent(1.5)).toBe('▲ 1.50%');
  });

  it('shows down arrow for negative', () => {
    expect(formatSignedPercent(-2.3)).toBe('▼ 2.30%');
  });

  it('shows dot for zero', () => {
    expect(formatSignedPercent(0)).toBe('• 0.00%');
  });

  it('returns undefined for NaN/undefined', () => {
    expect(formatSignedPercent(undefined)).toBeUndefined();
    expect(formatSignedPercent(NaN)).toBeUndefined();
  });
});

// ── expandHome ───────────────────────────────────────────────────────
describe('expandHome', () => {
  it('expands ~ to home directory', () => {
    expect(expandHome('~/test')).toBe(join(homedir(), 'test'));
  });

  it('leaves absolute paths unchanged', () => {
    expect(expandHome('/absolute/path')).toBe('/absolute/path');
  });
});

// ── logInfo / logDebug ───────────────────────────────────────────────
describe('logInfo', () => {
  it('logs when verbose is true', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(noop);
    logInfo({ verbose: true }, 'test message');
    expect(spy).toHaveBeenCalledWith('[phrases] test message');
    spy.mockRestore();
  });

  it('does not log when verbose is false', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(noop);
    logInfo({ verbose: false }, 'test message');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('logDebug', () => {
  it('logs when debug is true', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(noop);
    logDebug({ debug: true }, 'debug message');
    expect(spy).toHaveBeenCalledWith('[phrases:debug] debug message');
    spy.mockRestore();
  });
});

// ── loadDotEnv ───────────────────────────────────────────────────────
describe('loadDotEnv', () => {
  const tmpDir = join(tmpdir(), 'thinking-phrases-test-dotenv');
  const envFile = join(tmpDir, '.env');

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.TEST_DOTENV_VAR;
  });

  it('loads key=value pairs into process.env', () => {
    writeFileSync(envFile, 'TEST_DOTENV_VAR=hello\n');
    loadDotEnv(envFile);
    expect(process.env.TEST_DOTENV_VAR).toBe('hello');
  });

  it('does not overwrite existing env vars', () => {
    process.env.TEST_DOTENV_VAR = 'existing';
    writeFileSync(envFile, 'TEST_DOTENV_VAR=new\n');
    loadDotEnv(envFile);
    expect(process.env.TEST_DOTENV_VAR).toBe('existing');
  });

  it('skips comments and blank lines', () => {
    writeFileSync(envFile, '# comment\n\nTEST_DOTENV_VAR=value\n');
    loadDotEnv(envFile);
    expect(process.env.TEST_DOTENV_VAR).toBe('value');
  });

  it('strips surrounding quotes', () => {
    writeFileSync(envFile, "TEST_DOTENV_VAR='quoted'\n");
    loadDotEnv(envFile);
    expect(process.env.TEST_DOTENV_VAR).toBe('quoted');
  });

  it('does nothing for non-existent file', () => {
    loadDotEnv('/nonexistent/.env');
    // just ensure no throw
  });
});

// ── fetchText / fetchJson ────────────────────────────────────────────
describe('fetchText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns response text on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('hello world', { status: 200 }),
    );
    const result = await fetchText('https://example.com');
    expect(result).toBe('hello world');
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not found', { status: 404 }),
    );
    await expect(fetchText('https://example.com')).rejects.toThrow('404');
  });
});

describe('fetchJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ key: 'value' }), { status: 200 }),
    );
    const result = await fetchJson<{ key: string }>('https://example.com');
    expect(result).toEqual({ key: 'value' });
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('error', { status: 500 }),
    );
    await expect(fetchJson('https://example.com')).rejects.toThrow('500');
  });
});

// ── resolveSettingsPath ──────────────────────────────────────────────
describe('resolveSettingsPath', () => {
  it('returns explicit path expanded from ~', () => {
    const result = resolveSettingsPath('auto', '~/my-settings.json');
    expect(result).toBe(join(homedir(), 'my-settings.json'));
  });

  it('returns absolute explicit path unchanged', () => {
    const result = resolveSettingsPath('auto', '/absolute/settings.json');
    expect(result).toBe('/absolute/settings.json');
  });

  it('resolves relative explicit path against cwd', () => {
    const result = resolveSettingsPath('auto', 'relative/settings.json');
    expect(result).toContain('relative/settings.json');
    expect(result.startsWith('/')).toBe(true);
  });

  it('returns a valid path for insiders target', () => {
    const result = resolveSettingsPath('insiders');
    expect(result).toContain('settings.json');
    expect(result).toMatch(/Insiders|insiders/i);
  });

  it('returns a valid path for stable target', () => {
    const result = resolveSettingsPath('stable');
    expect(result).toContain('settings.json');
    expect(result).not.toMatch(/Insiders/i);
  });

  it('returns a valid path for auto target', () => {
    const result = resolveSettingsPath('auto');
    expect(result).toContain('settings.json');
  });
});

// ── fetchUsZipLocation ───────────────────────────────────────────────
describe('fetchUsZipLocation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws on invalid zip code', async () => {
    await expect(fetchUsZipLocation('bad')).rejects.toThrow('Invalid ZIP code');
  });

  it('fetches and parses valid zip location', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        'post code': '33312',
        country: 'US',
        places: [{
          'place name': 'Fort Lauderdale',
          state: 'Florida',
          'state abbreviation': 'FL',
          latitude: '26.0985',
          longitude: '-80.1636',
        }],
      })),
    );

    const result = await fetchUsZipLocation('33312');
    expect(result.zipCode).toBe('33312');
    expect(result.placeName).toBe('Fort Lauderdale');
    expect(result.stateAbbreviation).toBe('FL');
    expect(result.latitude).toBeCloseTo(26.0985);
    expect(result.longitude).toBeCloseTo(-80.1636);
  });

  it('throws when API returns no places', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ places: [] })),
    );

    await expect(fetchUsZipLocation('00000')).rejects.toThrow('Could not resolve ZIP code');
  });

  it('throws when API returns invalid coordinates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        places: [{
          'place name': 'Nowhere',
          latitude: 'invalid',
          longitude: 'invalid',
        }],
      })),
    );

    await expect(fetchUsZipLocation('99999')).rejects.toThrow('Could not resolve ZIP code');
  });
});
