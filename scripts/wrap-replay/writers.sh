#!/usr/bin/env bash
# Bundles the wrap up writer test with the worker code it imports, then runs it.
#   scripts/wrap-replay/writers.sh --write luna|luna-low|flash [--repeat n] [--only id,id]
#   scripts/wrap-replay/writers.sh --judge sol|pro
#   scripts/wrap-replay/writers.sh --report
# ESBUILD=/path/to/esbuild overrides the esbuild binary.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/writers.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle-writers.mjs"
node "$HERE/.bundle-writers.mjs" "$@"
