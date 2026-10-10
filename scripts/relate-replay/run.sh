#!/usr/bin/env bash
# Replays the "already have it?" check (workers/cortex/minddropRelate.js) on
# real past drops with a chosen model, using the items each person had at the
# moment of each drop. NODE_USE_ENV_PROXY makes node's fetch use the proxy in
# the Cowork VM; it does nothing elsewhere.
#   scripts/relate-replay/run.sh --variant gemini --run 1
#   scripts/relate-replay/run.sh --variant luna-none --run 1
#   scripts/relate-replay/run.sh --variant luna-low --run 5 --deadlines
# Keys come from .audit-keys.local at the repo root (OPENAI_API_KEY, GEMINI_TEST_API_KEY).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
NODE_USE_ENV_PROXY=1 node --no-warnings "$HERE/run.mjs" "$@"
