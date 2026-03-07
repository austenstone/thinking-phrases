import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fetchGitHubActivityArticles, githubActivitySource } from '../src/sources/githubActivity.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import type { Config } from '../src/core/types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function buildGitHubConfig(overrides: Partial<Config['githubActivity']> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    githubActivity: {
      ...DEFAULT_CONFIG.githubActivity,
      enabled: true,
      tokenEnvVar: 'GITHUB_TOKEN',
      ...overrides,
    },
  };
}

// ── isEnabled ────────────────────────────────────────────────────────
describe('githubActivitySource.isEnabled', () => {
  it('returns false by default', () => {
    expect(githubActivitySource.isEnabled(DEFAULT_CONFIG)).toBe(false);
  });

  it('returns true when enabled', () => {
    expect(githubActivitySource.isEnabled(buildGitHubConfig())).toBe(true);
  });
});

// ── fetchGitHubActivityArticles — disabled ───────────────────────────
describe('fetchGitHubActivityArticles — disabled', () => {
  it('returns empty when disabled', async () => {
    const result = await fetchGitHubActivityArticles(DEFAULT_CONFIG);
    expect(result).toEqual([]);
  });
});

// ── repo-commits mode ────────────────────────────────────────────────
describe('fetchGitHubActivityArticles — repo-commits', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GITHUB_TOKEN = originalEnv;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  it('fetches commit list then details and returns articles', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test_token_123';

    const commitList = [
      { sha: 'abc1234', html_url: 'https://github.com/owner/repo/commit/abc1234' },
      { sha: 'def5678', html_url: 'https://github.com/owner/repo/commit/def5678' },
    ];

    const commitDetail1 = {
      sha: 'abc1234',
      html_url: 'https://github.com/owner/repo/commit/abc1234',
      commit: {
        message: 'feat: add dark mode support\n\nAdds CSS variables for dark theme',
        author: { date: new Date().toISOString(), name: 'Test User' },
      },
      author: { login: 'testuser' },
      stats: { additions: 42, deletions: 10, total: 52 },
      files: [
        { filename: 'src/theme.css', status: 'modified', additions: 30, deletions: 5, changes: 35 },
        { filename: 'src/app.ts', status: 'modified', additions: 12, deletions: 5, changes: 17 },
      ],
    };

    const commitDetail2 = {
      sha: 'def5678',
      html_url: 'https://github.com/owner/repo/commit/def5678',
      commit: {
        message: 'fix: resolve null pointer in settings',
        author: { date: new Date().toISOString(), name: 'Other Dev' },
      },
      author: { login: 'otherdev' },
      stats: { additions: 3, deletions: 1, total: 4 },
      files: [{ filename: 'src/settings.ts', status: 'modified', additions: 3, deletions: 1, changes: 4 }],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

      // token validation
      if (url === 'https://api.github.com/user') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }

      // commit list
      if (url.includes('/repos/owner/repo/commits?')) {
        return new Response(JSON.stringify(commitList));
      }

      // commit detail
      if (url.includes('/repos/owner/repo/commits/abc1234')) {
        return new Response(JSON.stringify(commitDetail1));
      }
      if (url.includes('/repos/owner/repo/commits/def5678')) {
        return new Response(JSON.stringify(commitDetail2));
      }

      return new Response('not found', { status: 404 });
    });

    const config = buildGitHubConfig({
      mode: 'repo-commits',
      repo: 'owner/repo',
      maxItems: 2,
      sinceHours: 24,
    });

    const result = await fetchGitHubActivityArticles(config);
    expect(result).toHaveLength(2);

    // Check first article
    expect(result[0].type).toBe('article');
    expect(result[0].id).toContain('github:owner/repo:abc1234');
    expect(result[0].title).toContain('feat: add dark mode support');
    expect(result[0].source).toBe('repo');
    expect(result[0].link).toBe('https://github.com/owner/repo/commit/abc1234');
    expect(result[0].displayPhrase).toBeTruthy();
    expect(result[0].displayPhrase).toContain('dark mode');

    // Check second article
    expect(result[1].title).toContain('fix: resolve null pointer');
    expect(result[1].id).toContain('def5678');
  });

  it('includes branch filter in API request', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test_token_123';
    let capturedUrl = '';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

      if (url === 'https://api.github.com/user') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }

      if (url.includes('/repos/') && url.includes('/commits?')) {
        capturedUrl = url;
        return new Response(JSON.stringify([]));
      }

      return new Response('{}');
    });

    const config = buildGitHubConfig({
      mode: 'repo-commits',
      repo: 'owner/repo',
      branch: 'develop',
      maxItems: 1,
      sinceHours: 24,
    });

    await fetchGitHubActivityArticles(config);
    expect(capturedUrl).toContain('sha=develop');
  });
});

