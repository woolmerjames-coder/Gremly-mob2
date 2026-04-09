# Temporal Audit — Gremly Codebase

> Generated 2026-04-06. Exhaustive audit of every date/time write path, AI pipeline date handling, LLM date context, Life Map/DCO/Weekly Summary temporal flows, calendar read paths, and risk summary.

---

## 1. Supabase Date/Time Write Paths

### Key: Date value sources

| Source | Description |
|--------|-------------|
| **DateService** | `nowTimestamp()` which calls `getDateService().nowTimestamp()` → `this.now().toISOString()` |
| **DateService.today()** | `getDateService().today()` → YYYY-MM-DD in local timezone |
| **AI extraction** | Value from AI classification/enrichment pipeline (Phase 2) |
| **User input** | Value from overlay form or user action |
| **Supabase default** | Not in payload; DB sets via `DEFAULT now()` or trigger |
| **Derived** | Computed from another date value (e.g., `computeDueDay()`) |
| **raw new Date()** | `new Date().toISOString()` directly, bypassing DateService |

---

### TABLE: `todos`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/repo/supabase.ts:699` | `create()` INSERT | `created_at` | Supabase default | Explicitly excluded (line 662 safety check) |
| 2 | `lib/repo/supabase.ts:699` | `create()` INSERT | `updated_at` | Supabase default | Explicitly excluded |
| 3 | `lib/repo/supabase.ts:699` | `create()` INSERT | `due_date` | User input / AI | Via `normalizeIsoDatetime(effectiveDueDate)` |
| 4 | `lib/repo/supabase.ts:699` | `create()` INSERT | `due_day` | User input / AI / Derived | YYYY-MM-DD via `computeDueDay()` |
| 5 | `lib/repo/supabase.ts:699` | `create()` INSERT | `due_time` | User input / AI | HH:mm format |
| 6 | `lib/repo/supabase.ts:1240` | `update()` UPDATE | `updated_at` | Supabase default | DB trigger handles it |
| 7 | `lib/repo/supabase.ts:1240` | `update()` UPDATE | `due_date` | User input / Derived | Via `normalizeIsoDatetime()` or `computeDueDay()` |
| 8 | `lib/repo/supabase.ts:1240` | `update()` UPDATE | `due_day` | User input / Derived | Via `computeDueDay()` |
| 9 | `lib/repo/supabase.ts:1240` | `update()` UPDATE | `due_time` | User input | Direct from patch |
| 10 | `lib/repo/supabase.ts:1240` | `update()` UPDATE | `commitment_started_at` | User input | Via `normalizeIsoDatetime()` |
| 11 | `lib/repo/supabase.ts:2556` | `archiveItemsByDropId` | `completed_at` | DateService | `nowTimestamp()` |
| 12 | `lib/repo/supabase.ts:2672` | `restoreItem` | `archived_at` | null | Clearing |
| 13 | `lib/repo/supabase.ts:2672` | `restoreItem` | `completed_at` | null | Clearing |
| 14 | `lib/repo/supabase.ts:2939` | `completeTodo()` | `completed_at` | Caller-provided | `atIso` parameter |
| 15 | `lib/repo/supabase.ts:2961` | `undoCompletion()` | `completed_at` | null | Clearing |
| 16 | `lib/repo/supabase.ts:4532` | `toggleTodoPinned` | `updated_at` | DateService | `nowTimestamp()` |
| 17 | `lib/repo/supabase.ts:2851` | `addCommitment` | `commitment_started_at` | DateService | `nowTimestamp()` |
| 18 | `lib/repo/supabase.ts:2873` | `removeCommitment` | `commitment_archived_at` | DateService | `nowTimestamp()` |
| 19 | `lib/store/useGremlyStore.ts:2606` | `createTodo` INSERT | `created_at` | DateService | `nowTimestamp()` — **manually set, NOT Supabase default** |
| 20 | `lib/store/useGremlyStore.ts:2606` | `createTodo` INSERT | `updated_at` | DateService | `nowTimestamp()` — **manually set** |
| 21 | `lib/store/useGremlyStore.ts:2647` | `updateTodo` UPDATE | `updated_at` | DateService | `nowTimestamp()` |
| 22 | `lib/store/useGremlyStore.ts:2708` | `completeTodo` | `completed_at` | DateService | `nowTimestamp()` |
| 23 | `lib/store/useGremlyStore.ts:2741` | `uncompleteTodo` | `completed_at` | null | Clearing |
| 24 | `lib/store/useGremlyStore.ts:2785` | `archiveTodo` | `archived_at` | DateService | `nowTimestamp()` |
| 25 | `lib/store/useGremlyStore.ts:2815` | `restoreTodo` | `archived_at` | null | Clearing |
| 26 | `lib/store/useGremlyStore.ts:5645` | `addCommitment` (todo) | `commitment_started_at` | DateService | `nowTimestamp()` |
| 27 | `lib/store/useGremlyStore.ts:5722` | `removeCommitment` (todo) | `commitment_archived_at` | DateService | `nowTimestamp()` |
| 28 | `lib/store/useGremlyStore.ts:6329` | `slotTaskIntoGap` | `scheduled_start_iso` | User action | ISO from Morning Brief gap selection |
| 29 | `lib/store/useGremlyStore.ts:6359` | `unslotTask` | `scheduled_start_iso` | null | Clearing |
| 30 | `lib/store/useGremlyStore.ts:1750` | `ensureCurrentRitualDay` | `commitment_started_at` | null | Clearing |
| 31 | `lib/minddrop/dropSync.ts:278` | `syncDropToSupabase` INSERT | `created_at` | DateService | `nowTimestamp()` — **manually set** |
| 32 | `lib/minddrop/dropSync.ts:278` | `syncDropToSupabase` INSERT | `updated_at` | DateService | `nowTimestamp()` — **manually set** |
| 33 | `lib/minddrop/dropSync.ts:278` | `syncDropToSupabase` INSERT | `due_day` | AI extraction / Derived | `effectiveDueDay` from enrichment |
| 34 | `lib/minddrop/dropSync.ts:278` | `syncDropToSupabase` INSERT | `due_date` | AI extraction / Derived | Same as `dueDay` |
| 35 | `lib/minddrop/dropSync.ts:278` | `syncDropToSupabase` INSERT | `due_time` | AI extraction | `enrichment?.event_time` |
| 36 | `lib/minddrop/dropSync.ts:278` | `syncDropToSupabase` INSERT | `target_date` | AI extraction | `enrichment?.target_date` |
| 37 | `lib/minddrop/dropSync.ts:278` | `syncDropToSupabase` INSERT | `scheduled_date` | AI extraction | `enrichment?.scheduled_date` |
| 38 | `lib/minddrop/phase2.ts:473` | Phase2 enrichment UPDATE | `due_date` | AI extraction | `result.targetDate` / `result.scheduledDate` / `result.extractedDate` |
| 39 | `lib/minddrop/phase2.ts:473` | Phase2 enrichment UPDATE | `due_day` | AI extraction / Derived | YYYY-MM-DD from AI-returned date |
| 40 | `lib/minddrop/phase2.ts:473` | Phase2 enrichment UPDATE | `target_date` | AI extraction | `result.targetDate` |
| 41 | `lib/minddrop/phase2.ts:473` | Phase2 enrichment UPDATE | `scheduled_date` | AI extraction | `result.scheduledDate` |
| 42 | `app/screens/SweepFlowScreen.tsx:1833` | Sweep prep todo INSERT | `created_at` | DateService | `nowTimestamp()` — manually set |
| 43 | `app/screens/SweepFlowScreen.tsx:1833` | Sweep prep todo INSERT | `updated_at` | DateService | `nowTimestamp()` — manually set |
| 44 | `app/screens/SweepFlowScreen.tsx:1833` | Sweep prep todo INSERT | `target_date` | From original note | `originalNote?.target_date` |
| 45 | `app/screens/SweepFlowScreen.tsx:1833` | Sweep prep todo INSERT | `due_day` | From original note | `originalNote?.target_date` |
| 46 | `hooks/useEntityMutations.ts:335` | archive mutation | `archived_at` | DateService | `nowTimestamp()` |

