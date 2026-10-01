#!/usr/bin/env bash
# Bundles the corpus runner with the worker code it imports (the workers use
# extensionless imports, which plain node cannot load), then runs it.
#   scripts/brief-corpus/run.sh [plans] [--real] [--only id,id] [--models gemini,openai]
# ESBUILD=/path/to/esbuild overrides the esbuild binary (for a machine where
# node_modules holds another platform's build).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
# "plans" as the first argument runs the plan picker's corpus instead of the brief's
ENTRY="$HERE/run.mjs"
if [ "${1:-}" = "plans" ]; then
  ENTRY="$HERE/plans.mjs"
  shift
fi
${ESBUILD:-npx esbuild} "$ENTRY" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle.mjs"
node "$HERE/.bundle.mjs" "$@"
