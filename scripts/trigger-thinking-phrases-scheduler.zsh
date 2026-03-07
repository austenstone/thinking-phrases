#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
REPO_DIR="${SCRIPT_DIR:h}"
LABEL="com.austenstone.thinking-phrases.rss"
JOB_ID="gui/$(id -u)/$LABEL"

cd "$REPO_DIR"

if launchctl print "$JOB_ID" >/dev/null 2>&1; then
  echo "Triggering installed scheduler: $JOB_ID"
  launchctl kickstart -k "$JOB_ID"
  echo "Triggered LaunchAgent: $LABEL"
  exit 0
fi

echo "No installed scheduler found; running thinking phrases directly"
if [[ -n "${THINKING_PHRASES_CONFIG:-}" ]]; then
  npm run phrases:run -- --config "$THINKING_PHRASES_CONFIG"
else
  npm run phrases:run
fi
