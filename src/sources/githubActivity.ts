import { execFileSync } from 'node:child_process';
import type { ArticleItem, Config, GitHubActivityConfig, GitHubFeedKind, PhraseSource } from '../core/types.js';
import { fetchJson, fetchText, logDebug, logInfo, relativeTime, singleLine, truncate } from '../core/utils.js';
import { hydrateArticleContent, parseFeedArticles } from './rss.js';

interface GitHubCommitListItem {
  sha: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: {
      date?: string;
      name?: string;
    };
  };
}

interface GitHubCommitDetail extends GitHubCommitListItem {
  author?: {
    login?: string;
  };
  stats?: {
    additions?: number;
    deletions?: number;
    total?: number;
  };
  files?: Array<{
    filename?: string;
    status?: string;
    additions?: number;
    deletions?: number;
    changes?: number;
    patch?: string;
  }>;
}

interface GitHubOrgEvent {
  id: string;
  type?: string;
  created_at?: string;
  repo?: {
    name?: string;
  };
  payload?: {
    head?: string;
    ref?: string;
  };
}

interface GitHubFeedsResponse {
  timeline_url?: string;
  current_user_public_url?: string;
  current_user_url?: string;
  current_user_actor_url?: string;
  current_user_organization_urls?: string[];
  security_advisories_url?: string;
}

const GITHUB_ACCEPT = 'application/vnd.github+json';
const GITHUB_API_VERSION = '2022-11-28';

