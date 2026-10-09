#!/usr/bin/env bash
# Bundles the enrichment replay with the worker code it imports, then runs it.
#   scripts/enrich-replay/run.sh <time|people> [--old <file>] [--repeat n]
# A bundle of its own for each run, so parts can run side by side.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
BUNDLE="$HERE/.bundle-$$.mjs"
trap 'rm -f "$BUNDLE"' EXIT
${ESBUILD:-npx esbuild} "$HERE/run.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=error --outfile="$BUNDLE"
node "$BUNDLE" "$@"
