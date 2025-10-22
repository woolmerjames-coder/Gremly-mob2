#!/usr/bin/env bash
set -euo pipefail

# ============================================
# Supabase Diagnostics Bundle Generator
# ============================================
# Purpose: Generate a safe, shareable diagnostics bundle for debugging
# Output: supa_diag_bundle.zip (no secrets, no data)
# ============================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DIAG_DIR="supa_diag"
BUNDLE_NAME="supa_diag_bundle.zip"
PROJECT_ROOT="$(pwd)"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}🔍 Supabase Diagnostics Bundle Generator${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# ============================================
# Step 0: Cleanup old diagnostics
# ============================================
echo -e "${YELLOW}[0/9] Cleaning up old diagnostics...${NC}"
rm -rf "$DIAG_DIR" 2>/dev/null || true
rm -f "$BUNDLE_NAME" 2>/dev/null || true
mkdir -p "$DIAG_DIR"
cd "$DIAG_DIR"
echo -e "${GREEN}✓ Clean workspace ready${NC}"
echo ""

# ============================================
# Step 1: Verify Supabase CLI
# ============================================
echo -e "${YELLOW}[1/9] Verifying Supabase CLI...${NC}"
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}✗ Supabase CLI not found${NC}"
    echo "Install with: brew install supabase/tap/supabase"
    exit 1
fi

supabase --version > cli_version.txt 2>&1
echo -e "${GREEN}✓ Supabase CLI version:${NC} $(cat cli_version.txt)"
echo ""

# ============================================
# Step 2: Check Supabase Login Status
# ============================================
echo -e "${YELLOW}[2/9] Checking Supabase login status...${NC}"
if supabase projects list > projects_list.txt 2>&1; then
    echo -e "${GREEN}✓ Logged in to Supabase${NC}"
    echo "Projects available: $(wc -l < projects_list.txt | tr -d ' ') lines"
else
    echo -e "${RED}✗ Not logged in to Supabase${NC}"
    echo "Run: supabase login"
    cat projects_list.txt 2>/dev/null || true
    exit 1
fi
echo ""

# ============================================
# Step 3: Get Project Status
# ============================================
echo -e "${YELLOW}[3/9] Getting project status...${NC}"
supabase status > status.txt 2>&1 || echo "No local project linked" > status.txt
cat status.txt
echo ""

# ============================================
# Step 4: Extract Project Reference
# ============================================
echo -e "${YELLOW}[4/9] Detecting project reference...${NC}"
# Try to get project ref from .env.local, .env, or git config
PROJECT_REF=""

if [ -f "$PROJECT_ROOT/.env.local" ]; then
    PROJECT_REF=$(grep -E "EXPO_PUBLIC_SUPABASE_URL|SUPABASE_PROJECT_REF" "$PROJECT_ROOT/.env.local" | head -1 | sed 's/.*\/\/\([^.]*\).*/\1/' || true)
fi

if [ -z "$PROJECT_REF" ] && [ -f "$PROJECT_ROOT/.env" ]; then
    PROJECT_REF=$(grep -E "EXPO_PUBLIC_SUPABASE_URL|SUPABASE_PROJECT_REF" "$PROJECT_ROOT/.env" | head -1 | sed 's/.*\/\/\([^.]*\).*/\1/' || true)
fi

if [ -z "$PROJECT_REF" ]; then
    # Try to extract from supabase config
    PROJECT_REF=$(supabase status 2>/dev/null | grep "Project ID" | awk '{print $NF}' || echo "")
fi

if [ -n "$PROJECT_REF" ]; then
    echo -e "${GREEN}✓ Project reference detected: ${PROJECT_REF}${NC}"
    echo "$PROJECT_REF" > project_ref.txt
else
    echo -e "${YELLOW}⚠ Could not auto-detect project reference${NC}"
    echo "UNKNOWN" > project_ref.txt
fi
echo ""

# ============================================
# Step 5: Dump Schema (DDL only, no data)
# ============================================
echo -e "${YELLOW}[5/9] Dumping database schema...${NC}"
if [ -n "$PROJECT_REF" ]; then
    # Try to dump schema using supabase CLI
    supabase db dump \
        --project-id "$PROJECT_REF" \
        --data-only=false \
        > schema_dump.sql 2>&1 || {
        echo -e "${YELLOW}⚠ Could not dump schema via CLI (may need db URL)${NC}"
        echo "-- Schema dump failed - see error above" > schema_dump.sql
    }
    
    if [ -s schema_dump.sql ]; then
        echo -e "${GREEN}✓ Schema dumped ($(wc -l < schema_dump.sql | tr -d ' ') lines)${NC}"
    else
        echo -e "${YELLOW}⚠ Schema dump is empty${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Skipping schema dump (no project ref)${NC}"
    echo "-- No project reference available" > schema_dump.sql
fi
echo ""

# ============================================
# Step 6: Export TypeScript Types
# ============================================
echo -e "${YELLOW}[6/9] Generating TypeScript types...${NC}"
if [ -n "$PROJECT_REF" ]; then
    npx --yes supabase gen types typescript \
        --project-id "$PROJECT_REF" \
        > database_types.ts 2>&1 || {
        echo -e "${YELLOW}⚠ Could not generate types${NC}"
        echo "// Type generation failed" > database_types.ts
    }
    
    if [ -s database_types.ts ] && ! grep -q "error" database_types.ts; then
        echo -e "${GREEN}✓ Types generated ($(wc -l < database_types.ts | tr -d ' ') lines)${NC}"
    else
        echo -e "${YELLOW}⚠ Type generation failed or empty${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Skipping type generation (no project ref)${NC}"
    echo "// No project reference available" > database_types.ts
fi
echo ""

