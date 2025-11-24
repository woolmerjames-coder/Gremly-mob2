#!/bin/bash
#
# Capture Mind Drop logs for analysis
# Usage: ./scripts/capture-logs.sh
#
# This script:
# 1. Clears the previous log file
# 2. Starts Expo with --clear flag
# 3. Captures all output to minddrop-test.log
# 4. Displays output in terminal (via tee)
#
# To stop: Press Ctrl+C
# To analyze: npm run analyze:drops

LOG_FILE="minddrop-test.log"

echo "🔍 Starting Mind Drop log capture..."
echo "📝 Logs will be saved to: $LOG_FILE"
echo ""
echo "📱 Open the app and perform Mind Drop entries"
echo "🛑 Press Ctrl+C when done to stop capture"
echo ""

# Clear previous log
> "$LOG_FILE"

# Start Expo and capture logs
npx expo start --clear 2>&1 | tee "$LOG_FILE"
