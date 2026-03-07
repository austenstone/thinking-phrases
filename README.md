# 🎮 VS Code Copilot Tips

**Loading screen tips for VS Code** — learn shortcuts, Copilot tricks, and editor features while your AI agent thinks.

Inspired by [WoW loading screen tips](https://wowwiki-archive.fandom.com/wiki/Loading_screen_tips), [League tips](https://www.reddit.com/r/leagueoflegends/comments/6sm4lx/i_have_forged_a_list_of_all_the_loading_screen/), and every game that teaches you something while you wait.

Uses the [`chat.agent.thinking.phrases`](https://code.visualstudio.com/updates/v1_110#_custom-thinking-phrases) setting introduced in VS Code 1.110.

## What it looks like

Every time Copilot is thinking or running a tool, instead of generic loading text, you see tips like:

> *⌘+D selects the next occurrence of a word. Keep pressing for more!*

> *A well-placed breakpoint is worth a thousand console.logs.*

> *Type /fork in chat to branch your conversation and explore a new direction.*

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
  "phrases": [ ... ]
}
```

## Categories

| Category | Tips | Description |
|----------|------|-------------|
| ⌨️ [Shortcuts](tips/vscode/shortcuts.json) | 25 | Keyboard shortcuts — multi-cursor, navigation, selection, formatting |
| 🤖 [Copilot](tips/vscode/copilot.json) | 15 | Copilot Chat, agent mode, inline chat, NES, prompt files |
| 🔀 [Git](tips/vscode/git.json) | 8 | Source control, blame, staging, timeline |
| 💻 [Terminal](tips/vscode/terminal.json) | 7 | Integrated terminal, splits, suggestions |
| 🐛 [Debugging](tips/vscode/debugging.json) | 7 | Breakpoints, stepping, logpoints, conditional stops |
| ✏️ [Editor](tips/vscode/editor.json) | 10 | Zen mode, sticky scroll, themes, settings, Emmet |
| 😄 [Funny](tips/vscode/funny.json) | 8 | Flavor text — 10% humor, 90% wisdom |

Standalone reference set:

- 🐉 [WoW loading screen tips](tips/wow-loading-screen-tips.json) — 109 original World of Warcraft loading tips wrapped in the same settings format

**80 tips total** across macOS, Windows, and Linux variants.

## Tip Format

Each tip JSON file contains an array of objects with platform-specific strings:

```json
{
  "mac": "⌘+D selects the next occurrence of a word. Keep pressing for more!",
  "windows": "Ctrl+D selects the next occurrence of a word. Keep pressing for more!",
  "linux": "Ctrl+D selects the next occurrence of a word. Keep pressing for more!"
}
```

Mac tips use native symbols (⌘ ⌥ ⇧ ⌃). Windows/Linux tips use spelled-out keys (Ctrl, Alt, Shift).

## Building

```bash
npm install
npm run build
```

This reads VS Code category files from `tips/vscode/`, reads the standalone WoW reference set from `tips/wow-loading-screen-tips.json`, and generates platform-specific settings files in `out/`.

## Contributing

Add VS Code tips to the appropriate category file in `tips/vscode/`. Each tip needs all three platform variants. Run `npm run build` to regenerate the output.

**Guidelines:**
- Keep tips scannable — they may only be visible for 3-5 seconds
- Lead with the shortcut or feature name
- 90% useful tips, 10% humor
- Test that your keyboard shortcuts are correct for all platforms

## References

- [VS Code Tips and Tricks](https://code.visualstudio.com/docs/getstarted/tips-and-tricks)
- [VS Code Keyboard Shortcuts](https://code.visualstudio.com/docs/configure/keybindings)
- [Custom Thinking Phrases (v1.110)](https://code.visualstudio.com/updates/v1_110#_custom-thinking-phrases)
- [WoW Loading Screen Tips](https://wowwiki-archive.fandom.com/wiki/Loading_screen_tips)

## License

MIT
