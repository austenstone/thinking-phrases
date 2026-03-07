# Thinking Phrases

Turn your VS Code thinking indicator into a live dashboard. Static tip packs, real-time data sources, AI-powered summaries — all piped into [`chat.agent.thinking.phrases`](https://code.visualstudio.com/updates/v1_110#_custom-thinking-phrases).

## Quick start

```bash
npx thinking-phrases --interactive
```

That's it. No install, no clone, no config files. The interactive CLI walks you through picking sources, previewing phrases, writing to VS Code settings, and optionally installing a macOS scheduler.

Or maybe you just want the [static thinking phrases](https://github.com/austenstone/thinking-phrases/tree/main/out)

## Features

### 8 live data sources

| Source | What it shows | Example phrase |
|--------|--------------|----------------|
| **RSS / Atom** | Any feed URL | `Linux 6.14 lands with io_uring changes — Ars Technica (2h ago)` |
| **Stocks** | Live ticker quotes via Yahoo Finance | `NVDA $128.44 ▼ 0.84% 🟢` |
| **Hacker News** | Top/new/best/ask/show/jobs | `I built a database in a spreadsheet — HN @author 342 pts (45m ago)` |
| **Earthquakes** | USGS earthquake catalog near a ZIP | `M4.2 — 12 km NE of Ridgecrest, CA — USGS (38m ago)` |
| **Weather** | Current conditions + NWS severe alerts | `Fort Lauderdale, FL, 81°F, Partly Cloudy — Weather.gov` |
| **Custom JSON** | Any JSON API with configurable field mapping | `Article title — My API (1h ago)` |
| **GitHub Commits** | Recent repo or org commits with diffs | `fix devtools entrypoint — vscode +1/-1 @deepak1556 (4h ago)` |
| **GitHub Feeds** | Org activity, timeline, security advisories | `opened a pull request in copilot-sdk — @dependabot (3m ago)` |

### AI-powered formatting

Enable [GitHub Models](https://docs.github.com/en/github-models) and each article is individually sent to the model for rewriting into concise, factual phrases. Source attribution (`— Source (time)`) is appended automatically after the model responds — the model focuses purely on content. Works with any OpenAI-compatible model including `gpt-4o-mini`, `gpt-5`, and `o3`.

Phrases from all sources are persisted in a local phrase store (`~/.cache/thinking-phrases/phrase-store.json`) so sources with different refresh intervals don't overwrite each other. Stocks refresh every 60s, RSS every 6h — both stay in the output.

### Static phrase packs

Pre-built JSON packs for when you want something stable:

| Pack | Phrases |
|------|---------|
| VS Code tips (mac/win/linux) | 80 |
| JavaScript tips | 100 |
| TypeScript tips | 124 |
| Ruby tips | 108 |
| League of Legends loading tips | 100 |
| WoW loading screen tips | 109 |
| Inspirational quotes | 1,614 |

### Interactive CLI

A guided terminal UI that walks you through source selection, config, preview, and installation — no flag memorization required.

### macOS scheduler

A `launchd` job that refreshes your phrases on a cron-like interval. Set it to 5 minutes for stocks, an hour for news, whatever you want.

### Multiple config profiles

Keep separate configs for different moods. `configs/github-timeline.config.json` for work, `configs/stocks-only.config.json` for market hours, swap between them.

### One-liner examples

```bash
# GitHub org activity feed
npx thinking-phrases --use-github --github-mode feed --github-feed-kind organization --github-org github --github-max-items 10

# Repo commits with AI summaries
npx thinking-phrases --use-github --github-mode repo-commits --github-repo microsoft/vscode --github-max-items 5 --use-models

# Stocks + RSS
npx thinking-phrases --stocks MSFT,NVDA,TSLA --feed https://github.blog/feed/

# Earthquakes near a ZIP
npx thinking-phrases --use-earthquakes --quake-zip 94103 --quake-min-magnitude 2

# Weather alerts near a ZIP
npx thinking-phrases --use-weather-alerts --weather-zip 33312

# Dry run (preview only, don't write)
npx thinking-phrases --dry-run --use-github --github-mode feed --github-feed-kind organization --github-org github

# Write to settings
npx thinking-phrases --use-github --github-mode feed --github-feed-kind organization --github-org github
```

### Install globally (optional)

```bash
npm install -g thinking-phrases
thinking-phrases --interactive
```

### Clone for development

```bash
git clone https://github.com/austenstone/thinking-phrases.git
cd thinking-phrases
npm install
npm run start:interactive
```

## Data sources

### RSS / Atom feeds

Any RSS or Atom feed URL. Google News, GitHub Blog, Ars Technica, your company blog — whatever you want.

```json
"feeds": [
  { "url": "https://github.blog/feed/" },
  { "url": "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en" }
]
```

### Stock quotes

Live prices via Yahoo Finance. Supports market state labels (pre-market, after-hours).

```json
"stockQuotes": {
  "enabled": true,
  "symbols": ["MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "AMD"],
  "includeMarketState": true,
  "showClosed": false
}
```

### Hacker News

Top, new, best, ask, show, or jobs feed. Configurable minimum score and item count.

```json
"hackerNews": {
  "enabled": true,
  "feed": "top",
  "maxItems": 10,
  "minScore": 50
}
```

### Earthquakes (USGS)

Enter a ZIP code and the engine resolves it to lat/lon, then queries the USGS earthquake catalog within a configurable radius.

```json
"earthquakes": {
  "enabled": true,
  "zipCode": "94103",
  "minMagnitude": 2,
  "radiusKm": 500,
  "limit": 10
}
```

### Weather (NOAA/NWS)

Enter a ZIP code and the engine resolves it to coordinates, finds the nearest NWS observation station, and fetches **current conditions** (temperature, description, wind, humidity). Also checks for active severe weather alerts.

If no ZIP is configured, the interactive CLI auto-detects your location via IP geolocation.

```json
"weatherAlerts": {
  "enabled": true,
  "zipCode": "33312",
  "minimumSeverity": "moderate",
  "limit": 10
}
```

Example output: `Fort Lauderdale, FL, 81°F, Partly Cloudy — Weather.gov`

### Custom JSON API

Point it at any JSON endpoint. Map title, content, link, source, date, and ID fields. Works with anything that returns an array of objects.

```json
"customJson": {
  "enabled": true,
  "url": "https://hn.algolia.com/api/v1/search?tags=front_page",
  "itemsPath": "hits",
  "titleField": "title",
  "linkField": "url",
  "sourceLabel": "HN API",
  "dateField": "created_at",
  "idField": "objectID",
  "maxItems": 10
}
```

### GitHub activity

Three modes for GitHub data:

**Repo commits** — recent commits from a specific repository. Includes short SHA, line deltas, and author handle in the phrase. When AI is enabled with extra context, the model gets the **full commit diff**.

```json
"githubActivity": {
  "enabled": true,
  "mode": "repo-commits",
  "repo": "microsoft/vscode",
  "branch": "main",
  "maxItems": 10,
  "tokenEnvVar": "GITHUB_TOKEN"
}
```

**Org commits** — recent push events across an entire GitHub organization. Fetches commit details for each push.

```json
"githubActivity": {
  "enabled": true,
  "mode": "org-commits",
  "org": "github",
  "maxItems": 10
}
```

**Feeds** — GitHub Atom feeds including organization activity, your personal timeline, security advisories, or any custom feed URL. Supports authenticated private feed discovery via `/feeds` with fallback to public org events.

```json
"githubActivity": {
  "enabled": true,
  "mode": "feed",
  "feedKind": "organization",
  "org": "github",
  "maxItems": 20
}
```

Available feed kinds: `timeline`, `current-user-public`, `current-user`, `current-user-actor`, `security-advisories`, `organization`, `custom-url`.

## Phrase format

Phrases are content-first with source attribution at the end. Each source type has a customizable template:

```json
"phraseFormatting": {
  "maxLength": 140,
  "templates": {
    "article": "%title% — %source% (%time%)",
    "hackerNews": "%title% — HN %score% (%time%)",
    "stock": "%symbol% %price% %change% %market%",
    "githubCommit": "%headline% — %repo% %delta% @%author% (%time%)",
    "githubFeed": "%action% — @%handle% (%time%)"
  }
}
```

AI-generated phrases get their source suffix appended automatically with source-specific metadata:
- **HN**: `— HN @author 342 pts (2h ago)`
- **GitHub commits**: `— vscode +12/-3 @octocat (5m ago)`
- **RSS/Blog**: `— The GitHub Blog (3h ago)`

## GitHub Models (AI)

When enabled, each article is sent individually to GitHub Models for rewriting into concise, factual phrases. The model focuses on content only — source attribution (`— Source (time)`) and source-specific metadata (HN score, commit deltas, author) are appended automatically after the response.

Uses the [OpenAI SDK](https://github.com/openai/openai-node) for compatibility with all models including reasoning models (`gpt-5`, `o3`). Falls back to basic formatting if auth or inference fails.

```json
"githubModels": {
  "enabled": true,
  "model": "openai/gpt-4o-mini",
  "endpoint": "https://models.github.ai/inference",
  "maxConcurrency": 3,
  "fetchArticleContent": true
}
```

### Auth

Tokens are resolved in this order for both GitHub API and GitHub Models:

1. Configured env var (`GITHUB_MODELS_TOKEN` / `GITHUB_TOKEN`)
2. `GITHUB_TOKEN` env var
3. `gh auth token` (GitHub CLI)

For GitHub activity, if a token causes 401/403 on public endpoints, it silently retries without auth.

## Presets

The interactive installer includes built-in presets to get started fast:

| Preset | Sources |
|--------|---------|
| **Dev Pulse** | Google Tech news + Hacker News top stories |
| **Market Watch** | Big-tech stock quotes with fast-refresh defaults |
| **World Signals** | Earthquakes + severe weather + Hacker News best |

## Scheduler (macOS)

The interactive installer can set up a `launchd` scheduler that refreshes your phrases on a timer. If you cloned the repo, you can also install it manually:

```bash
npm run schedule             # default: every 3600s (1 hour)
npm run schedule -- 300      # every 5 minutes
npm run schedule -- 900 ./configs/stocks-only.config.json
```

The scheduler runs at the OS level. Your VS Code settings update silently in the background.

```bash
npm run schedule:trigger     # run the installed scheduler now (or fall back to a direct run)
npm run schedule:remove      # remove the scheduler
npx thinking-phrases --uninstall  # remove thinking phrases from settings
```

## Config profiles

Keep multiple configs in `configs/` and switch between them:

```text
configs/
  rss-settings.config.json
  github-timeline.config.json
  github-commits.config.json
  google-news.config.json
  google-technology-stocks.config.json
  hn-best-earthquakes-weather-alerts.config.json
  stocks-only.config.json
```

```bash
npm start -- --config configs/stocks-only.config.json
npm run schedule -- 300 configs/stocks-only.config.json
```

## Static packs

### VS Code tips

| Category | Count | Description |
|----------|-------|-------------|
| ⌨️ Shortcuts | 25 | Multi-cursor, navigation, selection, formatting |
| 🤖 Copilot | 15 | Chat, agent mode, inline chat, prompt files |
| 🔀 Git | 8 | Source control, blame, staging, timeline |
| 💻 Terminal | 7 | Splits, suggestions, integrated terminal |
| 🐛 Debugging | 7 | Breakpoints, logpoints, conditional stops |
| ✏️ Editor | 10 | Zen mode, sticky scroll, Emmet |
| 😄 Funny | 8 | Flavor text |

OS-aware format — each tip has `mac`, `windows`, and `linux` variants:

```json
{
  "mac": "⌘+D selects the next occurrence of a word. Keep pressing for more!",
  "windows": "Ctrl+D selects the next occurrence of a word. Keep pressing for more!",
  "linux": "Ctrl+D selects the next occurrence of a word. Keep pressing for more!"
}
```

### Other packs

Standalone string arrays — just drop them in:

- JavaScript tips (100)
- TypeScript tips (124)
- Ruby tips (108)
- League of Legends loading tips (100)
- WoW loading screen tips (109)
- Inspirational quotes (1,614 — from `dwyl/quotes`, GPL-2.0)

## CLI reference

| Command | Description |
|---------|-------------|
| `npx thinking-phrases --interactive` | Guided interactive setup |
| `npx thinking-phrases --dry-run` | Preview phrases without writing |
| `npx thinking-phrases` | Write phrases to VS Code settings |
| `npx thinking-phrases --uninstall` | Remove thinking phrases from settings |

All `--flags` from the data source sections above work with any of these commands.

## How it works

```
Sources → Normalize → Format → Write
```

1. **Sources** fetch live data (RSS, stocks, GitHub, USGS, NOAA, JSON APIs)
2. **Core** normalizes everything into article or stock items
3. **Formatter** builds display phrases — content first, source/metadata suffix appended (e.g. `— HN @user 342 pts (2h ago)`). AI-rewritten phrases get the same suffix treatment.
4. **Phrase store** persists phrases per-source in `~/.cache/thinking-phrases/` so different refresh intervals don't clobber each other
5. **Sink** writes the merged phrases into VS Code `settings.json` using `jsonc-parser` (preserves comments and formatting)

The source catalog is modular. Each source is a simple `{ isEnabled, fetch }` object registered in the catalog. Adding a new source means writing one file and registering it.

## Portability

Settings path auto-detection works on macOS, Linux, and Windows. Supports both VS Code Stable and Insiders. You can also pass `--settings` to point at any path.

## References

- [VS Code Custom Thinking Phrases](https://code.visualstudio.com/updates/v1_110#_custom-thinking-phrases)
- [GitHub Models](https://docs.github.com/en/github-models/quickstart)
- [GitHub REST API — Feeds](https://docs.github.com/en/rest/activity/feeds)
- [GitHub REST API — Commits](https://docs.github.com/en/rest/commits/commits)
- [USGS Earthquake Catalog](https://earthquake.usgs.gov/fdsnws/event/1/)
- [NOAA/NWS Alerts API](https://www.weather.gov/documentation/services-web-api)
- [Yahoo Finance](https://finance.yahoo.com/)

## License

MIT
