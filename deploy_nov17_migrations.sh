#!/bin/bash
# Deploy November 17, 2025 migrations
# 1. Habits notes column (for Mind Drop habit conversion)
# 2. Due time timestamp fix (for Today view)

set -e  # Exit on error

echo "🚀 Deploying November 17, 2025 migrations..."
echo ""

# Check if we have Supabase credentials
if [ -z "$SUPABASE_PASSWORD" ]; then
  echo "❌ Error: SUPABASE_PASSWORD environment variable not set"
  echo "Please set it with: export SUPABASE_PASSWORD='your-password'"
  exit 1
fi

# Supabase connection URL
DB_URL="postgresql://postgres.pvfnnpcfmgczlcglvlzl:$SUPABASE_PASSWORD@aws-0-us-west-1.pooler.supabase.com:6543/postgres"

echo "📋 Migrations to apply:"
echo "  1. 20251117_add_habits_notes_column.sql"
echo "  2. 20251117_fix_due_time_timestamp_conversion.sql"
echo ""

# Option 1: Use Supabase CLI (recommended)
if command -v supabase &> /dev/null; then
  echo "✅ Using Supabase CLI..."
  supabase db push --db-url "$DB_URL"
  echo ""
  echo "✅ Migrations applied successfully via Supabase CLI!"
else
  echo "⚠️  Supabase CLI not found. Please apply migrations manually:"
  echo ""
  echo "Option A: Install Supabase CLI and run:"
  echo "  npx supabase db push --db-url \"$DB_URL\""
  echo ""
  echo "Option B: Copy and run SQL directly in Supabase SQL Editor:"
  echo "  1. Open https://supabase.com/dashboard/project/pvfnnpcfmgczlcglvlzl/sql/new"
  echo "  2. Copy contents of supabase/migrations/20251117_add_habits_notes_column.sql"
  echo "  3. Run the SQL"
  echo "  4. Copy contents of supabase/migrations/20251117_fix_due_time_timestamp_conversion.sql"
  echo "  5. Run the SQL"
  exit 1
fi

echo ""
echo "🧪 Verification steps:"
echo "  1. Check Mind Drop → Habit conversion:"
echo "     - Submit: 'Run every morning, even if just for 5 mins'"
echo "     - Click 'Habit' chip"
echo "     - Verify: No schema error, habit created with notes"
echo ""
echo "  2. Check Today view loads without errors:"
echo "     - Open Today screen"
echo "     - Verify: No '09:00' timestamp errors in logs"
echo ""
echo "✅ Deployment complete!"
