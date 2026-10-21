#!/usr/bin/env bash
set -euo pipefail
academy_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec node --disable-warning=ExperimentalWarning "$academy_root/dist/cli.js" "$@"
