#!/usr/bin/env bash
set -euo pipefail

academy_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
academy_link=0
academy_check=0
academy_dry_run=0
academy_host_build=0
academy_stage=''
academy_promoted=0
academy_had_dist=0
academy_success=0
academy_lock_owned=0

usage() {
  cat <<'HELP'
Agent Academy · Source installation and verification

Managed installation: herdr plugin install ozaimoglu/agent-academy

./scripts/install.sh             Check, install locked dependencies, build and verify
./scripts/install.sh --link      Then register this checkout with Herdr
./scripts/install.sh --check     Verify the current installation; do not build or register
./scripts/install.sh --dry-run   Check the environment and preview the steps
./scripts/install.sh --build-only  Build for Herdr’s managed installation

Exit: 0 success · 2 prerequisite/argument · 3 dependency · 4 build · 5 verification · 6 Herdr registration
User preferences, lessons and Codex settings are preserved. The panel does not open automatically.
HELP
}
fail() { printf '\nERROR [%s]: %s\n' "$1" "$2" >&2; exit "$1"; }
step() { printf '\n[%s] %s\n' "$1" "$2"; }
cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$academy_promoted" == 1 && "$academy_success" != 1 ]]; then
    if [[ -e "$academy_stage/previous-dist" ]]; then
      rm -rf -- "$academy_root/dist"
      mv -- "$academy_stage/previous-dist" "$academy_root/dist"
    elif [[ "$academy_had_dist" == 0 ]]; then
      rm -rf -- "$academy_root/dist"
    fi
    printf '%s\n' 'Restored the previous application build.' >&2
  fi
  if [[ -n "$academy_stage" ]]; then rm -rf -- "$academy_stage"; fi
  if [[ "$academy_lock_owned" == 1 ]]; then
    rm -f -- "$academy_root/.academy-install.lock/pid"
    rmdir -- "$academy_root/.academy-install.lock" || true
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for academy_arg in "$@"; do
  case "$academy_arg" in
    --link) academy_link=1 ;;
    --check) academy_check=1 ;;
    --dry-run) academy_dry_run=1 ;;
    --build-only) academy_host_build=1 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; fail 2 "Unknown argument: $academy_arg" ;;
  esac
done
if [[ "$academy_check" == 1 && ( "$academy_link" == 1 || "$academy_host_build" == 1 || "$academy_dry_run" == 1 ) ]]; then
  fail 2 '--check must be used alone.'
fi
if [[ "$academy_host_build" == 1 && "$academy_link" == 1 ]]; then fail 2 '--build-only and --link cannot be combined.'; fi
cd -- "$academy_root"

printf '%s\n' 'AGENT ACADEMY · Installation'
step '1/5' 'Prerequisites and environment'
command -v node >/dev/null 2>&1 || fail 2 'Node.js >=22.19 was not found. https://nodejs.org/en/download'
# Keep this bootstrap compatible with older Node versions so the error is actionable.
node -e 'const v=process.versions.node.split(".").map(Number);if(v[0]<22||(v[0]===22&&v[1]<19)){console.error("Node.js >=22.19 is required; installed: "+process.version);process.exit(1)}' || fail 2 'Update Node.js first.'
if [[ "$academy_link" == 1 ]]; then
  node --disable-warning=ExperimentalWarning scripts/preflight.mjs --require-herdr || fail 2 'Prerequisite check failed; no automatic system changes were made.'
else
  node --disable-warning=ExperimentalWarning scripts/preflight.mjs || fail 2 'Prerequisite check failed; no automatic system changes were made.'
fi

if [[ "$academy_dry_run" == 1 ]]; then
  printf '\n%s\n' 'PLAN · no dependencies, build output or Herdr registration changed.'
  printf '%s\n' '  2. npm ci --include=dev --no-audit --no-fund' '  3. Build TypeScript in a temporary directory' '  4. Verify SQLite + CLI + offline pipeline and record the installation' '  5. Activate the verified dist build'
  if [[ "$academy_link" == 1 ]]; then printf '  6. herdr plugin link %q\n' "$academy_root"; fi
  exit 0
fi
if [[ "$academy_check" == 1 ]]; then
  node --disable-warning=ExperimentalWarning scripts/verify-install.mjs || fail 5 'Could not verify installation. Run the source installer again.'
  academy_success=1
  exit 0
fi

mkdir -- "$academy_root/.academy-install.lock" 2>/dev/null || fail 2 'Another installation holds .academy-install.lock. Wait for it to finish.'
academy_lock_owned=1
printf '%s\n' "$$" > "$academy_root/.academy-install.lock/pid"
academy_stage="$(mktemp -d "$academy_root/.academy-install.XXXXXX")" || fail 4 'Cannot write to the installation directory.'
step '2/5' 'Installing dependencies from the lockfile'
# TypeScript is needed at install time even when the host sets NODE_ENV=production.
npm ci --include=dev --no-audit --no-fund || fail 3 'Could not install dependencies. Check network/registry access and npm output.'
step '3/5' 'Building in an isolated directory'
npm run build -- --outDir "$academy_stage/dist" --sourceMap false --declaration false || fail 4 'Build failed; the previous dist build was preserved.'
cp -R -- fixtures "$academy_stage/fixtures" || fail 4 'Could not prepare acceptance test fixtures.'
step '4/5' 'Installation acceptance checks'
node --disable-warning=ExperimentalWarning scripts/verify-install.mjs --dist "$academy_stage/dist" --record || fail 5 'Could not verify the new build; the previous dist build was preserved.'

step '5/5' 'Activating the verified application'
if [[ -L "$academy_root/dist" ]]; then fail 5 'dist is a symbolic link; it was not changed automatically.'; fi
if [[ -e "$academy_root/dist" ]]; then
  academy_had_dist=1
fi
# Mark the promotion before moving: the EXIT trap restores the backup on any failure.
academy_promoted=1
if [[ "$academy_had_dist" == 1 ]]; then mv -- "$academy_root/dist" "$academy_stage/previous-dist"; fi
mv -- "$academy_stage/dist" "$academy_root/dist"
if [[ "$academy_link" == 1 ]]; then
  herdr plugin link "$academy_root" || fail 6 'Herdr registration failed; restoring the previous application build.'
fi
academy_success=1
printf '\n%s\n' 'SUCCESS · Installation and offline acceptance checks passed.' 'Receipt: dist/install-info.json'
if [[ "$academy_host_build" == 1 ]]; then
  printf '%s\n' 'Herdr will continue registering the managed installation.'
elif [[ "$academy_link" == 1 ]]; then
  printf '%s\n' 'Herdr registration complete. Open from your Codex pane:' '  herdr plugin action invoke local.agent-academy.open'
else
  printf '%s\n' 'Local demo: npm run demo' 'To also register with Herdr: ./scripts/install.sh --link'
fi
printf '%s\n' 'The panel opens in standby · B start · D stop · Q close'
