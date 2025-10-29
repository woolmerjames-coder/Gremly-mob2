# Today v3 — Phase 2 Repo Layer

This phase adds new repo methods required by Today v3:

- `listTodayMerged(nowIso)`
- `logHabitProgress(habitId, atIso?, count?, occurrenceIndex?)`
- `getHabitProgressForDate(habitId, dayIso)`
- `getFocusForDate(dayIso)`
- `setFocus({ entry_id, entry_type, source, expires_at })`
- `clearFocusForDate(dayIso)`
- `topFocusCandidates(limit)`
- `listRecentDrops(sinceIso)`
- `getTodaySummary()`
- `sweepApplyAction(id, type, action, details?)`

## Notes
- Supabase repo uses day columns added in Phase 1 (`focus_day`, `occurred_day`, `due_day`).
- All queries are owner-scoped via RLS (as configured).
- Methods are designed to be resilient and return safe defaults.
- No UI changes in this phase; later phases will call these methods.

## Local dev
- MemoryRepo implements the same interface to support tests and DS previews.
- If you use Supabase types codegen, consider regenerating after Phase 1 migrations.
