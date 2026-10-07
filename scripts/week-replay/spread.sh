#!/usr/bin/env bash
# Bundles the spread replay with the worker code it imports (the workers use
# extensionless imports, which plain node cannot load), then runs it.
#   scripts/week-replay/spread.sh [--only id,id] [--repeat n] [--show] [--effort medium] [--judge sol|pro|none]
# ESBUILD=/path/to/esbuild overrides the esbuild binary.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/spread.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle-spread.mjs"
node "$HERE/.bundle-spread.mjs" "$@"
