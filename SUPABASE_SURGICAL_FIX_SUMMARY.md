# Supabase Surgical Fix & Verify - Implementation Summary

## ✅ Changes Completed

### 0) Working Diagnostics Script

**Created:** `scripts/generate_supabase_diagnostics.sh`
- ✅ Uses required environment variables: `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL_RO`
- ✅ Collects CLI version, projects list, status
- ✅ Generates TypeScript types
- ✅ Dumps schema (DDL only, no data)
- ✅ Extracts metadata (policies, RLS flags, grants, fkeys, extensions)
- ✅ Sanitizes environment variables (redacts values)
- ✅ Archives migrations
- ✅ Executable and ready to run

**Added to package.json:**
```json
"diag:supa": "bash scripts/generate_supabase_diagnostics.sh"
```

---

### 1) User ID Attachment & Error Logging

**Updated:** `lib/repo/supabase.ts`

**Added helper function:**
```typescript
function logSbError(ctx: string, error: any) {
  if (!error) return;
  console.error(`[SupabaseRepo] ${ctx} error`, {
    message: error.message ?? String(error),
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}
```

**Changes to all write operations:**
- ✅ **`create()` method**: Attaches `user_id: this.ensureUserId()` to payload
- ✅ **`update()` method**: Uses `logSbError()` for detailed error logging
- ✅ **`remove()` method**: Uses `logSbError()` for detailed error logging
- ✅ **`createSpace()`**: Attaches `user_id` and uses `logSbError()`
- ✅ **`createPerson()`**: Attaches `user_id` and uses `logSbError()`

All errors now bubble up with clear context including code, message, details, and hint.

---

**Updated:** `providers/AuthProvider.tsx`
- ✅ Enhanced anonymous sign-in error handling
- ✅ Ensures both `setUser(anonData.user)` and `setSession(anonData.session)` are called
- ✅ Logs user ID after successful sign-in
- ✅ Shows critical error message in dev if anonymous sign-in fails

---

**Updated:** `lib/supabase/client.ts`
- ✅ Added health check on init (dev only):
  ```typescript
  supabase.auth.getSession().then(({ data }) => {
    console.log('[Supabase Client] session?', !!data.session, 'user?', data.session?.user?.id);
  });
  ```

---

**Updated:** `providers/RepoProvider.tsx`
- ✅ Already had dev logging for backend and userId
- No changes needed (already optimal)

---

### 2) RLS Policies for Core Tables

**Created:** `supabase/migrations/20251021_rls_core_policy.sql`

**Enables RLS on:**
- todos
- habits
- notes
- spaces
- tags
- tag_map
- people
- entity_people

**Policies created (idempotent):**
- `*_sel_own` - SELECT where `user_id = auth.uid()`
- `*_ins_own` - INSERT with check `user_id = auth.uid()`
- `*_upd_own` - UPDATE where `user_id = auth.uid()`
- `*_del_own` - DELETE where `user_id = auth.uid()`

**Performance indexes:**
- `idx_todos_user_due` on `(user_id, due_at)`
- `idx_habits_user_updated` on `(user_id, updated_at)`

All policies use a helper function `__ensure_policy()` for idempotency (dropped at end of migration).

---

### 3) Supabase Smoke Test in DevLogin

**Updated:** `app/(dev)/DevLogin.tsx`

**Added:**
- ✅ Import for `supabase` client
- ✅ `handleSmokeTest()` function that:
  - Runs `supabase.from('todos').select('id').limit(1)`
  - Shows Alert with DB OK or error details
  - Logs error with code and message
  - Updates test result display

**UI changes:**
- ✅ Added "Run Smoke Test" button (outline variant)
- ✅ Reorganized card with two sections:
  1. Direct DB connection test (smoke test)
  2. Full repo layer test (create test todo)
- ✅ Shared `testResult` display shows both test outcomes

---

## 📋 How to Apply

### Step 1: Apply RLS Migration

```bash
# Option A: Via CLI (if connection works)
supabase db push

# Option B: Via SQL Editor (recommended due to previous connection issues)
# 1. Open Supabase Dashboard SQL Editor
# 2. Copy contents of supabase/migrations/20251021_rls_core_policy.sql
# 3. Run the migration
# 4. Run: NOTIFY pgrst, 'reload schema';
```

### Step 2: Rebuild and Run

```bash
npx expo start -c
```

### Step 3: Test in DevLogin

