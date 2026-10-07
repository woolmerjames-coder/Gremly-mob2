#!/usr/bin/env bash
# Bundles the shadow runner with the worker code it imports, then runs it.
#   scripts/shadow/run.sh <job> [options]           this tree's code
#   scripts/shadow/run.sh <job> --code <dir> [...]  another tree's code (a git archive, say)
# ESBUILD=/path/to/esbuild overrides the esbuild binary. Keys come from the environment.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TREE="$(cd "$HERE/../.." && pwd)"
export SHADOW_OUT="${SHADOW_OUT:-$TREE/Claude outputs/shadow}"
ARGS=()
while [ $# -gt 0 ]; do
  if [ "$1" = "--code" ]; then TREE="$(cd "$2" && pwd)"; shift 2; else ARGS+=("$1"); shift; fi
done
if [ "$TREE" != "$(cd "$HERE/../.." && pwd)" ]; then
  mkdir -p "$TREE/scripts/shadow" && cp "$HERE"/harness.js "$HERE"/run.mjs "$TREE/scripts/shadow/"
  export SHADOW_CODE_LABEL="$TREE"
fi
cd "$TREE"
${ESBUILD:-npx esbuild} "$TREE/scripts/shadow/run.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$TREE/scripts/shadow/.bundle.mjs"
node "$TREE/scripts/shadow/.bundle.mjs" "${ARGS[@]}"
