#!/usr/bin/env bash
set -u
cd "$(dirname "$0")"
LOG=results/run-all-r2.log
echo "start $(date -u +%FT%TZ)" >> "$LOG"
for m in gpt-4.1-mini gpt-6-luna gpt-6-luna-low gemini-3.8-flash; do
  node run-turns.mjs "$m" dev "r2_one_v2_${m}" 6 one-call 3000 v2 >> "$LOG" 2>&1
done
node run-turns.mjs gpt-6-luna-low dev r2_one_v1_gpt-6-luna-low 6 one-call 3000 v1 >> "$LOG" 2>&1
for m in gpt-6-luna gpt-4.1-mini gemini-3.8-flash; do
  node run-chats.mjs "$m" dev "r2_v2_${m}" 6 1000 v2 >> "$LOG" 2>&1
done
echo "done $(date -u +%FT%TZ)" >> "$LOG"
