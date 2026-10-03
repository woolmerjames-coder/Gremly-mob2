#!/usr/bin/env bash
# Bundles the agent smoke run with the worker code it imports (the workers use
# imports plain node cannot load as they are), then runs it.
#   scripts/agent-smoke/run.sh [--models gemini,openai] [--only id,id]
# ESBUILD=/path/to/esbuild overrides the esbuild binary.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/run.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle.mjs"
node "$HERE/.bundle.mjs" "$@"
