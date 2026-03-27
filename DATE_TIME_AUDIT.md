# Date/Time Best Practice Audit

**Audit Date:** 2026-03-26
**Scope:** Entire codebase (React Native app, Cloudflare Workers, Inngest functions, Supabase edge functions, utility files)
**Exclusions:** `node_modules/`, `gremly-handoff-jan26/` (legacy reference), `date-audit/` (old audit), test files (noted but not counted as violations)

---

## 1. Stats

| Metric | Count |
|--------|-------|
| Total date/time touchpoints (non-test, non-legacy) | ~350+ |
| **Total violations** | **~85** |
| CRITICAL | 28 |
| HIGH | 32 |
| MEDIUM (LOW) | 25 |

### Violations by Rule

| Rule | Description | Violations |
|------|-------------|------------|
| Rule 1 | Single source of truth for "now" | ~45 |
| Rule 2 | Single date library | 0 (PASS) |
| Rule 3 | UTC for storage, local for display | 12 |
| Rule 4 | Explicit timezone conversion | 2 |
| Rule 5 | Day boundary logic centralized | 6 |
| Rule 6 | No ambiguous date comparisons | 14 |
| Rule 7 | Server scheduling respects timezone | 0 (PASS) |
| Rule 8 | No implicit timezone assumptions | 6 |

---

## 2. Violation Inventory (by Rule, sorted by Severity)

### Rule 1: Single source of truth for "now"

Raw `new Date()` or `Date.now()` used in feature code instead of `DateService.now()` / `dateService.today()` / `dateService.nowTimestamp()`.

#### CRITICAL

| # | File | Line(s) | Snippet | Why |
|---|------|---------|---------|-----|
| 1 | `app/features/streaks/streakService.ts` | 35-36 | `const today = format(startOfDay(new Date()), 'yyyy-MM-dd')` | Gets "today" via raw Date + date-fns instead of `dateService.today()`. Streak logic will be wrong across day boundary. |
| 2 | `app/features/streaks/useStreak.ts` | 26 | `format(subDays(startOfDay(new Date()), lookbackDays), 'yyyy-MM-dd')` | Same pattern — raw Date for streak lookback window. |
| 3 | `app/tabs/TodayV4LanesView.tsx` | 84 | `format(new Date(), 'EEEE, MMMM do')` | Today's date header via raw Date + date-fns. |
| 4 | `hooks/useTimezoneSync.ts` | 31, 45 | `new Date().toISOString()` | DB timestamp for `updated_at` and `last_app_active_at`. Should use `dateService.nowTimestamp()`. |
| 5 | `hooks/useEntityMutations.ts` | 339 | `archived_at: new Date().toISOString()` | Archival timestamp bypasses DateService. |
| 6 | `hooks/useChatMessages.ts` | 244-245 | `created_at: new Date().toISOString()` | Chat message timestamps. |
| 7 | `hooks/useJournalAnalysis.ts` | 177 | `const now = new Date().toISOString()` | Cache timestamp. |
| 8 | `hooks/useNotificationPreferences.ts` | 62, 229 | `new Date()` / `new Date().toISOString()` | Notification pref timestamps & date construction. |
| 9 | `hooks/useSpaceChatEnhanced.ts` | 355, 396 | `detectedAt: new Date().toISOString()` | Saveable type detection timestamps. |
| 10 | `hooks/useMetaIntentHandler.ts` | 312, 362, 443 | `detectedAt: new Date().toISOString()` | Intent detection timestamps. |
| 11 | `src/lib/chat/saveableTypes.ts` | 387 | `detectedAt: new Date().toISOString()` | Saveable type detection timestamp. |
| 12 | `src/utils/notifications.ts` | 100 | `updated_at: new Date().toISOString()` | Push token tracking timestamp. |
| 13 | `lib/weeklySummary/generateWeeklySummary.ts` | 96 | `generated_at: new Date().toISOString()` | Summary generation timestamp. |
| 14 | `providers/AuthProvider.tsx` | 331, 362 | `created_at: new Date().toISOString()` | Auth mock/fallback data. |
| 15 | `src/lib/formatters/itemDisplayHelpers.ts` | 54 | `const now = new Date()` | Business logic date comparison for display helpers. |

