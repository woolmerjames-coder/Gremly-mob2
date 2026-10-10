#!/usr/bin/env bash
# Bundles the stage 9 gate with the worker code it imports, then runs it.
#   scripts/filing-replay/gate.sh [--report]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/gate.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle-gate.mjs"
node "$HERE/.bundle-gate.mjs" "$@"
