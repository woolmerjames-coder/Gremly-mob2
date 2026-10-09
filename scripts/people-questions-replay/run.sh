#!/usr/bin/env bash
# Bundles the people questions replay with the worker code it imports, then runs it.
#   scripts/people-questions-replay/run.sh [check|ask|answer|all] [--models luna,flash] [--repeat n]
# ESBUILD=/path/to/esbuild overrides the esbuild binary.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/run.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle.mjs"
node "$HERE/.bundle.mjs" "$@"