#### HIGH

| # | File | Line(s) | Snippet | Why |
|---|------|---------|---------|-----|
| 16 | `app/tabs/TodayScreen.tsx` | 84, 168, 172 | `new Date().getHours()` | Hour-based evening teaser logic. Should use `dateService.getHour()`. |
| 17 | `app/today/CommitmentsSection.tsx` | 26 | `const now = new Date()` | Time diff calculation. |
| 18 | `app/components/morning-brief/MorningBriefSheet.tsx` | 1165, 1385 | `new Date()` / `new Date().toISOString()` | Reminder time calc and archival timestamp. |
| 19 | `src/hooks/useActionToast.tsx` | 121, 126 | `const now = new Date()` | Day name calculation for toast messages. |
| 20 | `src/components/habits/BreakHabitDetail.tsx` | 169, 212, 223, 305, 648 | `new Date()` (5 uses) | Habit UI: year comparison, date picker init, minimum date. |
| 21 | `src/components/habits/BuildHabitDetail.tsx` | 137, 157 | `new Date()` | Same habit UI pattern. |
| 22 | `App.tsx` | 343, 425, 588 | `Date.now()` / `new Date(Date.now() + ...)` | Snooze reminder time calculations. |

#### LOW (dev/utility files)

| # | File | Line(s) | Snippet | Why |
|---|------|---------|---------|-----|
| 23 | `app/dev/HubDSPlayground.tsx` | 21 | `new Date().toISOString()` | Dev playground mock data. |
| 24 | `app/dev/TodayDSPlayground.tsx` | 20-53 | `new Date().toISOString()` (5 uses) | Dev playground mock data. |

---

### Rule 2: Single date library — **PASS**

The codebase uses **one library consistently**: `date-fns` (45+ files).

No imports found for: moment, dayjs, luxon, date-fns-tz.

`Intl.DateTimeFormat` is used alongside date-fns for timezone-aware formatting in workers and utilities — this is complementary, not a competing library.

---

### Rule 3: UTC for storage/transport, local for display

#### CRITICAL

| # | File | Line | Snippet | Why |
|---|------|------|---------|-----|
| 1 | `scripts/dev/check-sweep-discrepancy.ts` | 60 | `new Date().toISOString().split('T')[0]` | Classic timezone bug: gets UTC date, not local date. At 8pm PST this returns tomorrow. |

#### HIGH (inconsistent display formatting)

| # | File | Line | Snippet | Why |
|---|------|------|---------|-----|
| 2 | `app/people/PersonDetailScreen.tsx` | 181 | `new Date(item.updated_at).toLocaleDateString()` | Relies on device locale for display instead of DateService formatting. |
| 3 | `app/spaces/SpaceHomeScreen.tsx` | 167, 185, 2953 | `date.toLocaleDateString()` (3 uses) | Ad-hoc locale-dependent display formatting. |
| 4 | `components/spaces/CompletedInSpaceOverlay.tsx` | 84 | `date.toLocaleDateString()` | Same pattern. |
| 5 | `app/screens/CatchAllNotepad.tsx` | 2096 | `d.toLocaleDateString()` | Relative date fallback formatting. |
| 6 | `app/components/minddrop/AnimatedDropCard.tsx` | 148 | `d.toLocaleDateString()` | Same pattern. |
| 7 | `app/screens/SweepTestScreen.tsx` | 291, 459 | `date.toLocaleString()` | Timestamp display in test screen. |
| 8 | `app/dev/HubDSPlayground.tsx` | 120 | `new Date(item.updated_at).toLocaleDateString()` | Dev file display. |
| 9 | `app/dev/TodayDSPlayground.tsx` | 89 | `new Date(todo.due_date).toLocaleDateString()` | Dev file display. |