### TABLE: `habits`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/repo/supabase.ts:699` | `create()` INSERT | `created_at` | Supabase default | Explicitly excluded |
| 2 | `lib/repo/supabase.ts:699` | `create()` INSERT | `updated_at` | Supabase default | Explicitly excluded |
| 3 | `lib/repo/supabase.ts:699` | `create()` INSERT | `start_date` | User input / AI | `input.start_date` |
| 4 | `lib/repo/supabase.ts:699` | `create()` INSERT | `end_date` | User input | `input.end_date` |
| 5 | `lib/repo/supabase.ts:1240` | `update()` UPDATE | `start_date` | User input | From patch |
| 6 | `lib/repo/supabase.ts:1240` | `update()` UPDATE | `end_date` | User input | From patch |
| 7 | `lib/repo/supabase.ts:1240` | `update()` UPDATE | `commitment_started_at` | User input | Via `normalizeIsoDatetime()` |
| 8 | `lib/repo/supabase.ts:2499` | `sweepApplyAction` archive | `archived_at` | DateService | `nowTimestamp()` |
| 9 | `lib/repo/supabase.ts:2588` | `archiveItemsByDropId` | `archived_at` | DateService | `nowIso` |
| 10 | `lib/repo/supabase.ts:2689` | `restoreItem` | `archived_at` | null | Clearing |
| 11 | `lib/repo/supabase.ts:2903` | `completeHabit()` | `last_completed_at` | Caller-provided | `atIso` |
| 12 | `lib/repo/supabase.ts:2988` | `undoCompletion` | `last_completed_at` | null | Clearing |
| 13 | `lib/repo/supabase.ts:4545` | `toggleHabitPinned` | `updated_at` | DateService | `nowTimestamp()` |
| 14 | `lib/repo/supabase.ts:2851` | `addCommitment` | `commitment_started_at` | DateService | `nowTimestamp()` |
| 15 | `lib/repo/supabase.ts:2851` | `addCommitment` | `commitment_until` | DateService | `addDays(today, durationDays - 1)` |
| 16 | `lib/repo/supabase.ts:2873` | `removeCommitment` | `commitment_archived_at` | DateService | `nowTimestamp()` |
| 17 | `lib/store/useGremlyStore.ts:2877` | `createHabit` INSERT | `created_at` | DateService | `nowTimestamp()` — **manually set** |
| 18 | `lib/store/useGremlyStore.ts:2877` | `createHabit` INSERT | `updated_at` | DateService | `nowTimestamp()` — **manually set** |
| 19 | `lib/store/useGremlyStore.ts:2877` | `createHabit` INSERT | `start_date` | Caller-provided | From sanitized habit partial |
| 20 | `lib/store/useGremlyStore.ts:2926` | `updateHabit` | `updated_at` | DateService | `nowTimestamp()` |
| 21 | `lib/store/useGremlyStore.ts:3035` | `completeHabit` | `last_completed_at` | DateService | `nowTimestamp()` |
| 22 | `lib/store/useGremlyStore.ts:3035` | `completeHabit` | `updated_at` | DateService | `nowTimestamp()` |
| 23 | `lib/store/useGremlyStore.ts:3067` | first completion `start_date` | `start_date` | DateService.today() | YYYY-MM-DD |
| 24 | `lib/store/useGremlyStore.ts:3142` | `uncompleteHabit` | `last_completed_at` | DB query | Recalculated from latest remaining progress |
| 25 | `lib/store/useGremlyStore.ts:3331` | `checkInHabit` | `last_checked_in_at` | DateService | `nowTimestamp()` |
| 26 | `lib/store/useGremlyStore.ts:3363` | `archiveHabit` | `archived_at` | DateService | `nowTimestamp()` |
| 27 | `lib/store/useGremlyStore.ts:3393` | `restoreHabit` | `archived_at` | null | Clearing |
| 28 | `lib/store/useGremlyStore.ts:5666` | `addCommitment` | `commitment_started_at` | DateService | `nowTimestamp()` |
| 29 | `lib/store/useGremlyStore.ts:5666` | `addCommitment` | `commitment_until` | DateService | `addDays(today, durationDays)` |
| 30 | `lib/store/useGremlyStore.ts:5738` | `removeCommitment` | `commitment_archived_at` | DateService | `nowTimestamp()` |
| 31 | `lib/minddrop/dropSync.ts:278` | sync INSERT (habit) | `created_at` | DateService | `nowTimestamp()` — **manually set** |
| 32 | `lib/minddrop/dropSync.ts:278` | sync INSERT (habit) | `updated_at` | DateService | `nowTimestamp()` — **manually set** |
| 33 | `lib/minddrop/dropSync.ts:278` | sync INSERT (habit) | `start_date` | AI extraction | `enrichment?.extracted_start_date` |
| 34 | `lib/minddrop/phase2.ts:473` | Phase2 enrichment | `start_date` | AI extraction | `result.extractedStartDate` |

### TABLE: `habit_progress`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/repo/supabase.ts:2205` | `logHabitProgress` INSERT | `occurred_at` | Caller-provided | `atIso` parameter |
| 2 | `lib/repo/supabase.ts:2912` | `completeHabit()` INSERT | `occurred_at` | Caller-provided | `atIso` |
| 3 | `lib/repo/supabase.ts:2912` | `completeHabit()` INSERT | `occurred_day` | Derived | `atIso.split('T')[0]` |
| 4 | `lib/repo/supabase.ts:3037` | `completeHabitForDate` INSERT | `occurred_at` | **raw new Date()** | `new Date(occurredDay).toISOString()` — midnight UTC |
| 5 | `lib/repo/supabase.ts:3037` | `completeHabitForDate` INSERT | `occurred_day` | Caller-provided | `dateIso.split('T')[0]` |
| 6 | `lib/repo/supabase.ts:3077` | `completeHabitForDateSilent` INSERT | `occurred_at` | **raw new Date()** | `new Date(occurredDay).toISOString()` — midnight UTC |
| 7 | `lib/repo/supabase.ts:3077` | `completeHabitForDateSilent` INSERT | `occurred_day` | Caller-provided | `dateIso.split('T')[0]` |
| 8 | `lib/store/useGremlyStore.ts:2999` | `completeHabit` INSERT | `occurred_day` | DateService.today() | YYYY-MM-DD local |
| 9 | `lib/store/useGremlyStore.ts:2999` | `completeHabit` INSERT | `occurred_at` | Derived | `${todayDate}T12:00:00.000Z` — **noon UTC hack** |

### TABLE: `notes`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/repo/supabase.ts:699` | `create()` INSERT | `created_at` | Supabase default | Excluded |
| 2 | `lib/repo/supabase.ts:699` | `create()` INSERT | `date` | User input | ISO date for journals |
| 3 | `lib/repo/supabase.ts:1240` | `update()` UPDATE | `date` | User input | Via `normalizeIsoDatetime()` |
| 4 | `lib/repo/supabase.ts:2623` | `archiveItemsByDropId` | `archived_at` | DateService | `nowIso` |
| 5 | `lib/repo/supabase.ts:2704` | `restoreItem` | `archived_at` | null | Clearing |
| 6 | `lib/repo/supabase.ts:4161` | `createNote` (v3.3) INSERT | `date` | User input | `input.date` |
| 7 | `lib/repo/supabase.ts:4197` | `updateNote` | `date` | User input | From patch |
| 8 | `lib/repo/supabase.ts:4558` | `toggleNotePinned` | `updated_at` | DateService | `nowTimestamp()` |
| 9 | `lib/store/useGremlyStore.ts:3430` | `createNote` INSERT | `created_at` | DateService | `nowTimestamp()` — **manually set** |
| 10 | `lib/store/useGremlyStore.ts:3430` | `createNote` INSERT | `updated_at` | DateService | `nowTimestamp()` — **manually set** |
| 11 | `lib/store/useGremlyStore.ts:3485` | `updateNote` | `updated_at` | DateService | Implicit in sanitized |
| 12 | `lib/store/useGremlyStore.ts:3590` | `archiveNote` | `archived_at` | DateService | `nowTimestamp()` |
| 13 | `lib/store/useGremlyStore.ts:3620` | `restoreNote` | `archived_at` | null | Clearing |
| 14 | `lib/store/useGremlyStore.ts:5914` | calendar sync INSERT | (via sanitize) | Calendar API data | Event dates from device calendar |
| 15 | `lib/store/useGremlyStore.ts:5933` | calendar sync UPDATE | `updated_at` | DateService | `nowTimestamp()` |
| 16 | `lib/store/useGremlyStore.ts:5963` | calendar sync soft delete | `archived_at` | DateService | `nowTimestamp()` |
| 17 | `lib/minddrop/dropSync.ts:278` | sync INSERT (note) | `created_at` | DateService | `nowTimestamp()` — **manually set** |
| 18 | `lib/minddrop/dropSync.ts:278` | sync INSERT (note) | `updated_at` | DateService | `nowTimestamp()` — **manually set** |
| 19 | `lib/minddrop/dropSync.ts:278` | sync INSERT (note) | `target_date` | AI extraction | `enrichment?.target_date` |
| 20 | `lib/minddrop/dropSync.ts:278` | sync INSERT (note) | `end_date` | AI extraction | `enrichment?.end_date` |
| 21 | `lib/minddrop/dropSync.ts:278` | sync INSERT (note) | `event_time` | AI extraction | `enrichment?.event_time` |
| 22 | `lib/minddrop/phase2.ts` | Phase2 enrichment | `target_date` | AI extraction | `result.targetDate` |
| 23 | `lib/minddrop/phase2.ts` | Phase2 enrichment | `date` | AI extraction | `result.scheduledDate` |
| 24 | `lib/sweep/engine.ts:507` | sweep archive | `archived_at` | Caller-provided | `now` param |
| 25 | `lib/sweep/engine.ts:538` | sweep skip | `skipped_in_sweep_at` | Caller-provided | `now` |
| 26 | `lib/conversion.ts` | conversion archive | `archived_at` | DateService | `nowTimestamp()` |

### TABLE: `focus_card`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/repo/supabase.ts:2313` | `setFocus()` UPSERT | `expires_at` | Caller-provided | From params |
| 2 | `lib/repo/supabase.ts:2313` | `setFocus()` UPSERT | `focus_day` | Derived | `ensureDay(params.expires_at)` |

### TABLE: `space_milestones`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/repo/supabase.ts:4372` | `createMilestone` INSERT | `date` | User input | `payload.date` |
| 2 | `lib/repo/supabase.ts:4372` | `createMilestone` INSERT | `completed_at` | null | Initialized |
| 3 | `lib/repo/supabase.ts:4424` | `updateMilestone` | `updated_at` | DateService | `nowTimestamp()` |
| 4 | `lib/repo/supabase.ts:4424` | `updateMilestone` | `completed_at` | User input/caller | From patch |
| 5 | `lib/repo/supabase.ts:4424` | `updateMilestone` | `date` | User input | From patch |
| 6 | `lib/repo/supabase.ts:4447` | `completeMilestone` | `completed_at` | DateService | `nowTimestamp()` |
| 7 | `lib/store/useGremlyStore.ts:4259` | createMilestone INSERT | `date` | User input | From milestone data |
| 8 | `lib/store/useGremlyStore.ts:4297` | updateMilestone | `updated_at` | DateService | `nowTimestamp()` |

### TABLE: `spaces`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/cortex/summarize.ts:270` | projection UPDATE | `last_summary_at` | DateService | `nowTimestamp()` |
| 2 | `lib/store/useGremlyStore.ts:3695` | `updateSpace` | `updated_at` | DateService | `nowTimestamp()` |

### TABLE: `space_chats`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/repo/supabase.ts:4768` | `archive` | `archived_at` | DateService | `nowTimestamp()` |
| 2 | `lib/store/useGremlyStore.ts:3790` | accept suggestion | `updated_at` | DateService | `nowTimestamp()` |
| 3 | `lib/store/useGremlyStore.ts:3817` | dismiss suggestion | `updated_at` | DateService | `nowTimestamp()` |
| 4 | `lib/store/useGremlyStore.ts:4100` | updateSpaceChat | `updated_at` | DateService | `nowTimestamp()` |

