#!/usr/bin/env bash
# scripts/drift_check.sh
# CI script to detect schema drift between Supabase and local types.
# Fails if generated types differ from committed types (indicates schema changed).

set -e

echo "🔍 Checking for database schema drift..."
echo ""

# Extract project ref from .env.local URL if not set
if [ -z "$SUPABASE_PROJECT_REF" ]; then
  if [ -f ".env.local" ]; then
    SUPABASE_PROJECT_REF=$(grep "EXPO_PUBLIC_SUPABASE_URL" .env.local | sed 's/.*\/\/\([^.]*\).*/\1/' || true)
  fi
fi

# Check if project ref is available
if [ -z "$SUPABASE_PROJECT_REF" ]; then
  echo "⚠️  WARNING: SUPABASE_PROJECT_REF not set, skipping drift check"
  echo "   (This is expected in CI environments without Supabase access)"
  echo ""
  exit 0
fi

# Save current types file hash
if [ -f "lib/supabase/types.ts" ]; then
  BEFORE_HASH=$(shasum lib/supabase/types.ts | awk '{print $1}')
else
  BEFORE_HASH=""
fi

# Regenerate types from live schema
echo "📥 Fetching latest schema from Supabase..."
bash scripts/gen_db_types.sh

# Check if types changed
if [ -f "lib/supabase/types.ts" ]; then
  AFTER_HASH=$(shasum lib/supabase/types.ts | awk '{print $1}')
else
  AFTER_HASH=""
fi

if [ "$BEFORE_HASH" != "$AFTER_HASH" ]; then
  echo ""
  echo "❌ SCHEMA DRIFT DETECTED!"
  echo ""
  echo "The database schema has changed but types are not up to date."
  echo ""
  echo "Required actions:"
  echo "  1. Review changes: git diff lib/supabase/types.ts"
  echo "  2. Update code to match new schema"
  echo "  3. Run: npm run typecheck"
  echo "  4. Commit updated types.ts"
  echo ""
  exit 1
else
  echo ""
  echo "✅ No schema drift detected - types are up to date"
  echo ""
fi
