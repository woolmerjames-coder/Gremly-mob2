#!/usr/bin/env bash
# Bundles the first Worlds replay with the worker code it imports, then runs it.
#   scripts/first-worlds-replay/run.sh [--models sonnet,luna,flash] [--repeat n] [--only jun,ines]
# ESBUILD=/path/to/esbuild overrides the esbuild binary.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/run.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle.mjs"
node "$HERE/.bundle.mjs" "$@"
