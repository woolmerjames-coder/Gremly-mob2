#!/usr/bin/env bash
# Bundles the Ask Gremly replay with the worker code it imports, then runs it.
#   scripts/ask-replay/run.sh --build | [--variants a,b] [--repeat n] [--only id,id] [--label name]
# ESBUILD=/path/to/esbuild overrides the esbuild binary.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/run.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle.mjs"
node "$HERE/.bundle.mjs" "$@"