### TABLE: `cortex_preferences`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/repo/supabase.ts:4914` | `setCortexPrefs` UPSERT | `updated_at` | DateService | `nowTimestamp()` |
| 2 | `lib/store/useGremlyStore.ts:1352` | onboarding UPSERT | `onboarding_completed_at` | DateService | `nowTimestamp()` |
| 3 | `lib/store/useGremlyStore.ts:1649` | miniSweep UPSERT | `mini_sweep_last_completed_at` | DateService | `nowTimestamp()` |
| 4 | `lib/store/useGremlyStore.ts:1882` | dayBoundaryHour UPSERT | `updated_at` | DateService | `nowTimestamp()` |
| 5 | `lib/store/useGremlyStore.ts:1899` | setOnboardingCompletedAt | `onboarding_completed_at` | Caller-provided | timestamp param |
| 6 | `lib/store/useGremlyStore.ts:1927` | markOnboardingComplete | `onboarding_completed_at` | DateService | `nowTimestamp()` |
| 7 | `lib/store/useGremlyStore.ts:1953` | startTraining | `training_started_at` | DateService | `nowTimestamp()` |
| 8 | `lib/store/useGremlyStore.ts:1971` | markFirstDropComplete | `first_drop_completed_at` | DateService | `nowTimestamp()` |
| 9 | `lib/store/useGremlyStore.ts:1999` | markDemoSweepComplete | `demo_sweep_completed_at` | DateService | `nowTimestamp()` |
| 10 | `lib/store/useGremlyStore.ts:2026` | markFirstTodayVisit | `first_today_visit_completed_at` | DateService | `nowTimestamp()` |
| 11 | `lib/sweep/engine.ts:638` | sweep streak UPSERT | `last_sweep_completed_at` | DateService | `now.toISOString()` |
| 12 | `lib/sweep/engine.ts:638` | sweep streak UPSERT | `sweep_streak_last_date` | DateService.today() | YYYY-MM-DD |
| 13 | `supabase/functions/cortex-learn/index.ts:64` | learn job UPSERT | `updated_at` | **raw new Date()** | `new Date().toISOString()` — bypasses DateService (server-side Deno) |
| 14 | `supabase/functions/cortex-learn/index.ts:64` | learn job UPSERT | `last_learned_at` | Derived | Calculated from event timestamps |

### TABLE: `notification_preferences`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/store/useGremlyStore.ts:1473` | timezone sync | `updated_at` | DateService | `nowTimestamp()` |
| 2 | `hooks/useNotificationPreferences.ts:217` | save prefs UPSERT | `morning_time` | User input | Time string |
| 3 | `hooks/useNotificationPreferences.ts:217` | save prefs UPSERT | `evening_time` | User input | Time string |
| 4 | `hooks/useNotificationPreferences.ts:217` | save prefs UPSERT | `afternoon_time` | User input | Time string |
| 5 | `hooks/useNotificationPreferences.ts:217` | save prefs UPSERT | `updated_at` | DateService | `nowTimestamp()` |
| 6 | `hooks/useTimezoneSync.ts:53` | heartbeat | `last_app_active_at` | DateService | `nowTimestamp()` |
| 7 | `app/screens/CatchAllNotepad.tsx:9541` | training evening time | `evening_time` | User input | Time from picker |

### TABLE: `calendar_events`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/store/useGremlyStore.ts:6184` | createUserCalendarEvent | `event_date` | User input | From eventData |
| 2 | `lib/store/useGremlyStore.ts:6184` | createUserCalendarEvent | `event_time` | User input | From eventData |
| 3 | `lib/store/useGremlyStore.ts:6229` | updateUserCalendarEvent | `updated_at` | DateService | `nowTimestamp()` |
| 4 | `lib/store/useGremlyStore.ts:6229` | updateUserCalendarEvent | `event_date` | User input | From patch |
| 5 | `lib/store/useGremlyStore.ts:6229` | updateUserCalendarEvent | `event_time` | User input | From patch |

### TABLE: `weekly_summaries`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/store/useGremlyStore.ts:5370` | `saveWeeklySummary` UPSERT | `created_at` | DateService | `nowTimestamp()` — **manually set** |
| 2 | `lib/store/useGremlyStore.ts:5370` | `saveWeeklySummary` UPSERT | `updated_at` | DateService | `nowTimestamp()` — **manually set** |
| 3 | `lib/store/useGremlyStore.ts:5370` | `saveWeeklySummary` UPSERT | `week_start_date` | Caller-provided | From summary object |
| 4 | `lib/store/useGremlyStore.ts:5410` | `markSummaryViewed` | `viewed_at` | DateService | `nowTimestamp()` |
| 5 | `lib/store/useGremlyStore.ts:5432` | `markSummaryFlowCompleted` | `updated_at` | DateService | `nowTimestamp()` |
| 6 | `lib/store/useGremlyStore.ts:5454` | `dismissSummaryBanner` | `updated_at` | DateService | `nowTimestamp()` |

### TABLE: `list_items`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/repo/supabase.ts:4035` | `toggleListItemComplete` | `completed_at` | DateService | `nowTimestamp()` or null |

### TABLE: `space_meta`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/repo/supabase.ts:4491` | `upsertSpaceMeta` UPSERT | `updated_at` | DateService | `nowTimestamp()` |

### TABLE: `user_daily_state`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/store/useGremlyStore.ts:5571` | `patchDcoTodayFocus` | `updated_at` | DateService | `nowTimestamp()` |

### TABLE: `people`

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/repo/supabase.ts:3585` | `createPerson` INSERT | `dates_json` | User input | Array of `{date, label}` objects |
| 2 | `lib/repo/supabase.ts:3625` | `updatePerson` | `dates_json` | User input | From patch |

### TABLE: `events` (analytics)

| # | File | Function/Context | Date Column | Source | Notes |
|---|------|------------------|-------------|--------|-------|
| 1 | `lib/repo/supabase.ts:4061` | `writeEvent` INSERT | `created_at` | Supabase default | Not in payload |
| 2 | `lib/sweep/engine.ts:583` | sweep_completed INSERT | `completed_at` (in payload_json) | DateService | `now.toISOString()` |

### RPC Calls (write operations with date params)

| # | File | Function/Context | Date Param | Source |
|---|------|------------------|------------|--------|
| 1 | `lib/store/useGremlyStore.ts:1795` | `increment_drop_count` | `p_ritual_day` | `ensureCurrentRitualDay()` |
| 2 | `lib/store/useGremlyStore.ts:1839` | `increment_sweep_count` | `p_ritual_day` | `ensureCurrentRitualDay()` |
| 3 | `lib/store/useGremlyStore.ts:2068` | `update_gauge_atomic` | `p_ritual_day` | DateService |

### Key Findings — Section 1

1. **Inconsistent `created_at`/`updated_at` sourcing**: `lib/repo/supabase.ts` correctly relies on Supabase defaults. But `lib/store/useGremlyStore.ts` and `lib/minddrop/dropSync.ts` **manually set** `created_at` and `updated_at` using `nowTimestamp()`. Two code paths with different behavior.

2. **`raw new Date()` usages** (bypassing DateService):
   - `lib/repo/supabase.ts:3037,3077` (`completeHabitForDate`, `completeHabitForDateSilent`): `new Date(occurredDay).toISOString()` — creates midnight-UTC from a date string, timezone-unsafe.
   - `supabase/functions/cortex-learn/index.ts:62`: `new Date().toISOString()` for `updated_at` — server-side Deno, no DateService available.

3. **`occurred_at` noon-UTC hack**: `useGremlyStore.completeHabit` uses `${todayDate}T12:00:00.000Z` to avoid timezone boundary issues, while `lib/repo/supabase.ts` methods use `new Date(occurredDay).toISOString()` which produces midnight UTC. Inconsistent.

4. **All AI-extracted dates** from Phase 2 enrichment and dropSync are stored directly as YYYY-MM-DD strings returned by the LLM, validated only by `DateService.parseAIDate()` (format + plausibility range).

---

## 2. AI Pipeline Date Handling

### Pipeline Architecture

The MindDrop pipeline (`lib/minddrop/dropPipeline.ts`) is a state machine:

**queued** → **classified** → **titled** → **enriched** → **syncing** → **complete**

(with multi-entity side path: queued → multi_detected → enriched → complete)

Phase handlers live in `lib/minddrop/dropPhases.ts`.

### DateService (`lib/date/DateService.ts`)

The single source of truth for all date operations:
- Uses `Intl.DateTimeFormat` with user's timezone for all local date operations
- Injectable clock (`config.clock`) for testing
- Injectable timezone (`config.timezone`)
- `today()` → `YYYY-MM-DD` in user's local timezone
- `parseNaturalDate()` — 3-stage NLP pipeline: custom patterns → `chrono-node` → regex fallback
- `parseAIDate()` — validates AI dates: strips time components, rejects dates >365 days past or >730 days future
- Branded types (`LocalDateString`, `UtcTimestamp`) to prevent mixing

### Stage-by-Stage Date Handling

#### Stage 0: Nano Preparse (7 parallel mini-LLM calls)

**File:** `workers/cortex/index.js:738-868`

- 7 parallel `gpt-4o-mini` (nano) calls
- Only date-related field: **`has_date_or_time` (boolean)** — "Does the text contain a specific date, named day of the week, or clock time?"
- **Boolean signal only** — no date value extracted
- **No date context provided to the LLM** — model doesn't know what "today" is
- Feeds into heuristic scorer and Phase 1 routing

#### Stage 1: Phase 1 Classification

**Files:** `lib/minddrop/phase1.ts`, `workers/cortex/index.js:1213+`

- Prompt mentions dates only for classification signals (bucket routing)
- `temporal_specificity` detects if input has date+time → routes to `date_type` ambiguity
- **No actual date values extracted or resolved**
- **No date context provided to the LLM**
- Relative dates like "next Thursday" pass through untouched

#### Stage 1.5: Ambiguity Detection

**Files:** `lib/ai/phase1_5.ts`, `lib/minddrop/dropPhases.ts:292`, `workers/cortex/index.js:7672`

- Client-side `extractTemporal()` (regex) detects temporal words — returns **raw relative text**, not resolved date
- `dateService.today()` is sent as `currentDate` to the worker
- `date_type` ambiguity offers clarification options with `dateField: 'target_date'`
- **LLM generates clarification labels but does NOT resolve dates**

#### Stage 1.5a: Titling

**File:** `workers/cortex/index.js:8774`

- Prompt explicitly says: **"Strip temporal information — Dates, times, time-of-day (morning, evening, night), and scheduling words belong in metadata, not titles."**
- **No date extraction or resolution**
- **No date context injected**

#### Stage 2: Phase 2 Enrichment — THE MAIN DATE EXTRACTION STAGE

**Files:** `lib/minddrop/dropPhases.ts:153`, `lib/minddrop/phase2.ts:91`, `workers/cortex/index.js:9015-9445`

This is where **ALL date extraction and resolution happens.**

**What the client sends:**
```typescript
const currentDate = dateService.today();              // "2026-04-06" (YYYY-MM-DD, local)
const dayOfWeek = new Intl.DateTimeFormat('en-US', {  // "Sunday"
  weekday: 'long',
  timeZone: getDateService().getTimezone(),
}).format(getDateService().now());
const timezone = getDateService().getTimezone();       // e.g., "America/Los_Angeles"
```

**What the worker prompt tells the LLM:**
1. `Today is ${currentDate} (${dayOfWeek}).` + `User timezone: ${timezone}.`
2. **Dynamic weekday-to-date mapping** via `generateDateExamples()`: For each day of the week, computes the actual YYYY-MM-DD of the next occurrence (e.g., `"Monday" = 2026-04-07 (tomorrow)`)
3. Explicit rules: "tomorrow" = add 1 day, named days = next occurrence, same day = +7 days, "Do NOT return today's date unless the input explicitly says 'today'"
4. Date intelligence: distinguishes `target_date` (deadline) vs `scheduled_date` (when to do it) vs `date_type_ambiguous`

**CRITICAL: The LLM itself resolves relative dates to absolute dates.** No client-side `DateService.parseNaturalDate()` or `chrono-node` is called on AI output.

**Potential issue in `generateDateExamples()`**: Uses `.toISOString().split('T')[0]` (line 8990) for date arithmetic — could theoretically cause a UTC offset bug, though the function is called from the worker where the base date is already set.

**Date fields the LLM returns:**

| Entity Type | Fields |
|-------------|--------|
| **Todos** | `target_date: YYYY-MM-DD`, `scheduled_date: YYYY-MM-DD`, `date_type_ambiguous: boolean`, `event_time: HH:mm` |
| **Habits** | `extracted_start_date: YYYY-MM-DD`, `extracted_frequency`, `extracted_days: [0,1,...]` |
| **Logs (all)** | `target_date: YYYY-MM-DD`, `end_date: YYYY-MM-DD`, `event_time: HH:mm` |
| **Legacy** | `extracted_date: YYYY-MM-DD` (deprecated fallback) |

**Post-LLM validation (`lib/minddrop/phase2Validation.ts`):**
- `DateService.parseAIDate()` validates format + plausibility range (-365 to +730 days)
- Strips time components from `YYYY-MM-DDT...` formats

#### Stage 2b: Reminder Extraction

**File:** `workers/cortex/index.js:9667`

- Same date context: `Today: ${currentDate} (${dayOfWeek})`, `Timezone: ${timezone}`
- LLM returns: `reminder_date: YYYY-MM-DD`, `reminder_time: HH:mm`, `reminder_frequency`
- **The LLM resolves relative dates to absolute YYYY-MM-DD**
- Validation: regex only (`/^\d{4}-\d{2}-\d{2}$/` for date, `/^\d{2}:\d{2}$/` for time)

#### Stage 3: Sync to Supabase

**File:** `lib/minddrop/dropSync.ts`

Date field mapping at storage:
```typescript
// For todos:
dueDay = enrichment?.target_date || enrichment?.scheduled_date ||
         enrichment?.extracted_date?.split('T')[0] || (source === 'today' ? effectiveDueDay : null);

