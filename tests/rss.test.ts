import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseFeedArticles } from '../src/sources/rss.js';
import type { ArticleItem, FeedConfig } from '../src/core/types.js';

// ── parseFeedArticles (RSS 2.0) ──────────────────────────────────────
describe('parseFeedArticles — RSS 2.0', () => {
  const feed: FeedConfig = { url: 'https://example.com/rss' };

  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>First Article</title>
      <link>https://example.com/1</link>
      <description>&lt;p&gt;Description one&lt;/p&gt;</description>
      <pubDate>Sat, 01 Mar 2025 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second Article</title>
      <link>https://example.com/2</link>
      <description>Plain text description</description>
      <pubDate>Sun, 02 Mar 2025 14:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

  it('parses RSS items', () => {
    const articles = parseFeedArticles(rssXml, feed);
    expect(articles).toHaveLength(2);
    expect(articles[0].title).toBe('First Article');
    expect(articles[0].link).toBe('https://example.com/1');
    expect(articles[0].source).toBe('Test Feed');
    expect(articles[0].type).toBe('article');
  });

  it('strips HTML from description content', () => {
    const articles = parseFeedArticles(rssXml, feed);
    expect(articles[0].content).toBe('Description one');
  });

  it('uses feed source override when provided', () => {
    const feedWithSource: FeedConfig = { url: 'https://example.com/rss', source: 'Custom Source' };
    const articles = parseFeedArticles(rssXml, feedWithSource);
    expect(articles[0].source).toBe('Custom Source');
  });

  it('computes relative time from pubDate', () => {
    const articles = parseFeedArticles(rssXml, feed);
    // These are old dates, so time should show days ago
    expect(articles[0].time).toMatch(/\d+d ago/);
  });
});

// ── parseFeedArticles (Atom) ─────────────────────────────────────────
describe('parseFeedArticles — Atom', () => {
  const feed: FeedConfig = { url: 'https://example.com/atom' };

  const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom Entry 1</title>
    <link href="https://example.com/atom/1" />
    <updated>2025-03-01T12:00:00Z</updated>
    <summary>Summary of atom entry</summary>
  </entry>
  <entry>
    <title>Atom Entry 2</title>
    <link href="https://example.com/atom/2" />
    <updated>2025-03-02T12:00:00Z</updated>
    <content type="html">&lt;p&gt;HTML content&lt;/p&gt;</content>
  </entry>
</feed>`;

  it('parses Atom entries', () => {
    const articles = parseFeedArticles(atomXml, feed);
    expect(articles).toHaveLength(2);
    expect(articles[0].title).toBe('Atom Entry 1');
    expect(articles[0].link).toBe('https://example.com/atom/1');
    expect(articles[0].source).toBe('Atom Feed');
  });

  it('uses content over summary', () => {
    const articles = parseFeedArticles(atomXml, feed);
    expect(articles[1].content).toBe('HTML content');
  });
});

// ── parseFeedArticles — unsupported format ───────────────────────────
describe('parseFeedArticles — unsupported', () => {
  it('throws for unrecognized format', () => {
    expect(() =>
      parseFeedArticles('<html><body>Not a feed</body></html>', { url: 'https://example.com' }),
    ).toThrow('Unsupported feed format');
  });
});

// ── hydrateArticleContent ────────────────────────────────────────────
describe('hydrateArticleContent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns articles unchanged when fetchArticleContent is disabled', async () => {
    const { hydrateArticleContent } = await import('../src/sources/rss.js');
    const { DEFAULT_CONFIG } = await import('../src/core/config.js');
    const config = {
      ...DEFAULT_CONFIG,
      githubModels: { ...DEFAULT_CONFIG.githubModels, fetchArticleContent: false },
    };

    const articles: ArticleItem[] = [
      { type: 'article', id: '1', title: 'Test', link: 'https://example.com/1' },
    ];

    const result = await hydrateArticleContent(articles, config);
    expect(result).toHaveLength(1);
    expect(result[0].articleContent).toBeUndefined();
  });

  it('keeps existing articleContent without re-fetching', async () => {
    const { hydrateArticleContent } = await import('../src/sources/rss.js');
    const { DEFAULT_CONFIG } = await import('../src/core/config.js');
    const config = {
      ...DEFAULT_CONFIG,
      githubModels: { ...DEFAULT_CONFIG.githubModels, fetchArticleContent: true },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const articles: ArticleItem[] = [
      { type: 'article', id: '1', title: 'Test', link: 'https://example.com/1', articleContent: 'Already fetched content' },
    ];

    const result = await hydrateArticleContent(articles, config);
    expect(result[0].articleContent).toBe('Already fetched content');
    // Should not have fetched the link since content already exists
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches article content from link when missing', async () => {
    const { hydrateArticleContent } = await import('../src/sources/rss.js');
    const { DEFAULT_CONFIG } = await import('../src/core/config.js');
    const config = {
      ...DEFAULT_CONFIG,
      githubModels: { ...DEFAULT_CONFIG.githubModels, fetchArticleContent: true, maxArticleContentLength: 500 },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><body><article><p>This is a long enough paragraph to pass the length check and be extracted as article content for the model to process.</p></article></body></html>'),
    );

    const articles: ArticleItem[] = [
      { type: 'article', id: '1', title: 'Test', link: 'https://example.com/article' },
    ];

    const result = await hydrateArticleContent(articles, config);
    expect(result[0].articleContent).toBeTruthy();
  });

  it('gracefully handles fetch errors', async () => {
    const { hydrateArticleContent } = await import('../src/sources/rss.js');
    const { DEFAULT_CONFIG } = await import('../src/core/config.js');
    const config = {
      ...DEFAULT_CONFIG,
      githubModels: { ...DEFAULT_CONFIG.githubModels, fetchArticleContent: true },
    };

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const articles: ArticleItem[] = [
      { type: 'article', id: '1', title: 'Test', link: 'https://example.com/fail', content: 'Fallback content' },
    ];

    const result = await hydrateArticleContent(articles, config);
    // Should not throw, should fall back gracefully
    expect(result).toHaveLength(1);
  });

  it('skips articles without a link', async () => {
    const { hydrateArticleContent } = await import('../src/sources/rss.js');
    const { DEFAULT_CONFIG } = await import('../src/core/config.js');
    const config = {
      ...DEFAULT_CONFIG,
      githubModels: { ...DEFAULT_CONFIG.githubModels, fetchArticleContent: true },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const articles: ArticleItem[] = [
      { type: 'article', id: '1', title: 'No Link' },
    ];

    const result = await hydrateArticleContent(articles, config);
    expect(result).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── rssSource.isEnabled ──────────────────────────────────────────────
describe('rssSource', () => {
  it('is enabled when feeds are present', async () => {
    const { rssSource } = await import('../src/sources/rss.js');
    const { DEFAULT_CONFIG } = await import('../src/core/config.js');
    expect(rssSource.isEnabled({ ...DEFAULT_CONFIG, feeds: [{ url: 'https://example.com/feed' }] })).toBe(true);
    expect(rssSource.isEnabled({ ...DEFAULT_CONFIG, feeds: [] })).toBe(false);
  });
});