1. Open app
2. Navigate to DevLogin screen (via debug button)
3. Click "Run Smoke Test" - should see "DB OK"
4. Click "Create Test Todo" - should create successfully
5. Check console logs for detailed output

### Step 4: Generate Diagnostics

```bash
# Set required environment variables
export SUPABASE_PROJECT_REF="pvfnnpcfmgczlcglvlzl"
export SUPABASE_DB_URL_RO="postgres://readonly_user:***@db.pvfnnpcfmgczlcglvlzl.supabase.co:5432/postgres"

# Run diagnostics
npm run diag:supa

# Output will be in supa_diag/ folder
```

**Note:** For readonly user, create one if needed:
```sql
create role app_readonly login password 'your_secure_password';
grant usage on schema public to app_readonly;
grant select on all tables in schema public to app_readonly;
alter default privileges in schema public grant select on tables to app_readonly;
```

---

## 🔍 Verification Checklist

After applying changes:

- [ ] App starts without errors
- [ ] Anonymous sign-in works (check logs for user ID)
- [ ] DevLogin smoke test shows "DB OK"
- [ ] Can create test todo via DevLogin
- [ ] Console shows detailed error logs if any failures
- [ ] RLS policies prevent cross-user data access
- [ ] Diagnostics script runs successfully
- [ ] All write operations attach user_id automatically

---

## 🎯 Expected Behavior

### Successful Flow

1. **App Start:**
   ```
   [Supabase Client] Initializing...
   [Supabase Client] URL: ✅ Set
   [Supabase Client] session? true user? 64f359d1-aea5-4d4d-bdc3-2baa4c314bc6
   [RepoProvider] Backend: supabase
   [RepoProvider] User ID: 64f359d1-aea5-4d4d-bdc3-2baa4c314bc6
   [RepoProvider] ✅ Using SupabaseRepo
   ```

2. **Smoke Test:**
   ```
   [DevLogin SmokeTest] Query successful
   Alert: "DB OK - rows: 5"
   ```

3. **Create Todo:**
   ```
   [SupabaseRepo.create] Using todoInsertSchema
   [SupabaseRepo.create] Raw result from DB: {...}
   ✅ Created todo: abc-123-def
   ```

### Error Flow

If RLS policy blocks access:
```
[SupabaseRepo] todos.insert error {
  message: "new row violates row-level security policy for table \"todos\"",
  code: "42501",
  details: null,
  hint: null
}
```

If column missing:
```
[SupabaseRepo] notes.insert error {
  message: "Could not find the 'name' column of 'notes' in the schema cache",
  code: "PGRST204",
  details: null,
  hint: null
}
```

---

## 📁 Files Modified

### Created
- ✅ `scripts/generate_supabase_diagnostics.sh`
- ✅ `supabase/migrations/20251021_rls_core_policy.sql`

### Modified
- ✅ `lib/repo/supabase.ts` - Added logSbError, user_id attachment
- ✅ `lib/supabase/client.ts` - Added health check
- ✅ `providers/AuthProvider.tsx` - Enhanced error handling
- ✅ `app/(dev)/DevLogin.tsx` - Added smoke test
- ✅ `package.json` - Added diag:supa script

### Not Modified (already optimal)
- ✅ `providers/RepoProvider.tsx` - Already has dev logging

---

## 🚨 Important Notes

1. **User ID Column:**
   - All tables must have `user_id uuid` column
   - If a table uses `owner_id` instead, either:
     - Add computed column: `user_id uuid generated always as (owner_id) stored`
     - Or update RLS policies to use `owner_id = auth.uid()`

2. **Testing:**
   - Always test in dev build first
   - Check console logs for detailed error messages
   - Use smoke test to verify DB connection before creating data

3. **Diagnostics:**
   - Requires readonly database user for security
   - Never commit database URLs to git
   - Use .env.local for credentials

4. **Performance:**
   - RLS policies add overhead - monitor query times
   - Indexes created for common queries (user_id + date fields)
   - Consider connection pooling for production

---

## 🎉 Summary

All requested changes implemented:
- ✅ Working diagnostics script with real DB connection
- ✅ User ID automatically attached to all writes
- ✅ Clear error logging with code/message/details/hint
- ✅ RLS policies protecting all core tables
- ✅ Smoke test in DevLogin for quick verification
- ✅ Health check on Supabase client init
- ✅ Enhanced error handling in auth flow

Ready to apply and test! 🚀
