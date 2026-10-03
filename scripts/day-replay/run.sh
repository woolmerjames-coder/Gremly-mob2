#!/usr/bin/env bash
# Bundles the replay runner with the worker code it imports (the workers use
# extensionless imports, which plain node cannot load), then runs it.
#   scripts/day-replay/run.sh [--real] [--only id,id] [--models openai,claude,gemini]
# ESBUILD=/path/to/esbuild overrides the esbuild binary.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/run.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle.mjs"
node "$HERE/.bundle.mjs" "$@"