// For habits:
start_date = enrichment?.extracted_start_date || (source === 'today' ? effectiveDueDay : null);

// For notes:
target_date = enrichment?.target_date || null;
```

### Pipeline Summary Table

| Stage | Date in Prompt? | Date Values Extracted? | Who Resolves Relative Dates? |
|-------|----------------|----------------------|------------------------------|
| Preparse (7x nano) | No | `has_date_or_time` boolean only | N/A |
| Phase 1 Classification | No | No | N/A |
| Phase 1.5 Clarification | `currentDate` sent | No — UX options only | N/A |
| Phase 1.5a Titling | No | Actively strips dates | N/A |
| **Phase 2 Enrichment** | **Yes — full context + weekday lookup** | **All date fields** | **The LLM itself** |
| **Phase 2b Reminders** | **Yes — date + timezone** | **reminder_date, reminder_time** | **The LLM itself** |
| Validation (client) | N/A | Format + range check | `DateService.parseAIDate()` |
| Sync to DB | N/A | Maps AI → columns | Direct passthrough |

### Key Findings — Section 2

1. **The LLM is the sole resolver of relative dates.** No `DateService.parseNaturalDate()` or `chrono-node` is called on AI output. The LLM receives today's date, timezone, and a weekday-to-date lookup table, and outputs YYYY-MM-DD directly.

2. **Post-LLM validation is lightweight.** `parseAIDate()` checks format and plausibility but does not independently verify that "next Thursday" was resolved correctly.

3. **Phase 1 has no date context** — it classifies temporal presence without knowing the current date.

4. **`generateDateExamples()` uses `.toISOString().split('T')[0]`** — potential UTC offset risk when computing weekday-to-date mapping.

5. **Legacy `extracted_date` field** is deprecated but kept as fallback in both `phase2.ts` and the streaming path.

---

## 3. Date Context in LLM Calls

### Calls WITH proper date context

| # | Endpoint | File | Date Context | Source | Format |
|---|----------|------|-------------|--------|--------|
| 1 | `enrich-phase2` | `workers/cortex/index.js:9015` | `currentDate`, `dayOfWeek`, `timezone`, dynamic weekday mapping | DateService (via client) | YYYY-MM-DD, day name, IANA tz |
| 2 | `enrich-phase2b` | `workers/cortex/index.js:9667` | `currentDate`, `dayOfWeek`, `timezone` | DateService (via client) | YYYY-MM-DD, day name, IANA tz |
| 3 | `organize-day` | `workers/cortex/index.js:6157` | UTC ISO, local time, timezone, current hour | `new Date()` + `Intl` | ISO-8601, "3:45 PM", IANA tz |
| 4 | Entity Chat | `workers/cortex/index.js:4168` | `currentDate`, `timeOfDay`, `timeStr` | `new Date()` + `Intl` with `body.timezone` | "Tuesday, June 10, 2025", "3:45 PM" |
| 5 | `habit-builder` | `workers/cortex/index.js:3462` | `dow`, `today` | `context.currentDate` or `Intl` fallback | YYYY-MM-DD, day name |
| 6 | `general-greeting` | `workers/cortex/index.js:3384` | `timeStr`, `dayStr` | `new Date()` + `Intl` | "3:45 PM on Tuesday" |
| 7 | Running Summary | `workers/cortex/index.js:1998` | `today` | `Intl.DateTimeFormat('en-CA')` | YYYY-MM-DD |
| 8 | Entity Chat Summary | `workers/cortex/index.js:2099` | `today` | `Intl.DateTimeFormat('en-CA')` | YYYY-MM-DD |
| 9 | `chat-full-summary` | `workers/cortex/index.js:6920` | `todayStr` | `Intl.DateTimeFormat('en-US')` | "Tuesday, June 10, 2025" |
| 10 | `reclassify-after-clarification` | `workers/cortex/index.js:7980` | `currentDate` | `body.currentDate` or `Intl` fallback | YYYY-MM-DD |
| 11 | Daily Life Map Update | `workers/inngest-jobs/index.js:6458` | `TODAY: ${targetDate}`, `TIMEZONE: ${tz}`, full event data | `getUserLocalDate(timezone)` | YYYY-MM-DD, IANA tz |
| 12 | Space Chat | `workers/cortex/index.js` | Timezone, todayActivity context | `body.timezone`, `new Date()` | ISO, IANA tz |
| 13 | Weekly Summary V2 Analyst | `workers/inngest-jobs/index.js:5909` | `weekStart`, `weekEnd` | Computed from snapshot | YYYY-MM-DD |
| 14 | Weekly Summary V2 Editorial | `workers/inngest-jobs/index.js:3773` | `weekStart`, `weekEnd`, `WEEK BOUNDARY` instruction | Computed from snapshot | YYYY-MM-DD |

### Calls WITHOUT date context (that reason about time)

| # | Endpoint | File | Problem |
|---|----------|------|---------|
| 1 | **`classify-phase1`** | `workers/cortex/index.js:1214` | Classifies temporal signals (date_type ambiguity) but model has **no current date** |
| 2 | **`classify-preparse`** | `workers/cortex/index.js:7182` | Detects `has_date_or_time` but model has **no current date** |
| 3 | **`openAiEngine.classify()`** | `cortex/openAiEngine.ts` | Asks model to infer due dates with **no current date** — prompt says `set "undefinedDue": true unless explicit non-today due date` but model doesn't know what today is |
| 4 | **`enrich-phase1-5a`** | `workers/cortex/index.js:8774` | Has a "DATE HANDLING" section but **no current date injected** |
| 5 | `clarify-ambiguity` | `workers/cortex/index.js:7868` | No date (lower risk — UX labels only) |
| 6 | `detect-multi` | `workers/cortex/index.js:7420` | No date (lower risk — structural detection) |
| 7 | `sweep-headline` | `workers/cortex/index.js:7115` | No date (lower risk — tone only) |

### Date Source Inconsistencies

| Issue | Location | Expected | Actual |
|-------|----------|----------|--------|
| Web search tool description uses UTC | `workers/cortex/index.js:2390` | User timezone | `Intl.DateTimeFormat('en-US', { timeZone: 'UTC' })` — wrong date at midnight boundary |
| `extractHabitFields()` uses UTC for day-of-week | `workers/cortex/index.js:5574` | User timezone | `Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' })` — wrong day at midnight boundary |
| Supabase Edge Function Phase 2 has no timezone | `supabase/functions/cortex-proxy/index.ts:255` | Full date context like Cloudflare Worker | `new Date().toISOString().split('T')[0]` — UTC only, no weekday mapping |
| `buildBirthdayContext()` uses UTC | `workers/cortex/index.js:37` | User timezone | `new Date()` with UTC |
| Default timezone varies across endpoints | Multiple | Consistent default | `'UTC'`, `'America/Los_Angeles'`, `'Pacific/Tahiti'` in different places |

