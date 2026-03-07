# Thinking Phrases

Custom thinking phrases for AI tools — both **static phrase packs** and **dynamically populated phrases** from live feeds.

This started as a VS Code tip pack. It is now a broader phrase engine:

- curated packs you can paste directly into settings
- live RSS/Atom feeds that refresh your phrases automatically
- live stock quote phrases that can refresh every few minutes
- live GitHub activity phrases for repo commits, org commits, or GitHub feeds
- optional GitHub Models formatting for cleaner, more useful summaries

Today the main target is VS Code’s [`chat.agent.thinking.phrases`](https://code.visualstudio.com/updates/v1_110#_custom-thinking-phrases), but the idea is bigger than one editor: short, loading-screen-style phrases that can be static, themed, or generated from fresh content.

## What this repo does

There are two modes here.

### Static phrase packs

Curated JSON packs for things like:

- VS Code tips
- JavaScript
- TypeScript
- Ruby
- League-style loading screen tips
- WoW loading screen tips

These are great when you want something stable, branded, themed, or educational.

### Dynamic phrases

An updater script can:

- fetch RSS or Atom feeds
- fetch live stock quotes
- fetch GitHub commits or GitHub feeds
- optionally fetch full article content
- optionally run summaries through GitHub Models
- write the result into your VS Code settings automatically

This is great when you want your thinking phrases to stay fresh without manually curating them.

## Quick start

### Use a static pack

Install deps and build the generated outputs:

```bash
npm install
npm run build
```

Then copy one of these into your VS Code `settings.json`:

- [`out/settings-mac.json`](out/settings-mac.json)
- [`out/settings-windows.json`](out/settings-windows.json)
- [`out/settings-linux.json`](out/settings-linux.json)
- [`out/javascript-tips.json`](out/javascript-tips.json)
- [`out/typescript-tips.json`](out/typescript-tips.json)
- [`out/ruby-tips.json`](out/ruby-tips.json)
- [`out/dwyl-quotes.json`](out/dwyl-quotes.json)
- [`out/league-loading-screen-tips.json`](out/league-loading-screen-tips.json)
- [`out/wow-loading-screen-tips.json`](out/wow-loading-screen-tips.json)

### Use live dynamic phrases

Edit [`configs/rss-settings.config.json`](configs/rss-settings.config.json), then preview the output:

```bash
npm run rss:dry-run
```

If it looks good, write it to your VS Code settings:

```bash
npm run rss:run
```

Want a guided setup instead of memorizing flags?

```bash
npm run rss:interactive
```

Want to fully remove the installed thinking phrases without using interactive mode?

```bash
npm run rss:remove
```

Interactive mode can install either:

- a **dynamic** profile using RSS, stocks, Hacker News, earthquakes, weather alerts, custom JSON, GitHub activity, and optional GitHub Models
- a **static** generated pack from `out/`
- or **uninstall** the VS Code thinking phrases entry and remove the macOS scheduler if one is installed

Want live stock phrases too? Turn on `stockQuotes` in [`configs/rss-settings.config.json`](configs/rss-settings.config.json) and the updater will prepend live ticker phrases before the RSS phrases.

## What the output looks like

Everything ultimately writes to the same VS Code setting shape:

```json
"chat.agent.thinking.phrases": {
  "mode": "replace",
  "phrases": [
    "⌘+D selects the next occurrence of a word. Keep pressing for more!",
    "GitHub Copilot Dev Days brings hands-on AI coding workshops to cities worldwide starting in March.",
    "Don’t use forEach with await; it won’t wait, and it won’t apologize."
  ]
}
```

You can either:

- paste a generated file from `out/`
- run the RSS updater and let it write this setting for you

## Static packs

### Pack catalog

- [`tips/vscode/`](tips/vscode/) — 80 OS-aware VS Code tips covering shortcuts, Copilot, Git, terminal, debugging, editor features, and a little flavor text
- [`tips/javascript-tips.json`](tips/javascript-tips.json) — 100 modern JavaScript tips
- [`tips/typescript-tips.json`](tips/typescript-tips.json) — 124 TypeScript tips
- [`tips/ruby-tips.json`](tips/ruby-tips.json) — 108 Ruby tips
- [`tips/dwyl-quotes.json`](tips/dwyl-quotes.json) — 1,614 quote phrases sourced from `dwyl/quotes`; review upstream GPL-2.0 licensing before redistribution
- [`tips/league-loading-screen-tips.json`](tips/league-loading-screen-tips.json) — 100 League-inspired loading screen tips
- [`tips/wow-loading-screen-tips.json`](tips/wow-loading-screen-tips.json) — 109 WoW loading screen tips

### VS Code pack breakdown

| Category | Tips | Description |
|----------|------|-------------|
| ⌨️ [Shortcuts](tips/vscode/shortcuts.json) | 25 | Multi-cursor, navigation, selection, formatting |
| 🤖 [Copilot](tips/vscode/copilot.json) | 15 | Chat, agent mode, inline chat, prompt files, NES |
| 🔀 [Git](tips/vscode/git.json) | 8 | Source control, blame, staging, timeline |
| 💻 [Terminal](tips/vscode/terminal.json) | 7 | Integrated terminal, splits, suggestions |
| 🐛 [Debugging](tips/vscode/debugging.json) | 7 | Breakpoints, stepping, logpoints, conditional stops |
| ✏️ [Editor](tips/vscode/editor.json) | 10 | Zen mode, sticky scroll, themes, settings, Emmet |
| 😄 [Funny](tips/vscode/funny.json) | 8 | Flavor text with at least some practical value |

### Tip formats

The VS Code pack uses OS-aware entries:

```json
{
  "mac": "⌘+D selects the next occurrence of a word. Keep pressing for more!",
  "windows": "Ctrl+D selects the next occurrence of a word. Keep pressing for more!",
  "linux": "Ctrl+D selects the next occurrence of a word. Keep pressing for more!"
}
```

Standalone packs can be plain string arrays.

## Dynamic RSS updater

The updater is the other half of this repo.

It turns live content into thinking phrases.

Under the hood, it now follows a simple phrase-engine flow:

- sources fetch live data
- shared core logic normalizes and formats it
- a sink writes the final phrases into VS Code settings

That keeps the updater small and makes it much easier to add future polling-friendly sources beyond RSS and stocks.

### What it does

- fetches RSS and Atom feeds
- sorts recent items
- formats them as thinking phrases
- writes directly to `chat.agent.thinking.phrases`
- optionally fetches full linked articles for better context
- can prepend live stock quotes like `MSFT — $412.21 — ▲ 1.32% — today`
- can turn recent GitHub commits into phrase-friendly summaries
- optionally uses GitHub Models to generate more concrete summaries

### Basic workflow

1. Configure feeds in [`configs/rss-settings.config.json`](configs/rss-settings.config.json)
2. Optionally enable `stockQuotes`
3. Run a dry run
4. Run the real update
5. Or launch the interactive terminal UI
6. Optionally install the scheduled updater on macOS

```bash
npm run rss:dry-run
npm run rss:run
npm run rss:interactive
npm run rss:install
npm run rss:install -- 300
```

### Interactive terminal UI

The updater now includes a guided CLI flow with terminal styling and prompts for:

- static pack vs dynamic profile
- discovered static packs from `out/`
- a growing source catalog: RSS, stocks, Hacker News, earthquakes, weather alerts, and custom JSON
- repo commits, org commits, and GitHub feeds
- feed URLs
- stock symbols
- one ZIP code for local earthquakes and weather alerts
- repo/org/feed selection for GitHub activity
- GitHub Models usage
- append vs replace mode
- preview vs write
- optional macOS scheduler install when you choose write

On macOS, interactive mode also shows whether the scheduler is currently installed, its interval, and which config file it points to.

The built-in Google News technology option now uses the **Technology topic feed**, not a broad `q=technology` search feed, so it avoids a bunch of finance noise from companies with `Technology` in their names.

Run it with:

```bash
npm run rss:interactive
```

Or directly:

```bash
npm run rss:run -- --interactive
```

If you choose to write settings on macOS, the interactive flow can also offer to install the `launchd` scheduler and ask how often it should run.

If you reinstall the scheduler, it replaces the existing launch agent with the new interval and config file.

When choosing a scheduler config in interactive mode, it lists discovered config profiles from `configs/` and lets you pick one or create a new one.

If you pick a static pack while a scheduler is installed, interactive mode can also offer to uninstall that scheduler so your static phrases do not get overwritten later.

### Example overrides

```bash
npm run rss:dry-run -- --feed https://github.blog/feed --limit 5
npm run rss:dry-run -- --use-models --feed https://github.blog/feed
npm run rss:dry-run -- --stocks MSFT,NVDA,TSLA
npm run rss:dry-run -- --use-earthquakes --quake-zip 94103 --quake-min-magnitude 2 --quake-limit 2
npm run rss:dry-run -- --use-weather-alerts --weather-zip 33312 --weather-limit 2
npm run rss:dry-run -- --use-github --github-mode repo-commits --github-repo microsoft/vscode --github-max-items 3
npm run rss:dry-run -- --use-github --github-mode org-commits --github-org github --github-max-items 3
npm run rss:dry-run -- --use-github --github-mode feed --github-feed-kind security-advisories --github-max-items 3
npm run rss:run -- --config ./my-rss-profile.json
npm run rss:run -- --settings ~/Library/Application\ Support/Code\ -\ Insiders/User/settings.json
```

For the interactive installer, earthquake and weather setup now defaults to a single **5-digit US ZIP code** instead of asking for place filters and area codes up front. Advanced knobs like magnitude, radius, severity, and manual area filters still exist in config/CLI if you want them.

GitHub activity also supports a few modes:

- `repo-commits` — recent commits from one repo via the GitHub commits API
- `org-commits` — recent public push activity across a GitHub org via org events
- `feed` — Atom feeds resolved from GitHub's `/feeds` endpoint or a custom feed URL

When GitHub Models and `fetchArticleContent` are enabled, repo and org commit modes also include commit file metadata and patch previews as model context, so the summaries can talk about what actually changed instead of just parroting the commit subject like a caffeinated intern.

### Uninstall or change the current scheduler

To remove the installed scheduler completely:

```bash
npm run rss:uninstall
```

To remove the `chat.agent.thinking.phrases` setting itself, use:

```bash
npm run rss:remove
```

To change the schedule or point it at another config file, just reinstall it:

```bash
npm run rss:install -- 900 ./my-rss-profile.json
```

That replaces the existing launch agent with the new interval and config path.

### Portability

If you do not pass `--settings`, the updater will try to find your user `settings.json` automatically on:

- macOS
- Linux
- Windows

So yes, this is meant to be shareable and not just a one-machine goblin script.

### Live stock phrases

Set this in `configs/rss-settings.config.json`:

```json
"stockQuotes": {
  "enabled": true,
  "symbols": ["MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "AMD"],
  "includeMarketState": true
}
```

When enabled, the updater fetches current quotes and generates short phrases like:

- `MSFT — $412.21 — ▲ 1.32% — today`
- `NVDA — $128.44 — ▼ 0.84% — after-hours`

The bundled macOS scheduler is a `launchd` job, so the refresh happens at the OS level instead of inside the updater code. By default the installer uses `StartInterval = 3600` for RSS, and you can override it when installing, for example:

RSS defaults to an hourly refresh so regular news feeds do not churn unnecessarily. For stock-heavy or other fast-moving configs, install with a shorter interval when you want fresher updates.

```bash
npm run rss:install -- 300
npm run rss:install -- 900
```

Those mean every 5 minutes and every 15 minutes, respectively.

## Optional GitHub Models formatting

If enabled, the RSS updater can generate better phrases than the default `source — title — time` formatter.

What you get:

- cleaner phrasing
- more concrete summaries
- support for multiple phrases from a single article when useful
- fallback to non-model formatting if auth or inference fails

### Auth order

The updater checks for a token in this order:

1. `GITHUB_MODELS_TOKEN`
2. `GITHUB_TOKEN`
3. `gh auth token`

### `.env` example

```bash
GITHUB_MODELS_TOKEN=github_pat_your_token_here
GITHUB_TOKEN=github_pat_your_token_here
```

### Example config

```json
"githubModels": {
  "enabled": true,
  "model": "openai/gpt-4.1",
  "tokenEnvVar": "GITHUB_MODELS_TOKEN",
  "maxInputItems": 10,
  "maxTokens": 300,
  "maxPhrasesPerArticle": 2,
  "temperature": 0.2,
  "fetchArticleContent": true,
  "maxArticleContentLength": 6000
}
```

### GitHub activity config example

```json
"githubActivity": {
  "enabled": true,
  "mode": "repo-commits",
  "repo": "microsoft/vscode",
  "branch": "main",
  "feedKind": "timeline",
  "maxItems": 5,
  "sinceHours": 24,
  "tokenEnvVar": "GITHUB_TOKEN"
}
```

For feed mode, switch `mode` to `feed` and set one of:

- `feedKind: "timeline"`
- `feedKind: "current-user-public"`
- `feedKind: "current-user"`
- `feedKind: "current-user-actor"`
- `feedKind: "security-advisories"`
- `feedKind: "organization"` with `org`
- `feedKind: "custom-url"` with `feedUrl`

## Scripts

```text
npm run build         Generate static pack outputs into out/
npm run rss:dry-run   Preview live phrases without writing settings
npm run rss:remove    Remove installed thinking phrases from settings
npm run rss:run       Write live phrases into settings.json
npm run rss:install   Install the scheduled RSS updater on macOS
npm run rss:uninstall Remove the scheduled RSS updater
```

## Repo layout

```text
tips/
  vscode/
    shortcuts.json
    copilot.json
    git.json
    terminal.json
    debugging.json
    editor.json
    funny.json
  javascript-tips.json
  ruby-tips.json
  typescript-tips.json
  dwyl-quotes.json
  league-loading-screen-tips.json
  wow-loading-screen-tips.json

scripts/
  build.ts
  update-rss-settings.ts
  run-rss-update.zsh
  install-rss-updater.zsh

src/
  core/
    config.ts
    githubModels.ts
    runner.ts
    sourceCatalog.ts
    types.ts
    utils.ts
  sources/
    customJson.ts
    earthquakes.ts
    githubActivity.ts
    hackerNews.ts
    rss.ts
    stocks.ts
    weatherAlerts.ts
  sinks/
    vscodeSettings.ts

out/
  settings-mac.json
  settings-windows.json
  settings-linux.json
  vscode-tips.json
  javascript-tips.json
  ruby-tips.json
  typescript-tips.json
  league-loading-screen-tips.json
  wow-loading-screen-tips.json

launchd/
  com.austenstone.thinking-phrases.rss.plist
```

## Contributing

If you're adding static packs:

- keep phrases short and scannable
- prefer useful > clever
- use OS-aware objects when shortcuts differ by platform
- run `npm run build`

If you're working on the dynamic side:

- prefer portable behavior
- keep the updater simple
- avoid brittle scraping unless it materially improves phrase quality
- keep external data sources dependency-light and resilient
- make sure dry runs stay safe

## References

- [VS Code Custom Thinking Phrases](https://code.visualstudio.com/updates/v1_110#_custom-thinking-phrases)
- [VS Code Tips and Tricks](https://code.visualstudio.com/docs/getstarted/tips-and-tricks)
- [VS Code Keyboard Shortcuts](https://code.visualstudio.com/docs/configure/keybindings)
- [GitHub Models quickstart](https://docs.github.com/en/github-models/quickstart)
- [GitHub Models inference REST API](https://docs.github.com/en/rest/models/inference?apiVersion=2022-11-28)

## License

MIT
