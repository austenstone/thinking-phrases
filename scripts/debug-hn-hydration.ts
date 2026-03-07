import { fetchHackerNewsArticles } from '../src/sources/hackerNews.js';
import { hydrateArticleContent } from '../src/sources/rss.js';
import { DEFAULT_CONFIG, mergeConfig } from '../src/core/config.js';

async function main() {
  const config = mergeConfig(DEFAULT_CONFIG, {}, {});
  config.hackerNews.enabled = true;
  config.hackerNews.feed = 'top';
  config.hackerNews.maxItems = 5;
  config.githubModels.enabled = true;
  config.githubModels.fetchArticleContent = true;
  config.debug = true;
  const articles = await fetchHackerNewsArticles(config);
  
  console.log('=== BEFORE HYDRATION ===');
  for (const a of articles) {
    console.log(`${(a.title ?? '').slice(0, 55).padEnd(55)} | content: ${String(a.content?.length ?? 0).padStart(5)} | articleContent: ${String(a.articleContent?.length ?? 0).padStart(5)} | link: ${(a.link ?? '').slice(0, 50)}`);
  }
  
  const hydrated = await hydrateArticleContent(articles, config);
  
  console.log('\n=== AFTER HYDRATION ===');
  for (const a of hydrated) {
    console.log(`${(a.title ?? '').slice(0, 55).padEnd(55)} | content: ${String(a.content?.length ?? 0).padStart(5)} | articleContent: ${String(a.articleContent?.length ?? 0).padStart(5)}`);
    if (a.articleContent) {
      console.log(`  preview: ${a.articleContent.slice(0, 120)}`);
    } else {
      console.log(`  (no article content fetched)`);
    }
  }
}

main();
