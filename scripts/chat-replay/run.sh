#!/usr/bin/env bash
# Bundles the chat replay with the worker code it imports (the workers use
# extensionless imports, which plain node cannot load), then runs it.
#   scripts/chat-replay/run.sh [--only id,id] [--models gemini,openai] [--repeat n]
# ESBUILD=/path/to/esbuild overrides the esbuild binary.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/run.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle.mjs"
node "$HERE/.bundle.mjs" "$@"
