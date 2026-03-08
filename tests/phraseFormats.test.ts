import { describe, it, expect } from 'vitest';
import {
  PHRASE_SEPARATOR,
  applyFormatTemplate,
  formatArticlePhrase,
  formatHackerNewsPhrase,
  formatStockPhrase,
  formatGitHubCommitPhrase,
  formatGitHubFeedPhrase,
  formatWeatherNoAlertsPhrase,
} from '../src/core/phraseFormats.js';

// ── PHRASE_SEPARATOR ─────────────────────────────────────────────────
describe('PHRASE_SEPARATOR', () => {
  it('is an em-dash with spaces', () => {
    expect(PHRASE_SEPARATOR).toBe(' — ');
  });
});

// ── formatArticlePhrase ──────────────────────────────────────────────
// Default article format used by RSS, Earthquakes, Weather, Custom JSON.
// Expected output: "Title — Source (3h ago)"
describe('formatArticlePhrase', () => {
  it('formats with source, title, and time', () => {
    expect(formatArticlePhrase(
      { source: 'GitHub Blog', title: 'Copilot in the CLI', time: '3h ago' },
    )).toBe('Copilot in the CLI — GitHub Blog (3h ago)');
  });

  it('omits source when includeSource is false', () => {
    expect(formatArticlePhrase(
      { source: 'GitHub Blog', title: 'Copilot in the CLI', time: '3h ago' },
      { includeSource: false },
    )).toBe('Copilot in the CLI — (3h ago)');
  });

  it('omits time when includeTime is false', () => {
    expect(formatArticlePhrase(
      { source: 'GitHub Blog', title: 'Copilot in the CLI', time: '3h ago' },
      { includeTime: false },
    )).toBe('Copilot in the CLI — GitHub Blog');
  });

  it('formats title only when source and time missing', () => {
    expect(formatArticlePhrase({ title: 'Just a title' })).toBe('Just a title');
  });

  it('omits source when empty string', () => {
    expect(formatArticlePhrase(
      { source: '', title: 'Title', time: '1h ago' },
    )).toBe('Title — (1h ago)');
  });

  it('omits source when whitespace only', () => {
    expect(formatArticlePhrase(
      { source: '   ', title: 'Title', time: '2d ago' },
    )).toBe('Title — (2d ago)');
  });

  it('omits time when empty string', () => {
    expect(formatArticlePhrase(
      { source: 'Src', title: 'Title', time: '' },
    )).toBe('Title — Src');
  });

  it('trims whitespace from all parts', () => {
    expect(formatArticlePhrase(
      { source: '  Src  ', title: '  Title  ', time: '  1h ago  ' },
    )).toBe('Title — Src (1h ago)');
  });

  it('omits both source and time when both disabled', () => {
    expect(formatArticlePhrase(
      { source: 'Src', title: 'Title', time: '1h ago' },
      { includeSource: false, includeTime: false },
    )).toBe('Title');
  });
});

// ── formatHackerNewsPhrase ───────────────────────────────────────────
// Expected output: "HN: Title — +342 — 3h ago"
describe('formatHackerNewsPhrase', () => {
  it('formats with title, score, and time', () => {
    expect(formatHackerNewsPhrase(
      { title: 'Show HN: My project', score: '+342', time: '3h ago' },
    )).toBe('HN: Show HN: My project — +342 — 3h ago');
  });

  it('formats without score', () => {
    expect(formatHackerNewsPhrase(
      { title: 'Ask HN: Best language?', time: '5h ago' },
    )).toBe('HN: Ask HN: Best language? — 5h ago');
  });

  it('formats without time', () => {
    expect(formatHackerNewsPhrase(
      { title: 'Rust is awesome', score: '+100' },
    )).toBe('HN: Rust is awesome — +100');
  });

  it('formats with title only', () => {
    expect(formatHackerNewsPhrase(
      { title: 'Just a title' },
    )).toBe('HN: Just a title');
  });
});

// ── formatStockPhrase ────────────────────────────────────────────────
// Expected output: "MSFT $425.30 ▲ 1.25% 🟢"
describe('formatStockPhrase', () => {
  it('formats with all fields', () => {
    expect(formatStockPhrase(
      { symbol: 'MSFT', price: '$425.30', change: '▲ 1.25%', market: '🟢' },
    )).toBe('MSFT $425.30 ▲ 1.25% 🟢');
  });

  it('formats without change', () => {
    expect(formatStockPhrase(
      { symbol: 'MSFT', price: '$425.30', market: '🟢' },
    )).toBe('MSFT $425.30 🟢');
  });

  it('formats without market', () => {
    expect(formatStockPhrase(
      { symbol: 'MSFT', price: '$425.30', change: '▲ 1.25%' },
    )).toBe('MSFT $425.30 ▲ 1.25%');
  });

  it('formats with symbol and price only', () => {
    expect(formatStockPhrase(
      { symbol: 'MSFT', price: '$425.30' },
    )).toBe('MSFT $425.30');
  });

  it('shows down arrow for negative', () => {
    expect(formatStockPhrase(
      { symbol: 'TSLA', price: '$180.00', change: '▼ 3.50%', market: '🔒' },
    )).toBe('TSLA $180.00 ▼ 3.50% 🔒');
  });
});

