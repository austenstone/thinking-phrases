#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
REPO_DIR="${SCRIPT_DIR:h}"
DEFAULT_INTERVAL=3600
INTERVAL_SECONDS="${1:-$DEFAULT_INTERVAL}"
CONFIG_PATH="${2:-}"
PLIST_SOURCE="$REPO_DIR/launchd/com.austenstone.thinking-phrases.rss.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DEST="$LAUNCH_AGENTS_DIR/com.austenstone.thinking-phrases.rss.plist"
LABEL="com.austenstone.thinking-phrases.rss"
OLD_PLIST_DEST="$LAUNCH_AGENTS_DIR/com.austenstone.thinking-phrases.news.plist"

if [[ $# -gt 2 ]]; then
  echo "Usage: $0 [interval-seconds] [config-path]" >&2
  exit 1
fi

if [[ ! "$INTERVAL_SECONDS" =~ '^[0-9]+$' ]] || (( INTERVAL_SECONDS <= 0 )); then
  echo "Installer failed: interval must be a positive integer in seconds. Received: $INTERVAL_SECONDS" >&2
  exit 1
fi

if [[ ! -f "$PLIST_SOURCE" ]]; then
  echo "Installer failed: plist not found at $PLIST_SOURCE" >&2
  exit 1
fi

if [[ -n "$CONFIG_PATH" ]]; then
  if [[ "$CONFIG_PATH" == ~/* ]]; then
    CONFIG_PATH="$HOME/${CONFIG_PATH#~/}"
  elif [[ "$CONFIG_PATH" != /* ]]; then
    CONFIG_PATH="$REPO_DIR/$CONFIG_PATH"
  fi

  if [[ ! -f "$CONFIG_PATH" ]]; then
    echo "Installer failed: config not found at $CONFIG_PATH" >&2
    exit 1
  fi
fi

mkdir -p "$LAUNCH_AGENTS_DIR"
chmod +x "$REPO_DIR/scripts/run-rss-update.zsh"
cp "$PLIST_SOURCE" "$PLIST_DEST"
/usr/libexec/PlistBuddy -c "Set :StartInterval $INTERVAL_SECONDS" "$PLIST_DEST"

if [[ -n "$CONFIG_PATH" ]]; then
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables dict" "$PLIST_DEST" >/dev/null 2>&1 || true
  /usr/libexec/PlistBuddy -c "Delete :EnvironmentVariables:THINKING_PHRASES_CONFIG" "$PLIST_DEST" >/dev/null 2>&1 || true
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:THINKING_PHRASES_CONFIG string $CONFIG_PATH" "$PLIST_DEST"
else
  /usr/libexec/PlistBuddy -c "Delete :EnvironmentVariables:THINKING_PHRASES_CONFIG" "$PLIST_DEST" >/dev/null 2>&1 || true
fi

launchctl unload "$OLD_PLIST_DEST" >/dev/null 2>&1 || true
rm -f "$OLD_PLIST_DEST"
launchctl unload "$PLIST_DEST" >/dev/null 2>&1 || true
launchctl load "$PLIST_DEST"

echo "Installed LaunchAgent: $LABEL"
echo "Plist: $PLIST_DEST"
echo "Run script: $REPO_DIR/scripts/run-rss-update.zsh"
echo "Schedule: launchd StartInterval=$INTERVAL_SECONDS"
if [[ -n "$CONFIG_PATH" ]]; then
  echo "Config: $CONFIG_PATH"
fi
echo
launchctl list | grep "$LABEL" || echo "LaunchAgent loaded, but not currently shown in launchctl list output."