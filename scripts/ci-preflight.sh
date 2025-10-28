#!/usr/bin/env bash
# CI Pre-flight checks
# Run before CI to ensure common issues are caught early

set -euo pipefail

echo "🔍 Running CI pre-flight checks..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0

# Check 1: TypeScript compilation
echo ""
echo "📋 Check 1/4: TypeScript compilation..."
if npm run typecheck > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} TypeScript compilation passed"
else
  echo -e "${RED}✗${NC} TypeScript compilation failed"
  echo "Run: npm run typecheck"
  FAILED=1
fi

# Check 2: ESLint
echo ""
echo "📋 Check 2/4: ESLint..."
if npm run lint > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} ESLint passed"
else
  echo -e "${RED}✗${NC} ESLint failed"
  echo "Run: npm run lint"
  FAILED=1
fi

# Check 3: Verify excluded directories are not breaking typecheck
echo ""
echo "📋 Check 3/4: Verify excluded directories..."
PROBLEM_DIRS=("artifacts" "scripts" "_archive" "gremly-chat-system-review")
for dir in "${PROBLEM_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    # Check if the directory would cause typecheck failures if included
    if grep -q "\"$dir/\*\*/\*\"" tsconfig.json; then
      echo -e "${GREEN}✓${NC} $dir is properly excluded in tsconfig.json"
    else
      echo -e "${YELLOW}⚠${NC} $dir exists but may not be excluded in tsconfig.json"
    fi
  fi
done

# Check 4: Verify no stray generated files in source
echo ""
echo "📋 Check 4/4: Check for stray generated files in source..."
STRAY_FILES=$(find app lib src components -name "*.tsbuildinfo" 2>/dev/null || true)
if [ -z "$STRAY_FILES" ]; then
  echo -e "${GREEN}✓${NC} No stray build artifacts in source directories"
else
  echo -e "${RED}✗${NC} Found stray build artifacts:"
  echo "$STRAY_FILES"
  FAILED=1
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All pre-flight checks passed!${NC}"
  echo "Safe to push to CI."
  exit 0
else
  echo -e "${RED}✗ Some checks failed.${NC}"
  echo "Fix the issues above before pushing."
  exit 1
fi
