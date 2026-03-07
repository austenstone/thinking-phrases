import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ArticleItem, Config } from './types.js';
import { logDebug, logInfo } from './utils.js';

const CACHE_DIR = join(homedir(), '.cache', 'thinking-phrases');
const SOURCE_TIMESTAMPS_FILE = join(CACHE_DIR, 'source-timestamps.json');
const MODEL_CACHE_FILE = join(CACHE_DIR, 'model-cache.json');
const DEFAULT_CACHE_TTL_SECONDS = 604800; // 7 days

type SourceTimestamps = Record<string, number>;

interface ModelCacheEntry {
  phrases: string[];
  cachedAt: number; // epoch ms
}

type ModelCache = Record<string, ModelCacheEntry>;

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown): void {
  ensureCacheDir();
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// --- Source fetch interval tracking ---

function readSourceTimestamps(): SourceTimestamps {
  return readJson<SourceTimestamps>(SOURCE_TIMESTAMPS_FILE, {});
}

function writeSourceTimestamps(timestamps: SourceTimestamps): void {
  writeJson(SOURCE_TIMESTAMPS_FILE, timestamps);
}

/**
 * Returns the configured fetchIntervalSeconds for a given source type.
 * RSS feeds use a top-level `rssFetchIntervalSeconds` since each feed doesn't
 * map 1:1 to a source config block.
 */
export function getSourceIntervalSeconds(sourceType: string, config: Config): number {
  switch (sourceType) {
    case 'rss': return config.rssFetchIntervalSeconds;
    case 'stocks': return config.stockQuotes.fetchIntervalSeconds ?? 60;
    case 'hacker-news': return config.hackerNews.fetchIntervalSeconds ?? 300;
    case 'earthquakes': return config.earthquakes.fetchIntervalSeconds ?? 1800;
    case 'weather-alerts': return config.weatherAlerts.fetchIntervalSeconds ?? 1800;
    case 'custom-json': return config.customJson.fetchIntervalSeconds ?? 3600;
    case 'github-activity': return config.githubActivity.fetchIntervalSeconds ?? 300;
    default: return 300;
  }
}

/**
 * Check whether a source should be fetched based on its per-source interval.
 * Returns true if the source is stale (interval elapsed) or has never been fetched.
 */
export function isSourceStale(sourceType: string, config: Config): boolean {
  const timestamps = readSourceTimestamps();
  const lastFetch = timestamps[sourceType];
  if (lastFetch === undefined) {
    return true;
  }

  const intervalMs = getSourceIntervalSeconds(sourceType, config) * 1000;
  const elapsed = Date.now() - lastFetch;
  return elapsed >= intervalMs;
}

/**
 * Record that a source was successfully fetched right now.
 */
export function markSourceFetched(sourceType: string): void {
  const timestamps = readSourceTimestamps();
  timestamps[sourceType] = Date.now();
  writeSourceTimestamps(timestamps);
}

// --- Model result deduplication cache ---

function readModelCache(): ModelCache {
  return readJson<ModelCache>(MODEL_CACHE_FILE, {});
}

function writeModelCache(cache: ModelCache): void {
  writeJson(MODEL_CACHE_FILE, cache);
}

/**
 * Prune model cache entries older than the configured TTL.
 */
function pruneModelCache(cache: ModelCache, ttlSeconds: number): ModelCache {
  const cutoff = Date.now() - ttlSeconds * 1000;
  const pruned: ModelCache = {};
  for (const [id, entry] of Object.entries(cache)) {
    if (entry.cachedAt >= cutoff) {
      pruned[id] = entry;
    }
  }

  return pruned;
}

/**
 * Split articles into those that need model processing and those that already
 * have cached phrases. Returns the cached phrases for the already-processed ones.
 */
export function partitionArticlesByModelCache(
  articles: ArticleItem[],
  config: Config,
): { uncached: ArticleItem[]; cachedPhrases: string[] } {
  const ttl = config.githubModels.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
  const cache = pruneModelCache(readModelCache(), ttl);
  const uncached: ArticleItem[] = [];
  const cachedPhrases: string[] = [];

  for (const article of articles) {
    const entry = cache[article.id];
    if (entry) {
      logDebug(config, `Model cache hit for "${article.title ?? article.id}"`);
      cachedPhrases.push(...entry.phrases);
    } else {
      uncached.push(article);
    }
  }

  logInfo(config, `Model cache: ${cachedPhrases.length} cached phrases, ${uncached.length} articles need processing`);
  return { uncached, cachedPhrases };
}

/**
 * Save model-generated phrases keyed by article ID so we never re-process them.
 * Maps each phrase back to its source article via a simple index-based heuristic:
 * phrases are distributed round-robin across the input articles.
 *
 * For better accuracy, call this per-chunk where articles and phrases align tightly.
 */
export function cacheModelResults(articles: ArticleItem[], phrases: string[], config: Config): void {
  const ttl = config.githubModels.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
  const cache = pruneModelCache(readModelCache(), ttl);
  const maxPerArticle = config.githubModels.maxPhrasesPerArticle;

  // Best-effort: assign phrases to articles in order, up to maxPhrasesPerArticle each
  let phraseIndex = 0;
  for (const article of articles) {
    const articlePhrases: string[] = [];
    while (phraseIndex < phrases.length && articlePhrases.length < maxPerArticle) {
      articlePhrases.push(phrases[phraseIndex]);
      phraseIndex += 1;
    }

    cache[article.id] = { phrases: articlePhrases, cachedAt: Date.now() };
  }

  // Overflow phrases (more output than articles) are dropped — they'd accumulate
  // under unique keys and never get reused.

  writeModelCache(cache);
}

// --- Phrase store (merge across fetch intervals) ---

const PHRASE_STORE_FILE = join(CACHE_DIR, 'phrase-store.json');

type PhraseStore = Record<string, {
  phrases: string[];
  updatedAt: number;
}>;

function readPhraseStore(): PhraseStore {
  return readJson<PhraseStore>(PHRASE_STORE_FILE, {});
}

function writePhraseStore(store: PhraseStore): void {
  writeJson(PHRASE_STORE_FILE, store);
}

/**
 * Persist phrases for a source type so they survive across runs
 * where the source isn't re-fetched (interval not elapsed).
 */
export function storePhrases(sourceType: string, phrases: string[]): void {
  const store = readPhraseStore();
  store[sourceType] = { phrases, updatedAt: Date.now() };
  writePhraseStore(store);
}

/**
 * Merge stored phrases with fair round-robin distribution across sources.
 * Each source contributes proportionally so no single source dominates.
 */
export function getMergedPhrases(limit: number): string[] {
  const store = readPhraseStore();
  const entries = Object.values(store).filter(e => e.phrases.length > 0);
  if (entries.length === 0) return [];

  const result: string[] = [];
  const perSource = Math.max(1, Math.ceil(limit / entries.length));

  // First pass: give each source its fair share
  for (const entry of entries) {
    result.push(...entry.phrases.slice(0, perSource));
  }

  // Second pass: fill remaining slots from sources that have more
  if (result.length < limit) {
    for (const entry of entries) {
      const remaining = entry.phrases.slice(perSource);
      for (const phrase of remaining) {
        if (result.length >= limit) break;
        if (!result.includes(phrase)) {
          result.push(phrase);
        }
      }
    }
  }

  return result.slice(0, limit);
}