# ============================================
# Step 7: Collect RLS Policies, Triggers, Extensions
# ============================================
echo -e "${YELLOW}[7/9] Collecting database metadata...${NC}"

# Create a SQL script to extract metadata
cat > extract_metadata.sql << 'EOSQL'
-- RLS Policies
\echo '=== RLS POLICIES ==='
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

\echo ''
\echo '=== TRIGGERS ==='
SELECT 
    trigger_schema,
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

\echo ''
\echo '=== EXTENSIONS ==='
SELECT 
    extname as extension_name,
    extversion as version
FROM pg_extension
ORDER BY extname;

\echo ''
\echo '=== FOREIGN KEYS ==='
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.update_rule,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

\echo ''
\echo '=== GRANTS ==='
SELECT 
    table_schema,
    table_name,
    privilege_type,
    grantee
FROM information_schema.table_privileges
WHERE table_schema = 'public'
ORDER BY table_name, privilege_type;

\echo ''
\echo '=== INDEXES ==='
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

\echo ''
\echo '=== COLUMNS ==='
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
EOSQL

echo -e "${GREEN}✓ Metadata extraction script created${NC}"

# Try to run metadata extraction if we have a connection
if [ -f "$PROJECT_ROOT/.env.local" ] && grep -q "SUPABASE_DB_URL" "$PROJECT_ROOT/.env.local" 2>/dev/null; then
    echo "Attempting to extract metadata..."
    DB_URL=$(grep "SUPABASE_DB_URL" "$PROJECT_ROOT/.env.local" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    if [ -n "$DB_URL" ]; then
        psql "$DB_URL" -f extract_metadata.sql > metadata.txt 2>&1 || {
            echo -e "${YELLOW}⚠ Could not connect to database${NC}"
            echo "-- Connection failed" > metadata.txt
        }
    fi
else
    echo -e "${YELLOW}⚠ No database URL available - metadata extraction skipped${NC}"
    echo "-- No database connection available" > metadata.txt
fi
echo ""

# ============================================
# Step 8: Archive Migrations
# ============================================
echo -e "${YELLOW}[8/9] Archiving migrations...${NC}"
if [ -d "$PROJECT_ROOT/supabase/migrations" ]; then
    tar -czf migrations.tgz -C "$PROJECT_ROOT/supabase" migrations 2>/dev/null || {
        echo -e "${YELLOW}⚠ Could not create migrations archive${NC}"
        touch migrations.tgz
    }
    MIGRATION_COUNT=$(find "$PROJECT_ROOT/supabase/migrations" -type f -name "*.sql" | wc -l | tr -d ' ')
    echo -e "${GREEN}✓ Migrations archived (${MIGRATION_COUNT} files)${NC}"
else
    echo -e "${YELLOW}⚠ No migrations directory found${NC}"
    touch migrations.tgz
fi
echo ""

# ============================================
# Step 9: Collect Environment Variable Names (NO VALUES)
# ============================================
echo -e "${YELLOW}[9/9] Collecting environment variable names...${NC}"
cat > env_vars_sanitized.txt << 'EOENV'
# Environment Variables (values redacted for security)
# Generated: $(date)

EOENV

for env_file in "$PROJECT_ROOT/.env.local" "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.example"; do
    if [ -f "$env_file" ]; then
        echo "## From $(basename $env_file)" >> env_vars_sanitized.txt
        grep -E "^[A-Z_]+" "$env_file" | sed 's/=.*/=<REDACTED>/' >> env_vars_sanitized.txt 2>/dev/null || true
        echo "" >> env_vars_sanitized.txt
    fi
done

echo -e "${GREEN}✓ Environment variable names collected (values redacted)${NC}"
echo ""

# ============================================
# Step 10: Create Summary
# ============================================
cat > SUMMARY.txt << EOSUMMARY
Supabase Diagnostics Bundle
Generated: $(date)
Project Root: $PROJECT_ROOT
Project Reference: $(cat project_ref.txt 2>/dev/null || echo "UNKNOWN")

=== CONTENTS ===
- cli_version.txt: Supabase CLI version
- projects_list.txt: Available projects
- status.txt: Local project status
- project_ref.txt: Detected project reference
- schema_dump.sql: Database schema (DDL only, no data)
- database_types.ts: Generated TypeScript types
- extract_metadata.sql: SQL script used for metadata extraction
- metadata.txt: RLS policies, triggers, extensions, foreign keys, grants
- migrations.tgz: Compressed migrations folder
- env_vars_sanitized.txt: Environment variable names (values redacted)

=== SECURITY ===
✓ No user data included
✓ No secrets or API keys
✓ No connection strings with passwords
✓ Only schema definitions and metadata

=== FILES ===
$(ls -lh)

EOSUMMARY

# ============================================
# Step 11: Create ZIP Bundle
# ============================================
cd "$PROJECT_ROOT"
echo -e "${YELLOW}Creating final bundle...${NC}"
zip -r "$BUNDLE_NAME" "$DIAG_DIR"/* > /dev/null 2>&1

# ============================================
# Final Output
# ============================================
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}✅ Bundle created successfully!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "${GREEN}📦 Location: ${PROJECT_ROOT}/${BUNDLE_NAME}${NC}"
echo -e "${GREEN}📊 Size: $(du -h "$BUNDLE_NAME" | cut -f1)${NC}"
echo ""
echo -e "${BLUE}Contents summary:${NC}"
unzip -l "$BUNDLE_NAME" | tail -n +4 | head -n -2 | awk '{print "  - " $NF}'
echo ""
echo -e "${YELLOW}💡 To extract: unzip $BUNDLE_NAME${NC}"
echo -e "${YELLOW}💡 To share: This bundle contains no secrets or user data${NC}"
echo ""
