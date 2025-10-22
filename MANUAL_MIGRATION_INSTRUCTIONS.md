# Database Migration Instructions

The automated migration push via CLI is experiencing network connectivity issues. Please run these migrations manually through the **Supabase SQL Editor** instead.

## Instructions

1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/pvfnnpcfmgczlcglvlzl/editor
2. Navigate to the SQL Editor
3. Run each migration below **in order**

---

## Migration 1: UUID Extension
**File:** `20251015000000_ensure_uuid_extension.sql`

```sql
-- Ensure UUID Extension
create extension if not exists "uuid-ossp";
```

---

## Migration 2: UUID Compatibility Function
**File:** `20251015000001_uuid_compatibility.sql`

```sql
-- UUID Function Compatibility
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public' and p.proname = 'uuid_generate_v4'
  ) then
    create or replace function public.uuid_generate_v4()
    returns uuid as $func$
      select gen_random_uuid();
    $func$ language sql;
    raise notice 'Created uuid_generate_v4 as alias for gen_random_uuid';
  end if;
end $$;
```

---

## Migration 3: Fix Entity People Columns
**File:** `20251020000000_fix_entity_people_columns.sql`

Run the contents of this file (it's quite long, so copy from the file in your workspace)

---

## Migration 4: Reconcile All Tables (MAIN MIGRATION)
**File:** `20251022_reconcile_all.sql`

This is the comprehensive migration that adds all missing columns. Copy the entire contents from the file in your workspace.

Key changes it makes:
- Adds `name`, `title`, `why_string`, `origin`, `subtype`, `completed_at` to todos
- Adds `name`, `title`, `why_string`, `origin`, `subtype`, `completed_at` to habits  
- Adds all missing columns to notes
- Adds tags and tag_map columns and RLS policies
- Backfills empty names/titles with 'Untitled'
- Sets NOT NULL constraints gently

---

## Migration 5: Schema Doctor (VALIDATION)
**File:** `20251022_schema_doctor.sql`

This validates that all expected columns exist. Copy from the file in your workspace.

It will raise notices if anything is missing but won't fail the run.

---

## After Running Migrations

1. **Refresh PostgREST cache:**
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```

2. **Restart your Expo app:**
   ```bash
   echo "r" | nc -U ~/.expo/metro.sock
   ```

3. **Test the app** - Hub screen should now load without errors

---

## Quick Copy-Paste Version

If you want to run everything at once, you can combine the key migrations:

```sql
-- 1. UUID setup
create extension if not exists "uuid-ossp";

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public' and p.proname = 'uuid_generate_v4'
  ) then
    create or replace function public.uuid_generate_v4()
    returns uuid as $func$
      select gen_random_uuid();
    $func$ language sql;
  end if;
end $$;

-- 2. Then run the contents of 20251022_reconcile_all.sql
-- 3. Then run the contents of 20251022_schema_doctor.sql
-- 4. Finally:
NOTIFY pgrst, 'reload schema';
```

---

## Files Created

All migration files are ready in `supabase/migrations/`:
- ✅ `20251015000000_ensure_uuid_extension.sql`
- ✅ `20251015000001_uuid_compatibility.sql`
- ✅ `20251019000000_pre_phase8_tag_setup.sql`
- ✅ `20251019000001_pre_phase8_entity_people_setup.sql`
- ✅ `20251020000000_fix_entity_people_columns.sql`
- ✅ `20251022000000_fix_tag_map_columns.sql`
- ✅ `20251022_reconcile_all.sql` ← **MAIN ONE**
- ✅ `20251022_schema_doctor.sql` ← **VALIDATOR**

## Why Manual?

The Supabase CLI is experiencing network connectivity issues:
```
dial tcp connection refused
```

Running via SQL Editor bypasses the CLI connection pooler and connects directly to your database.
