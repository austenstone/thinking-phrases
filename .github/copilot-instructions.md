# Copilot Instructions — Thinking Phrases

## What This Project Does

**Thinking Phrases** turns VS Code's `chat.agent.thinking.phrases` setting into a live information dashboard. While Copilot's agent is thinking (1–30 seconds of dead time), users see rotating phrases pulled from real-time data sources — news, stocks, GitHub commits, weather, earthquakes, Hacker News, and more.

The VS Code setting looks like this:

```json
"chat.agent.thinking.phrases": {
  "mode": "replace",
  "phrases": [
    "NVDA $128.44 ▼ 0.84% 🟢",
    "io_uring can now replace epoll for high-throughput networking in Linux 6.14 — Ars Technica (2h ago)",
    "DevTools now loads 40% faster after entrypoint was split into lazy chunks — vscode @deepak1556 (4h ago)"
  ]
}
```

A CLI fetches live data, optionally summarizes it with GitHub Models (AI), and writes the phrases array into VS Code's `settings.json`. A macOS `launchd` scheduler can refresh it automatically in the background.

## Architecture

```
bin/thinking-phrases.ts    → CLI entrypoint (tsx, hashbang)
src/core/                  → Config, runner, types, caching, formatting, scheduling
src/sources/               → Data fetchers (RSS, stocks, GitHub, HN, earthquakes, weather, custom JSON)
src/sinks/                 → Output writers (VS Code settings.json)
tips/                      → Static phrase packs (JSON files)
configs/                   → Saved config presets (JSON)
scripts/                   → Build script, launchd install/uninstall
tests/                     → Vitest unit tests (mirrors src/ structure)
```

### Key Modules

- **`src/core/runner.ts`** — Main orchestrator. Fetches from all enabled sources, optionally runs AI summarization, dedupes, and writes to VS Code settings.
- **`src/core/config.ts`** — CLI arg parsing (`parseArgs`), config file loading/saving, validation, merging with defaults.
- **`src/core/types.ts`** — All TypeScript interfaces and type aliases. Source of truth for `Config`, `ArticleItem`, mode/target unions.
- **`src/core/phraseCache.ts`** — SQLite-backed cache for phrases and model results. Handles staleness checks and deduplication.
- **`src/core/phraseFormats.ts`** — Template-based phrase formatting with `%placeholder%` substitution.
- **`src/core/githubModels.ts`** — Calls GitHub Models API to summarize articles into concise phrases.
- **`src/core/sourceCatalog.ts`** — Registry of all dynamic sources with their fetch functions and config keys.
- **`src/sinks/vscodeSettings.ts`** — Reads/writes `settings.json` for VS Code stable or Insiders.

### Data Flow

1. CLI parses args → merges with config file → validates
2. Runner iterates enabled sources from `sourceCatalog`
3. Each source fetcher returns `ArticleItem[]`
4. Items are formatted into phrase strings using templates
5. Optionally batched through GitHub Models for AI summarization
6. Phrases are deduplicated and cached in SQLite
7. Final phrases array is written to VS Code `settings.json`

## Tech Stack

- **TypeScript** (strict mode, ES2022, NodeNext modules)
- **tsx** for direct TS execution (no compile step for dev)
- **Vitest** for testing
- **ESLint** with typescript-eslint
- **No enums** — uses union types (`'append' | 'replace'`) and `as const`
- **npm** as package manager

## Coding Conventions

- Pin to exact SHAs when referencing GitHub Actions
- `camelCase` for variables/functions, `PascalCase` for types/interfaces, `SCREAMING_SNAKE` for constants
- Comments explain WHY, not WHAT
- Prefer simple functions over deep abstractions
- Error handling: try/catch for async, return early on errors
- Use `type` imports (`import type { ... }`) — enforced by ESLint
- No `any` unless unavoidable (ESLint warns)
- All source fetchers return `ArticleItem[]` and follow the pattern in `src/sources/`
- Tests mirror the source structure in `tests/` — e.g., `src/sources/stocks.ts` → `tests/stocks.test.ts`

## How to Run

```bash
# Interactive setup
npm run start:interactive

# Dry run (preview without writing)
npm run start:dry-run -- --stocks MSFT,NVDA

# Run with a saved config
npm run start -- --config configs/hn-top.config.json

# Tests
npm test

# Build static packs
npm run build
```

## Adding a New Source

1. Create `src/sources/mySource.ts` — export a fetch function that returns `ArticleItem[]`
2. Add config interface to `src/core/types.ts`
3. Register in `src/core/sourceCatalog.ts`
4. Add CLI flags in `src/core/config.ts` (`parseArgs` and `DEFAULT_CONFIG`)
5. Add formatting template if needed in `src/core/phraseFormats.ts`
6. Add tests in `tests/mySource.test.ts`
