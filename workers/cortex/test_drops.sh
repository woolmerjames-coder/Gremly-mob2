#!/bin/bash
# Test 40 drops against classify-phase1-v2
# Usage: WORKER_URL=https://your-worker.workers.dev ./test_drops.sh

WORKER_URL="${WORKER_URL:-https://gentle-thunder-5854.woolmerjames.workers.dev}"

drops=(
  "email landlord about the leak in the bathroom"
  "cycle to work twice a week"
  "no screens after 10pm"
  "I actually enjoyed that run today for once"
  "coffee with Jake Wednesday morning"
  "buy bin bags"
  "take vitamins every morning"
  "stop ordering takeout so much"
  "kept losing focus every 10 minutes today"
  "a way to quickly dump everything in my head when I feel overwhelmed"
  "renew passport before summer"
  "write a few lines in a journal each night"
  "don't check phone during meals"
  "I feel more productive when I start work before 9"
  "gym class Thursday at 6pm"
  "return that package"
  "do yoga once a week"
  "cut down on coffee in the afternoons"
  "felt a bit disconnected from everything today"
  "a feature that helps me actually follow through on plans I make"
  "transfer money to savings account"
  "start doing a weekly grocery shop instead of daily trips"
  "stop staying up too late watching random videos"
  "I get a slump every day around 3pm"
  "dinner reservation Friday at 8:30"
  "print those documents"
  "walk 8k steps a day"
  "no phone while working in the morning block"
  "I've been in a better mood when I exercise regularly"
  "something that helps me decide what to do when I have too many options"
  "check car insurance renewal date"
  "prep meals on Sundays for the week"
  "limit sugar to weekends"
  "I didn't feel like myself today, a bit off"
  "meeting with design team tomorrow at 11"
  "wifi password is on the back of the router"
  "passport expires in March next year"
  "washing machine cycle takes 1 hour 20 minutes"
  "gym closes at 9pm on weekdays"
  "landlord's phone number is saved in emails somewhere"
)

echo "Testing ${#drops[@]} drops against $WORKER_URL"
echo "================================================"

for i in "${!drops[@]}"; do
  n=$((i + 1))
  text="${drops[$i]}"
  echo ""
  echo "--- Drop $n: $text ---"
  curl -s -X POST "$WORKER_URL" \
    -H "Content-Type: application/json" \
    -d "{\"type\": \"classify-phase1-v2\", \"text\": \"$text\"}" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    bucket = d.get('bucket', '?')
    subtype = d.get('subtype', '')
    habit = d.get('habitSubtype', '')
    sub = f'/{subtype}' if subtype else ''
    hab = f' ({habit})' if habit else ''
    amb = ' CLARIFY' if d.get('is_ambiguous') else ''
    print(f'  → {bucket}{sub}{hab}{amb}')
except:
    print('  → ERROR parsing response')
" 
  sleep 0.5
done

echo ""
echo "================================================"
echo "Done. Check Cloudflare logs for full observation data."
