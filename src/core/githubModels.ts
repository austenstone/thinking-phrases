import OpenAI from 'openai';
import { execFileSync } from 'node:child_process';
import type { ArticleItem, Config, GitHubModelsConfig } from './types.js';
import { decodeHtmlEntities, dedupePhrases, logDebug, singleLine } from './utils.js';
import { appendSourceSuffix } from './phraseFormats.js';

interface BuildModelArticlePhrasesOptions {
  onProgress?: (message: string) => void;
  /** Source type for prompt selection (rss, hacker-news, github-activity, etc.) */
  sourceType?: string;
}

const PROMPT_PREAMBLE = [
  'Return JSON only: {"phrases":["..."]}.',
  'Each phrase: factual, concrete, max maxLength chars. You may emit up to maxPhrasesPerArticle phrases per item.',
  'NEVER include the source name, author, date, or time — those are appended automatically.',
  'NEVER restate the title verbatim. The reader already saw the headline — give them the insight behind it.',
].join(' ');

export const DEFAULT_SOURCE_PROMPTS: Record<string, string> = {
  'rss': [
    PROMPT_PREAMBLE,
    'You are extracting insights from blog posts and news articles (RSS/Atom feeds).',
    'You receive the article title AND the full article body text.',
    'Your job: find the single most valuable, concrete takeaway buried in the article that the reader would NOT get from the title alone.',
    'Prioritize: specific numbers, benchmarks, percentages, technical details, surprising findings, release dates, breaking changes, or "how it works" explanations.',
    'BAD: "GitHub released a new feature for code review" (just restates the headline).',
    'GOOD: "Copilot code review now uses multi-line comments that reduced cognitive load by 15% in A/B testing".',
    'BAD: "The article discusses improvements to Docker performance".',
    'GOOD: "Docker BuildKit v0.17 parallelizes dependency resolution, cutting cold builds from 4m to 90s on large monorepos".',
    'If the article body has real data, use it. If it is too thin, extract the most specific claim from the title and sharpen it.',
  ].join(' '),
  'hacker-news': [
    PROMPT_PREAMBLE,
    'You are extracting insights from Hacker News posts. You may receive:',
    '(a) The HN title + the full linked article body (most common — link posts)',
    '(b) The HN title + the self-post text (Ask HN, Show HN)',
    '(c) The HN title + both the self-post text AND fetched article body',
    'Your job: extract the ONE technical insight, surprising fact, or concrete detail that makes this post worth reading.',
    'The reader has 3 seconds of glance time. Make it count with a real fact, not a summary.',
    'BAD: "A database was built in a spreadsheet" (just restates the HN title).',
    'GOOD: "The spreadsheet-database uses SQLite compiled to WASM, handling 10k rows with indexed queries under 50ms".',
    'BAD: "The author discusses their experience with Rust".',
    'GOOD: "Switching from Go to Rust cut their p99 latency from 12ms to 800μs by eliminating GC pauses".',
    'For Show HN posts: what does it actually do and what makes it technically interesting?',
    'For Ask HN posts: what is the most insightful or surprising answer/claim?',
  ].join(' '),
  'github-activity': [
    PROMPT_PREAMBLE,
    'You are summarizing GitHub commits. You receive the commit message AND the full diff (added/removed lines).',
    'Your job: explain the PURPOSE and IMPACT of the change in plain language. What is different for users or developers AFTER this commit?',
    'Read the diff carefully — the commit message often undersells the change. The diff tells the real story.',
    'BAD: "Fixed a null check in the settings handler" (says what, not why).',
    'GOOD: "Settings panel no longer crashes when opening a workspace with a corrupted .vscode/settings.json".',
    'BAD: "Refactored the entrypoint module".',
    'GOOD: "DevTools now loads 40% faster after the entrypoint was split into lazy-loaded chunks".',
    'For performance changes: include the before/after numbers if visible in the diff.',
    'For bug fixes: describe the user-visible symptom that was fixed.',
    'For new features: describe what users can now do that they couldn\'t before.',
    'NEVER mention file paths, line counts, or SHA hashes — those appear in the metadata suffix.',
  ].join(' '),
  'earthquakes': [
    PROMPT_PREAMBLE,
    'You are summarizing USGS earthquake data. You receive magnitude, location, significance score, alert level, and tsunami status.',
    'Keep it concise and factual. The magnitude and location are already in the title — add context that helps the reader understand the severity.',
    'If significance is high (>500) or an alert level is set, emphasize that.',
    'If a tsunami bulletin was issued, lead with that.',
    'BAD: "An earthquake happened near Ridgecrest" (obvious from the title).',
    'GOOD: "Significance 680 with yellow alert — strongest quake in the region since the 2019 Ridgecrest sequence".',
    'If the data is sparse (just magnitude + location with no alert), a clean one-liner with the depth or felt radius is fine.',
  ].join(' '),
  'custom-json': [
    PROMPT_PREAMBLE,
    'You are summarizing items from a custom JSON API. The data structure varies.',
    'Extract the most concrete, specific, and informative detail from each item.',
    'Focus on facts the reader can learn in a glance: numbers, names, outcomes, technical details.',
    'BAD: "An interesting article about cloud computing".',
    'GOOD: "AWS Lambda now supports 10GB memory functions, enabling in-memory ML inference without containers".',
  ].join(' '),
};