// ── org-commits mode ─────────────────────────────────────────────────
describe('fetchGitHubActivityArticles — org-commits', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GITHUB_TOKEN = originalEnv;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  it('fetches org events, filters PushEvents, and resolves commit details', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test_token_123';

    const events = [
      {
        id: 'ev1',
        type: 'PushEvent',
        created_at: new Date().toISOString(),
        actor: { login: 'contributor' },
        repo: { name: 'myorg/myrepo' },
        payload: { head: 'sha111' },
      },
      {
        id: 'ev2',
        type: 'IssuesEvent',
        created_at: new Date().toISOString(),
        actor: { login: 'someone' },
        repo: { name: 'myorg/other' },
        payload: { action: 'opened' },
      },
    ];

    const commitDetail = {
      sha: 'sha111',
      html_url: 'https://github.com/myorg/myrepo/commit/sha111',
      commit: {
        message: 'chore: update dependencies',
        author: { date: new Date().toISOString(), name: 'Contributor' },
      },
      author: { login: 'contributor' },
      stats: { additions: 5, deletions: 2, total: 7 },
      files: [],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

      if (url === 'https://api.github.com/user') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }

      if (url.includes('/orgs/myorg/events')) {
        return new Response(JSON.stringify(events));
      }

      if (url.includes('/repos/myorg/myrepo/commits/sha111')) {
        return new Response(JSON.stringify(commitDetail));
      }

      return new Response('not found', { status: 404 });
    });

    const config = buildGitHubConfig({
      mode: 'org-commits',
      org: 'myorg',
      maxItems: 5,
      sinceHours: 24,
    });

    const result = await fetchGitHubActivityArticles(config);
    // Only the PushEvent should produce an article
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain('update dependencies');
    expect(result[0].source).toBe('myrepo');
  });
});