### Date Format Inconsistencies Across LLM Calls

| Format | Used By |
|--------|---------|
| `YYYY-MM-DD` | Phase 2, Phase 2b, reclassify, running summary, entity chat summary |
| `"Tuesday, June 10, 2025"` (human-readable) | Entity chat, chat-full-summary, buildBirthdayContext |
| `"3:45 PM on Tuesday"` (time + day) | general-greeting |
| `"Tuesday, 2025-06-10"` (mixed) | habit-builder |
| ISO-8601 full timestamp | organize-day (UTC) |

### Key Findings — Section 3

1. **Phase 1 classification has no date context** — it determines temporal routing (`date_type` ambiguity) without knowing the current date.

2. **Web search tool description uses UTC** — for a user at 11 PM local time, the date shown to the model could be tomorrow.

3. **`extractHabitFields()` uses UTC for day-of-week** — could return "Monday" when it's still Sunday in the user's timezone.

4. **Legacy Supabase Edge Function Phase 2** lacks timezone awareness, weekday mapping, and dynamic date examples that the Cloudflare Worker version has.

5. **Default timezone falls back to `'UTC'`, `'America/Los_Angeles'`, or `'Pacific/Tahiti'`** depending on the endpoint — no consistent default.

6. **Date format is inconsistent** across LLM calls — some use YYYY-MM-DD, some human-readable, some mixed.

---

## 4. Life Map / DCO / Weekly Summary Temporal Flow

### Life Map

**Files:** `workers/inngest-jobs/index.js` (lines 2510-2698 bootstrap, 2701-2973 rebuild, 6526-6578 daily merge)

**Temporal data IN:**
- `fetchUserSnapshot()` fetches todos, notes, events, habits, habit_progress, milestones, spaces — all with structured date columns (`created_at`, `completed_at`, `target_date`, `end_date`, `occurred_day`)
- 7/21-day window computed from `getUserLocalDate(timezone)` → YYYY-MM-DD
- Includes weekly summaries with `week_start_date` and prior DCOs with `date` columns

**Temporal data OUT (AI-generated):**
- Bootstrap (Claude Sonnet): `evidence[].date` (YYYY-MM-DD), `thread.last_activity` (YYYY-MM-DD), `rebuilt_at` (ISO), `updated_at` (ISO)
- Daily update (Gemini Flash): `thread_updates[].new_evidence[].date` (YYYY-MM-DD)
- Weekly rebuild (Claude Sonnet): `thread_updates[].last_activity`, `new_threads[].evidence[].date`

**Are dates carried or model-generated?**
Evidence dates are **carried from input data** — models are instructed to reference existing data points. `last_activity` values are model-selected from available dates, not invented.

**Storage:**
- Table: `user_life_map` — columns: `user_id`, `life_map` (JSONB), `version`, `rebuilt_at` (timestamp), `updated_at` (timestamp)
- **ALL dates inside the Life Map exist ONLY as text in JSONB** — no structured date columns for evidence dates or thread activity

**FLAGGED — Dates only as text in JSONB:**
- `user_life_map.life_map.domains[].threads[].evidence[].date` — YYYY-MM-DD in JSONB
- `user_life_map.life_map.domains[].threads[].last_activity` — YYYY-MM-DD in JSONB
- `user_life_map.life_map.domains[].threads[].summary` — natural language with temporal references
- `user_life_map.life_map.domains[].threads[].recent_update` — natural language with temporal context

### DCO (Daily Context Object)

**Files:** `workers/inngest-jobs/index.js` (lines 122-358, 6354-6663), `workers/cortex/context/dcoContext.js`

**Temporal data IN:**
- Same `fetchUserSnapshot` as Life Map (7-day window)
- `buildWorldPicture()` formats with `TODAY: ${targetDate}`, calendar events, milestones with days-away
- Previous DCO headline included with its date

**Temporal data OUT (AI-generated):**
- `daily_focus.today_focus[]` — items mentioning dates ("3 overdue todos")
- `daily_focus.lead_story.detail` — max 80 chars, may reference today-specific context
- `thread_updates[].new_evidence[].date` — YYYY-MM-DD (carried from input)
- `generateHeadlineFromFocus` (Claude Haiku) → headline text that may contain temporal language

**Deterministic assembly (`assembleDcoFromFocus`):**
- `active_today.upcoming_in_7d` — strings like `"2026-03-14: Fly to Hawaii"` (date embedded in text!)
- `generated_at` — `new Date().toISOString()`
- `date` — YYYY-MM-DD from `getUserLocalDate(timezone)`

**Storage:**
- Table: `user_daily_state` — columns: `user_id`, `date` (structured DATE, part of unique key), `dco` (JSONB), `extraction_raw` (JSONB), `created_at`, `updated_at`, `expires_at`

**FLAGGED — Dates only as text in JSONB:**
- `user_daily_state.dco.active_today.upcoming_in_7d[]` — strings like `"2026-03-14: Fly to Hawaii"` with dates embedded in text
- `user_daily_state.dco.daily_focus.lead_story.detail` — may contain date-specific language
- `user_daily_state.dco.brief_headline` — AI-generated text with potential temporal context
- `user_daily_state.dco.generated_at` — ISO timestamp inside JSONB (duplicated as `created_at` column)

### Weekly Summary

**Files:** `lib/weeklySummary/generateWeeklySummary.ts`, `lib/weeklySummary/buildWeeklySummaryPayload.ts`, `workers/inngest-jobs/index.js` (lines 3444-3640+ V2, 829-1080 V2 worker)

#### V1 (client-side)

**Temporal data IN:**
- From Zustand store: `completed_at`, `created_at`, `due_date`, `due_day`, `locked_in_at` on todos; `created_at`, `last_checked_in_at` on habits; `created_at` on notes; event dates from calendar
- Week boundaries from DateService: `weekStartDate` (Monday), `weekEndDate` (Sunday)

**Temporal data OUT:**
- `magicMoments[].date` (YYYY-MM-DD), `weekAhead.highlights[].day/time`, `recommendations[].prefill.due_day` (YYYY-MM-DD)

#### V2 (server-side, Inngest pipeline)

**Pipeline stages:**
1. **Analyst** (Claude Haiku): Receives full weekly snapshot data → outputs `themes[].this_week.events[]` with dates, `week_timeline.significant_days[].date`, `magic_moment_candidates[].date`
2. **Editorial Brief** (Claude Sonnet): Receives analyst + Life Map → produces brief with `weekStart`/`weekEnd` boundaries
3. **Discovery Grounding** (Gemini Flash with Google Search): Contains **hardcoded year range** "2023-2026"
4. **Storyteller** (Claude Sonnet): Receives editorial brief → generates narrative cards
5. **Constraint Pass** (Claude Sonnet): Validates output

**Temporal data OUT (cards):**
- `WSV2OpeningCard.quote_date` (YYYY-MM-DD), `mood_arc[].date` (YYYY-MM-DD — carried from input)
- `WSV2MomentsCard.moments[].date` (YYYY-MM-DD), `moments[].day_label`
- `WSV2WeekAheadCard.highlights[].date` (YYYY-MM-DD), `highlights[].day_label`
- `WSV2RecommendationCard.prefill.due_day` (YYYY-MM-DD)

**Storage:**
- Table: `weekly_summaries` — columns: `user_id`, `week_start_date` (DATE), `week_end_date` (DATE), `generated_at`, `content` (JSONB), `stats_snapshot` (JSONB), `trend_context` (JSONB), `viewed_at`, `created_at`, `updated_at`

**FLAGGED — Dates only as text in JSONB:**
- `weekly_summaries.content.cards[type='moments'].moments[].date` — YYYY-MM-DD inside JSONB
- `weekly_summaries.content.cards[type='week_ahead'].highlights[].date` — YYYY-MM-DD inside JSONB
- `weekly_summaries.content.cards[type='opening'].quote_date` — YYYY-MM-DD inside JSONB
- `weekly_summaries.content.cards[type='recommendation'].prefill.due_day` — YYYY-MM-DD inside JSONB
- All narrative text fields may contain date-specific language that becomes stale

### Morning Brief

**Files:** `lib/today/hooks/useMorningBrief.ts`, `app/components/morning-brief/MorningBriefSheet.tsx`

- Reads DCO headline from store's `dco.brief_headline`
- Calendar events from `useCalendarEventsForDate`
- Today's todos/habits from store selectors
- **Does NOT generate dates via AI** — pure client-side UI
- Storage: `daily_briefs` table with structured `date` column — **clean date handling**

### Cron Jobs / Scheduled Tasks

| Job | Schedule | Notes |
|-----|----------|-------|
| `dailySynthesisDispatcher` | `0 4 * * *` (4 AM UTC) | Profile synthesis fan-out |
| `dcoDispatcher` | `0 * * * *` (hourly) | Checks timezone windows, DCO at 4 AM local |
| `weeklySummaryV2Dispatcher` | `*/5 * * * *` (every 5 min) | Weekly summary ritual day matching |
| `archiveStaleEvents` | `0 3 * * *` (3 AM UTC) | Archives event notes >7 days old |
| Notification Worker | `*/5 * * * *` | Morning/evening notifications in timezone windows |

