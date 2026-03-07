#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
REPO_DIR="${SCRIPT_DIR:h}"
LABEL="com.austenstone.thinking-phrases.rss"
JOB_ID="gui/$(id -u)/$LABEL"
STDOUT_LOG="$REPO_DIR/launchd/rss-update.log"
STDERR_LOG="$REPO_DIR/launchd/rss-update.error.log"
HEALTH_LOG="$REPO_DIR/launchd/task-health.json"

print_log_section() {
  local title="$1"
  local file_path="$2"

  echo
  echo "$title"
  if [[ -f "$file_path" ]]; then
    tail -20 "$file_path"
  else
    echo "(no log file yet: $file_path)"
  fi
}

cd "$REPO_DIR"

if launchctl print "$JOB_ID" >/dev/null 2>&1; then
  echo "Triggering installed scheduler: $JOB_ID"
  : >"$STDOUT_LOG"
  : >"$STDERR_LOG"
  launchctl kickstart -k "$JOB_ID"
  sleep 2
  echo "Triggered LaunchAgent: $LABEL"
  echo "Stdout log: $STDOUT_LOG"
  echo "Stderr log: $STDERR_LOG"
  echo "Health file: $HEALTH_LOG"
  echo
  echo "LaunchAgent status"
  launchctl print "$JOB_ID" 2>/dev/null | grep -E "state =|pid =|last exit code =" || echo "(launchctl status summary unavailable)"
  print_log_section "Recent stdout" "$STDOUT_LOG"
  print_log_section "Recent stderr" "$STDERR_LOG"
  exit 0
fi

echo "No installed scheduler found; running thinking phrases directly"
if [[ -n "${THINKING_PHRASES_CONFIG:-}" ]]; then
  npm start -- --config "$THINKING_PHRASES_CONFIG"
else
  npm start
fi