// ── formatGitHubCommitPhrase ─────────────────────────────────────────
// Expected output: "Fix null check (+12 -3) vscode@a1b2c3d - @octocat 2h ago"
describe('formatGitHubCommitPhrase', () => {
  it('formats with all metadata', () => {
    expect(formatGitHubCommitPhrase({
      headline: 'Fix null check',
      delta: '+12 -3',
      repo: 'vscode',
      sha: 'a1b2c3d',
      author: 'octocat',
      time: '2h ago',
    })).toBe('Fix null check (+12 -3) vscode@a1b2c3d - @octocat 2h ago');
  });

  it('formats without delta', () => {
    expect(formatGitHubCommitPhrase({
      headline: 'Fix null check',
      repo: 'vscode',
      sha: 'a1b2c3d',
      author: 'octocat',
      time: '2h ago',
    })).toBe('Fix null check vscode@a1b2c3d - @octocat 2h ago');
  });

  it('formats without sha', () => {
    expect(formatGitHubCommitPhrase({
      headline: 'Fix null check',
      delta: '+12 -3',
      repo: 'vscode',
      author: 'octocat',
      time: '2h ago',
    })).toBe('Fix null check (+12 -3) vscode - @octocat 2h ago');
  });

  it('formats without author', () => {
    expect(formatGitHubCommitPhrase({
      headline: 'Fix null check',
      delta: '+12 -3',
      repo: 'vscode',
      sha: 'a1b2c3d',
      time: '2h ago',
    })).toBe('Fix null check (+12 -3) vscode@a1b2c3d 2h ago');
  });

  it('formats without time', () => {
    expect(formatGitHubCommitPhrase({
      headline: 'Fix null check',
      delta: '+12 -3',
      repo: 'vscode',
      sha: 'a1b2c3d',
      author: 'octocat',
    })).toBe('Fix null check (+12 -3) vscode@a1b2c3d - @octocat');
  });

  it('formats with headline and repo only', () => {
    expect(formatGitHubCommitPhrase({
      headline: 'Initial commit',
      repo: 'my-repo',
    })).toBe('Initial commit my-repo');
  });

  it('handles missing headline gracefully', () => {
    const result = formatGitHubCommitPhrase({
      repo: 'vscode',
      sha: 'abc1234',
      time: '1h ago',
    });
    expect(result).toBe('vscode@abc1234 1h ago');
  });
});

// ── formatGitHubFeedPhrase ───────────────────────────────────────────
// Expected output: "@octocat pushed to main — 1h ago"
describe('formatGitHubFeedPhrase', () => {
  it('formats with handle and time', () => {
    expect(formatGitHubFeedPhrase({
      handle: 'octocat',
      action: 'pushed to main',
      time: '1h ago',
    })).toBe('@octocat pushed to main — 1h ago');
  });

  it('formats without handle', () => {
    expect(formatGitHubFeedPhrase({
      action: 'pushed to main',
      time: '1h ago',
    })).toBe('pushed to main — 1h ago');
  });

  it('formats without time', () => {
    expect(formatGitHubFeedPhrase({
      handle: 'octocat',
      action: 'opened a pull request in vscode',
    })).toBe('@octocat opened a pull request in vscode');
  });

  it('formats with action only', () => {
    expect(formatGitHubFeedPhrase({
      action: 'starred vscode',
    })).toBe('starred vscode');
  });
});

// ── formatWeatherNoAlertsPhrase ──────────────────────────────────────
// Expected output: "No active alerts — Fort Lauderdale, FL — Weather.gov"
describe('formatWeatherNoAlertsPhrase', () => {
  it('formats with location', () => {
    expect(formatWeatherNoAlertsPhrase({ location: 'Fort Lauderdale, FL' }))
      .toBe('No active alerts — Fort Lauderdale, FL — Weather.gov');
  });

  it('formats with zip code fallback', () => {
    expect(formatWeatherNoAlertsPhrase({ location: '33312' }))
      .toBe('No active alerts — 33312 — Weather.gov');
  });
});

