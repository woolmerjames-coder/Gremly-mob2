# Supabase Maintenance Notes

<!-- Remote migration context -->
- Remote production database already registers migration versions `20251022`, `20251030`, and `20251109`. Do **not** attempt to reapply these locally removed placeholder files.

<!-- Next steps once CLI connectivity is stable -->
1. `supabase db pull`
2. `supabase migration repair --status applied 20251022 20251030 20251109`
3. `supabase db push`

These steps will align the local migrations directory with the remote schema before introducing new changes.
