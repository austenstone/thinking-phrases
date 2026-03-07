#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
exec zsh "$SCRIPT_DIR/install-rss-updater.zsh" "$@"
