# Thinking Phrases

**Loading screen-style phrase packs for AI tools** — with VS Code as the first pack, not the whole universe.

This repo currently targets the [`chat.agent.thinking.phrases`](https://code.visualstudio.com/updates/v1_110#_custom-thinking-phrases) setting introduced in VS Code 1.110, but the broader idea is bigger than VS Code: reusable phrase packs themed around products, workflows, games, and communities.

## What it looks like

Every time Copilot is thinking or running a tool, instead of generic loading text, you see tips like:

> *⌘+D selects the next occurrence of a word. Keep pressing for more!*

> *A well-placed breakpoint is worth a thousand console.logs.*

> *Type /fork in chat to branch your conversation and explore a new direction.*

Every generated file in `out/` is already wrapped in the VS Code settings shape, so you can paste any single pack directly into `settings.json`.

## Quick Start

1. Copy the contents of the settings file for your platform:
   - [`out/settings-mac.json`](out/settings-mac.json)
   - [`out/settings-windows.json`](out/settings-windows.json)
   - [`out/settings-linux.json`](out/settings-linux.json)

2. Paste it into your VS Code `settings.json` (open with `⌘,` → click the `{}` icon, or `Ctrl+Shift+P` → "Open User Settings (JSON)")

3. That's it. Next time the agent thinks, you'll learn something.

### Append vs Replace

By default, tips are set to `"append"` mode — they're added alongside VS Code's built-in thinking phrases. If you want ONLY your tips, change `"mode"` to `"replace"`:

```json
"chat.agent.thinking.phrases": {
  "mode": "replace",
  "phrases": ["..."]
}
```

## Packs

### Pack catalog

- [`tips/vscode/`](tips/vscode/) — **80 OS-aware VS Code tips** covering shortcuts, Copilot, Git, terminal, debugging, editor features, and a little flavor text. Generated outputs: [`out/settings-mac.json`](out/settings-mac.json), [`out/settings-windows.json`](out/settings-windows.json), [`out/settings-linux.json`](out/settings-linux.json), and [`out/vscode-tips.json`](out/vscode-tips.json).
- [`tips/javascript-tips.json`](tips/javascript-tips.json) — **100 modern JavaScript tips** focused on current syntax, async patterns, collection APIs, ESM, and practical runtime features. Generated output: [`out/javascript-tips.json`](out/javascript-tips.json).
- [`tips/ruby-tips.json`](tips/ruby-tips.json) — **108 Ruby tips** focused on core syntax, blocks, collections, classes, method conventions, and idiomatic Ruby style for beginners. Generated output: [`out/ruby-tips.json`](out/ruby-tips.json).
- [`tips/typescript-tips.json`](tips/typescript-tips.json) — **124 modern TypeScript tips** covering strictness, inference, utility types, `satisfies`, `as const`, and current TS 5.x-era patterns. Generated output: [`out/typescript-tips.json`](out/typescript-tips.json).
- [`tips/league-loading-screen-tips.json`](tips/league-loading-screen-tips.json) — **100 League-inspired tips** mixing gameplay advice, lore nods, and Rift-flavored nonsense. Generated output: [`out/league-loading-screen-tips.json`](out/league-loading-screen-tips.json).
- [`tips/wow-loading-screen-tips.json`](tips/wow-loading-screen-tips.json) — **109 WoW loading screen tips** wrapped in the same settings format for easy use in VS Code. Generated output: [`out/wow-loading-screen-tips.json`](out/wow-loading-screen-tips.json).

### VS Code pack

| Category | Tips | Description |
|----------|------|-------------|
| ⌨️ [Shortcuts](tips/vscode/shortcuts.json) | 25 | Keyboard shortcuts — multi-cursor, navigation, selection, formatting |
| 🤖 [Copilot](tips/vscode/copilot.json) | 15 | Copilot Chat, agent mode, inline chat, NES, prompt files |
| 🔀 [Git](tips/vscode/git.json) | 8 | Source control, blame, staging, timeline |
| 💻 [Terminal](tips/vscode/terminal.json) | 7 | Integrated terminal, splits, suggestions |
| 🐛 [Debugging](tips/vscode/debugging.json) | 7 | Breakpoints, stepping, logpoints, conditional stops |
| ✏️ [Editor](tips/vscode/editor.json) | 10 | Zen mode, sticky scroll, themes, settings, Emmet |
| 😄 [Funny](tips/vscode/funny.json) | 8 | Flavor text — 10% humor, 90% wisdom |

**80 tips total** across macOS, Windows, and Linux variants.

## Tip Format

The `vscode` source files contain arrays of objects with platform-specific strings:

```json
{
  "mac": "⌘+D selects the next occurrence of a word. Keep pressing for more!",
  "windows": "Ctrl+D selects the next occurrence of a word. Keep pressing for more!",
  "linux": "Ctrl+D selects the next occurrence of a word. Keep pressing for more!"
}
```

Mac tips use native symbols (⌘ ⌥ ⇧ ⌃). Windows/Linux tips use spelled-out keys (Ctrl, Alt, Shift).

Standalone phrase packs like `tips/javascript-tips.json`, `tips/ruby-tips.json`, `tips/typescript-tips.json`, `tips/league-loading-screen-tips.json`, and `tips/wow-loading-screen-tips.json` can just be plain string arrays when they don't need OS-specific variants.

## Using a single pack

If you only want one pack instead of the platform-specific VS Code bundle, copy any file from `out/` directly into `settings.json`.

Example:

```json
"chat.agent.thinking.phrases": {
  "mode": "append",
  "phrases": [
    "Prefer `const` by default; reach for `let` only when reassignment is the point.",
    "Optional chaining keeps nullable paths readable: `user?.profile?.avatarUrl`.",
    "Don’t use `forEach` with `await`; it won’t wait, and it won’t apologize."
  ]
}
```

Or just paste `out/javascript-tips.json`, `out/ruby-tips.json`, `out/typescript-tips.json`, `out/league-loading-screen-tips.json`, or `out/wow-loading-screen-tips.json` as-is.

## Building

```bash
npm install
npm run build
```

This reads the VS Code pack from `tips/vscode/`, discovers standalone packs from `tips/*.json`, and generates ready-to-paste settings files in `out/`.

Generated outputs:

- `out/settings-mac.json`
- `out/settings-windows.json`
- `out/settings-linux.json`
- `out/javascript-tips.json`
- `out/ruby-tips.json`
- `out/typescript-tips.json`
- `out/league-loading-screen-tips.json`
- `out/vscode-tips.json`
- `out/wow-loading-screen-tips.json`

Repo layout:

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
  league-loading-screen-tips.json
  wow-loading-screen-tips.json

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
```

## Contributing

For now:

- add VS Code tips to the appropriate file in `tips/vscode/`
- keep each VS Code tip OS-aware with `mac`, `windows`, and `linux`
- use standalone JSON arrays in `tips/*.json` for packs that don't need platform variants
- run `npm run build` to regenerate the output

If we add more packs later, the repo structure is already set up for that direction. Tiny repo, mildly ambitious agenda 😌

**Guidelines:**
- Keep tips scannable — they may only be visible for 3-5 seconds
- Lead with the shortcut or feature name
- 90% useful tips, 10% humor
- Test that your keyboard shortcuts are correct for all platforms

## References

- [VS Code Tips and Tricks](https://code.visualstudio.com/docs/getstarted/tips-and-tricks)
- [VS Code Keyboard Shortcuts](https://code.visualstudio.com/docs/configure/keybindings)
- [Custom Thinking Phrases (v1.110)](https://code.visualstudio.com/updates/v1_110#_custom-thinking-phrases)
- [16 Modern JavaScript Features That Might Blow Your Mind](https://dev.to/sylwia-lask/16-modern-javascript-features-that-might-blow-your-mind-4h5e)
- [mbeaudru/modern-js-cheatsheet](https://github.com/mbeaudru/modern-js-cheatsheet)
- [JavaScript.info](https://javascript.info/)
- [Learn X in Y Minutes: Ruby](https://learnxinyminutes.com/ruby/)
- [Ruby Style Guide](https://github.com/bbatsov/ruby-style-guide)
- [Try Ruby](https://try.ruby-lang.org/)
- [jellydn/typescript-tips](https://github.com/jellydn/typescript-tips)
- [Learn X in Y Minutes: TypeScript](https://learnxinyminutes.com/typescript/)
- [TypeScript Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html)
- [TypeScript 4.9 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html)
- [TypeScript 5.4 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-4.html)
- [League loading screen tips thread](https://www.reddit.com/r/leagueoflegends/comments/6sm4lx/i_have_forged_a_list_of_all_the_loading_screen/)
- [Rift Trivia fun facts source](https://github.com/Siratish/rift-trivia/blob/6833c15e0f87ccde2300446da7aab025a2e1cdd9/frontend/public/fun-facts.txt#L5)
- [WoW Loading Screen Tips](https://wowwiki-archive.fandom.com/wiki/Loading_screen_tips)

## License

MIT
