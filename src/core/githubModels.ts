import ModelClient, { isUnexpected } from '@azure-rest/ai-inference';
import { AzureKeyCredential } from '@azure/core-auth';
import { execFileSync } from 'node:child_process';
import type { ArticleItem, Config, GitHubModelsConfig, GitHubModelsResponse } from './types.js';
import { decodeHtmlEntities, dedupePhrases, logDebug, singleLine } from './utils.js';

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

  const endpoint = config.endpoint || DEFAULT_ENDPOINT;
  const client = ModelClient(endpoint, new AzureKeyCredential(token));
  const isReasoningModel = /\b(o1|o3|o4|gpt-5)\b/iu.test(config.model);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response type varies by endpoint; we check with isUnexpected below
  let response: any;
  try {
    response = await client.path('/chat/completions').post({
      body: {
        model: config.model,
        messages: [{ role: 'user', content }],
        // Reasoning models (o1/o3/o4/gpt-5) only accept temperature=1
        ...(isReasoningModel ? {} : { temperature: config.temperature }),
        response_format: { type: 'json_object' },
        // Reasoning models require max_completion_tokens; others use max_tokens
        ...(isReasoningModel
          ? { max_completion_tokens: config.maxTokens } as Record<string, unknown>
          : { max_tokens: config.maxTokens }),
      },
    });
  } catch (error: unknown) {
    // The Azure SDK throws a SyntaxError when the API returns raw text (e.g. 429 rate limit).
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Too many requests') || message.includes('429')) {
      throw new Error('GitHub Models 429: rate limited — try again shortly');
    }
    throw error;
  }

  if (isUnexpected(response)) {
    const errorBody = response.body as { error?: { message?: string; code?: string; type?: string } };
    const status = response.status;
    const detail = errorBody.error?.message ?? JSON.stringify(errorBody);
    throw new Error(`GitHub Models ${status}: ${detail}`);
  }

  const body = response.body as GitHubModelsResponse;
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error(`GitHub Models response did not include content. Status: ${response.status}, body: ${JSON.stringify(body).slice(0, 300)}`);
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

    return extractModelPhrases(responseText)
      .map(phrase => singleLine(decodeHtmlEntities(phrase), config.phraseFormatting.maxLength))
      .filter(Boolean);
  };

  // Process batches with bounded concurrency
  const maxConcurrency = config.githubModels.maxConcurrency;
  const allPhrases: string[] = [];
  let lastError: unknown;

  for (let start = 0; start < chunks.length; start += maxConcurrency) {
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