// ── feed mode ────────────────────────────────────────────────────────
describe('fetchGitHubActivityArticles — feed', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GITHUB_TOKEN = originalEnv;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  it('fetches Atom feed from custom URL and parses articles', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test_token_123';

    const atomFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>GitHub Feed</title>
  <entry>
    <title>austenstone pushed to main</title>
    <link href="https://github.com/austenstone/thinking-phrases/commits/main" />
    <updated>2026-03-06T20:00:00Z</updated>
    <author><name>austenstone</name></author>
    <summary>3 commits to main</summary>
  </entry>
  <entry>
    <title>copilot opened a pull request</title>
    <link href="https://github.com/austenstone/thinking-phrases/pull/1" />
    <updated>2026-03-06T19:00:00Z</updated>
    <author><name>copilot</name></author>
    <summary>Add new feature</summary>
  </entry>
</feed>`;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const req = input instanceof Request ? input : undefined;
      const headers = req?.headers;
      const accept = headers?.get?.('accept') ?? '';

      if (url === 'https://api.github.com/user') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }

      // Feeds endpoint
      if (url === 'https://api.github.com/feeds') {
        return new Response(JSON.stringify({
          timeline_url: 'https://github.com/timeline',
        }));
      }

      // The actual feed URL returns Atom XML
      if (url.includes('custom-feed-url')) {
        return new Response(atomFeed, {
          headers: { 'content-type': 'application/atom+xml' },
        });
      }

      return new Response('not found', { status: 404 });
    });

    const config = buildGitHubConfig({
      mode: 'feed',
      feedKind: 'custom-url',
      feedUrl: 'https://github.com/custom-feed-url',
      maxItems: 5,
      sinceHours: 48,
    });

    const result = await fetchGitHubActivityArticles(config);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('article');
    // Articles sorted by datetime descending
    expect(result[0].title).toContain('pushed to main');
    expect(result[1].title).toContain('opened a pull request');
  });

  it('falls back to org events API when org feed is not available', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test_token_123';

    const orgEvents = [
      {
        id: 'evt1',
        type: 'PullRequestEvent',
        created_at: new Date().toISOString(),
        actor: { login: 'alice' },
        repo: { name: 'github/docs' },
        payload: {
          action: 'opened',
          pull_request: {
            number: 42,
            title: 'Fix typo in README',
            html_url: 'https://github.com/github/docs/pull/42',
          },
        },
      },
      {
        id: 'evt2',
        type: 'IssuesEvent',
        created_at: new Date().toISOString(),
        actor: { login: 'bob' },
        repo: { name: 'github/actions' },
        payload: {
          action: 'closed',
          issue: {
            number: 99,
            title: 'Runner crashes on arm64',
            html_url: 'https://github.com/github/actions/issues/99',
          },
        },
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

      if (url === 'https://api.github.com/user') {
        return new Response(JSON.stringify({ login: 'testuser' }), { status: 200 });
      }

      // Feeds endpoint returns no org URLs
      if (url === 'https://api.github.com/feeds') {
        return new Response(JSON.stringify({
          timeline_url: 'https://github.com/timeline',
          current_user_organization_urls: [],
        }));
      }

      // Org events fallback
      if (url.includes('/orgs/github/events')) {
        return new Response(JSON.stringify(orgEvents));
      }

      return new Response('not found', { status: 404 });
    });

    const config = buildGitHubConfig({
      mode: 'feed',
      feedKind: 'organization',
      org: 'github',
      maxItems: 5,
      sinceHours: 24,
    });

    const result = await fetchGitHubActivityArticles(config);
    expect(result.length).toBeGreaterThan(0);
    // Should be org event articles, not Atom feed articles
    expect(result[0].title).toContain('alice');
    expect(result[0].title).toContain('pull request');
  });
});

// ── auth fallback ────────────────────────────────────────────────────
describe('fetchGitHubActivityArticles — auth behavior', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GITHUB_TOKEN = originalEnv;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  it('works without token for public repos', async () => {
    delete process.env.GITHUB_TOKEN;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

      if (url === 'https://api.github.com/user') {
        return new Response('Unauthorized', { status: 401 });
      }

      if (url.includes('/repos/microsoft/vscode/commits?')) {
        return new Response(JSON.stringify([
          { sha: 'pub123', html_url: 'https://github.com/microsoft/vscode/commit/pub123' },
        ]));
      }

      if (url.includes('/repos/microsoft/vscode/commits/pub123')) {
        return new Response(JSON.stringify({
          sha: 'pub123',
          html_url: 'https://github.com/microsoft/vscode/commit/pub123',
          commit: {
            message: 'Public commit message',
            author: { date: new Date().toISOString(), name: 'VSCode Dev' },
          },
          author: { login: 'vscodedev' },
          stats: { additions: 1, deletions: 0, total: 1 },
          files: [],
        }));
      }

      return new Response('not found', { status: 404 });
    });

    const config = buildGitHubConfig({
      mode: 'repo-commits',
      repo: 'microsoft/vscode',
      maxItems: 1,
      sinceHours: 168,
    });

    const result = await fetchGitHubActivityArticles(config);
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain('Public commit message');
  });
});
