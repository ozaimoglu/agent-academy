#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<19)){console.error("Node >=22.19 gerekli.");process.exit(1)}'
npm ci
npm run build
if [[ "${1:-}" == "--link" ]]; then
  # Explicit --link is the user's choice to register the plugin globally.
  herdr plugin link "$PWD"
else
  printf '%s\n' 'Build hazır. Plugin kaydı için (global Herdr kaydı değişir):' "  herdr plugin link \"$PWD\"" 'Herdr içindeki Codex pane’inden aç:' '  herdr plugin action invoke local.agent-academy.open'
fi