function getGitHubToken(config: GitHubActivityConfig): string | undefined {
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

function buildGitHubHeaders(token?: string, accept = GITHUB_ACCEPT): Record<string, string> {
  return {
    accept,
    'x-github-api-version': GITHUB_API_VERSION,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

function isGitHubAuthFailure(error: unknown): boolean {
  return error instanceof Error && /\((401|403)\)/u.test(error.message);
}

async function fetchGitHubJson<T>(url: string, token?: string): Promise<T> {
  try {
    return await fetchJson<T>(url, buildGitHubHeaders(token));
  } catch (error) {
    if (token && isGitHubAuthFailure(error)) {
      return fetchJson<T>(url, buildGitHubHeaders(undefined));
    }

    throw error;
  }
}

async function fetchGitHubText(url: string, token?: string, accept = 'application/atom+xml'): Promise<string> {
  try {
    return await fetchText(url, buildGitHubHeaders(token, accept));
  } catch (error) {
    if (token && isGitHubAuthFailure(error)) {
      return fetchText(url, buildGitHubHeaders(undefined, accept));
    }

    throw error;
  }
}

function parseRepoSlug(repo?: string): { owner: string; repo: string } {
  const [owner, repoName] = repo?.trim().split('/') ?? [];
  if (!owner || !repoName) {
    throw new Error(`Expected repo in owner/name format. Received: ${repo}`);
  }

  return { owner, repo: repoName };
}

function firstCommitLine(message?: string): string {
  return message?.split('\n')[0]?.trim() || 'Untitled commit';
}

function repoDisplayName(repoLabel: string): string {
  const trimmed = repoLabel.trim();
  if (!trimmed) {
    return 'GitHub';
  }

  const parts = trimmed.split('/').filter(Boolean);
  return parts.at(-1) ?? trimmed;
}

function buildCommitContent(detail: GitHubCommitDetail, config: Config): string | undefined {
  const files = detail.files ?? [];
  const summaryBits = [
    typeof detail.stats?.total === 'number' ? `${detail.stats.total} line changes` : undefined,
    typeof detail.stats?.additions === 'number' ? `+${detail.stats.additions}` : undefined,
    typeof detail.stats?.deletions === 'number' ? `-${detail.stats.deletions}` : undefined,
    files.length > 0 ? `${files.length} files` : undefined,
  ].filter(Boolean);

  const fileLines = files.slice(0, 8).map(file => {
    const patchPreview = file.patch ? singleLine(file.patch, 220) : undefined;
    const stats = typeof file.changes === 'number' ? `${file.status ?? 'changed'} • ${file.changes} changes` : file.status;
    return [file.filename, stats, patchPreview].filter(Boolean).join(' — ');
  });

  const content = [
    detail.commit?.message?.trim(),
    summaryBits.length > 0 ? summaryBits.join(' • ') : undefined,
    ...fileLines,
  ].filter(Boolean).join('\n\n');

  return content ? truncate(content, config.githubModels.maxArticleContentLength) : undefined;
}

function buildCommitArticle(repoLabel: string, detail: GitHubCommitDetail, content?: string): ArticleItem {
  const datetime = detail.commit?.author?.date;
  const repoName = repoDisplayName(repoLabel);
  const authorHandle = detail.author?.login?.trim();
  const titleBits = [
    firstCommitLine(detail.commit?.message),
    authorHandle ? `@${authorHandle}` : undefined,
  ].filter(Boolean);

  return {
    type: 'article',
    id: `github:${repoLabel}:${detail.sha}`,
    title: titleBits.join(' — '),
    link: detail.html_url,
    source: repoName,
    datetime,
    time: relativeTime(datetime),
    content: detail.commit?.message?.trim(),
    articleContent: content,
  };
}

async function fetchCommitDetail(owner: string, repo: string, ref: string, config: Config, token?: string): Promise<GitHubCommitDetail> {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${ref}`;
  return fetchGitHubJson<GitHubCommitDetail>(url, token);
}

async function fetchRepoCommitArticles(config: Config): Promise<ArticleItem[]> {
  const { owner, repo } = parseRepoSlug(config.githubActivity.repo);
  const token = getGitHubToken(config.githubActivity);
  const params = new URLSearchParams({
    per_page: String(config.githubActivity.maxItems),
    since: new Date(Date.now() - config.githubActivity.sinceHours * 60 * 60 * 1000).toISOString(),
  });

  if (config.githubActivity.branch?.trim()) {
    params.set('sha', config.githubActivity.branch.trim());
  }

  const listUrl = `https://api.github.com/repos/${owner}/${repo}/commits?${params.toString()}`;
  logInfo(config, `Fetching GitHub repo commits from ${listUrl}`);
  const commits = await fetchGitHubJson<GitHubCommitListItem[]>(listUrl, token);

  const details = await Promise.all(
    commits.slice(0, config.githubActivity.maxItems).map(commit => fetchCommitDetail(owner, repo, commit.sha, config, token)),
  );

  return details.map(detail => {
    const content = config.githubModels.enabled && config.githubModels.fetchArticleContent
      ? buildCommitContent(detail, config)
      : detail.commit?.message?.trim();

    return buildCommitArticle(`${owner}/${repo}`, detail, content);
  });
}

async function fetchOrgCommitArticles(config: Config): Promise<ArticleItem[]> {
  const token = getGitHubToken(config.githubActivity);
  const params = new URLSearchParams({ per_page: String(Math.min(Math.max(config.githubActivity.maxItems * 10, 50), 100)) });
  const eventsUrl = `https://api.github.com/orgs/${config.githubActivity.org}/events?${params.toString()}`;
  logInfo(config, `Fetching GitHub org events from ${eventsUrl}`);
  const events = await fetchGitHubJson<GitHubOrgEvent[]>(eventsUrl, token);
  const sinceThreshold = Date.now() - config.githubActivity.sinceHours * 60 * 60 * 1000;

  const pushEvents = events
    .filter(event => event.type === 'PushEvent' && event.repo?.name && event.payload?.head)
    .filter(event => new Date(event.created_at ?? 0).getTime() >= sinceThreshold)
    .slice(0, Math.min(events.length, Math.max(config.githubActivity.maxItems * 2, config.githubActivity.maxItems)));

  const details = await Promise.allSettled(
    pushEvents.map(async event => {
      const { owner, repo } = parseRepoSlug(event.repo?.name);
      const detail = await fetchCommitDetail(owner, repo, event.payload?.head ?? '', config, token);
      const content = config.githubModels.enabled && config.githubModels.fetchArticleContent
        ? buildCommitContent(detail, config)
        : detail.commit?.message?.trim();

      return buildCommitArticle(event.repo?.name ?? `${owner}/${repo}`, detail, content);
    }),
  );

  const successfulArticles = details
    .flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    .slice(0, config.githubActivity.maxItems);

  for (const failedResult of details) {
    if (failedResult.status === 'rejected') {
      logDebug(config, `Skipping GitHub org commit event after fetch failure: ${failedResult.reason instanceof Error ? failedResult.reason.message : String(failedResult.reason)}`);
    }
  }

  return successfulArticles;
}

async function resolveFeedUrl(config: Config, token?: string): Promise<string> {
  const feedConfig = config.githubActivity;
  if (feedConfig.feedKind === 'custom-url') {
    if (!feedConfig.feedUrl?.trim()) {
      throw new Error('GitHub feed URL is required when feed kind is custom-url.');
    }

    return feedConfig.feedUrl.trim();
  }

  const feeds = await fetchGitHubJson<GitHubFeedsResponse>('https://api.github.com/feeds', token);
  const feedLookup: Record<Exclude<GitHubFeedKind, 'organization' | 'custom-url'>, string | undefined> = {
    timeline: feeds.timeline_url,
    'current-user-public': feeds.current_user_public_url,
    'current-user': feeds.current_user_url,
    'current-user-actor': feeds.current_user_actor_url,
    'security-advisories': feeds.security_advisories_url,
  };

  if (feedConfig.feedKind === 'organization') {
    const org = feedConfig.org?.trim().toLowerCase();
    const match = feeds.current_user_organization_urls?.find(url => url.toLowerCase().includes(`/organizations/${org}/`));
    if (!match) {
      throw new Error(`No organization feed found for ${feedConfig.org}. This feed type requires authenticated access to that org feed.`);
    }

    return match;
  }

  const resolved = feedLookup[feedConfig.feedKind];
  if (!resolved) {
    throw new Error(`GitHub feed ${feedConfig.feedKind} is unavailable. Try setting a custom feed URL or using a token with access.`);
  }

  return resolved;
}

async function fetchGitHubFeedArticles(config: Config): Promise<ArticleItem[]> {
  const token = getGitHubToken(config.githubActivity);
  const feedUrl = await resolveFeedUrl(config, token);
  logInfo(config, `Fetching GitHub feed from ${feedUrl}`);
  const xml = await fetchGitHubText(feedUrl, token, 'application/atom+xml');
  const articles = parseFeedArticles(xml, { url: feedUrl, source: 'GitHub' })
    .sort((left, right) => new Date(right.datetime ?? 0).getTime() - new Date(left.datetime ?? 0).getTime())
    .slice(0, config.githubActivity.maxItems);

  return hydrateArticleContent(articles, {
    ...config,
    feeds: [{ url: feedUrl, source: 'GitHub' }],
    limit: config.githubActivity.maxItems,
  });
}

export async function fetchGitHubActivityArticles(config: Config): Promise<ArticleItem[]> {
  if (!config.githubActivity.enabled) {
    return [];
  }

  switch (config.githubActivity.mode) {
    case 'repo-commits':
      return fetchRepoCommitArticles(config);
    case 'org-commits':
      return fetchOrgCommitArticles(config);
    case 'feed':
      return fetchGitHubFeedArticles(config);
    default:
      return [];
  }
}

export const githubActivitySource: PhraseSource = {
  type: 'github-activity',
  isEnabled: config => config.githubActivity.enabled,
  fetch: fetchGitHubActivityArticles,
};