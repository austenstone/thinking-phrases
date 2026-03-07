import { XMLParser } from 'fast-xml-parser';
import type { ArticleItem, Config, FeedConfig, PhraseSource } from '../core/types.js';
import { decodeHtmlEntities, fetchText, logDebug, logInfo, relativeTime, singleLine, stripHtml, truncate } from '../core/utils.js';

type XmlPrimitive = string | number | boolean | null | undefined;

interface XmlObject {
  [key: string]: XmlValue;
}

type XmlArray = XmlValue[];

type XmlValue = XmlPrimitive | XmlObject | XmlArray;

function readText(value: XmlValue): string | undefined {
  if (typeof value === 'string') {
    const decoded = decodeHtmlEntities(value).trim();
    return decoded || undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return undefined;
  }

  const textValue = value['#text'];
  if (typeof textValue !== 'string') {
    return undefined;
  }

  const decoded = decodeHtmlEntities(textValue).trim();
  return decoded || undefined;
}

function readLink(value: XmlValue): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }

  if (Array.isArray(value)) {
    return value.map(readLink).find(Boolean);
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const href = value['@_href'];
  if (typeof href === 'string' && href.trim()) {
    return href.trim();
  }

  return readText(value);
}

function toArray<T>(value: T | T[] | undefined): T[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function extractJsonLdArticleBody(html: string, maxLength: number): string | undefined {
  const matches = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)];
  const candidates: string[] = [];

  const collect = (value: unknown): void => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collect(item);
      }
      return;
    }

    if (typeof value !== 'object') {
      return;
    }

    const record = value as Record<string, unknown>;
    const typeValue = record['@type'];
    const typeText = Array.isArray(typeValue) ? typeValue.join(' ') : String(typeValue ?? '');

    if (/article|blogposting|newsarticle/iu.test(typeText)) {
      for (const field of ['articleBody', 'description'] as const) {
        const fieldValue = record[field];
        if (typeof fieldValue === 'string') {
          const cleaned = stripHtml(fieldValue);
          if (cleaned && cleaned.length >= 120) {
            candidates.push(cleaned);
          }
        }
      }
    }

    for (const nested of Object.values(record)) {
      collect(nested);
    }
  };

  for (const [, jsonText] of matches) {
    try {
      collect(JSON.parse(jsonText.trim()) as unknown);
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  const best = candidates.sort((left, right) => right.length - left.length)[0];
  return best ? truncate(best, maxLength) : undefined;
}

function extractArticleTextFromHtml(html: string, maxLength: number): string | undefined {
  const jsonLd = extractJsonLdArticleBody(html, maxLength);
  if (jsonLd) {
    return jsonLd;
  }

  const articleLikeSections = [
    ...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/giu),
    ...html.matchAll(/<main\b[^>]*>([\s\S]*?)<\/main>/giu),
    ...html.matchAll(/<body\b[^>]*>([\s\S]*?)<\/body>/giu),
  ].map(match => match[1]);

  for (const section of articleLikeSections) {
    const paragraphs = [...section.matchAll(/<(p|li|blockquote|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/giu)]
      .map(match => stripHtml(match[2]))
      .filter((text): text is string => Boolean(text && text.length >= 60));

    if (paragraphs.length > 0) {
      return truncate(paragraphs.slice(0, 8).join('\n\n'), maxLength);
    }
  }

  return truncate(stripHtml(html) ?? '', maxLength) || undefined;
}

export function parseFeedArticles(xml: string, feed: FeedConfig): ArticleItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
    trimValues: true,
  });

  const parsed = parser.parse(xml) as XmlObject;
  const rssChannel = (parsed.rss as XmlObject | undefined)?.channel as XmlObject | undefined;

  if (rssChannel) {
    const defaultSource = feed.source?.trim() || readText(rssChannel.title);
    return toArray(rssChannel.item).map(item => {
      const entry = item as XmlObject;
      const datetime = readText(entry.pubDate) ?? readText(entry.isoDate);
      const link = readLink(entry.link);
      const content = stripHtml(readText(entry['content:encoded']) ?? readText(entry.description));

      return {
        type: 'article',
        id: link ?? `${defaultSource ?? 'rss'}:${readText(entry.title) ?? 'untitled'}`,
        title: readText(entry.title),
        link,
        source: readText(entry.source) ?? defaultSource,
        datetime,
        time: relativeTime(datetime),
        content,
        articleContent: content && content.length >= 200 ? content : undefined,
      };
    });
  }

  const atomFeed = parsed.feed as XmlObject | undefined;
  if (atomFeed) {
    const defaultSource = feed.source?.trim() || readText(atomFeed.title);
    return toArray(atomFeed.entry).map(item => {
      const entry = item as XmlObject;
      const datetime = readText(entry.updated) ?? readText(entry.published);
      const link = readLink(entry.link);
      const sourceObject = entry.source as XmlObject | undefined;
      const authorObject = entry.author as XmlObject | undefined;
      const content = stripHtml(readText(entry.content) ?? readText(entry.summary));

      return {
        type: 'article',
        id: link ?? `${defaultSource ?? 'atom'}:${readText(entry.title) ?? 'untitled'}`,
        title: readText(entry.title),
        link,
        source: readText(sourceObject?.title) ?? readText(authorObject?.name) ?? defaultSource,
        datetime,
        time: relativeTime(datetime),
        content,
        articleContent: content && content.length >= 200 ? content : undefined,
      };
    });
  }

  throw new Error(`Unsupported feed format for ${feed.url}`);
}

async function fetchFeed(feed: FeedConfig): Promise<ArticleItem[]> {
  return parseFeedArticles(await fetchText(feed.url), feed);
}

export async function hydrateArticleContent(articles: ArticleItem[], config: Config): Promise<ArticleItem[]> {
  if (!config.githubModels.fetchArticleContent) {
    logInfo(config, 'Article fetching disabled; using feed content only');
    return articles;
  }

  logInfo(config, `Fetching article content for up to ${articles.length} articles`);

  return Promise.all(articles.map(async article => {
    if (article.articleContent) {
      logDebug(config, `Using embedded feed article content for: ${article.title ?? article.link}`);
      return article;
    }

    if (!article.link) {
      return article;
    }

    try {
      logInfo(config, `Fetching article content from ${article.link}`);
      const html = await fetchText(article.link);
      const articleContent = extractArticleTextFromHtml(html, config.githubModels.maxArticleContentLength);

      if (articleContent) {
        logDebug(config, `Fetched article content preview: ${singleLine(articleContent, 220)}`);
      }

      return {
        ...article,
        articleContent: articleContent || article.content,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logInfo(config, `Falling back to feed snippet for ${article.link} — ${message}`);
      return article;
    }
  }));
}

export async function fetchRssArticles(config: Config): Promise<ArticleItem[]> {
  if (config.feeds.length === 0) {
    return [];
  }

  const articles = (await Promise.all(config.feeds.map(fetchFeed)))
    .flat()
    .sort((left, right) => new Date(right.datetime ?? 0).getTime() - new Date(left.datetime ?? 0).getTime())
    .slice(0, config.limit);

  logInfo(config, `Loaded ${articles.length} RSS articles after sorting and limit`);
  return hydrateArticleContent(articles, config);
}

export const rssSource: PhraseSource = {
  type: 'rss',
  isEnabled: config => config.feeds.length > 0,
  fetch: fetchRssArticles,
};
