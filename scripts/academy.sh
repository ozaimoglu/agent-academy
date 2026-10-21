#!/usr/bin/env bash
set -euo pipefail
academy_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
academy_node='node'
if [[ -f "$academy_root/dist/node-executable" ]]; then
  IFS= read -r academy_node < "$academy_root/dist/node-executable"
  if [[ "$academy_node" != /* || ! -x "$academy_node" ]]; then
    printf '%s\n' 'Agent Academy: Kurulumda kaydedilen Node bulunamadı. Kurulumu yeniden çalıştırın.' >&2
    exit 2
  fi
fi
# Herdr may have started before an nvm/other user-local Node installation was added.
# Child CLIs (including npm-installed Codex) also need that runtime on PATH.
if [[ "$academy_node" == /* ]]; then
  export PATH="$(dirname -- "$academy_node")${PATH:+:$PATH}"
fi
exec "$academy_node" --disable-warning=ExperimentalWarning "$academy_root/dist/cli.js" "$@"
