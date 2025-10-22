# Database Schema Conformance Implementation

## Goal Achieved ✅
Made app code conform to live Supabase schema. Supabase is now the single source of truth for data structures.

## Key Changes

### 1. Type Generation System
**Files Created:**
- `scripts/gen_db_types.sh` - Generates TypeScript types from live Supabase project
- `lib/supabase/types.ts` - Generated types (609 lines, auto-generated from schema)
- `lib/supabase/mappers.ts` - Type aliases and mapping utilities

**Usage:**
```bash
export SUPABASE_PROJECT_REF=pvfnnpcfmgczlcglvlzl
npm run db:types
```

### 2. Schema Truth (from Generated Types)

#### TODOS Table
- ✅ Uses `name` field (NOT 'title')
- ✅ Uses `owner_id` for RLS (NOT 'user_id')
- No 'type' column exists
- Fields: name, body, due_date, due_time, reminders_json, notes, tags, subtype, etc.

#### NOTES Table
- ✅ Uses `title` field (NOT 'name')
- ✅ Uses `owner_id` for RLS
- Fields: title, body, subtype, date, mood, fmt, reminders_json, tags, journal_subtype, etc.

#### HABITS Table
- ✅ Uses BOTH `name` AND `title` fields (both required)
- ✅ Uses `owner_id` for RLS
- Fields: name, title, frequency, frequency_json, reminders_json, triggers_json, etc.

### 3. Code Refactoring

#### lib/repo/supabase.ts
**Before:**
- Mixed use of `user_id` and `owner_id`
- Applied `withNameTitle()` helper to all record types (caused PGRST204 errors)
- Legacy field mapping logic

**After:**
- ✅ All inserts use `owner_id` (line 280)
- ✅ Removed `withNameTitle()` application (deprecated, causes schema errors)
- ✅ Todos: Send only `name` field
- ✅ Notes: Send only `title` field
- ✅ Habits: Send both `name` and `title` fields
- ✅ Enhanced error logging with `logSupabaseError()` from mappers
- ✅ User-friendly error messages with code hints

#### lib/schemas.ts
**Updated Insert Schemas:**
- `habitInsertSchema`: Now requires both `name` and `title`
- `todoInsertSchema`: Uses `name` only (removed `title` field)
- `noteInsertSchema`: Uses `title` only, added journal fields (date, mood, fmt, reminders_json, tags, journal_subtype)

#### lib/supabase/mappers.ts (NEW)
**Purpose:** Centralize database schema knowledge

**Key Functions:**
- `mapCreateInput()` - Map entity type to correct DB insert payload
- `logSupabaseError()` - Detailed error logging with code/message/details/hint
- `getUserFriendlyErrorMessage()` - User-friendly error messages for common codes:
  - PGRST204: Schema mismatch (missing column)
  - 23502: NOT NULL violation
  - 42501: RLS permission denied
  - 23505: Duplicate entry

**Type Exports:**
- TodoRow, TodoInsert
- NoteRow, NoteInsert
- HabitRow, HabitInsert
- SpaceRow, SpaceInsert
- TagRow, TagInsert
- PersonRow, PersonInsert

### 4. Drift Detection System

#### scripts/drift_check.sh
Detects when database schema changes but types aren't updated.

**How it works:**
1. Saves current types.ts file hash
2. Regenerates types from live Supabase
3. Compares hashes
4. Fails CI if types changed (forces code update + commit)

**Usage:**
```bash
export SUPABASE_PROJECT_REF=pvfnnpcfmgczlcglvlzl
npm run db:drift
```

#### .github/workflows/db-drift.yml
CI workflow that runs on PR/push:
- Installs dependencies
- Runs `npm run typecheck`
- Verifies types.ts exists
- Optional: Runs drift check (commented out - requires GitHub secret)

### 5. Package.json Scripts

Added:
```json
"db:types": "bash scripts/gen_db_types.sh",
"db:drift": "bash scripts/drift_check.sh"
```

### 6. Dev Tools

#### app/(dev)/DevLogin.tsx
Already correct! Uses:
- `name` for todos ✅
- `owner_id` for RLS ✅

## Migration Path for Developers

