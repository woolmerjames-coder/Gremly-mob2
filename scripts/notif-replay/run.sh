#!/usr/bin/env bash
# Bundles the evening notification replay with the worker code it imports, then runs it.
#   scripts/notif-replay/run.sh [--repeat n]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/run.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle.mjs"
node "$HERE/.bundle.mjs" "$@"
