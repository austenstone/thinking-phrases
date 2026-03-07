import ModelClient, { isUnexpected } from '@azure-rest/ai-inference';
import { AzureKeyCredential } from '@azure/core-auth';
import { execFileSync } from 'node:child_process';
import type { ArticleItem, Config, GitHubModelsConfig, GitHubModelsResponse } from './types.js';
import { decodeHtmlEntities, dedupePhrases, logDebug, singleLine } from './utils.js';

interface BuildModelArticlePhrasesOptions {
  onProgress?: (message: string) => void;
}

const GITHUB_MODELS_ENDPOINT = 'https://models.github.ai/inference';

function getGitHubModelsToken(config: GitHubModelsConfig): string | undefined {
  const envToken = process.env[config.tokenEnvVar] ?? process.env.GITHUB_TOKEN;
  if (envToken && !envToken.includes('replace_me')) {
    return envToken;
  }

  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return token || undefined;
  } catch {
    return undefined;
  }
}

function extractModelPhrases(input: string): string[] {
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
    .map(line => line.replace(/^[\[\]",*-•\s]+/gu, '').trim())
    .filter(Boolean);
}

async function runGitHubModelsPrompt(config: GitHubModelsConfig, content: string): Promise<string> {
  const token = getGitHubModelsToken(config);
  if (!token) {
    throw new Error(
      `Missing GitHub Models token. Set ${config.tokenEnvVar}, set GITHUB_TOKEN, or sign in with GitHub CLI via \`gh auth login\`.`,
    );
  }

  const client = ModelClient(GITHUB_MODELS_ENDPOINT, new AzureKeyCredential(token));
  const response = await client.path('/chat/completions').post({
    body: {
      model: config.model,
      messages: [{ role: 'user', content }],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      response_format: { type: 'json_object' },
    },
  });

  if (isUnexpected(response)) {
    const errorBody = response.body as { error?: { message?: string } };
    throw new Error(errorBody.error?.message ?? 'GitHub Models request failed.');
  }

  const text = (response.body as GitHubModelsResponse).choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('GitHub Models response did not include content.');
  }

  return text;
}

function chunkArticles(articles: ArticleItem[], config: GitHubModelsConfig): ArticleItem[][] {
  const estimatedPerChunk = Math.max(1, Math.floor(config.maxTokens / Math.max(80, config.maxPhrasesPerArticle * 80)));
  const chunkSize = Math.max(1, Math.min(config.maxInputItems, estimatedPerChunk));
  const chunks: ArticleItem[][] = [];

  for (let index = 0; index < articles.length; index += chunkSize) {
    chunks.push(articles.slice(index, index + chunkSize));
  }

  return chunks;
}

export async function buildModelArticlePhrases(
  articles: ArticleItem[],
  config: Config,
  options: BuildModelArticlePhrasesOptions = {},
): Promise<string[]> {
  const chunks = chunkArticles(articles, config.githubModels);
  let completedChunks = 0;

  options.onProgress?.(`Generating phrases with GitHub Models (${chunks.length} batch${chunks.length === 1 ? '' : 'es'} in parallel)`);

  const settledChunkResults = await Promise.allSettled(
    chunks.map(async (chunk, index) => {
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
          content: article.articleContent ?? article.content ?? '',
          link: article.link ?? '',
        })),
      });

      logDebug(config, `Sending ${chunk.length} items to GitHub Models for chunk ${index + 1}/${chunks.length}`);
      const responseText = await runGitHubModelsPrompt(config.githubModels, payload);
      logDebug(config, `Model response preview: ${singleLine(responseText, 220)}`);

      completedChunks += 1;
      options.onProgress?.(`Generated GitHub Models phrases (${completedChunks}/${chunks.length})`);

      return extractModelPhrases(responseText)
        .map(phrase => singleLine(decodeHtmlEntities(phrase), config.phraseFormatting.maxLength))
        .filter(Boolean);
    }),
  );

  const rejectedChunk = settledChunkResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  if (rejectedChunk) {
    throw rejectedChunk.reason;
  }

  return dedupePhrases(
    settledChunkResults.flatMap(result => (result.status === 'fulfilled' ? result.value : [])),
  );
}