> **Note:** None of the `toLocaleDateString()` calls are sending local time to Supabase — they're all for display. The violation is inconsistency with the DateService formatting pattern, not data corruption.

---

### Rule 4: Explicit timezone conversion at boundaries

#### HIGH

| # | File | Line | Snippet | Why |
|---|------|------|---------|-----|
| 1 | `components/overlay/dueUtils.ts` | 19 | `const offset = -date.getTimezoneOffset()` | Ad-hoc `toIsoLocal()` function manually constructs ISO with timezone offset. Should use DateService. |
| 2 | `lib/cortex/entities/datetime.ts` | 47 | `const tz = -d.getTimezoneOffset()` | Same `toIsoLocal()` pattern — duplicate ad-hoc timezone math. |

---

### Rule 5: Day boundary logic centralized

#### HIGH

| # | File | Line(s) | Snippet | Why |
|---|------|---------|---------|-----|
| 1 | `app/spaces/SpaceHomeScreen.tsx` | 2988-2990 | `d.getFullYear() === today.getFullYear() && d.getMonth() === ...` | Manual "is same day" comparison. Should use `dateService.isToday()`. |
| 2 | `app/spaces/SpaceHomeScreen.tsx` | 3028-3031 | `const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && ...` | Creates local `isSameDay` helper duplicating DateService. |
| 3 | `app/spaces/SpaceHomeScreen.tsx` | 3034 | Manual `${d.getFullYear()}-${...getMonth()...}-${...getDate()...}` | Manual date string construction — duplicates `dateService.toLocalDate()`. |
| 4 | `app/utils/recurrence.ts` | 76-79 | `getTodayISO()` function: `now.getFullYear()` + manual padding | Creates local `getTodayISO()` instead of using `dateService.today()`. |
| 5 | `app/screens/CatchAllNotepad.tsx` | 822 | `new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)` | Manual midnight normalization for `startOfTodayLocal()`. |
| 6 | `app/spaces/SpaceHomeScreen.tsx` | 179-180 | `new Date(now.getFullYear(), now.getMonth(), now.getDate())` | Manual midnight normalization for due date comparison. |

---

### Rule 6: No ambiguous date comparisons

#### MEDIUM

| # | File | Line(s) | Count | Why |
|---|------|---------|-------|-----|
| 1 | `components/overlay/UnifiedOverlayV2.tsx` | 8372, 8378, 8408, 8415 | 4 | `selectedDate.toDateString() === new Date().toDateString()` — uses `.toDateString()` for comparison instead of normalizing to YYYY-MM-DD. |
| 2 | `components/sweep/SweepCardNew.tsx` | 667, 682, 700, 715 | 4 | Same `.toDateString()` comparison pattern. |
| 3 | `components/sweep/SweepCard.OLD.tsx` | 2073, 2088, 2122, 2138 | 4 | Same `.toDateString()` comparison pattern (legacy file but still in source). |

> Total: 12+ `.toDateString()` comparison violations across 3 files. These are environment-dependent and bypass the DateService normalization.

---

### Rule 7: Server-side scheduling respects user timezone — **PASS**

Workers correctly handle timezone:
- `workers/inngest-jobs/index.js`: Cron fires at UTC, but dispatcher filters users by timezone window using `Intl.DateTimeFormat('en-CA', { timeZone: timezone })`.
- `workers/notifications/index.js`: Uses `getTimeInTimezone()` and `getDateInTimezone()` helpers per-user.
- Weekly summary dispatcher checks day-of-week and time window per-user timezone.

---

### Rule 8: No implicit timezone assumptions

#### HIGH

