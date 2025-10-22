# Schema Fix Summary

## What Was Done

### ✅ Code Changes Applied
1. **Added `stripNulls()` helper** in `lib/repo/supabase.ts`
   - Strips null/undefined values before insert to prevent schema cache errors
   - Applied to main create() method

2. **Enhanced error logging** in `lib/repo/supabase.ts`
   - Added detailed error logging for `countCompletedToday()` with code, details, hint

3. **Reverted accidental edits** to historical migrations:
   - `20250123000005_phase7_people_extras.sql` ✅ 
   - `20251020032701_phase8_tags_and_map.sql` ✅

4. **Created new patch migrations**:
   - `20251021_add_due_time_to_todos.sql` ✅ (already existed)
   - `20251021_fix_people_backfill.sql` ✅ (created)
   - `20251021_fix_tags_user_id_and_policies.sql` ✅ (created)

## ⚠️ Action Required: Manual Schema Patch

Because the old migrations fail when `user_id` doesn't exist yet, **you need to apply the patches manually first**.

### Steps to Complete:

1. **Open Supabase SQL Editor** (dashboard → SQL Editor → New query)

2. **Copy and paste** the entire contents of:
   ```
   supabase/diagnostics/apply_patches_manually.sql
   ```

3. **Click "Run"** - this will:
   - Add `due_time` column to `todos`
   - Add `display_name` to `people` and backfill from `name`
   - Add `user_id` to `tags` and `tag_map`
   - Create RLS policies
   - Refresh PostgREST schema cache
   - Verify all columns exist

4. **Check the verification result** - should show all TRUE:
   - ✅ todos_has_due_time
   - ✅ tags_has_user_id  
   - ✅ tagmap_has_user_id
   - ✅ people_has_display_name

5. **Reload the app**:
   ```bash
   npm start
   ```

6. **Test "Let Gremly Decide" flow**:
   - Create a quick note
   - Should save successfully without `due_time` or `fmt` errors

## Expected Logs After Fix

```
✅ [Supabase Client] URL (last 10 chars): upabase.co
✅ [Supabase Client] Repo Backend: supabase
✅ [RepoProvider] Backend: supabase
✅ [RepoProvider] User ID: <your-uuid>
✅ [AuthProvider] session user.id: <your-uuid>
```

**No more warnings:**
- ❌ "Tags not available"
- ❌ "Could not find the 'due_time' column"
- ❌ "Could not find the 'fmt' column"

## If You Still See Errors

Check the detailed error output from `countCompletedToday()`:
```
[SupabaseRepo.countCompletedToday] todos count error {
  code: "...",
  details: "...",
  hint: "...",
  message: "..."
}
```

Share this output and we can patch the specific issue.

## Files Modified

- ✅ `lib/repo/supabase.ts` - Added stripNulls(), enhanced error logging
- ✅ `supabase/migrations/20251021_fix_people_backfill.sql` - Created
- ✅ `supabase/migrations/20251021_fix_tags_user_id_and_policies.sql` - Created  
- ✅ `supabase/diagnostics/apply_patches_manually.sql` - Created for manual application

## Next Steps

After applying the manual patch:
1. Restart app
2. Test AI classification flow
3. Verify no schema errors
4. Share any remaining error logs

The app should now work correctly with Supabase! 🎉
