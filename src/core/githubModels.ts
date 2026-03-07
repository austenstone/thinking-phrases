import OpenAI from 'openai';
import { execFileSync } from 'node:child_process';
import type { ArticleItem, Config, GitHubModelsConfig } from './types.js';
import { decodeHtmlEntities, dedupePhrases, logDebug, singleLine } from './utils.js';
import { appendSourceSuffix } from './phraseFormats.js';

interface BuildModelArticlePhrasesOptions {
  onProgress?: (message: string) => void;
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

export function chunkArticles(articles: ArticleItem[], config: GitHubModelsConfig): ArticleItem[][] {
  const chunks: ArticleItem[][] = [];
  const estimatedPerChunk = Math.max(1, Math.floor(config.maxTokens / Math.max(80, config.maxPhrasesPerArticle * 80)));
  const defaultChunkSize = Math.max(1, Math.min(config.maxInputItems, estimatedPerChunk));
  // Derive character budget from the model's input token limit.
  // ~4 chars per token, minus headroom for instruction/JSON envelope and output.
  const tokenBudget = config.maxInputTokens - config.maxTokens;
  const maxCharactersPerChunk = Math.max(4000, (tokenBudget * 4) - 2000);

  let currentChunk: ArticleItem[] = [];
  let currentCharacters = 0;

  const estimateArticleCharacters = (article: ArticleItem): number => {
    return [article.title, article.source, article.time, article.articleContent, article.content, article.link]
      .filter(Boolean)
      .join(' ')
      .length;
  };

  const flushCurrentChunk = (): void => {
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentCharacters = 0;
    }
  };

  for (const article of articles) {
    const articleCharacters = estimateArticleCharacters(article);

    if (
			currentChunk.length > 0
			&& (currentChunk.length >= defaultChunkSize || currentCharacters + articleCharacters > maxCharactersPerChunk)
		) {
      flushCurrentChunk();
    }

    currentChunk.push(article);
    currentCharacters += articleCharacters;

    if (articleCharacters > maxCharactersPerChunk) {
      flushCurrentChunk();
    }
  }

  flushCurrentChunk();

  return chunks;
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
    const payload = JSON.stringify({
      instruction: config.githubModels.systemPrompt ?? [
        'Create concise VS Code thinking phrases from these normalized content items.',
        'Return JSON only in this shape: {"phrases":["..."]}.',
        'Each phrase must be factual, concrete, and at most maxLength characters.',
        'You may emit multiple phrases for one item when it has multiple distinct takeaways.',
        'Return at most maxPhrasesPerArticle phrases per item.',
        'Prefer concrete details like numbers, locations, dates, features, examples, or outcomes.',
        'Avoid vague rewrites of the headline.',
        'Do NOT include the source name or time/date in the phrase — those are appended separately.',
      ].join(' '),
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

    // Tag each phrase with the source/time from its chunk's articles
    const chunkSource = chunk[0]?.source;
    const chunkTime = chunk[0]?.time;

    return extractModelPhrases(responseText)
      .map(phrase => singleLine(decodeHtmlEntities(phrase), config.phraseFormatting.maxLength))
      .filter(Boolean)
      .map(phrase => appendSourceSuffix(phrase, chunkSource, chunkTime));
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
