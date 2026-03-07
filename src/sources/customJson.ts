import type { ArticleItem, Config, CustomJsonConfig, PhraseSource } from '../core/types.js';
import { fetchJson, logInfo, relativeTime, stripHtml, truncate } from '../core/utils.js';

type PathSegment = number | string;

const PATH_SEGMENT_PATTERN = /(?:^|\.)([^.[\]]+)|\[(\d+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\]/gu;

function parsePathSegments(path: string): PathSegment[] {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return [];
  }

  const segments: PathSegment[] = [];

  for (const match of normalizedPath.matchAll(PATH_SEGMENT_PATTERN)) {
    const [, dotSegment, bracketSegment] = match;
    if (dotSegment) {
      segments.push(dotSegment);
      continue;
    }

    if (!bracketSegment) {
      continue;
    }

    if (/^\d+$/u.test(bracketSegment)) {
      segments.push(Number(bracketSegment));
      continue;
    }

    segments.push(bracketSegment.slice(1, -1));
  }

  return segments;
}

function getPathValue(input: unknown, path?: string): unknown {
  if (!path?.trim()) {
    return input;
  }

  const segments = parsePathSegments(path);
  let current: unknown = input;

  for (const segment of segments) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        return undefined;
      }

      current = current[segment];
      continue;
    }

    if (!current || typeof current !== 'object') {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function readStringValue(input: unknown, path?: string): string | undefined {
  const value = getPathValue(input, path);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
}

function toIsoDate(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value >= 1_000_000_000_000 ? value : value >= 1_000_000_000 ? value * 1000 : NaN;
    if (!Number.isFinite(milliseconds)) {
      return undefined;
    }

    return new Date(milliseconds).toISOString();
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d+(\.\d+)?$/u.test(trimmed)) {
    return toIsoDate(Number(trimmed));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function buildDefaultSourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, '');
  } catch {
    return 'Custom JSON';
  }
}

function resolveItems(payload: unknown, path?: string): unknown[] {
  const resolved = getPathValue(payload, path);
  if (Array.isArray(resolved)) {
    return resolved;
  }

  if (!path?.trim() && Array.isArray(payload)) {
    return payload;
  }

  throw new Error(`Custom JSON items path did not resolve to an array${path?.trim() ? `: ${path}` : ''}`);
}

async function fetchSingleCustomJsonSource(sourceConfig: CustomJsonConfig, config: Config): Promise<ArticleItem[]> {
  logInfo(config, `Fetching custom JSON items from ${sourceConfig.url}`);
  const payload = await fetchJson<unknown>(sourceConfig.url);
  const items = resolveItems(payload, sourceConfig.itemsPath).slice(0, sourceConfig.maxItems);
  const defaultSource = sourceConfig.sourceLabel?.trim() || buildDefaultSourceLabel(sourceConfig.url);

  return items.flatMap((item, index) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const title = readStringValue(item, sourceConfig.titleField);
    if (!title) {
      return [];
    }

    const content = stripHtml(readStringValue(item, sourceConfig.contentField));
    const datetime = toIsoDate(getPathValue(item, sourceConfig.dateField));
    const link = readStringValue(item, sourceConfig.linkField);
    const source = readStringValue(item, sourceConfig.sourceField) ?? defaultSource;
    const id = readStringValue(item, sourceConfig.idField)
      ?? link
      ?? `${sourceConfig.url}#${index}:${title}`;

    return [{
      type: 'article' as const,
      id: `custom-json:${id}`,
      title,
      link,
      source,
      datetime,
      time: relativeTime(datetime),
      content,
      articleContent: content ? truncate(content, config.githubModels.maxArticleContentLength) : undefined,
    }];
  });
}

export async function fetchCustomJsonArticles(config: Config): Promise<ArticleItem[]> {
  const allSources: CustomJsonConfig[] = [
    ...(config.customJson.enabled ? [config.customJson] : []),
    ...(config.customJsonSources ?? []).filter(s => s.enabled),
  ];

  if (allSources.length === 0) {
    return [];
  }

  const results = await Promise.all(allSources.map(source => fetchSingleCustomJsonSource(source, config)));
  return results.flat();
}

export const customJsonSource: PhraseSource = {
  type: 'custom-json',
  isEnabled: config => config.customJson.enabled || (config.customJsonSources ?? []).some(s => s.enabled),
  fetch: fetchCustomJsonArticles,
};