### Key Findings — Section 4

1. **Life Map stores ALL dates in JSONB only** — no structured columns for evidence dates. Cannot query "threads with activity after date X" without JSONB path queries.

2. **DCO `upcoming_in_7d` embeds dates in text strings** — e.g., `"2026-03-14: Fly to Hawaii"` — fragile to parse and stale on re-read.

3. **Weekly Summary V2 Discovery Grounding has hardcoded year range** `"2023-2026"` — will break in 2027.

4. **Weekly Summary `content` JSONB** contains dates in card structures with no corresponding structured columns beyond `week_start_date`/`week_end_date`.

5. **AI-generated narrative text** in all three systems contains temporal references that become stale immediately.

---

## 5. Calendar & Event Read Paths

### Data Model Overview

Three distinct sources of "events" plus a legacy analytics table:

| Source | Storage | Query Path |
|--------|---------|------------|
| **Synced calendar events** (Google/Outlook/ICS) | Fetched from Cloudflare Worker, cached in Zustand `calendarEvents`, reconciled into `notes` table as `subtype='event'` | CalendarClient → Store → calendarSync → notes |
| **Gremly-native events** | `notes` table with `subtype='event'` | Direct Supabase `notes` queries |
| **User quick-add events** | `calendar_events` table | Direct Supabase `calendar_events` queries |
| **Analytics events** | `events` table (`kind='sweep_completed'`, etc.) | Direct Supabase `events` queries |

### Read Path 1: CalendarClient (External Fetch)

**File:** `lib/calendar/CalendarClient.ts`

- `calendarClient.getEvents(startDate, endDate)` → Cloudflare Worker at `GET /calendar/events?start=YYYY-MM-DD&end=YYYY-MM-DD`
- Worker fans out to `fetchOutlookEvents()`, `fetchGoogleEvents()`, `fetchIcsEvents()` in parallel
- Returns `CalendarEvent[]` with `{ id, provider, startAt, endAt, isAllDay, location }`
- **No timezone conversion on the worker** — passes through raw ISO strings from providers

### Read Path 2: Store Calendar Fetch + Sync

**File:** `lib/store/useGremlyStore.ts:5766-5999`

- Groups results into `Record<string, CalendarEvent[]>` keyed by YYYY-MM-DD
- All-day events: `event.startAt.split('T')[0]` (raw string, avoids UTC shift)
- Timed events: `new Date(event.startAt)` then local `.getFullYear()/.getMonth()/.getDate()` — correctly local-timezone-aware
- After fetching, calls `syncCalendarEventsToNotes()` which reconciles into `notes` table
- **FLAG:** Sync reads from Zustand store snapshot, not fresh Supabase query — if store is stale, sync can miss existing event notes

### Read Path 3: Store Initialization (Full Data Load)

**File:** `lib/store/useGremlyStore.ts:1230-1290`

- Loads ALL todos, habits, notes, habit_progress (no date filter)
- `daily_briefs` filtered by `getDateService().today()` — correct local YYYY-MM-DD
- **No date filter on core entities** — everything in memory

### Read Path 4: Today/Now Selectors (In-Memory)

**File:** `lib/store/selectors.ts`

- `selectTodosDueToday`: `t.due_day === ds().today()` — clean string comparison
- `selectOverdueTodos`: `t.due_day && t.due_day < today` — string comparison
- `selectTodosCompletedToday`: `ds().isTimestampToday(t.completed_at)` — uses DateService
- `selectHabitCompletedToday`: `row.occurred_day === today` — clean
- All use `getDateService().today()` properly

### Read Path 5: Calendar View Selectors

**File:** `lib/store/calendarSelectors.ts`

- `useCalendarItemsForDate(dateStr)`: Reads todos, habits, notes, and `calendarEvents[dateStr]` from store
- Merges synced Notes and raw CalendarEvents via `coveredExternalIds` Set (synced Notes take priority)
- Uses DateService for time formatting and day-of-week calculation
- **Correctly timezone-aware** via `Intl.DateTimeFormat` with `getDateService().getTimezone()`

### Read Path 6: Capacity Selectors (Morning Brief)

**File:** `lib/store/capacitySelectors.ts`

- `useTodayCalendarEvents()`: `store.calendarEvents[today]`
- `calculateDayCapacity()`: Parses `event.startAt`/`event.endAt` as `new Date()`, extracts hours/minutes
- Uses `new Date(event.startAt).getHours()` — correctly local-timezone-aware

### Read Path 7: Morning Brief Items Selector

**File:** `lib/store/useGremlyStore.ts:9826-9864`

- Reads from **ALL THREE event sources**: `calendarEvents[date]` (synced external), `userCalendarEvents` (quick-adds), and `notes` where `subtype='event'` with `target_date` filter
- **FLAG:** Three separate event sources merged in one selector — no centralized CalendarService

### Read Path 8: `listTodayMerged` (Direct Supabase)

**File:** `lib/repo/supabase.ts:2007-2187`

- Active todos: `.or('due_day.eq.{day},carry_forward.eq.true')`
- Completed today: `.gte('completed_at', '{day}T00:00:00').lt('completed_at', '{day}T23:59:59.999')`
- **TIMEZONE BUG:** The `completed_at` range uses `${day}T00:00:00` WITHOUT `Z` suffix. `day` is a local YYYY-MM-DD. `completed_at` is stored as UTC. Supabase compares bare timestamps as UTC, so for a user in UTC-8, a todo completed at 11 PM local (7 AM next day UTC) could be filtered incorrectly.

### Read Path 9: `countCompletedToday` (Direct Supabase)

**File:** `lib/repo/supabase.ts:1939-2001`

- Same issue: `.gte('completed_at', '{today}T00:00:00').lt('completed_at', '{today}T23:59:59')` — **no Z suffix**
- But `getTodaySummary` (line 2425) DOES append `Z` suffix — **inconsistent within the same file**

### Read Path 10: Sweep Engine

**File:** `lib/sweep/engine.ts`

- Event notes: `.gte('target_date', todayDay).lte('target_date', sevenDaysFromNowStr)` — clean, uses DateService
- Date calculation via `getDateService().toLocalDate(sevenDaysFromNow)` — correct

### Read Path 11: Weekly Summary Builder

**File:** `lib/weeklySummary/buildWeeklySummaryPayload.ts`

- Reads from Zustand store (no direct Supabase)
- Merges three event sources: synced calendar, user calendar events, entity events (notes with `subtype='event'`)
- Week boundaries via `getMonday(today)` using DateService
- Time formatting: `Intl.DateTimeFormat` with user timezone — correct

### Read Path 12: `cortex-learn` Supabase Function

**File:** `supabase/functions/cortex-learn/index.ts`

- Reads from `events` table (analytics): `.gte('created_at', since).lte('created_at', new Date().toISOString())`
- Uses `user_id` instead of `owner_id` — **inconsistent with the rest of the codebase**
- Uses `new Date().toISOString()` (no DateService) — OK for server-side Deno

### Direct Supabase Queries That Bypass Shared Services

| Location | Table | Notes |
|----------|-------|-------|
| `repo/supabase.ts` `listTodayMerged` | todos, habits, habit_progress | Duplicates store selector logic |
| `repo/supabase.ts` `countPlannedToday/countCompletedToday` | todos | Duplicates store selectors |
| `repo/supabase.ts` `getTodaySummary` | todos | Different tz handling than neighbors |
| `sweep/engine.ts` | notes (target_date filter) | OK — sweep runs independently |
| `cortex-learn/index.ts` | events | Server function, uses `user_id` not `owner_id` |

### Key Findings — Section 5

1. **No `CalendarService` exists.** Calendar data is fragmented across CalendarClient, Zustand store `calendarEvents`, `calendar_events` table, and `notes` table with `subtype='event'`.

2. **`listTodayMerged` has a timezone bug** — `completed_at` range filter uses local day without `Z` suffix, while `completed_at` is stored as UTC. Off-by-one-day for users far from UTC.

3. **`getTodaySummary` vs `countCompletedToday` inconsistency** — one appends `Z`, the other doesn't, within the same file.

4. **Morning Brief selector merges THREE event sources** with no shared abstraction.

5. **Calendar sync reads from Zustand store snapshot** — could miss events if store is stale.

---

## 6. Risk Summary

### Ranked High-Risk Findings

| Rank | Finding | Risk | Location |
|------|---------|------|----------|
| **1** | **LLM is sole resolver of relative dates** | If the LLM misinterprets "next Thursday" there is no independent check. Post-validation only checks format and plausibility range, not correctness. | `workers/cortex/index.js:9015` (Phase 2) |
| **2** | **`listTodayMerged` timezone bug** | `completed_at` filter uses local day without `Z` suffix against UTC timestamps. Users far from UTC will see wrong "completed today" counts. | `lib/repo/supabase.ts:2070` |
| **3** | **Web search tool uses UTC for date** | Users at 11 PM local could get tomorrow's date in web search context. Model gives wrong-day answers. | `workers/cortex/index.js:2390` |
| **4** | **`extractHabitFields()` uses UTC for day-of-week** | Returns "Monday" when it's still Sunday in user's timezone. Habit field extraction off by one day. | `workers/cortex/index.js:5574` |
| **5** | **`generateDateExamples()` uses `.toISOString().split('T')[0]`** | UTC offset could cause weekday-to-date mapping to be off by one day, propagating to every Phase 2 date resolution. | `workers/cortex/index.js:8990` |
| **6** | **Phase 1 classification has no date context** | Routes temporal ambiguity (`date_type`) without knowing the current date. Could misclassify "tonight" vs "tomorrow". | `workers/cortex/index.js:1214` |
| **7** | **`occurred_at` inconsistency for habit completions** | Store uses noon-UTC hack, repo methods use midnight-UTC from `new Date()`. Two code paths produce different timestamps for the same logical action. | `lib/store/useGremlyStore.ts:2999` vs `lib/repo/supabase.ts:3037` |
| **8** | **Life Map stores all dates in JSONB only** | Cannot query temporal data without JSONB path queries. No index on evidence dates. Risk of drift as natural language summaries age. | `user_life_map.life_map` |
| **9** | **DCO `upcoming_in_7d` embeds dates in text** | Strings like `"2026-03-14: Fly to Hawaii"` are fragile to parse and stale immediately after generation. | `user_daily_state.dco` |
| **10** | **Weekly Summary V2 hardcoded year range** | Discovery Grounding prompt says "2023-2026" — will silently produce outdated search results in 2027. | `workers/inngest-jobs/index.js:3879` |
| **11** | **Default timezone varies by endpoint** | `'UTC'`, `'America/Los_Angeles'`, `'Pacific/Tahiti'` as fallback defaults. | Multiple files |
| **12** | **Dual `created_at`/`updated_at` sourcing** | `repo/supabase.ts` uses DB defaults, `useGremlyStore` manually sets via DateService. Two paths for the same semantic operation. | `lib/store/useGremlyStore.ts` vs `lib/repo/supabase.ts` |
| **13** | **Legacy Supabase Edge Function Phase 2** | No timezone, no weekday mapping, no dynamic date examples — far less capable than the Cloudflare Worker version. | `supabase/functions/cortex-proxy/index.ts:255` |
| **14** | **No CalendarService** | Calendar data fragmented across 4 sources with no shared abstraction. | CalendarClient, store, calendar_events, notes |
| **15** | **`cortex-learn` uses `user_id` not `owner_id`** | Inconsistent column naming with rest of codebase. | `supabase/functions/cortex-learn/index.ts` |

