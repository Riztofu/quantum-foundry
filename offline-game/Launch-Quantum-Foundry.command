#!/bin/bash
# Launch the offline game. No server, Python, Node, or network is needed.
set -euo pipefail
game_dir="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
if [ ! -f "$game_dir/index.html" ]; then
  printf '%s\n' 'index.html is missing. Unzip the complete Quantum-Foundry folder and try again.' >&2
  exit 1
fi
/usr/bin/open "$game_dir/index.html"
