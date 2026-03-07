import { execFileSync } from 'node:child_process';
import { formatGitHubCommitPhrase, formatGitHubFeedPhrase } from '../core/phraseFormats.js';
import type { ArticleItem, Config, GitHubActivityConfig, GitHubFeedKind, PhraseFormatTemplates, PhraseSource } from '../core/types.js';
import { USER_AGENT, fetchJson, fetchText, logDebug, logInfo, relativeTime, singleLine, truncate } from '../core/utils.js';
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

interface GitHubCommitContext {
  detail: GitHubCommitDetail;
  diffText?: string;
}

interface GitHubOrgEvent {
  id: string;
  type?: string;
  created_at?: string;
  actor?: {
    login?: string;
  };
  repo?: {
    name?: string;
  };
  payload?: {
    head?: string;
    ref?: string;
    action?: string;
    ref_type?: string;
    issue?: {
      number?: number;
      title?: string;
      html_url?: string;
    };
    pull_request?: {
      number?: number;
      title?: string;
      html_url?: string;
    };
    comment?: {
      html_url?: string;
    };
    release?: {
      name?: string;
      tag_name?: string;
      html_url?: string;
    };
    member?: {
      login?: string;
    };
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

interface GitHubAuthenticatedUser {
	login?: string;
}

const GITHUB_ACCEPT = 'application/vnd.github+json';
const GITHUB_API_VERSION = '2022-11-28';
let hasWarnedAboutRejectedGitHubToken = false;
let hasWarnedAboutInvalidConfiguredToken = false;

interface GitHubTokenCandidate {
  source: string;
  token: string;
}

function isPlaceholderToken(token?: string): boolean {
  return !token || token.includes('replace_me');
}

function getGitHubCliToken(): string | undefined {
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

function getGitHubTokenCandidates(config: GitHubActivityConfig): GitHubTokenCandidate[] {
  const candidates: GitHubTokenCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (source: string, token?: string): void => {
    if (isPlaceholderToken(token) || !token || seen.has(token)) {
      return;
    }

    seen.add(token);
    candidates.push({ source, token });
  };

  addCandidate(config.tokenEnvVar, process.env[config.tokenEnvVar]);
  if (config.tokenEnvVar !== 'GITHUB_TOKEN') {
    addCandidate('GITHUB_TOKEN', process.env.GITHUB_TOKEN);
  }
  addCandidate('gh auth token', getGitHubCliToken());

  return candidates;
}

async function validateGitHubToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        ...buildGitHubHeaders(token),
        'user-agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(15_000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function getGitHubToken(config: GitHubActivityConfig): Promise<string | undefined> {
  const candidates = getGitHubTokenCandidates(config);

  for (const candidate of candidates) {
    if (await validateGitHubToken(candidate.token)) {
      if (candidate.source === 'gh auth token' && candidates[0] && candidates[0].source !== 'gh auth token' && !hasWarnedAboutInvalidConfiguredToken) {
        hasWarnedAboutInvalidConfiguredToken = true;
        console.warn(`Configured ${candidates[0].source} was invalid; using GitHub CLI auth instead`);
      }

      return candidate.token;
    }
  }

  return undefined;
}

function buildGitHubHeaders(token?: string, accept = GITHUB_ACCEPT): Record<string, string> {
  return {
    accept,
    'x-github-api-version': GITHUB_API_VERSION,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

function isGitHubAuthFailure(error: unknown): boolean {
  return error instanceof Error && /\(401\)/u.test(error.message);
}

function warnRejectedGitHubTokenOnce(): void {
  if (hasWarnedAboutRejectedGitHubToken) {
    return;
  }

  hasWarnedAboutRejectedGitHubToken = true;
  console.warn('GitHub token rejected, retrying without auth');
}

async function fetchGitHubJson<T>(url: string, token?: string): Promise<T> {
  try {
    return await fetchJson<T>(url, buildGitHubHeaders(token));
  } catch (error) {
    if (token && isGitHubAuthFailure(error)) {
      warnRejectedGitHubTokenOnce();
      return fetchJson<T>(url, buildGitHubHeaders(undefined));
    }

    throw error;
  }
}

async function fetchGitHubJsonWithHeaders<T>(url: string, headers: Record<string, string>): Promise<T> {
  return fetchJson<T>(url, {
    'user-agent': 'thinking-phrases/1.0 (+https://github.com/austenstone/thinking-phrases)',
    ...headers,
  });
}

async function fetchGitHubText(url: string, token?: string, accept = 'application/atom+xml'): Promise<string> {
  try {
    return await fetchText(url, buildGitHubHeaders(token, accept));
  } catch (error) {
    if (token && isGitHubAuthFailure(error)) {
      warnRejectedGitHubTokenOnce();
      return fetchText(url, buildGitHubHeaders(undefined, accept));
    }

    throw error;
  }
}

function buildBasicAuthHeader(login: string, token: string): string {
  return `Basic ${Buffer.from(`${login}:${token}`).toString('base64')}`;
}

async function fetchGitHubFeedsResponse(token?: string): Promise<GitHubFeedsResponse> {
  const bearerFeeds = await fetchGitHubJson<GitHubFeedsResponse>('https://api.github.com/feeds', token);
  if (!token || (bearerFeeds.current_user_organization_urls?.length ?? 0) > 0) {
    return bearerFeeds;
  }

  try {
    const user = await fetchGitHubJson<GitHubAuthenticatedUser>('https://api.github.com/user', token);
    const login = user.login?.trim();
    if (!login) {
      return bearerFeeds;
    }

    return await fetchGitHubJsonWithHeaders<GitHubFeedsResponse>('https://api.github.com/feeds', {
      accept: GITHUB_ACCEPT,
      'x-github-api-version': GITHUB_API_VERSION,
      authorization: buildBasicAuthHeader(login, token),
    });
  } catch {
    return bearerFeeds;
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
  return buildCommitContentFromContext({ detail }, config);
}

function buildCommitContentFromContext(context: GitHubCommitContext, config: Config): string | undefined {
  const { detail, diffText } = context;
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
    files.length > 0 ? `Files changed (${files.length}): ${files.map(file => file.filename).filter(Boolean).join(', ')}` : undefined,
    diffText ? `Full diff:\n${diffText}` : fileLines.length > 0 ? fileLines.join('\n') : undefined,
  ].filter(Boolean).join('\n\n');

  return content || undefined;
}

function buildCommitDeltaLabel(detail: GitHubCommitDetail): string | undefined {
  const additions = detail.stats?.additions;
  const deletions = detail.stats?.deletions;

  if (!Number.isFinite(additions) && !Number.isFinite(deletions)) {
    return undefined;
  }

  return `+${additions ?? 0} -${deletions ?? 0}`;
}

function buildShortShaLabel(detail: GitHubCommitDetail): string | undefined {
  const sha = detail.sha?.trim();
  return sha ? sha.slice(0, 7) : undefined;
}

function buildCommitDisplayPhrase(repoLabel: string, detail: GitHubCommitDetail, templates?: PhraseFormatTemplates): string {
  return formatGitHubCommitPhrase({
    headline: firstCommitLine(detail.commit?.message),
    delta: buildCommitDeltaLabel(detail),
    repo: repoDisplayName(repoLabel),
    sha: buildShortShaLabel(detail),
    author: detail.author?.login?.trim(),
    time: relativeTime(detail.commit?.author?.date),
  }, { template: templates?.githubCommit });
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function buildGitHubFeedDisplayPhrase(article: ArticleItem, templates?: PhraseFormatTemplates): string | undefined {
  const title = article.title?.trim();
  if (!title) {
    return undefined;
  }

  const source = article.source?.trim();
  const time = article.time?.trim();
  const maybeHandle = source && source !== 'GitHub' ? source : undefined;

  if (!maybeHandle) {
    return formatGitHubFeedPhrase({ action: title, time }, { template: templates?.githubFeed });
  }

  // Strip the actor name from the start of the title if present (exact or case-insensitive)
  const handlePattern = new RegExp(`^${escapeRegExp(maybeHandle)}\\s*`, 'iu');
  const strippedTitle = title.replace(handlePattern, '').trim();
  const actionText = strippedTitle || title;

  return formatGitHubFeedPhrase({ handle: maybeHandle, action: actionText, time }, { template: templates?.githubFeed });
}

function repoNameFromEvent(repo?: string): string {
  return repoDisplayName(repo ?? 'GitHub');
}

function buildOrganizationEventTitle(event: GitHubOrgEvent): string | undefined {
  const actor = event.actor?.login?.trim();
  const repoName = repoNameFromEvent(event.repo?.name);
  const action = event.payload?.action?.trim();
  const eventType = event.type?.trim();

  if (!actor || !eventType) {
    return undefined;
  }

  switch (eventType) {
    case 'IssuesEvent':
      return `${actor} ${action ?? 'updated'} an issue in ${repoName}`;
    case 'IssueCommentEvent':
      return `${actor} commented on an issue in ${repoName}`;
    case 'PullRequestEvent':
      return `${actor} ${action ?? 'updated'} a pull request in ${repoName}`;
    case 'PullRequestReviewEvent':
      return `${actor} reviewed a pull request in ${repoName}`;
    case 'PullRequestReviewCommentEvent':
      return `${actor} commented on a pull request in ${repoName}`;
    case 'PushEvent':
      return `${actor} pushed to ${repoName}`;
    case 'CreateEvent':
      return `${actor} created ${event.payload?.ref_type ?? 'something'} in ${repoName}`;
    case 'DeleteEvent':
      return `${actor} deleted ${event.payload?.ref_type ?? 'something'} in ${repoName}`;
    case 'ReleaseEvent':
      return `${actor} ${action ?? 'published'} a release in ${repoName}`;
    case 'WatchEvent':
      return `${actor} starred ${repoName}`;
    case 'ForkEvent':
      return `${actor} forked ${repoName}`;
    case 'GollumEvent':
      return `${actor} updated the wiki in ${repoName}`;
    case 'MemberEvent':
      return `${actor} ${action ?? 'updated'} a member in ${repoName}`;
    case 'PublicEvent':
      return `${actor} open-sourced ${repoName}`;
    default:
      return `${actor} ${eventType.replace(/Event$/u, '').toLowerCase()} in ${repoName}`;
  }
}

function buildOrganizationEventLink(event: GitHubOrgEvent): string | undefined {
  return event.payload?.issue?.html_url
    ?? event.payload?.pull_request?.html_url
    ?? event.payload?.comment?.html_url
    ?? event.payload?.release?.html_url;
}

function buildOrganizationEventArticle(event: GitHubOrgEvent, templates?: PhraseFormatTemplates): ArticleItem | null {
  const title = buildOrganizationEventTitle(event);
  if (!title) {
    return null;
  }

  const datetime = event.created_at;
  const article: ArticleItem = {
    type: 'article',
    id: `github-feed-event:${event.id}`,
    title,
    link: buildOrganizationEventLink(event),
    source: event.actor?.login?.trim() || 'GitHub',
    datetime,
    time: relativeTime(datetime),
    content: title,
  };

  return {
    ...article,
    displayPhrase: buildGitHubFeedDisplayPhrase(article, templates),
  };
}

function buildCommitArticle(repoLabel: string, detail: GitHubCommitDetail, content?: string, templates?: PhraseFormatTemplates): ArticleItem {
  const datetime = detail.commit?.author?.date;
  const repoName = repoDisplayName(repoLabel);
  const authorHandle = detail.author?.login?.trim();
  const deltaLabel = buildCommitDeltaLabel(detail);
  const shortShaLabel = buildShortShaLabel(detail);
  const titleBits = [
    firstCommitLine(detail.commit?.message),
    shortShaLabel,
    deltaLabel,
    authorHandle ? `@${authorHandle}` : undefined,
  ].filter(Boolean);

  return {
    type: 'article',
    id: `github:${repoLabel}:${detail.sha}`,
    title: titleBits.join(' — '),
		displayPhrase: buildCommitDisplayPhrase(repoLabel, detail, templates),
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

async function fetchCommitDiff(owner: string, repo: string, ref: string, token?: string): Promise<string | undefined> {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${ref}`;
  const diffText = await fetchGitHubText(url, token, 'application/vnd.github.v3.diff');
  return diffText.trim() || undefined;
}

async function fetchCommitContext(owner: string, repo: string, ref: string, config: Config, token?: string): Promise<GitHubCommitContext> {
  const detail = await fetchCommitDetail(owner, repo, ref, config, token);
  if (!(config.githubModels.enabled && config.githubModels.fetchArticleContent)) {
    return { detail };
  }

  let diffText: string | undefined;
  try {
    diffText = await fetchCommitDiff(owner, repo, ref, token);
  } catch (error) {
    logDebug(config, `Falling back to patch previews for ${owner}/${repo}@${ref} because full diff fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { detail, diffText };
}

async function fetchRepoCommitArticles(config: Config): Promise<ArticleItem[]> {
  const { owner, repo } = parseRepoSlug(config.githubActivity.repo);
  const token = await getGitHubToken(config.githubActivity);
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

  const contexts = await Promise.all(
    commits.slice(0, config.githubActivity.maxItems).map(commit => fetchCommitContext(owner, repo, commit.sha, config, token)),
  );

  return contexts.map(context => {
    const { detail } = context;
    const content = config.githubModels.enabled && config.githubModels.fetchArticleContent
      ? buildCommitContentFromContext(context, config)
      : detail.commit?.message?.trim();

    return buildCommitArticle(`${owner}/${repo}`, detail, content);
  });
}

async function fetchOrgCommitArticles(config: Config): Promise<ArticleItem[]> {
  const token = await getGitHubToken(config.githubActivity);
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
      const context = await fetchCommitContext(owner, repo, event.payload?.head ?? '', config, token);
      const { detail } = context;
      const content = config.githubModels.enabled && config.githubModels.fetchArticleContent
        ? buildCommitContentFromContext(context, config)
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

  const feeds = await fetchGitHubFeedsResponse(token);
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
  const token = await getGitHubToken(config.githubActivity);
  let feedUrl: string | undefined;
  try {
    feedUrl = await resolveFeedUrl(config, token);
  } catch (error) {
    if (config.githubActivity.feedKind !== 'organization') {
      throw error;
    }

    const org = config.githubActivity.org?.trim();
    const eventsUrl = `https://api.github.com/orgs/${org}/events?per_page=${config.githubActivity.maxItems}`;
    logInfo(config, `Falling back to GitHub organization events from ${eventsUrl}`);
    const events = await fetchGitHubJson<GitHubOrgEvent[]>(eventsUrl, token);
    return events
      .map(buildOrganizationEventArticle)
      .filter((article): article is ArticleItem => Boolean(article))
      .slice(0, config.githubActivity.maxItems);
  }

  logInfo(config, `Fetching GitHub feed from ${feedUrl}`);
  const xml = await fetchGitHubText(feedUrl, token, 'application/atom+xml');
  const articles = parseFeedArticles(xml, { url: feedUrl, source: 'GitHub' })
    .map(article => ({
			...article,
			displayPhrase: buildGitHubFeedDisplayPhrase(article),
		}))
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