### Counts

| Metric | Count |
|--------|-------|
| Total date write paths found | **~160** unique insert/update operations writing date/time columns |
| Total LLM calls with date context | **14** endpoints with proper date context |
| Total LLM calls WITHOUT date context (that should have it) | **4** significant endpoints (Phase 1, preparse, legacy classify, Phase 1.5a) |
| Total places where dates are INFERRED by LLM rather than stored | **2** (Phase 2 enrichment, Phase 2b reminders) — these are the only stages where the LLM resolves relative → absolute dates |
| Tables with dates ONLY in JSONB (no structured column) | **3** (`user_life_map`, `user_daily_state.dco`, `weekly_summaries.content`) |
| Raw `new Date()` bypassing DateService | **3** locations |

### Quick Wins (<30 min each)

1. **Fix `listTodayMerged` timezone bug** — Add `Z` suffix to `completed_at` range filter or convert to `timestamptz` comparison. (~15 min)

2. **Fix web search tool UTC date** — Change `timeZone: 'UTC'` to `timeZone: body.timezone || 'UTC'` in the tool description. (~5 min)

3. **Fix `extractHabitFields()` UTC day-of-week** — Change `timeZone: 'UTC'` to `timeZone: body.timezone || 'UTC'`. (~5 min)

4. **Fix `generateDateExamples()` UTC split** — Use `Intl.DateTimeFormat('en-CA', { timeZone: timezone })` instead of `.toISOString().split('T')[0]`. (~10 min)

5. **Fix hardcoded "2023-2026" year range** — Replace with dynamic `${currentYear - 3}-${currentYear}`. (~5 min)

6. **Standardize default timezone fallback** — Replace all `'America/Los_Angeles'` and `'Pacific/Tahiti'` defaults with `'UTC'` (or a single configurable default). (~15 min)

7. **Add `currentDate` to Phase 1.5a prompt** — The DATE HANDLING section references temporal info but the model has no date context. Add `Today is ${currentDate}.` (~10 min)

8. **Make `countCompletedToday` consistent** — Use the same `Z`-suffix pattern as `getTodaySummary`. (~5 min)

### Structural Changes Needed

1. **CalendarService** — Create a centralized service that provides a single query interface across all 4 event sources (synced calendar, user calendar events, event notes, and raw CalendarEvents). Eliminates the 3-source merge in Morning Brief and other selectors.

2. **Client-side date verification for Phase 2** — After the LLM resolves relative dates, run `DateService.parseNaturalDate()` on the original text and compare against the LLM's output. Log discrepancies. This adds an independent check without blocking the pipeline.

3. **Structured date columns for JSONB documents** — Add indexed date columns alongside JSONB blobs:
   - `user_life_map`: Add `last_evidence_date` column (max evidence date across all threads)
   - `weekly_summaries`: Add `magic_moment_dates` array column or a `weekly_summary_dates` junction table
   - `user_daily_state`: Extract `upcoming_dates` array column from `dco.active_today.upcoming_in_7d`

4. **Unified `created_at`/`updated_at` strategy** — Either always let the DB set these (remove manual sets from `useGremlyStore` and `dropSync`) or always set them from DateService. Pick one.

5. **Add `captured_at` / `origin_timestamp` column** — For AI-extracted dates, store the `currentDate` that was sent to the LLM alongside the extracted date. This enables auditing: if the LLM was told "today is 2026-04-06" and returned "2026-04-13" for "next Monday", you can verify correctness post-hoc.

6. **Deprecate legacy Supabase Edge Function Phase 2** — Route all traffic through the Cloudflare Worker which has proper timezone handling and dynamic date examples.

7. **Inject `currentDate` into Phase 1 classification** — Even though Phase 1 doesn't extract dates, knowing the current date helps with temporal routing decisions. Low effort, prevents subtle misclassification.

8. **`occurred_at` reconciliation** — Unify the noon-UTC hack (store) and midnight-UTC (repo) into a single approach, ideally using DateService to produce a consistent local-noon timestamp.

---

## 7. Verification Pass — Corrections & Additions

> After the initial audit, a full line-by-line verification was performed on every key file. This section documents everything the initial pass missed or documented inaccurately.

### 7.1 Corrections to Section 1 (Supabase Write Paths)

#### Correction: `sweepApplyAction` todo archive does NOT write `archived_at`

The initial audit said `sweepApplyAction` at `lib/repo/supabase.ts:2471` writes `archived_at` for todos. **This is wrong.** The actual code only writes `{ status: 'archived', archived_reason: ... }` — no `archived_at` column. Only the **habit** sweep-archive path (line 2499) writes `archived_at`. This means **todo sweep-archive is inconsistent with habit sweep-archive** — habits get `archived_at` but todos do not.

#### Correction: `archiveItemsByDropId` — columns differ per table

The initial audit grouped todos/habits/notes together. The actual behavior:
- **Todos** (line 2556): writes `completed_at` and `status` — does NOT write `archived_at`
- **Habits** (line 2588): writes `archived`, `archived_at`, `archived_reason` — does NOT write `completed_at`
- **Notes** (line 2623): writes `archived`, `archived_at`, `archived_reason` — does NOT write `completed_at`

#### Correction: `createSpace` DOES set date columns

Listed as "no explicit date" but actually sets `created_at: now` and `updated_at: now` at `useGremlyStore.ts:3649-3650`.

#### Correction: `createSpaceChat` DOES set date columns

Listed as "no explicit date" but actually sets `created_at: now` and `updated_at: now` at `useGremlyStore.ts:4031-4033`.

#### Correction: `createMilestone` sets more date columns than documented

Listed as "date" only but also sets `created_at`, `updated_at`, and `completed_at: null` at `useGremlyStore.ts:4244-4248`.

### 7.2 Missed Write Paths — `lib/repo/supabase.ts`

| # | Line | Function | Table | Date Column | Source |
|---|------|----------|-------|-------------|--------|
| 1 | 2998 | `undoCompletion` (habit fallback) | habits | `last_completed_at` | null (clearing — 3rd update path when no progress rows found) |

### 7.3 Missed Write Paths — `lib/store/useGremlyStore.ts`

| # | Line | Function | Table | Date Column | Source |
|---|------|----------|-------|-------------|--------|
| 1 | 3907-3919 | `createGeneralChat` INSERT | space_chats | `created_at`, `updated_at` | DateService `nowTimestamp()` |
| 2 | 4122-4124 | `archiveSpaceChat` | space_chats | `archived_at` | DateService `nowTimestamp()` |
| 3 | 4163 | `addChatMessage` (optimistic) | space_chat_messages | `created_at` | DateService `nowTimestamp()` (optimistic local only; DB uses default) |
| 4 | 5129-5203 | `saveBrief` UPSERT | daily_briefs | `completed_at`, `updated_at`, `created_at` | DateService `nowTimestamp()` + input `completed_at` |
| 5 | 2555-2587 | `finalizeGraduation` | cortex_preferences | `graduated_at` | DateService `nowTimestamp()` |
| 6 | 3830-3901 | `assignDropsToSpace` | todos, notes, habits | `updated_at` | DateService `nowTimestamp()` (writes to each table separately at lines 3860, 3870, 3880) |
| 7 | 3199-3261 | `logHabitCompletionForDate` INSERT | habit_progress | `occurred_day`, `occurred_at` | `occurred_day` from caller; `occurred_at` constructed from day string |
| 8 | 8829-9683 | Entity chat mutations (8 ops: appendEntityChatMessage, finalizeEntityChatStreamingMessage, saveEntityChatNote, updateEntityChatNoteChecklist, updateEntityChatNote, convertNoteToChecklist, deleteEntityChatNote, clearEntityChat) | todos/habits/notes | `updated_at` | DateService `nowTimestamp()` — each goes through `supabase.from(table).update({ views: ..., updated_at: now })` |
| 9 | 7098-7188 | `splitMultiDrop` | notes (original + new) | `archived_at`, `updated_at` (original); `created_at`, `updated_at` (new inserts) | DateService `nowTimestamp()` |
| 10 | 7195-7241 | `resolveMultiDropAsSingle` | notes | `updated_at` | DateService `nowTimestamp()` |
| 11 | 8014-8468 | `resolvePendingDropClarification` (bucket change) | source entity + target entity | source: `archived_at`; target: `due_day`, `due_date`, `target_date`, `scheduled_date`, `start_date`, `date` (varies by bucket), `created_at`, `updated_at` | DateService `nowTimestamp()` for timestamps; enrichment dates for entity fields |
| 12 | 4534-4537 | `handleDayRollover` unfed streak | cortex_preferences | `updated_at` | DateService `nowTimestamp()` |
| 13 | 2423 | `get_training_readiness` RPC | (read) | `p_since` parameter | `trainingStartedAt` from cortex_preferences |

