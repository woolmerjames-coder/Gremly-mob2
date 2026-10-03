#!/usr/bin/env bash
# Bundles the agent replay with the worker code it imports (the workers use
# extensionless imports, which plain node cannot load), then runs it.
#   scripts/day-replay/run-agent.sh [--only id,id] [--models gemini,openai] [--repeat n]
# ESBUILD=/path/to/esbuild overrides the esbuild binary.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/run-agent.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle-agent.mjs"
node "$HERE/.bundle-agent.mjs" "$@"
