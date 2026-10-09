#!/usr/bin/env bash
# Bundles the chat correction check's replay with the worker code it imports, then runs it.
#   scripts/chat-correction-replay/run.sh [--repeat n] [--only id,id]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/run.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle.mjs"
node "$HERE/.bundle.mjs" "$@"