### 7.4 Missed Write Paths — `App.tsx` (main branch)

| # | Line | Function | Table | Date Column | Source |
|---|------|----------|-------|-------------|--------|
| 1 | 406-411 | Reminder snooze (todos) | todos | `reminders_json` containing `{time: HH:mm, date: YYYY-MM-DD}` | `getDateService().now()` + snooze offset |
| 2 | 412-415 | Reminder snooze (habits) | habits | `reminders_json` containing `{time: HH:mm, date: YYYY-MM-DD}` | `getDateService().now()` + snooze offset |
| 3 | 652-656 | Repeated snooze handler | todos/habits | `reminders_json` containing date/time fields | `getDateService().now()` + snooze offset |

### 7.5 Missed Write Paths — `app/screens/SweepFlowScreen.tsx` (main branch)

| # | Line | Function | Table | Date Column | Source |
|---|------|----------|-------|-------------|--------|
| 1 | 1676-1679 | Sweep resurface/remind-later | todos | `resurface_at`, `scheduled_date`, `due_day` | `ds.toLocalDate(resurfaceDate)` from user-picked date |
| 2 | 1710-1726 | Sweep due date | todos | `scheduled_date`, `due_day` | `decision.dueDateStr` from user pick |
| 3 | 1757-1760 | Sweep note resurface | notes | `resurface_at`, `swept_at` | `resurfaceDateStr` from user pick; `getDateService().nowTimestamp()` |
| 4 | 1774 | Sweep note "fine as is" | notes | `swept_at` | `getDateService().nowTimestamp()` |
| 5 | 4349 | Lock-in complete | todos | `completed_at` | `getDateService().nowTimestamp()` |
| 6 | 4357-4359 | Lock-in "tomorrow" reschedule | todos | `scheduled_date`, `due_day`, `due_date` | Tomorrow date from DateService |

### 7.6 Missed Write Paths — `app/screens/CatchAllNotepad.tsx` (main branch)

| # | Line | Function | Table | Date Column | Source |
|---|------|----------|-------|-------------|--------|
| 1 | 8182 | Timing chip | todos | `due_date` | `timingOptionToDate()` using `getDateService().now()` for today/tomorrow/this-weekend/monday |
| 2 | 9329-9334 | Training evening time (first variant) | notification_preferences | `evening_time`, `updated_at` | User time picker; `nowTimestamp()` |
| 3 | 9364-9369 | Training evening time (second variant) | notification_preferences | `evening_time`, `updated_at` | User time picker; `nowTimestamp()` |
| 4 | 4675-4700 | Phase 2 enrichment retry | (LLM call) | `currentDate`, `dayOfWeek`, `timezone` sent to cortex | `dateService.today()`, `Intl.DateTimeFormat`, `getDateService().getTimezone()` — correct |

### 7.7 Missed Temporal Flows — `workers/inngest-jobs/index.js`

| # | Function | Line | Details |
|---|----------|------|---------|
| 1 | `synthesizeUserProfile` | ~1855-1986 | Nightly deterministic profile render. No LLM call, but writes `generated_at` and conditionally `relationship_started_at` to `user_profiles`. |
| 2 | `backfillIdentity` | ~1737-1833 | One-time event-triggered function. Writes `identity.extracted_at` (ISO timestamp) into `user_profiles` JSONB blob. |
| 3 | Force-generate DCO endpoint | ~6895-7054 | HTTP endpoint `/api/force-generate-dco` that runs the entire DCO pipeline synchronously outside Inngest. Same temporal logic as the Inngest DCO pipeline, but a separate code path. Writes to both `user_life_map` and `user_daily_state`. |
| 4 | `dcoDispatcher` cleanup | ~134-151 | DELETEs expired `user_daily_state` rows where `expires_at < now()`. Uses `new Date().toISOString()` (UTC, correct for server). |
| 5 | Weekly Summary save | ~1047-1092 | Writes `week_start_date`, `week_end_date`, `generated_at`, `updated_at` to `weekly_summaries`. Also writes `trend_context` JSONB containing `week_start` in `prior_week_types`. |
| 6 | Profile upsert (nightly synth) | ~1967-1971 | Writes `generated_at` to `user_profiles`. Conditionally writes `relationship_started_at` based on earliest available data. |
| 7 | Space suggestions expire | ~1341-1348 | Writes `updated_at` to `space_suggestions` table when expiring old suggestions. |

### 7.8 Missed Temporal Flows — Notifications Worker

| # | Function | Line | Details |
|---|----------|------|---------|
| 1 | Notification timezone windows | `workers/notifications/index.js` | Uses `getDateInTimezone(userTz)` to compute local date, then matches against `morning_time`, `evening_time`, `afternoon_time` preferences. Correct timezone handling. |
| 2 | `claimNotificationSlot` | ~699-733 | RPC call with `p_date_key` set to `todayInUserTz` (YYYY-MM-DD). Prevents duplicate notifications per day. |
| 3 | Afternoon context | ~835-875 | Queries `todos.due_day` with `lte.${todayDate}` and locked-in items. Date from `getDateInTimezone()`. |
| 4 | **Hardcoded debug dates** | ~135 | `/debug-events` endpoint has hardcoded `2026-02-16` through `2026-03-01`. Debug-only, not production, but stale. |

### 7.9 Missed JSONB Date Storage

| # | Table.Column | JSONB Field | Notes |
|---|-------------|-------------|-------|
| 1 | `user_profiles.identity` | `extracted_at` (ISO timestamp) | Written by `extractIdentity` and `backfillIdentity` in inngest-jobs |
| 2 | `user_profiles` | `generated_at`, `relationship_started_at` | Written by `synthesizeUserProfile` nightly |
| 3 | `weekly_summaries.trend_context` | `prior_week_types[].week_start` | YYYY-MM-DD inside JSONB |
| 4 | `todos/habits.reminders_json` | `[].date` (YYYY-MM-DD), `[].time` (HH:mm) | Written by snooze handlers in App.tsx |

### 7.10 Additional Read Path Timezone Issues

| # | Location | Issue |
|---|----------|-------|
| 1 | `lib/repo/supabase.ts:1906` | `listDueToday` fallback uses `isToday(parseISO(t.due_date))` which interprets ISO in local timezone via date-fns — correct but different from the primary `due_day === todayStr` path |
| 2 | `lib/repo/supabase.ts:1493-1497` | `listByType` `createdAfter`/`createdBefore` filters pass through caller-provided strings with no timezone normalization |
| 3 | `lib/repo/supabase.ts:2425` | `getTodaySummary` uses `${day}T00:00:00Z` with Z suffix — **inconsistent with** `countCompletedToday` (no Z) and `listTodayMerged` (no Z) in the same file |
| 4 | `lib/weeklySummary/buildWeeklySummaryPayload.ts:490,504` | `new Date(ts).getDay()` and `new Date(ts).getHours()` on UTC `completed_at` timestamps — relies on device local timezone. Correct on client but would break if ever run server-side |
| 5 | `lib/sweep/engine.ts:370-372` | Mutates the Date object returned by `getDateService().now()` — code smell, should clone first |

### 7.11 Updated Counts (Revised)

| Metric | Original | Revised |
|--------|----------|---------|
| Total date write paths | ~160 | **~200+** (adding ~40 from verification) |
| Tables with dates ONLY in JSONB | 3 | **5** (adding `user_profiles`, `todos/habits.reminders_json`) |
| Raw `new Date()` bypassing DateService | 3 | **3** (confirmed — server-side usages are intentional) |
| LLM calls without date context (significant) | 4 | **4** (confirmed) |

### 7.12 Additional Quick Wins (from verification)

9. **Fix `sweepApplyAction` todo archive** — Add `archived_at: nowTimestamp()` to match the habit archive path. Currently todos archived via sweep have no `archived_at` timestamp. (~5 min)

10. **Remove hardcoded debug dates in notifications worker** — Replace `2026-02-16`/`2026-03-01` with dynamic date computation. (~5 min)

11. **Clone Date before mutating in sweep engine** — `lib/sweep/engine.ts:370`: Replace `const sevenDaysFromNow = getDateService().now(); sevenDaysFromNow.setDate(...)` with `const sevenDaysFromNow = new Date(getDateService().now().getTime()); ...` (~2 min)

### 7.13 Files Verified Without Issues

The following files were read in full and confirmed to have correct date handling matching the initial audit:

- `lib/minddrop/dropSync.ts` — all DateService, no raw Date()
- `lib/minddrop/phase2.ts` — all DateService, correct enrichment flow
- `lib/minddrop/dropPhases.ts` — correct date context assembly for Phase 2
- `lib/minddrop/phase2Validation.ts` — correct parseAIDate validation
- `lib/date/DateService.ts` — gold standard, no issues
- `lib/date/computeDueDay.ts` — deprecated shim, delegates to DateService
- `lib/sweep/engine.ts` — DateService throughout (one clone issue noted above)
- `lib/conversion.ts` — all nowTimestamp(), correct
- `lib/calendar/calendarSync.ts` — pure functions, no writes
- `lib/calendar/CalendarClient.ts` — pass-through, no date operations
- `lib/store/calendarSelectors.ts` — DateService throughout, correct timezone
- `lib/store/capacitySelectors.ts` — DateService throughout
- `hooks/useEntityMutations.ts` — DateService throughout
- `hooks/useNotificationPreferences.ts` — DateService throughout
- `hooks/useTimezoneSync.ts` — DateService throughout
- `supabase/functions/cortex-proxy/index.ts` — intentional UTC server-side, documented
- `supabase/functions/cortex-learn/index.ts` — intentional UTC server-side
- `cortex/openAiEngine.ts` — no date writes
- `lib/cortex/summarize.ts` — DateService for `last_summary_at`
- `lib/cortex/entities/datetime.ts` — production version correctly uses `getDateService().now()`
- `lib/now/useNowData.ts` / `lib/now/nowSelectors.ts` — DateService throughout
- `src/utils/notifications.ts` — DateService for push token `updated_at`