const DEFAULT_FALLBACK_PROMPT = [
  PROMPT_PREAMBLE,
  'Extract the single most valuable, concrete takeaway from each item.',
  'Prioritize: specific numbers, technical details, surprising findings, or "what changed and why it matters".',
  'The reader has 3 seconds. Give them a real insight, not a headline restatement.',
].join(' ');

/**
 * Resolve the prompt for a given source type.
 * Priority: config per-source prompt > config systemPrompt > built-in per-source default > built-in fallback.
 */
export function resolvePrompt(config: GitHubModelsConfig, sourceType?: string): string {
  if (sourceType && config.prompts?.[sourceType]) {
    return config.prompts[sourceType];
  }
  if (config.systemPrompt) {
    return config.systemPrompt;
  }
  if (sourceType && DEFAULT_SOURCE_PROMPTS[sourceType]) {
    return DEFAULT_SOURCE_PROMPTS[sourceType];
  }
  return DEFAULT_FALLBACK_PROMPT;
}

const DEFAULT_ENDPOINT = 'https://models.github.ai/inference';

function getGitHubModelsToken(config: GitHubModelsConfig): string | undefined {
  const envToken = process.env[config.tokenEnvVar] ?? process.env.GITHUB_TOKEN;
  if (envToken && !envToken.includes('replace_me')) {
    return envToken;
  }

  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...process.env,
        GITHUB_TOKEN: '',
        GH_TOKEN: '',
        GITHUB_ENTERPRISE_TOKEN: '',
        GH_ENTERPRISE_TOKEN: '',
      },
    }).trim();

    return token || undefined;
  } catch {
    return undefined;
  }
}

export function extractModelPhrases(input: string): string[] {
  const candidate = (input.match(/```(?:json)?\s*([\s\S]*?)```/u)?.[1] ?? input).trim();

  try {
    const parsed = JSON.parse(candidate) as unknown;

    if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
      return parsed;
    }

    if (
      parsed &&
      typeof parsed === 'object' &&
      'phrases' in parsed &&
      Array.isArray((parsed as { phrases?: unknown }).phrases)
    ) {
      return (parsed as { phrases: unknown[] }).phrases.filter((item): item is string => typeof item === 'string');
    }

    if (
      parsed &&
      typeof parsed === 'object' &&
      'phrasesByItem' in parsed &&
      Array.isArray((parsed as { phrasesByItem?: unknown }).phrasesByItem)
    ) {
      return (parsed as { phrasesByItem: unknown[] }).phrasesByItem.flatMap(item =>
        Array.isArray(item) ? item.filter((value): value is string => typeof value === 'string') : [],
      );
    }
  } catch {
    // Fall back to line parsing below.
  }

  return candidate
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[[\]",*\-•\s]+/gu, '').trim())
    .filter(Boolean);
}

