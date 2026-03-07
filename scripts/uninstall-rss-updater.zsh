#!/bin/zsh
set -euo pipefail

PLIST_DEST="$HOME/Library/LaunchAgents/com.austenstone.thinking-phrases.rss.plist"
OLD_PLIST_DEST="$HOME/Library/LaunchAgents/com.austenstone.thinking-phrases.news.plist"

launchctl unload "$PLIST_DEST" >/dev/null 2>&1 || true
launchctl unload "$OLD_PLIST_DEST" >/dev/null 2>&1 || true
rm -f "$PLIST_DEST" "$OLD_PLIST_DEST"

echo "Uninstalled LaunchAgent: com.austenstone.thinking-phrases.rss"