# Thinking Phrases

Instead of staring into the abyss while Copilot thinks — contemplating how agents are going to take your job — you could be doing something useful with that dead time.

This hooks into VS Code's [`chat.agent.thinking.phrases`](https://code.visualstudio.com/updates/v1_110#_custom-thinking-phrases) and turns it into a live dashboard. A `launchd` cron job fetches real-time data and swaps your phrases in the background. Interactive CLI to set it up. That's it.

- 📰 **Catch up on the news** — Google News, Hacker News, RSS/Atom, any feed
- 🐙 **GitHub activity** — commits, org feeds, security advisories, your timeline
- 🌦️ **Get the weather** — current conditions + severe alerts (lol like I go outside)
- 📈 **Watch the stock market go brrr** while your agents go brrr
- 🧠 **Learn something new** — VS Code tips, TypeScript snippets, programming languages
- 🎮 **Loading screen tips** — WoW, League of Legends... because why not
- 🤖 **AI-powered summaries** — GitHub Models rewrites articles into concise phrases

## Quick start

```bash
npx thinking-phrases --interactive
```

No install, no clone, no config files. The interactive CLI walks you through picking sources, previewing phrases, writing to VS Code settings, and optionally installing a macOS scheduler.

Or just grab the [static thinking phrases](https://github.com/austenstone/thinking-phrases/tree/main/out) directly.

## Live data sources

| Source | What it shows | Example phrase |
|--------|--------------|----------------|
| **RSS / Atom** | Any feed URL | `Copilot code review now accounts for over 20% of all code reviews on GitHub, reflecting a tenfold increase in usage since its launch. — The GitHub Blog (2d ago)` |
| **Stocks** | Live ticker quotes via Yahoo Finance | `BTC - USD $67,030.16 ▼ 1.83%` |
| **Hacker News** | Top/new/best/ask/show/jobs | `Multiple cursors enable simultaneous operations on syntax nodes, significantly enhancing bulk editing and refactoring capabilities. — Hacker News @ravenical 378 pts (17h ago)` |
| **Earthquakes** | USGS earthquake catalog near a ZIP | `M4.2 — 12 km NE of Ridgecrest, CA — USGS (38m ago)` |
| **Weather** | Temp, humidity, wind + NWS alerts | `77°F, Mostly Cloudy, Wind E 50 mph — Fort Lauderdale, FL — Weather.gov` |
| **Custom JSON** | Any JSON API with field mapping | `Article title — My API (1h ago)` |
| **GitHub Commits** | Repo or org commits with diffs | `fix devtools entrypoint — vscode +1/-1 @deepak1556 (4h ago)` |
| **GitHub Feeds** | Org activity, timeline, advisories | `opened a pull request in copilot-sdk — @dependabot (3m ago)` |

## Static phrase packs

Pre-built packs for when you just want vibes:

| Pack | Phrases |
|------|---------|
| VS Code tips (mac/win/linux) | 80 |
| JavaScript tips | 100 |
| TypeScript tips | 124 |
| Ruby tips | 108 |
| League of Legends loading tips | 100 |
| WoW loading screen tips | 109 |
| Inspirational quotes | 1,614 |

## Examples

```bash
# GitHub org activity feed
npx thinking-phrases --use-github --github-mode feed --github-feed-kind organization --github-org github --github-max-items 10

# Repo commits with AI summaries
npx thinking-phrases --use-github --github-mode repo-commits --github-repo microsoft/vscode --github-max-items 5 --use-models

# Stocks + RSS
npx thinking-phrases --stocks MSFT,NVDA,TSLA --feed https://github.blog/feed/

# Earthquakes near a ZIP
npx thinking-phrases --use-earthquakes --quake-zip 94103 --quake-min-magnitude 2

# Weather conditions + alerts
npx thinking-phrases --use-weather-alerts --weather-zip 33312

# Hacker News top stories
npx thinking-phrases --use-hacker-news --hn-feed top --hn-max-items 15 --hn-min-score 100

# Custom JSON API
npx thinking-phrases --use-custom-json --json-url "https://hn.algolia.com/api/v1/search?tags=front_page" --json-items-path hits --json-title-field title

# Dry run (preview only, don't write)
npx thinking-phrases --dry-run --stocks MSFT,NVDA --use-hacker-news
```

## Install

```bash
# Just run it (no install needed)
npx thinking-phrases --interactive

# Or install globally
npm install -g thinking-phrases
thinking-phrases --interactive

# Or clone for development
git clone https://github.com/austenstone/thinking-phrases.git
cd thinking-phrases
npm install
npm run start:interactive
```

## Data source config

Each source can be configured via CLI flags, config files, or the interactive CLI. Here's what each one looks like in a config file:

<details>
<summary><b>RSS / Atom feeds</b></summary>

Any feed URL. Google News, GitHub Blog, Ars Technica, your company blog — whatever. When AI is enabled, full article HTML is fetched for richer summaries.

```json
"feeds": [
  { "url": "https://github.blog/feed/" },
  { "url": "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en" }
]
```

Default refresh: every 6 hours.
</details>

<details>
<summary><b>Stock quotes</b></summary>

Live prices via Yahoo Finance. Pre-market, after-hours, closed labels.

```json
"stockQuotes": {
  "enabled": true,
  "symbols": ["MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "AMD"],
  "includeMarketState": true,
  "showClosed": false,
  "fetchIntervalSeconds": 60
}
```
</details>

<details>
<summary><b>Hacker News</b></summary>

Top, new, best, ask, show, or jobs feed. Configurable minimum score.

```json
"hackerNews": {
  "enabled": true,
  "feed": "top",
  "maxItems": 10,
  "minScore": 50,
  "fetchIntervalSeconds": 300
}
```
</details>

<details>
<summary><b>Earthquakes (USGS)</b></summary>

Enter a ZIP code or place name → resolves to lat/lon → queries USGS within a radius.

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
</details>

<details>
<summary><b>Weather (NOAA/NWS)</b></summary>

Current conditions (temp, humidity, wind, description) + active severe weather alerts. Auto-detects location in interactive mode.

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
</details>

<details>
<summary><b>Custom JSON API</b></summary>

Point at any JSON endpoint and map the fields. Multiple sources supported via `customJsonSources[]`.

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
</details>

<details>
<summary><b>GitHub activity</b></summary>

Three modes: **repo-commits** (recent commits with diffs), **org-commits** (push events across an org), and **feed** (Atom feeds — org activity, timeline, security advisories, etc.).

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

Feed kinds: `timeline`, `current-user-public`, `current-user`, `current-user-actor`, `security-advisories`, `organization`, `custom-url`.
</details>

## AI-powered formatting

Enable [GitHub Models](https://docs.github.com/en/github-models) and each article gets individually rewritten by AI into a concise phrase. Works with `gpt-4o-mini`, `gpt-5`, `o3`, or any OpenAI-compatible model. Source attribution (`— Source (time)`) is appended automatically — the model just focuses on content.

Results are cached per-article (7-day TTL) so re-runs don't burn tokens. Falls back to template formatting if auth or inference fails.

```json
"githubModels": {
  "enabled": true,
  "model": "openai/gpt-4o-mini",
  "fetchArticleContent": true
}
```

Auth resolves in order: `GITHUB_MODELS_TOKEN` → `GITHUB_TOKEN` → `gh auth token`.

## Phrase format

Customizable templates with `%variable%` substitution. The engine auto-strips empty brackets and collapses whitespace.

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

## Presets

The interactive CLI includes presets to get started fast:

| Preset | What you get |
|--------|-------------|
| **Dev Pulse** | Google Tech news + Hacker News top stories |
| **Market Watch** | MSFT, NVDA, AMZN, GOOGL, AMD, TSLA stock quotes |
| **World Signals** | Earthquakes (M4.5+) + severe weather + Hacker News best |

## Scheduler (macOS)

A `launchd` job that refreshes phrases in the background. The interactive CLI can set this up, or do it manually:

```bash
npm run schedule             # every 1 hour (default)
npm run schedule -- 300      # every 5 minutes
npm run schedule:trigger     # run now
npm run schedule:remove      # remove it
```

Also available via CLI flags: `--install-scheduler`, `--trigger-scheduler-now`, `--uninstall-scheduler`.

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