| # | File | Line | Snippet | Why |
|---|------|------|---------|-----|
| 1 | `lib/notifications/itemReminderService.ts` | 99-100 | `new Date(\`${reminder.date}T00:00:00\`)` | Constructs date without timezone specifier — interpreted as local on device, but could differ if processed server-side. |
| 2 | `lib/notifications/scheduleEventReminder.ts` | 24-32 | `new Date(\`${eventDate}T18:00:00\`)` / `new Date(\`${eventDate}T00:00:00\`)` | Same pattern: local-time string without explicit timezone. Works on device but is implicit. |
| 3 | `lib/calendar/transformCalendarEvent.ts` | 34 | `.toTimeString().slice(0, 5)` | Extracts time using `toTimeString()` which depends on device timezone implicitly. |
| 4 | `lib/store/calendarSelectors.ts` | 278-279 | `.toTimeString().slice(0, 5)` (2 uses) | Same `toTimeString()` pattern for HH:mm extraction. |
| 5 | `ritualDay.ts` | 59 | `const now = new Date()` | Uses raw `new Date()` — however this is the canonical utility, so it's acceptable. The Intl formatter handles timezone. **Borderline PASS.** |

---

## 3. Custom Date/Time Utility Functions

| Function | File | Canonical? | Notes |
|----------|------|-----------|-------|
| `DateService` (class) | `lib/date/DateService.ts` | **YES — Primary** | Singleton, injectable clock/timezone, branded types. 1092 lines. |
| `getRitualDay()` | `lib/date/ritualDay.ts` | **YES — For ritual day** | Handles day-boundary (e.g., 4am). Uses Intl.DateTimeFormat. |
| `isInLateNightPeriod()` | `lib/date/ritualDay.ts` | YES | Companion to getRitualDay. |
| `getHoursUntilDayBoundary()` | `lib/date/ritualDay.ts` | YES | Companion to getRitualDay. |
| `useDateService()` | `lib/date/useDateService.ts` | YES | React hook, syncs timezone from Zustand. |
| `useToday()` | `lib/date/useDateService.ts` | YES | Convenience hook. |
| `useNowTimestamp()` | `lib/date/useDateService.ts` | YES | Convenience hook. |
| `formatDue()` | `lib/date/formatDue.ts` | Deprecated wrapper | Delegates to DateService. |
| `computeDueDay()` | `lib/date/computeDueDay.ts` | Deprecated wrapper | Delegates to DateService. |
| `parseDue()` | `lib/cortex/entities/datetime.ts` | Specialized | NLP parser for cortex. Has own `toIsoLocal()` — **DUPLICATE** of DateService pattern. |
| `toIsoLocal()` | `components/overlay/dueUtils.ts` | **DUPLICATE** | Manual getTimezoneOffset() math — should use DateService. |
| `toIsoLocal()` | `lib/cortex/entities/datetime.ts` | **DUPLICATE** | Same pattern duplicated. |
| `getTodayISO()` | `app/utils/recurrence.ts` | **DUPLICATE** | Manual YYYY-MM-DD — duplicates `dateService.today()`. |
| `startOfTodayLocal()` | `app/screens/CatchAllNotepad.tsx` | **DUPLICATE** | Manual midnight normalization. |
| `isSameDay()` | `app/spaces/SpaceHomeScreen.tsx` | **DUPLICATE** | Manual day comparison helper. |
| `getUserLocalDate()` | `workers/inngest-jobs/index.js` | Worker-specific OK | Uses Intl.DateTimeFormat. Workers can't import RN DateService. |
| `getTimeInTimezone()` | `workers/notifications/index.js` | Worker-specific OK | Same — workers have own timezone helpers. |

---

## 4. Date Libraries Imported

| Library | File Count | Notes |
|---------|-----------|-------|
| `date-fns` | 45+ files | Primary library. Functions used: `format`, `parseISO`, `addDays`, `subDays`, `startOfDay`, `endOfDay`, `startOfWeek`, `endOfWeek`, `startOfMonth`, `endOfMonth`, `isToday`, `isTomorrow`, `isAfter`, `isBefore`, `nextMonday`, `differenceInDays`. |
| `chrono-node` | 1 file | `DateService.ts` only — NLP date parsing. |
| `Intl.DateTimeFormat` | 50+ files | Built-in — used for timezone detection and formatting. Not a competing library. |
| `date-fns-tz` | 0 files | Not used. |
| `moment` | 0 files | Not used. |
| `dayjs` | 0 files | Not used. |
| `luxon` | 0 files | Not used. |

