#!/bin/zsh
set -euo pipefail

REPO_DIR="/Users/austenstone/source/vscode-copilot-tips"

cd "$REPO_DIR"

if [[ -f "$HOME/.zshrc" ]]; then
  source "$HOME/.zshrc"
fi

if [[ -n "${THINKING_PHRASES_CONFIG:-}" ]]; then
  npm run rss:run -- --config "$THINKING_PHRASES_CONFIG"
else
  npm run rss:run
fi