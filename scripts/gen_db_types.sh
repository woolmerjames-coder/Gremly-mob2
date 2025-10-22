#!/usr/bin/env bash
# scripts/gen_db_types.sh
# Generate TypeScript types from live Supabase project schema.
# Source of truth: Supabase database schema (not local code).

set -e

# Extract project ref from .env.local URL if not set
if [ -z "$SUPABASE_PROJECT_REF" ]; then
  if [ -f ".env.local" ]; then
    SUPABASE_PROJECT_REF=$(grep "EXPO_PUBLIC_SUPABASE_URL" .env.local | sed 's/.*\/\/\([^.]*\).*/\1/' || true)
  fi
fi

# Check if project ref is available
if [ -z "$SUPABASE_PROJECT_REF" ]; then
  echo "❌ ERROR: SUPABASE_PROJECT_REF not set"
  echo ""
  echo "TODO: Set your Supabase project reference before running this script:"
  echo "  export SUPABASE_PROJECT_REF=pvfnnpcfmgczlcglvlzl"
  echo ""
  echo "Or add it to your .env.local:"
  echo "  SUPABASE_PROJECT_REF=pvfnnpcfmgczlcglvlzl"
  echo ""
  exit 1
fi

echo "🔄 Generating TypeScript types from Supabase project: $SUPABASE_PROJECT_REF"
echo ""

# Ensure output directory exists
mkdir -p lib/supabase

# Generate types from live Supabase project
npx --yes supabase gen types typescript \
  --project-id "$SUPABASE_PROJECT_REF" \
  --schema public \
  > lib/supabase/types.ts

echo "✅ Types generated successfully: lib/supabase/types.ts"
echo ""
echo "⚠️  IMPORTANT: If types changed, you must:"
echo "   1. Update code to match new types"
echo "   2. Run 'npm run typecheck' to verify"
echo "   3. Commit the updated types.ts file"
echo ""
