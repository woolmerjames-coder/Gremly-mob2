# Fix for "Invalid datetime" Error in Supabase Create

## Problem

The app is showing this error when trying to create a todo:

```json
{
  "code": "invalid_string",
  "validation": "datetime",
  "message": "Invalid datetime",
  "path": ["created_at"]
},
{
  "code": "invalid_string",
  "validation": "datetime",
  "message": "Invalid datetime",
  "path": ["updated_at"]
}
```

**Root Cause**: Your Supabase database tables have validation constraints or missing defaults on `created_at` and `updated_at` columns.

---

## Solution: Fix Database Schema

### Step 1: Run SQL Fix in Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `docs/supabase-schema-fix.sql`
5. Run the query

This will:
- Remove any CHECK constraints on timestamp fields
- Add proper defaults (`NOW()`) for `created_at` and `updated_at`
- Create triggers to auto-update `updated_at` on record changes
- Set UUID defaults for `id` columns

### Step 2: Verify Schema

After running the SQL, verify your table structure:

```sql
-- Check todos table structure
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'todos'
ORDER BY ordinal_position;
```

Expected output for timestamp columns:
```
created_at | timestamp with time zone | now() | NO
updated_at | timestamp with time zone | now() | NO
```

### Step 3: Test in App

1. Reload the app
2. Tap the floating "DEV" button
3. Sign in with your Supabase credentials
4. Tap "Create Test To-Do"
5. You should now see console logs:
   ```
   [SupabaseRepo] Creating todo with payload: {
     "title": "Phase 4 smoke",
     "body": "created from Dev Login",
     "undefined_due": true,
     "ai_placed": false,
     "space_id": null
   }
   ```
6. Success message: "✅ Todo created! ID: xxxxxxxx..."

---

## What the Code Fix Does

### Updated `lib/repo/supabase.ts`

**Before** (sent timestamps):
```typescript
const data = {
  title: input.title,
  created_at: nowIso(),  // ❌ Client-generated timestamp
  updated_at: nowIso(),  // ❌ Client-generated timestamp
  owner_id: userId,      // ❌ Should come from RLS
};
```

**After** (database defaults):
```typescript
const validated = todoInsertSchema.parse({
  title: input.title,
  body: input.body ?? null,
  undefined_due: input.undefined_due ?? true,
  ai_placed: input.ai_placed ?? false,
  space_id: input.space_id ?? null,
  // Excluded: id, owner_id, created_at, updated_at
});

// Strip undefined values
const payload = Object.fromEntries(
  Object.entries(validated).filter(([_, v]) => v !== undefined)
);
```

### Debug Logging Added

The code now logs in development mode:

**Before INSERT**:
```javascript
console.log('[SupabaseRepo] Creating todo with payload:', payload);
```

**On ERROR**:
```javascript
console.error('[SupabaseRepo] Error creating todo:', error);
console.error('[SupabaseRepo] Payload that failed:', payload);
```

---

## Alternative: If You Can't Modify Database

If you don't have permission to modify the database schema, you can work around this by making the timestamp fields nullable:

### Option A: Modify Table (Requires Admin)

```sql
ALTER TABLE todos ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE todos ALTER COLUMN updated_at DROP NOT NULL;
```

### Option B: Use Memory Backend

In `.env.local`:
```bash
EXPO_PUBLIC_REPO_BACKEND=memory  # Use in-memory storage instead
```

This bypasses Supabase entirely for development.

---

## Troubleshooting

### Still Getting "Invalid datetime" Error?

**Check 1: Verify database defaults exist**
```sql
SELECT column_name, column_default 
FROM information_schema.columns 
WHERE table_name = 'todos' 
AND column_name IN ('created_at', 'updated_at');
```

Expected output:
```
created_at | now()
updated_at | now()
```

**Check 2: Check for CHECK constraints**
```sql
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public';
```

If you see constraints on `created_at` or `updated_at`, drop them:
```sql
ALTER TABLE todos DROP CONSTRAINT constraint_name_here;
```

**Check 3: Verify RLS is configured**
```sql
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'todos';
```

You should have a policy like:
```sql
CREATE POLICY "Users can CRUD their own todos" ON todos
FOR ALL USING (auth.uid() = owner_id);
```

**Check 4: View console logs**

In the Metro Bundler terminal, look for:
```
[SupabaseRepo] Creating todo with payload: { ... }
```

If you see `created_at` or `updated_at` in the payload, the Insert schema isn't working correctly.

### App Crashed or Frozen?

1. Restart Metro bundler: Press `r` in terminal
2. Clear cache: `npx expo start --clear`
3. Check for TypeScript errors: `npm run typecheck`

---

## Testing Checklist

After applying the fix:

- [ ] SQL fix script ran successfully
- [ ] Database columns have `DEFAULT NOW()` for timestamps
- [ ] Triggers are created for `updated_at`
- [ ] App reloaded (press `r` in Metro terminal)
- [ ] Signed in via Dev Login screen
- [ ] "Create Test To-Do" button clicked
- [ ] Console shows payload without timestamps
- [ ] Success message appears
- [ ] `getById()` verification succeeds

---

## Summary

The error occurs because:
1. ❌ Client was sending `created_at`/`updated_at` (wrong format or value)
2. ❌ Database expected these fields but had no defaults
3. ❌ Validation failed on INSERT

The fix:
1. ✅ Client no longer sends timestamp fields
2. ✅ Database generates timestamps with `DEFAULT NOW()`
3. ✅ INSERT succeeds, database returns complete record
4. ✅ Debug logging helps identify issues

---

## Files Modified

1. `lib/repo/supabase.ts` - Strips undefined values, adds debug logging
2. `docs/supabase-schema-fix.sql` - SQL to fix database schema

**Next Step**: Run the SQL fix in your Supabase dashboard!
