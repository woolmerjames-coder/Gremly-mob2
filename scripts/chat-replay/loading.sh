#!/usr/bin/env bash
# Bundles the loading line check with the worker code it imports, then runs it.
#   scripts/chat-replay/loading.sh [--models a,b] [--repeat n]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/loading.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle-loading.mjs"
node "$HERE/.bundle-loading.mjs" "$@"
