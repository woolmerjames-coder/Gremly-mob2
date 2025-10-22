# Supabase Surgical Fix - Quick Start

## ✅ All Changes Applied

All code changes have been implemented. TypeScript may show stale errors - restart your IDE/TypeScript server.

## 🚀 Next Steps

### 1. Apply RLS Migration

**Option A: SQL Editor (Recommended)**
```bash
# 1. Open: https://supabase.com/dashboard/project/pvfnnpcfmgczlcglvlzl/editor
# 2. Copy contents of: supabase/migrations/20251021_rls_core_policy.sql
# 3. Paste and run in SQL Editor
# 4. Run: NOTIFY pgrst, 'reload schema';
```

**Option B: CLI (if connection works)**
```bash
supabase db push
```

### 2. Test the App

```bash
# Clear cache and restart
npx expo start -c
```

### 3. Run Smoke Tests

1. Open DevLogin screen (debug button)
2. Click "Run Smoke Test" → should see "DB OK"
3. Click "Create Test Todo" → should create successfully

### 4. Generate Diagnostics (Optional)

```bash
# Set environment variables
export SUPABASE_PROJECT_REF="pvfnnpcfmgczlcglvlzl"
export SUPABASE_DB_URL_RO="postgres://user:pass@db.pvfnnpcfmgczlcglvlzl.supabase.co:5432/postgres"

# Run diagnostics
npm run diag:supa
```

## 📋 What Was Changed

### Code
- ✅ `lib/repo/supabase.ts` - User ID attachment + error logging
- ✅ `lib/supabase/client.ts` - Health check on init
- ✅ `providers/AuthProvider.tsx` - Enhanced error handling
- ✅ `app/(dev)/DevLogin.tsx` - Smoke test button

### Migrations
- ✅ `supabase/migrations/20251021_rls_core_policy.sql` - RLS policies

### Scripts
- ✅ `scripts/generate_supabase_diagnostics.sh` - Diagnostics tool
- ✅ `package.json` - Added `diag:supa` command

## 🔍 Expected Console Output

```
[Supabase Client] Initializing...
[Supabase Client] URL: ✅ Set
[Supabase Client] session? true user? 64f359d1-...
[RepoProvider] Backend: supabase
[RepoProvider] User ID: 64f359d1-...
[RepoProvider] ✅ Using SupabaseRepo
```

## ❓ Troubleshooting

**TypeScript errors?**
- Restart TypeScript server in IDE
- Run `npx tsc --noEmit` to verify
- Errors should clear after IDE restart

**Smoke test fails?**
- Check RLS migration was applied
- Verify user is signed in (check console for user ID)
- Check Supabase dashboard for RLS policies

**Create fails?**
- Check console for detailed error (code, message, details, hint)
- Verify `user_id` column exists on table
- Check RLS policies allow INSERT

## 📚 Documentation

- Full implementation details: `SUPABASE_SURGICAL_FIX_SUMMARY.md`
- Diagnostics script usage: Run `scripts/generate_supabase_diagnostics.sh --help`
- Previous migration notes: `MANUAL_MIGRATION_INSTRUCTIONS.md`

## 🎯 Success Criteria

- [ ] App starts without crash
- [ ] User ID logged on auth
- [ ] Smoke test shows "DB OK"
- [ ] Can create test todo
- [ ] Console shows detailed logs
- [ ] No schema cache errors

All set! Apply the RLS migration and test. 🚀
