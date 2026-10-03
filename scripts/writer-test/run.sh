#!/usr/bin/env bash
# Bundles the writer test with the worker code it imports (the workers use
# extensionless imports, which plain node cannot load), then runs it.
#   scripts/writer-test/run.sh [--record] [--only id,id] [--models a,b] [--limit n]
# ESBUILD=/path/to/esbuild overrides the esbuild binary.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/run-writer.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle-writer.mjs"
node "$HERE/.bundle-writer.mjs" "$@"
