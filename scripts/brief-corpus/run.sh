#!/usr/bin/env bash
# Bundles the corpus runner with the worker code it imports (the workers use
# extensionless imports, which plain node cannot load), then runs it.
#   scripts/brief-corpus/run.sh [--real] [--only id,id] [--models gemini,openai]
# ESBUILD=/path/to/esbuild overrides the esbuild binary (for a machine where
# node_modules holds another platform's build).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/run.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle.mjs"
node "$HERE/.bundle.mjs" "$@"
