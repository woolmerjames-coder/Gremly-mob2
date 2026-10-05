#!/usr/bin/env bash
# Bundles the wrap up replay with the worker and app code it imports, then runs it.
#   scripts/wrap-replay/run.sh [--only id,id] [--repeat n] [--model name]
# ESBUILD=/path/to/esbuild overrides the esbuild binary.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/run.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle.mjs"
node "$HERE/.bundle.mjs" "$@"
