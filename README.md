# Thinking Phrases

Turn your VS Code thinking indicator into a live dashboard. Static tip packs, real-time data sources, AI-powered summaries — all piped into [`chat.agent.thinking.phrases`](https://code.visualstudio.com/updates/v1_110#_custom-thinking-phrases).

## Quick start

```bash
npx thinking-phrases --interactive
```

No install, no clone, no config files. The interactive CLI walks you through picking sources, previewing phrases, writing to VS Code settings, and optionally installing a macOS scheduler.

Or just grab the [static thinking phrases](https://github.com/austenstone/thinking-phrases/tree/main/out) directly.

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

A guided terminal UI built with [`@clack/prompts`](https://github.com/bombshell-dev/clack) that walks you through source selection, config, preview, and installation — no flag memorization required.

### macOS scheduler

A `launchd` job that refreshes your phrases on a cron-like interval. Set it to 5 minutes for stocks, an hour for news, whatever you want.

### Config profiles

Save named configs and switch between them. The interactive CLI saves configs to `configs/` automatically, or create them manually:

```bash
npx thinking-phrases --config configs/stocks.config.json
npx thinking-phrases --config configs/github-timeline.config.json
```

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

# Weather conditions + alerts near a ZIP
npx thinking-phrases --use-weather-alerts --weather-zip 33312

# Hacker News top stories with min score
npx thinking-phrases --use-hacker-news --hn-feed top --hn-max-items 15 --hn-min-score 100

# Custom JSON API
npx thinking-phrases --use-custom-json --json-url "https://hn.algolia.com/api/v1/search?tags=front_page" --json-items-path hits --json-title-field title

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

Any RSS or Atom feed URL. Google News, GitHub Blog, Ars Technica, your company blog — whatever you want. When AI is enabled, the engine fetches full article HTML and passes it to the model for richer summaries.

```json
"feeds": [
  { "url": "https://github.blog/feed/" },
  { "url": "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en" }
]
```

Default refresh: every 6 hours (`rssFetchIntervalSeconds: 21600`).

### Stock quotes

Live prices via Yahoo Finance. Supports market state labels (pre-market, after-hours, closed).

```json
"stockQuotes": {
  "enabled": true,
  "symbols": ["MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "AMD"],
  "includeMarketState": true,
  "showClosed": false,
  "fetchIntervalSeconds": 60
}
```

CLI: `--stocks MSFT,NVDA,TSLA` or `--use-stocks` / `--no-stocks`

### Hacker News

Top, new, best, ask, show, or jobs feed. Configurable minimum score and item count.

```json
"hackerNews": {
  "enabled": true,
  "feed": "top",
  "maxItems": 10,
  "minScore": 50,
  "fetchIntervalSeconds": 300
}
```

CLI: `--use-hacker-news --hn-feed top --hn-max-items 10 --hn-min-score 50`

### Earthquakes (USGS)

Enter a ZIP code (or place name) and the engine resolves it to lat/lon, then queries the USGS earthquake catalog within a configurable radius.

```json
"earthquakes": {
  "enabled": true,
  "zipCode": "94103",
  "minMagnitude": 2,
  "radiusKm": 500,
  "windowHours": 24,
  "limit": 10,
  "orderBy": "time",
  "fetchIntervalSeconds": 1800
}
```

CLI: `--use-earthquakes --quake-zip 94103 --quake-min-magnitude 2 --quake-radius-km 500 --quake-order time`

### Weather (NOAA/NWS)

Enter a ZIP code and the engine resolves it to coordinates, finds the nearest NWS observation station, and fetches **current conditions** (temperature, description, wind, humidity). Also checks for active severe weather alerts filtered by severity.

If no ZIP is configured, the interactive CLI auto-detects your location via IP geolocation.

```json
"weatherAlerts": {
  "enabled": true,
  "zipCode": "33312",
  "area": "FL",
  "minimumSeverity": "moderate",
  "limit": 10,
  "fetchIntervalSeconds": 1800
}
```

Severity levels: `minor`, `moderate`, `severe`, `extreme`.

CLI: `--use-weather-alerts --weather-zip 33312 --weather-severity severe`

### Custom JSON API

Point it at any JSON endpoint. Map title, content, link, source, date, and ID fields. Works with anything that returns an array of objects. Supports multiple sources via `customJsonSources[]` in config files.

```json
"customJson": {
  "enabled": true,
  "url": "https://hn.algolia.com/api/v1/search?tags=front_page",
  "itemsPath": "hits",
  "titleField": "title",
  "contentField": "summary",
  "linkField": "url",
  "sourceLabel": "HN API",
  "dateField": "created_at",
  "idField": "objectID",
  "maxItems": 10,
  "fetchIntervalSeconds": 3600
}
```

CLI: `--use-custom-json --json-url <url> --json-items-path hits --json-title-field title`

### GitHub activity

Three modes for GitHub data:

**Repo commits** — recent commits from a specific repository. Includes short SHA, line deltas, and author handle in the phrase. When AI is enabled, the model gets the **full commit diff** for richer summaries.

```json
"githubActivity": {
  "enabled": true,
  "mode": "repo-commits",
  "repo": "microsoft/vscode",
  "branch": "main",
  "maxItems": 10,
  "sinceHours": 24,
  "tokenEnvVar": "GITHUB_TOKEN",
  "fetchIntervalSeconds": 300
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

Phrases are content-first with source attribution at the end. Each source type has a customizable template using `%variable%` substitution:

```json
"phraseFormatting": {
  "includeSource": true,
  "includeTime": true,
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

The template engine automatically strips empty `()[]{}`, collapses repeated separators, and cleans extra whitespace.

AI-generated phrases get their source suffix appended automatically with source-specific metadata:
- **HN**: `— HN @author 342 pts (2h ago)`
- **GitHub commits**: `— vscode +12/-3 @octocat (5m ago)`
- **RSS/Blog**: `— The GitHub Blog (3h ago)`

## GitHub Models (AI)

When enabled, each article is sent individually to GitHub Models for rewriting into concise, factual phrases. The model focuses on content only — source attribution (`— Source (time)`) and source-specific metadata (HN score, commit deltas, author) are appended automatically after the response.

Uses the [OpenAI SDK](https://github.com/openai/openai-node) for compatibility with all models including reasoning models (`gpt-5`, `o3`). Falls back to basic formatting if auth or inference fails. Results are cached per-article (default TTL: 7 days) so re-runs don't burn tokens.

```json
"githubModels": {
  "enabled": true,
  "model": "openai/gpt-4o-mini",
  "endpoint": "https://models.github.ai/inference",
  "tokenEnvVar": "GITHUB_MODELS_TOKEN",
  "maxInputItems": 10,
  "maxInputTokens": 16000,
  "maxTokens": 500,
  "maxConcurrency": 1,
  "maxPhrasesPerArticle": 2,
  "temperature": 0.2,
  "fetchArticleContent": true,
  "maxArticleContentLength": 6000,
  "cacheTtlSeconds": 604800
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
| **Dev Pulse** | Google Tech news + Hacker News top (8 items, min score 80) |
| **Market Watch** | MSFT, NVDA, AMZN, GOOGL, AMD, TSLA stock quotes |
| **World Signals** | Earthquakes (M4.5+) + severe weather + Hacker News best |

## Phrase store

All phrases are persisted per-source in `~/.cache/thinking-phrases/`:

| File | Purpose |
|------|---------|
| `phrase-store.json` | Phrases from all sources, keyed by source type |
| `source-timestamps.json` | Last fetch time per source (for interval-based refresh) |
| `model-cache.json` | AI-generated phrases keyed by article ID (TTL: 7 days) |

This means sources with different refresh intervals coexist cleanly — stocks refresh every 60s while RSS refreshes every 6h, and both stay in the merged output.

## Scheduler (macOS)

The interactive installer can set up a `launchd` scheduler that refreshes your phrases on a timer. If you cloned the repo, you can also install it manually:

```bash
npm run schedule             # default: every 3600s (1 hour)
npm run schedule -- 300      # every 5 minutes
npm run schedule -- 900 ./configs/hn-top.config.json
```

The scheduler runs at the OS level. Your VS Code settings update silently in the background.

```bash
npm run schedule:trigger     # run the installed scheduler now (or fall back to a direct run)
npm run schedule:remove      # remove the scheduler
npx thinking-phrases --uninstall  # remove thinking phrases from settings
```

You can also manage the scheduler from CLI flags:

```bash
npx thinking-phrases --install-scheduler     # install/update the launchd job
npx thinking-phrases --trigger-scheduler-now # trigger immediate refresh
npx thinking-phrases --uninstall-scheduler   # remove the launchd job
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

Install a static pack directly:

```bash
npx thinking-phrases --static-pack out/typescript-tips.json
```

## CLI reference

### Commands

| Command | Description |
|---------|-------------|
| `npx thinking-phrases --interactive` | Guided interactive setup |
| `npx thinking-phrases --dry-run` | Preview phrases without writing |
| `npx thinking-phrases` | Write phrases to VS Code settings |
| `npx thinking-phrases --uninstall` | Remove thinking phrases from settings |
| `npx thinking-phrases --static-pack <path>` | Install a static phrase pack |

### Global flags

| Flag | Description |
|------|-------------|
| `--config <path>` | Load a saved config file |
| `--settings <path>` | Custom VS Code settings.json path |
| `--dry-run` | Preview phrases without writing to settings |
| `--verbose` | Verbose output |
| `--debug` | Debug output (includes verbose) |
| `--limit <num>` | Max total phrases (default: 100) |
| `--mode append\|replace` | Append to or replace existing phrases |
| `--target auto\|insiders\|stable` | Which VS Code edition to target |
| `--max-length <num>` | Max phrase length in characters (default: 140) |
| `--no-source` | Omit source attribution from phrases |
| `--no-time` | Omit relative time from phrases |

### Source flags

| Flag | Description |
|------|-------------|
| `--feed <url>` | Add an RSS/Atom feed URL (repeatable) |
| `--use-stocks` / `--no-stocks` | Enable/disable stock quotes |
| `--stocks <SYMBOLS>` | Comma-separated stock tickers |
| `--use-hacker-news` | Enable Hacker News |
| `--hn-feed <type>` | top, new, best, ask, show, or jobs |
| `--hn-max-items <num>` | Max HN items |
| `--hn-min-score <num>` | Minimum HN score filter |
| `--use-earthquakes` | Enable earthquake source |
| `--quake-zip <zip>` | ZIP code for earthquake search center |
| `--quake-place <name>` | Place name for earthquake search |
| `--quake-min-magnitude <num>` | Minimum magnitude filter |
| `--quake-radius-km <num>` | Search radius in km |
| `--quake-hours <num>` | Time window in hours |
| `--quake-order time\|magnitude` | Sort order |
| `--quake-limit <num>` | Max earthquake results |
| `--use-weather-alerts` | Enable weather source |
| `--weather-zip <zip>` | ZIP code for weather |
| `--weather-area <area>` | US state code (e.g. FL) |
| `--weather-severity <level>` | Minimum severity (minor/moderate/severe/extreme) |
| `--weather-limit <num>` | Max weather alert results |
| `--use-custom-json` | Enable custom JSON source |
| `--json-url <url>` | JSON endpoint URL |
| `--json-items-path <path>` | JSONPath to items array |
| `--json-title-field <field>` | Field name for title |
| `--json-content-field <field>` | Field name for content |
| `--json-link-field <field>` | Field name for link |
| `--json-source-field <field>` | Field name for source |
| `--json-source-label <label>` | Fallback source label |
| `--json-date-field <field>` | Field name for date |
| `--json-id-field <field>` | Field name for ID |
| `--json-max-items <num>` | Max JSON items |
| `--use-github` | Enable GitHub activity |
| `--github-mode <mode>` | repo-commits, org-commits, or feed |
| `--github-repo <owner/repo>` | Target repository |
| `--github-org <org>` | Target organization |
| `--github-branch <branch>` | Branch filter |
| `--github-feed-kind <kind>` | Feed type (see GitHub activity section) |
| `--github-feed-url <url>` | Custom feed URL |
| `--github-max-items <num>` | Max GitHub items |
| `--github-since-hours <num>` | Lookback window in hours |
| `--github-token-env <var>` | Env var name for GitHub token |

### AI model flags

| Flag | Description |
|------|-------------|
| `--use-models` / `--no-models` | Enable/disable AI rewriting |
| `--model <name>` | Model ID (default: `openai/gpt-4o-mini`) |
| `--models-endpoint <url>` | Inference endpoint |
| `--models-token-env <var>` | Env var for model auth token |
| `--models-max-concurrency <num>` | Parallel inference requests |
| `--models-max-input-items <num>` | Max articles sent to model |
| `--models-max-input-tokens <num>` | Max input token budget |
| `--models-max-tokens <num>` | Max output tokens per request |
| `--models-max-phrases-per-article <num>` | Phrases generated per article |
| `--models-temperature <0-1>` | Sampling temperature |
| `--fetch-article-content` / `--no-fetch-article-content` | Fetch full article HTML for AI |
| `--max-article-content-length <num>` | Max chars of article body sent to model |

### Scheduler flags

| Flag | Description |
|------|-------------|
| `--install-scheduler` | Install/update macOS launchd job |
| `--trigger-scheduler-now` | Trigger the scheduler immediately |
| `--uninstall-scheduler` | Remove the launchd job |

## How it works

```
Sources → Normalize → Format → Cache → Write
```

1. **Sources** fetch live data (RSS, stocks, GitHub, USGS, NOAA, JSON APIs) — each respects its own refresh interval
2. **Core** normalizes everything into `ArticleItem` or `StockItem` objects
3. **Formatter** builds display phrases from customizable templates — content first, source/metadata suffix appended
4. **AI** (optional) rewrites phrases via GitHub Models, with per-article caching to avoid redundant inference
5. **Phrase store** persists phrases per-source in `~/.cache/thinking-phrases/` so different refresh intervals don't clobber each other
6. **Sink** writes the merged phrases into VS Code `settings.json` using `jsonc-parser` (preserves comments and formatting)

The source catalog is modular. Each source is a `{ type, isEnabled, fetch }` object registered in the catalog. Adding a new source means writing one file and registering it.

## Portability

Settings path auto-detection works on macOS, Linux, and Windows. Supports both VS Code Stable and Insiders. You can also pass `--settings` to point at any path or `--target` to force a specific edition.

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
