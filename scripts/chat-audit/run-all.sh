#!/usr/bin/env bash
# Run every candidate over the practice and locked sets. Prompts are frozen, so
# both sets can run at once; nothing is tuned on the result.
# Usage: ./run-all.sh <round tag> [concurrency]
set -u
cd "$(dirname "$0")"
export NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1 NODE_EXTRA_CA_CERTS=${NODE_EXTRA_CA_CERTS:-}
ROUND=${1:-r1}; C=${2:-4}
LOG=results/run-all-$ROUND.log
echo "start $(date -u +%FT%TZ)" >> "$LOG"
for m in gpt-4.1-mini gpt-6-luna gpt-5-nano gemini-3.8-flash; do
  for set in dev test; do
    node run-turns.mjs "$m" "$set" "${ROUND}_${m}" "$C" two-call 3000 >> "$LOG" 2>&1
    node run-turns.mjs "$m" "$set" "${ROUND}_one_${m}" "$C" one-call 3000 >> "$LOG" 2>&1
    node run-chats.mjs "$m" "$set" "${ROUND}_${m}" "$C" 1000 >> "$LOG" 2>&1
  done
done
echo "done $(date -u +%FT%TZ)" >> "$LOG"
