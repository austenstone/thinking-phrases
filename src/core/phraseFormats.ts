/**
 * Centralized phrase format definitions.
 *
 * Every display-string pattern lives here so there's one place to
 * tweak separators, ordering, or punctuation across all sources.
 *
 * Each formatter accepts an optional `template` string with %varName%
 * placeholders. When provided, the template drives the output. When
 * omitted, the hardcoded default format is used (backward-compatible).
 */

/** Separator used between phrase segments (e.g. source, title, time). */
export const PHRASE_SEPARATOR = ' — ';

// ── Template Engine ─────────────────────────────────────────────────

/**
 * Substitute %varName% placeholders with values from `vars`.
 * - Missing / empty / whitespace-only vars are removed.
 * - Dangling separators and wrapper chars like `()` `[]` are cleaned up.
 */
export function applyFormatTemplate(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  let result = template;

  // Replace every %key% with its value, or empty string if missing
  result = result.replace(/%([a-zA-Z_]\w*)%/gu, (_match, key: string) => {
    const value = vars[key]?.trim();
    return value || '';
  });

  // Remove empty wrapper pairs: (), [], {}
  result = result.replace(/\(\s*\)/gu, '');
  result = result.replace(/\[\s*\]/gu, '');
  result = result.replace(/\{\s*\}/gu, '');

  // Collapse repeated separators (handles — , | , - , etc.)
  result = result.replace(/\s*(?:—|\||-|•|·)\s*(?:(?:—|\||-|•|·)\s*)*/gu, (match) => {
    // Keep just the first separator character with its original spacing pattern
    const sepMatch = match.match(/\s*(—|\||-|•|·)\s*/u);
    return sepMatch ? ` ${sepMatch[1]} ` : ' ';
  });

  // Clean up multiple spaces
  result = result.replace(/\s{2,}/gu, ' ');

  // Remove leading/trailing separators
  result = result.replace(/^\s*(?:—|\||-|•|·)\s*/u, '');
  result = result.replace(/\s*(?:—|\||-|•|·)\s*$/u, '');

  return result.trim();
}

// ── Article (RSS, Earthquakes, Weather alerts, Custom JSON) ─────────

export interface ArticlePhraseVars {
  source?: string;
  title: string;
  time?: string;
}

export interface ArticlePhraseOpts {
  includeSource?: boolean;
  includeTime?: boolean;
  template?: string;
}

/** Default: "Title — Source (3h ago)" */
export function formatArticlePhrase(
  vars: ArticlePhraseVars,
  opts?: ArticlePhraseOpts,
): string {
  if (opts?.template) {
    return applyFormatTemplate(opts.template, { ...vars });
  }

  const parts: string[] = [vars.title.trim()];
  const suffix = [
    opts?.includeSource !== false && vars.source?.trim() ? vars.source.trim() : '',
    opts?.includeTime !== false && vars.time?.trim() ? `(${vars.time.trim()})` : '',
  ].filter(Boolean).join(' ');

  if (suffix) {
    parts.push(suffix);
  }

  return parts.join(PHRASE_SEPARATOR);
}

// ── Hacker News ─────────────────────────────────────────────────────

export interface HackerNewsPhraseVars {
  title: string;
  score?: string;
  time?: string;
}

export interface HackerNewsPhraseOpts {
  template?: string;
}

/** Default: "HN: Title — +342 — 3h ago" */
export function formatHackerNewsPhrase(vars: HackerNewsPhraseVars, opts?: HackerNewsPhraseOpts): string {
  if (opts?.template) {
    return applyFormatTemplate(opts.template, { ...vars });
  }

  return [`HN: ${vars.title}`, vars.score, vars.time]
    .filter(Boolean)
    .join(PHRASE_SEPARATOR);
}

// ── Stocks ──────────────────────────────────────────────────────────

export interface StockPhraseVars {
  symbol: string;
  price: string;
  change?: string;
  market?: string;
}

