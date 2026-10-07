#!/usr/bin/env bash
# Replays the What got me here writer on the days in days.json, several times,
# and writes a review page James reads before the prompt ships.
#   scripts/age-replay/run.sh [--runs 5] [--model gpt-6-luna] [--days path.json]
# ESBUILD=/path/to/esbuild overrides the esbuild binary. Keys come from
# .audit-keys.local at the repo root or OPENAI_API_KEY in the environment.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
${ESBUILD:-npx esbuild} "$HERE/run.mjs" --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$HERE/.bundle.mjs"
node "$HERE/.bundle.mjs" "$@"