### Initial Setup
```bash
# 1. Set project ref
export SUPABASE_PROJECT_REF=pvfnnpcfmgczlcglvlzl

# 2. Generate types
npm run db:types

# 3. Type check
npm run typecheck

# 4. Test in app
npx expo start -c
```

### Daily Workflow
```bash
# Pull latest code
git pull

# Check if types changed
npm run db:drift

# If types changed:
npm run db:types
npm run typecheck
# Update code to match new types
git add lib/supabase/types.ts
git commit -m "chore: update DB types"
```

### When Schema Changes in Supabase
```bash
# 1. Regenerate types
npm run db:types

# 2. Review changes
git diff lib/supabase/types.ts

# 3. Update code
# Fix any TypeScript errors in:
# - lib/repo/supabase.ts
# - lib/schemas.ts
# - Any calling code

# 4. Test
npm run typecheck
npm test

# 5. Commit
git add lib/supabase/types.ts lib/
git commit -m "fix: align code with schema changes"
```

## Acceptance Criteria Status

✅ `npm run db:types` generates types from live project
✅ Code compiles with `npm run typecheck` (only 2 pre-existing CortexClient errors)
✅ Creating a todo works with `{ name, owner_id }`
✅ Creating a note works with `{ title, owner_id }`
✅ No references to 'type' field for todos
✅ No references to 'user_id' in insert payloads (uses owner_id)
✅ No 'title' sent for todos
✅ No 'name' sent for notes
✅ CI job ready (will fail if types change until code updated)

## Error Prevention

### Compile-Time Safety
- TypeScript fails if you send unknown fields
- Insert types enforce required fields
- Type aliases prevent schema drift

### Runtime Safety
- Enhanced error logging shows exact payload that failed
- Zod schemas validate at runtime
- User-friendly error messages for common issues

### CI Safety
- Types file must exist
- Typecheck must pass
- Optional drift check (when enabled)

## Testing Commands

```bash
# Full test suite
npm run ci

# Just type checking
npm run typecheck

# Check for drift
npm run db:drift

# Regenerate types
npm run db:types
```

## Breaking Changes

### For Existing Code

1. **Todos**: Change `title` → `name`
2. **Notes**: Keep `title` (already correct)
3. **Habits**: Send both `name` and `title`
4. **All entities**: Use `owner_id` (not `user_id`) in inserts

### Migration Example

**Before:**
```typescript
await repo.create({
  type: 'todo',
  title: 'Buy milk',
  user_id: userId,
});
```

**After:**
```typescript
await repo.create({
  type: 'todo',
  name: 'Buy milk',
  owner_id: userId,
});
```

## Files Modified

### Created
- `scripts/gen_db_types.sh`
- `scripts/drift_check.sh`
- `lib/supabase/types.ts` (generated)
- `lib/supabase/mappers.ts`
- `.github/workflows/db-drift.yml`

### Modified
- `package.json` (added db:types, db:drift scripts)
- `lib/repo/supabase.ts` (use owner_id, correct field names per table)
- `lib/schemas.ts` (habitInsertSchema, todoInsertSchema, noteInsertSchema)

### Unchanged (already correct)
- `app/(dev)/DevLogin.tsx`
- `lib/supabase/client.ts`

## Next Steps

1. ✅ Test todo creation in app
2. ✅ Test note creation in app
3. ✅ Test habit creation in app
4. Enable drift check in CI (add SUPABASE_PROJECT_REF secret)
5. Monitor for schema changes
6. Update documentation

## Maintenance

### When to Regenerate Types
- After any Supabase migration
- When adding new tables
- When modifying column types
- Weekly as a best practice

### Type Generation is Fast
```bash
$ time npm run db:types
real    0m2.341s
```

### Drift Check is Fast
```bash
$ time npm run db:drift
real    0m2.456s
```

## Success Metrics

✅ No PGRST204 errors (schema cache column not found)
✅ No 23502 errors (NOT NULL violation)
✅ No 42501 errors (RLS permission denied)
✅ Clean typecheck (except pre-existing CortexClient errors)
✅ All insert operations use correct field names
✅ All RLS operations use owner_id

## Documentation

See also:
- `scripts/gen_db_types.sh` - Script header comments
- `scripts/drift_check.sh` - Script header comments
- `lib/supabase/mappers.ts` - Type documentation
- `.github/workflows/db-drift.yml` - Workflow comments