---

## 5. Files Where Local Time Is Being Stored/Sent

| File | Line | What's stored | Destination | Severity |
|------|------|--------------|-------------|----------|
| No confirmed violations | — | — | — | — |

> **Good news:** No instances found where `toLocaleDateString()` or local-formatted dates are being written to Supabase. All DB writes use `.toISOString()` (UTC). The violations are about those `.toISOString()` calls not going through DateService, not about incorrect timezone in storage.

---

## 6. Files Where UTC Is Being Displayed to User Without Conversion

| File | Line | What's displayed | Severity |
|------|------|-----------------|----------|
| No confirmed violations | — | — | — |

> The display code either uses `toLocaleDateString()` (which handles local conversion, albeit inconsistently with DateService) or uses DateService formatting. No raw UTC ISO strings are shown to users.

---

## 7. getRitualDay() Bypasses (Own Day-Boundary Logic)

| File | Line(s) | What it does | Should use |
|------|---------|-------------|------------|
| `app/utils/recurrence.ts` | 72-79 | `getTodayISO()` — gets today as YYYY-MM-DD without day boundary | `dateService.today()` (or `getRitualDay()` if ritual context) |
| `app/screens/CatchAllNotepad.tsx` | 822 | `startOfTodayLocal()` — midnight normalization | `dateService.today()` + `dateService.fromLocalDate()` |
| `app/spaces/SpaceHomeScreen.tsx` | 179-180, 2988-3034 | Multiple manual day comparisons and YYYY-MM-DD construction | `dateService.isToday()`, `dateService.toLocalDate()` |
| `app/features/streaks/streakService.ts` | 35-36 | `startOfDay(new Date())` via date-fns | `dateService.today()` |
| `app/features/streaks/useStreak.ts` | 26 | `startOfDay(new Date())` via date-fns | `dateService.today()` |

> **Note:** These files get "today" without respecting the user's day boundary setting. If a user has day boundary set to 4am and it's 2am, these will return "today" while `getRitualDay()` would correctly return "yesterday". For non-ritual contexts (calendar dates), `dateService.today()` is correct. For ritual contexts (streaks, feeding gauge), `getRitualDay()` is required.

---

## Top Priority Fixes

### Tier 1 — Will cause wrong behavior (fix immediately)

1. **`app/features/streaks/streakService.ts` + `useStreak.ts`**: Streak calculations use `startOfDay(new Date())` — should use `dateService.today()` at minimum, or `getRitualDay()` if streaks respect day boundary.
2. **`scripts/dev/check-sweep-discrepancy.ts`**: `.toISOString().split('T')[0]` — the exact bug DateService was built to prevent.
3. **`components/overlay/UnifiedOverlayV2.tsx`**: `.toDateString()` comparisons — environment-dependent.
4. **`components/sweep/SweepCardNew.tsx`**: Same `.toDateString()` comparison issue.

### Tier 2 — Inconsistent with pattern (fix in next sprint)

5. **All `new Date().toISOString()` timestamp calls** (~15 files): Replace with `dateService.nowTimestamp()` or `getDateService().nowTimestamp()`.
6. **`components/overlay/dueUtils.ts` + `lib/cortex/entities/datetime.ts`**: Consolidate duplicate `toIsoLocal()` functions.
7. **`app/utils/recurrence.ts`**: Replace `getTodayISO()` with `dateService.today()`.
8. **`app/spaces/SpaceHomeScreen.tsx`**: Replace 6 manual day-comparison helpers with DateService calls.

### Tier 3 — Style/consistency (fix opportunistically)

9. **`toLocaleDateString()` display calls** (~10 files): Replace with `dateService.formatForChip()` or `formatDateForDisplay()`.
10. **Habit detail components** (BreakHabitDetail, BuildHabitDetail): Replace `new Date()` with DateService for year comparison and date picker bounds.