export interface StockPhraseOpts {
  template?: string;
}

/** Default: "MSFT $425.30 ▲ 1.25% 🟢" */
export function formatStockPhrase(vars: StockPhraseVars, opts?: StockPhraseOpts): string {
  if (opts?.template) {
    return applyFormatTemplate(opts.template, { ...vars });
  }

  return [vars.symbol, vars.price, vars.change, vars.market]
    .filter(Boolean)
    .join(' ');
}

// ── GitHub Commits ──────────────────────────────────────────────────

export interface GitHubCommitPhraseVars {
  headline?: string;
  delta?: string;
  repo: string;
  sha?: string;
  author?: string;
  time?: string;
}

export interface GitHubCommitPhraseOpts {
  template?: string;
}

/** Default: "Fix null check (+12 -3) vscode@a1b2c3d - @octocat 2h ago" */
export function formatGitHubCommitPhrase(vars: GitHubCommitPhraseVars, opts?: GitHubCommitPhraseOpts): string {
  if (opts?.template) {
    return applyFormatTemplate(opts.template, { ...vars });
  }

  const metadata = [
    vars.delta ? `(${vars.delta})` : undefined,
    `${vars.repo}${vars.sha ? `@${vars.sha}` : ''}`,
    vars.author ? `- @${vars.author}` : undefined,
    vars.time,
  ].filter(Boolean);

  return [vars.headline, ...metadata].filter(Boolean).join(' ');
}

// ── GitHub Feed / Org Events ────────────────────────────────────────

export interface GitHubFeedPhraseVars {
  handle?: string;
  action: string;
  time?: string;
}

export interface GitHubFeedPhraseOpts {
  template?: string;
}

/** Default: "@octocat pushed to main — 1h ago" */
export function formatGitHubFeedPhrase(vars: GitHubFeedPhraseVars, opts?: GitHubFeedPhraseOpts): string {
  if (opts?.template) {
    return applyFormatTemplate(opts.template, { ...vars });
  }

  const titlePart = vars.handle
    ? `@${vars.handle} ${vars.action}`
    : vars.action;

  return vars.time
    ? `${titlePart}${PHRASE_SEPARATOR}${vars.time}`
    : titlePart;
}

// ── Weather No-Alerts ───────────────────────────────────────────────

export interface WeatherNoAlertsPhraseVars {
  location: string;
}

/** "No active alerts — Fort Lauderdale, FL — Weather.gov" */
export function formatWeatherNoAlertsPhrase(vars: WeatherNoAlertsPhraseVars): string {
  return `No active alerts${PHRASE_SEPARATOR}${vars.location}${PHRASE_SEPARATOR}Weather.gov`;
}

// ── Source Suffix ───────────────────────────────────────────────────

/**
 * Build a source suffix from article metadata.
 * Format varies by source type:
 *   HN:     "— HN @author 123 pts (2h ago)"
 *   GitHub: "— repo +12/-3 @user (5m ago)"
 *   RSS:    "— GitHub Blog (3h ago)"
 */
export function appendSourceSuffix(
  phrase: string,
  source?: string,
  time?: string,
  metadata?: Record<string, string | undefined>,
): string {
  const parts: string[] = [];

  if (metadata?.repo && metadata?.delta) {
    // GitHub commit: "repo +12/-3 @user"
    parts.push(metadata.repo);
    parts.push(metadata.delta);
    if (metadata.author) parts.push(metadata.author);
  } else if (metadata?.score) {
    // Hacker News: "HN @author 123 pts"
    if (source) parts.push(source);
    if (metadata.author) parts.push(`@${metadata.author}`);
    parts.push(metadata.score);
  } else if (source) {
    parts.push(source);
  }

  if (time) parts.push(`(${time})`);

  const suffix = parts.join(' ');
  return suffix ? `${phrase}${PHRASE_SEPARATOR}${suffix}` : phrase;
}