async function runGitHubModelsPrompt(config: GitHubModelsConfig, content: string): Promise<string> {
  const token = getGitHubModelsToken(config);
  if (!token) {
    throw new Error(
      `Missing GitHub Models token. Set ${config.tokenEnvVar}, set GITHUB_TOKEN, or sign in with GitHub CLI via \`gh auth login\`.`,
    );
  }

  const client = new OpenAI({
    baseURL: config.endpoint || DEFAULT_ENDPOINT,
    apiKey: token,
  });

  const completion = await client.chat.completions.create({
    model: config.model,
    messages: [{ role: 'user', content }],
    ...(config.temperature !== 1 ? { temperature: config.temperature } : {}),
    max_completion_tokens: config.maxTokens,
    response_format: { type: 'json_object' },
  });

  const text = completion.choices?.[0]?.message?.content?.trim();
  if (!text) {
    const reason = completion.choices?.[0]?.finish_reason;
    throw new Error(`GitHub Models returned empty content (finish_reason: ${reason ?? 'unknown'})`);
  }

  return text;
}

export function chunkArticles(articles: ArticleItem[], _config: GitHubModelsConfig): ArticleItem[][] {
  return articles.map(article => [article]);
}

export async function buildModelArticlePhrases(
  articles: ArticleItem[],
  config: Config,
  options: BuildModelArticlePhrasesOptions = {},
): Promise<string[]> {
  const chunks = chunkArticles(articles, config.githubModels);
  let completedChunks = 0;

  options.onProgress?.(`Generating phrases with GitHub Models (${chunks.length} batch${chunks.length === 1 ? '' : 'es'})`);

  const processChunk = async (chunk: ArticleItem[], index: number): Promise<string[]> => {
    const contentBudget = config.githubModels.maxArticleContentLength;
    const instruction = resolvePrompt(config.githubModels, options.sourceType);
    const payload = JSON.stringify({
      instruction,
      maxLength: config.phraseFormatting.maxLength,
      maxPhrasesPerArticle: config.githubModels.maxPhrasesPerArticle,
      items: chunk.map(article => ({
        title: article.title ?? '',
        source: article.source ?? '',
        time: article.time ?? '',
        content: (article.articleContent ?? article.content ?? '').slice(0, contentBudget),
        link: article.link ?? '',
      })),
    });

    logDebug(config, `Sending ${chunk.length} items (${payload.length} chars) to GitHub Models for chunk ${index + 1}/${chunks.length}`);
    const responseText = await runGitHubModelsPrompt(config.githubModels, payload);
    logDebug(config, `Model response preview: ${singleLine(responseText, 220)}`);

    completedChunks += 1;
    options.onProgress?.(`Generated GitHub Models phrases (${completedChunks}/${chunks.length})`);

    // Tag each phrase with the source/time/metadata from the article
    const article = chunk[0];

    return extractModelPhrases(responseText)
      .map(phrase => singleLine(decodeHtmlEntities(phrase), config.phraseFormatting.maxLength))
      .filter(Boolean)
      .map(phrase => appendSourceSuffix(phrase, article?.source, article?.time, article?.metadata));
  };

  // Process chunks with bounded concurrency and a delay between batches
  const maxConcurrency = config.githubModels.maxConcurrency;
  const allPhrases: string[] = [];
  let lastError: unknown;

  for (let start = 0; start < chunks.length; start += maxConcurrency) {
    // Pause between batches to avoid rate limits
    if (start > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const batch = chunks.slice(start, start + maxConcurrency);
    const settledResults = await Promise.allSettled(
      batch.map((chunk, batchIndex) => processChunk(chunk, start + batchIndex)),
    );

    for (const result of settledResults) {
      if (result.status === 'fulfilled') {
        allPhrases.push(...result.value);
      } else {
        completedChunks += 1;
        lastError = result.reason;
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        logDebug(config, `Chunk failed: ${message}`);
        options.onProgress?.(`GitHub Models batch failed (${completedChunks}/${chunks.length}): ${message}`);
      }
    }
  }

  if (allPhrases.length === 0 && lastError) {
    throw lastError;
  }

  return dedupePhrases(allPhrases);
}
