#!/usr/bin/env bash
# The deadline check for the already have it check (final check item 6): the
# made up drops in workers/cortex/__tests__/fixtures/relate-deadlines.json,
# through the deadline request, on Luna low. NODE_USE_ENV_PROXY makes node's
# fetch use the proxy in the Cowork VM; it does nothing elsewhere.
#   scripts/relate-replay/deadlines.sh --run 1
# The key comes from .audit-keys.local at the repo root (OPENAI_API_KEY).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
NODE_USE_ENV_PROXY=1 node --no-warnings "$HERE/deadlines.mjs" "$@"
