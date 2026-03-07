#!/bin/zsh
set -euo pipefail

REPO_DIR="/Users/austenstone/source/vscode-copilot-tips"

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

cd "$REPO_DIR"

if [[ -f "$HOME/.zshrc" ]]; then
  set +u
  source "$HOME/.zshrc" >/dev/null 2>&1 || true
  set -u
fi

echo "[$(timestamp)] thinking-phrases scheduler run started"

if [[ -n "${THINKING_PHRASES_CONFIG:-}" ]]; then
  echo "[$(timestamp)] config: $THINKING_PHRASES_CONFIG"
  if npm start -- --config "$THINKING_PHRASES_CONFIG"; then
    echo "[$(timestamp)] thinking-phrases scheduler run completed successfully"
  else
    exit_code=$?
    echo "[$(timestamp)] thinking-phrases scheduler run failed with exit code $exit_code" >&2
    exit $exit_code
  fi
else
  echo "[$(timestamp)] config: default"
  if npm start; then
    echo "[$(timestamp)] thinking-phrases scheduler run completed successfully"
  else
    exit_code=$?
    echo "[$(timestamp)] thinking-phrases scheduler run failed with exit code $exit_code" >&2
    exit $exit_code
  fi
fi