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
  'Return JSON only in this shape: {"phrases":["..."]}.',
  'Each phrase must be factual, concrete, and at most maxLength characters.',
  'You may emit multiple phrases for one item when it has multiple distinct takeaways.',
  'Return at most maxPhrasesPerArticle phrases per item.',
  'Do NOT include the source name or time/date in the phrase — those are appended separately.',
].join(' ');

export const DEFAULT_SOURCE_PROMPTS: Record<string, string> = {
  'rss': [
    PROMPT_PREAMBLE,
    'You are summarizing articles from RSS/Atom feeds.',
    'Extract the most surprising, useful, or concrete detail from the article content — specific numbers, features, dates, outcomes, or insights.',
    'The reader wants to LEARN something new, not just know an article exists.',
    'If the content is substantial, prioritize the single most interesting takeaway a developer would remember.',
    'Avoid vague summaries like "the article discusses X" — state the actual finding or fact.',
  ].join(' '),
  'hacker-news': [
    PROMPT_PREAMBLE,
    'You are summarizing Hacker News posts.',
    'Extract a concrete, memorable takeaway — a specific technical insight, surprising fact, or actionable detail.',
    'The reader wants to learn the key insight without reading the full article.',
    'If article content is available, prioritize the most interesting technical detail or finding.',
    'If only a title is available, expand it into a more informative statement if possible, but stay factual.',
    'Avoid restating the title verbatim — add context or specificity.',
  ].join(' '),
  'github-activity': [
    PROMPT_PREAMBLE,
    'You are summarizing GitHub commits and activity.',
    'Explain WHAT the change does and WHY in plain language — the reader wants to understand the purpose and impact.',
    'Never output file paths, line counts, or SHA hashes — those are shown separately in the metadata suffix.',
    'Focus on the behavioral change: what is different for users or developers after this commit?',
    'For refactors or internal changes, explain what problem it solves or what it enables.',
  ].join(' '),
  'earthquakes': [
    PROMPT_PREAMBLE,
    'You are summarizing earthquake data from USGS.',
    'State the magnitude, location, and any notable context concisely.',
    'If multiple quakes are near the same area, highlight the pattern.',
  ].join(' '),
  'custom-json': [
    PROMPT_PREAMBLE,
    'You are summarizing items from a custom JSON API.',
    'Extract the most concrete and informative detail from each item.',
    'The reader wants a useful fact or insight, not a vague overview.',
  ].join(' '),
};

const DEFAULT_FALLBACK_PROMPT = [
  PROMPT_PREAMBLE,
  'Create concise VS Code thinking phrases from these content items.',
  'For articles/blog posts: extract the most surprising or useful concrete detail — numbers, features, dates, outcomes.',
  'For code commits/diffs: explain WHAT the change does and WHY, not which files were edited or line counts.',
  'Never output file paths, line counts, or SHA hashes — those are shown separately.',
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
