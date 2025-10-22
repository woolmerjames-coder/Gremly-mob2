#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   export SUPABASE_DB_URL_RO="postgres://readonly_user:*****@db.<ref>.supabase.co:5432/postgres"
#   export SUPABASE_PROJECT_REF="pvfnnpcfmgczlcglvlzl"  # from .env.local URL host prefix
#   chmod +x scripts/generate_supabase_diagnostics.sh && scripts/generate_supabase_diagnostics.sh

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/supa_diag"
mkdir -p "$OUT"

echo "== Supabase CLI =="
supabase --version | tee "$OUT/cli_version.txt" || true

echo "== Project Ref =="
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required}"
echo -n "$SUPABASE_PROJECT_REF" > "$OUT/project_ref.txt"

echo "== Projects List =="
supabase projects list > "$OUT/projects_list.txt" 2>&1 || true

echo "== Status =="
supabase status > "$OUT/status.txt" 2>&1 || true

echo "== DB Types =="
npx --yes supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" > "$OUT/database_types.ts" 2> "$OUT/types.log" || true

echo "== Schema Dump (DDL only) =="
if [[ -n "${SUPABASE_DB_URL_RO:-}" ]]; then
  pg_dump --schema-only --no-owner --no-privileges "$SUPABASE_DB_URL_RO" > "$OUT/schema_dump.sql" 2> "$OUT/schema_dump.log" || true
else
  echo "-- Missing SUPABASE_DB_URL_RO" > "$OUT/schema_dump.sql"
fi

echo "== Metadata SQL =="
cat > "$OUT/extract_metadata.sql" <<'SQL'
SELECT 'POLICIES' AS section;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies ORDER BY schemaname, tablename, policyname;

SELECT 'RLS_FLAGS' AS section;
SELECT n.nspname AS schema, c.relname AS table, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind='r' ORDER BY 1,2;

SELECT 'GRANTS' AS section;
SELECT table_schema, table_name, privilege_type, grantee
FROM information_schema.table_privileges ORDER BY 1,2,4,3;

SELECT 'FKEYS' AS section;
SELECT tc.table_schema, tc.table_name, kcu.column_name, ccu.table_name AS fk_table, ccu.column_name AS fk_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.table_schema
WHERE tc.constraint_type='FOREIGN KEY' ORDER BY 1,2;

SELECT 'EXTENSIONS' AS section;
SELECT * FROM pg_extension ORDER BY extname;
SQL

echo "== Metadata Extract =="
if [[ -n "${SUPABASE_DB_URL_RO:-}" ]]; then
  psql "$SUPABASE_DB_URL_RO" -v ON_ERROR_STOP=1 -f "$OUT/extract_metadata.sql" > "$OUT/metadata.txt" 2> "$OUT/metadata.log" || true
else
  echo "-- Missing SUPABASE_DB_URL_RO" > "$OUT/metadata.txt"
fi

echo "== Env Names (sanitized) =="
( printenv | sed -E 's/(=).*/=\[REDACTED]/' | sort ) > "$OUT/env_vars_sanitized.txt"

echo "== Migrations Snapshot =="
if [[ -d "$ROOT/supabase/migrations" ]]; then
  tar -czf "$OUT/migrations.tgz" -C "$ROOT" supabase/migrations
fi

echo "✅ Diagnostics ready at: $OUT"