// ── applyFormatTemplate ──────────────────────────────────────────────
describe('applyFormatTemplate', () => {
  it('substitutes all known variables', () => {
    expect(applyFormatTemplate(
      '%source% — %title% — %time%',
      { source: 'GitHub Blog', title: 'Copilot rocks', time: '3h ago' },
    )).toBe('GitHub Blog — Copilot rocks — 3h ago');
  });

  it('removes placeholders when variable is undefined', () => {
    expect(applyFormatTemplate(
      '%source% — %title% — %time%',
      { title: 'Just a title' },
    )).toBe('Just a title');
  });

  it('removes placeholders when variable is empty string', () => {
    expect(applyFormatTemplate(
      '%source% — %title% — %time%',
      { source: '', title: 'Title', time: '' },
    )).toBe('Title');
  });

  it('removes placeholders when variable is whitespace only', () => {
    expect(applyFormatTemplate(
      '%source% | %title% | %time%',
      { source: '  ', title: 'Title', time: '  ' },
    )).toBe('Title');
  });

  it('cleans up dangling separators at start', () => {
    expect(applyFormatTemplate(
      '%source% — %title%',
      { title: 'Title' },
    )).toBe('Title');
  });

  it('cleans up dangling separators at end', () => {
    expect(applyFormatTemplate(
      '%title% — %time%',
      { title: 'Title' },
    )).toBe('Title');
  });

  it('cleans up collapsed separators in middle', () => {
    expect(applyFormatTemplate(
      '%source% — %middle% — %title%',
      { source: 'Src', title: 'Title' },
    )).toBe('Src — Title');
  });

  it('handles custom separators like pipes', () => {
    expect(applyFormatTemplate(
      '%source% | %title% | %time%',
      { source: 'HN', title: 'Cool story', time: '1h ago' },
    )).toBe('HN | Cool story | 1h ago');
  });

  it('handles no-separator templates', () => {
    expect(applyFormatTemplate(
      '[%source%] %title%',
      { source: 'RSS', title: 'New post' },
    )).toBe('[RSS] New post');
  });

  it('handles bracket-wrapped variables with missing value', () => {
    expect(applyFormatTemplate(
      '(%delta%) %repo%',
      { repo: 'vscode' },
    )).toBe('vscode');
  });

  it('preserves literal text with no variables', () => {
    expect(applyFormatTemplate(
      'Hello world',
      { source: 'ignored' },
    )).toBe('Hello world');
  });

  it('trims the final result', () => {
    expect(applyFormatTemplate(
      '  %title%  ',
      { title: 'Hello' },
    )).toBe('Hello');
  });
});

// ── Template-aware formatters ────────────────────────────────────────
describe('formatArticlePhrase with template', () => {
  it('uses template when provided', () => {
    expect(formatArticlePhrase(
      { source: 'RSS Feed', title: 'Big news', time: '2h ago' },
      { template: '[%source%] %title% (%time%)' },
    )).toBe('[RSS Feed] Big news (2h ago)');
  });

  it('falls back to default format when template is undefined', () => {
    expect(formatArticlePhrase(
      { source: 'RSS Feed', title: 'Big news', time: '2h ago' },
    )).toBe('Big news — RSS Feed (2h ago)');
  });

  it('template still respects missing vars', () => {
    expect(formatArticlePhrase(
      { title: 'Only title' },
      { template: '%source% | %title% | %time%' },
    )).toBe('Only title');
  });
});

describe('formatHackerNewsPhrase with template', () => {
  it('uses template when provided', () => {
    expect(formatHackerNewsPhrase(
      { title: 'Show HN: AI thing', score: '+500', time: '1h ago' },
      { template: '🔥 %title% [%score%] %time%' },
    )).toBe('🔥 Show HN: AI thing [+500] 1h ago');
  });

  it('falls back to default format when no template', () => {
    expect(formatHackerNewsPhrase(
      { title: 'Cool post', score: '+42', time: '3h ago' },
    )).toBe('HN: Cool post — +42 — 3h ago');
  });
});

describe('formatStockPhrase with template', () => {
  it('uses template when provided', () => {
    expect(formatStockPhrase(
      { symbol: 'MSFT', price: '$425.30', change: '▲ 1.25%', market: '🟢' },
      { template: '%symbol%: %price% (%change%) %market%' },
    )).toBe('MSFT: $425.30 (▲ 1.25%) 🟢');
  });

  it('falls back to default format when no template', () => {
    expect(formatStockPhrase(
      { symbol: 'MSFT', price: '$425.30', change: '▲ 1.25%', market: '🟢' },
    )).toBe('MSFT $425.30 ▲ 1.25% 🟢');
  });
});

describe('formatGitHubCommitPhrase with template', () => {
  it('uses template when provided', () => {
    expect(formatGitHubCommitPhrase(
      { headline: 'Fix bug', delta: '+5 -2', repo: 'vscode', sha: 'abc1234', author: 'octocat', time: '1h ago' },
      { template: '%headline% [%repo%@%sha%] by @%author% — %time%' },
    )).toBe('Fix bug [vscode@abc1234] by @octocat — 1h ago');
  });

  it('falls back to default format when no template', () => {
    expect(formatGitHubCommitPhrase({
      headline: 'Fix bug',
      delta: '+5 -2',
      repo: 'vscode',
      sha: 'abc1234',
      author: 'octocat',
      time: '1h ago',
    })).toBe('Fix bug (+5 -2) vscode@abc1234 - @octocat 1h ago');
  });
});

describe('formatGitHubFeedPhrase with template', () => {
  it('uses template when provided', () => {
    expect(formatGitHubFeedPhrase(
      { handle: 'octocat', action: 'pushed to main', time: '2h ago' },
      { template: '[%handle%] %action% (%time%)' },
    )).toBe('[octocat] pushed to main (2h ago)');
  });

  it('falls back to default format when no template', () => {
    expect(formatGitHubFeedPhrase({
      handle: 'octocat',
      action: 'pushed to main',
      time: '2h ago',
    })).toBe('@octocat pushed to main — 2h ago');
  });
});
