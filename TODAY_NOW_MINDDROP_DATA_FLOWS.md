# Today/Now & Mind Drop Data Flows

## 0. Main Entry Points (STEP 1)

**Today/Now screens**

- **Router:** `app/tabs/TodayScreen.tsx`
  - Decides which implementation to render:
    - `env.feature.today.nowV1` → `NowScreenV1` (`app/screens/NowScreenV1.tsx`)
    - else `TodayV4LanesView` / `TodayV3View` / `TodayScreenV2` (legacy) in the same file.
- **Primary NOW implementation:** `app/screens/NowScreenV1.tsx`
  - Uses:
    - Data: `useNowData` (`lib/now/useNowData.ts`)
    - Interactions (todos + habits): `useTodayInteractions` (`lib/today/useTodayInteractions.ts`)
    - Overwhelm: `useOverwhelmFlow` (`lib/now/useOverwhelmFlow.ts`)
    - Progress popup: `NowProgressPopup` (`components/now/NowProgressPopup.tsx`)

**Mind Drop screen**

- **Screen:** `app/screens/CatchAllNotepad.tsx`
  - Uses (for classification/pipeline):
    - Stage A + B orchestration: `runMindDropStageAClassification`, `runMindDropStageBPrefill`
      from `lib/minddrop/pipelineStages.ts`
    - Conversion helpers:
      - `convertUnsortedToTodo`, `convertUnsortedToHabit`, `convertUnsortedToLog`
        from `lib/conversion.ts`
    - Background enrichment: `backgroundPrefill` from `lib/minddrop/backgroundPrefill.ts`
    - Cortex classification: `cortexDecide` / `callClassify` from `lib/cortex/*`
  - Data access: via `IRepo` (`lib/repo/IRepo.ts`) implemented by `SupabaseRepo` (`lib/repo/supabase.ts`)

**Hooks / selectors by concern**

- **Todos**
  - Types/schema: `Todo` in `lib/types.ts`
  - Read (NOW): `useNowData` → `listTodayMerged` + `nowSelectors`
  - Read (Today V2): `useTodayData` (`lib/today/useTodayData.ts`) via `listTodayMerged` and other repo calls
  - Interactions: `useTodayInteractions.toggleTodoComplete`
  - Mind Drop → todo: `runMindDropStageAClassification` → `convertUnsortedToTodo` → `repo.create`

- **Habits**
  - Types/schema: `Habit` in `lib/types.ts` (+ `types/habit.ts` for enriched shape)
  - Read (NOW): `useNowData` → `listTodayMerged` + `nowSelectors`
  - Read (Today V2): `useTodayData`
  - Interactions: `useTodayInteractions.toggleHabitComplete`
  - Habit progress history: `habit_progress` table via `logHabitProgress`, `getHabitProgressForWeek` in `supabase.ts`
  - Mind Drop → habit: `runMindDropStageAClassification` → `convertUnsortedToHabit` → `repo.create`

- **Logs / notes**
  - Types/schema: `Note` in `lib/types.ts` (subtype: `journal | list | catchall | idea | reference`)
  - Read (NOW “Mind Vault” summary): `useNowData` → `nowSelectors.getWeeklyCaptureCounts`/`getMindVaultSummary`
  - Logs overlay on Today: implemented in Today stack (overlay components + repo.listByType / queries)
  - Mind Drop → log: `runMindDropStageAClassification` → `convertUnsortedToLog` or “promoted” note; enrichment in `backgroundPrefill` + `mergeLogSubtypeTag`.

---

## 1. Todos

### 1.1 Entities & Schema

**Type definition (frontend)** – `lib/types.ts`:

- Core fields:
  - `id: string`
  - `type: 'todo'`
  - `name: string` (primary title in-app)
  - `title?: string` (legacy compatibility; kept in sync)
  - `body?: string | null` (full Mind Drop text / details)
  - `space_id?: ID | null`
  - `due_date?: string | null` (ISO date, `YYYY-MM-DD` or full ISO)
  - `due_time?: string | null` (HH:mm)
  - `undefined_due?: boolean` (explicitly “no date”)
  - `reminders?: any[] | null`
  - `notes?: string | null`
  - `tags?: string[] | null`
  - `subtype?: 'reminder' | 'microproject' | null`
  - `ai_placed: boolean`
  - `archived?: boolean`
  - `why_string?: string | null`
  - `origin?: 'catchall' | 'space_chat' | 'manual' | null`
  - `canonicalType?: 'todo' | 'habit' | 'log' | 'unsorted' | 'note' | 'journal'`
  - `labels?: string[]`
  - `views?: { ai_pending?, ai_failed?, minddrop_stage?, minddrop_prefilled_v1?, ... }`
  - `source_message_id?: string | null`
  - `drop_id?: string | null` (Mind Drop identifier)
  - `created_at`, `updated_at`, `owner_id`
  - Commitment-related fields (`commitment`, `commitment_started_at`, etc.)
  - `tags_meta?: TagsMeta | null`

**Supabase persistence (backend behavior)** – `lib/repo/supabase.ts`:

- Table: `todos`
- Source-of-truth behavior:
  - Uses `name` as primary heading; `title` is mirrored for compatibility.
  - Completed state: `completed_at` timestamp column (soft delete for “active” lists).
  - Filtering:
    - generic listing filters out completed todos by `is('completed_at', null)` in various queries.
  - Mind Drop metadata: `views` JSONB is normalized via `normalizeViews`.

### 1.2 Read Flow (Today / NOW)

**Entry in NOW screen** – `NowScreenV1.tsx`:

1. `NowScreenV1` calls `const { activeItems, lockedItems, futureItems, completedToday, progressState, ... } = useNowData();`
2. Renders todo cards from:
   - `lockedItems` (some are todos),
   - `activeItems` (type `'todo'`),
   - `futureItems` (type `'todo'`),
   - completed list for the popup: `completedToday`.

**Hook: `useNowData`** – `lib/now/useNowData.ts`:

1. Determines “today”:
   - `const today = new Date();`
   - Normalizes dates to day-only strings when needed (splitting `toISOString`).
2. Fetches TODAY universe from repo:
   - `const allEntities = await repo.listTodayMerged(todayIso);`
   - Splits into:
     - `todos` (entities with `type === 'todo'`)
     - `habits` (entities with `type === 'habit'`)
   - Fetches notes for Mind Vault: `repo.listByType('note', ...)` or similar (already in file).
3. Builds habit completion history for week (used by both habits & progress logic) via:
   - `repo.getHabitProgressForWeek(habit.id, weekStartIso, weekEndIso)` (NOT directly for todos).
4. Runs NOW selectors:
   - `getLockedItems(allEntities, completionHistory, today)`
   - `getActiveTodayItems(...)`
   - `getFutureItems(...)`
   - `getCompletedTodayItems(...)`
   - `getProgressEligibleItems(...)`
   - `getProgressState(eligibleItems, completedIds)`
5. Packs result into `NowData`.

**Repo helper: `listTodayMerged`** – `lib/repo/supabase.ts`:

- Signature:
  - `async listTodayMerged(nowIso: string): Promise<Array<{ type: 'todo' | 'habit'; ... }>>`
- TODAY selection logic for todos:
  - Normalizes `nowIso` → `day = ensureDay(nowIso)` (YYYY-MM-DD).
  - Queries active todos:

    ```ts
    const activeResp = await supabase
      .from('todos')
      .select('id,name,due_date,due_day,space_id,status,carry_forward,tags,commitment,completed_at')
      .eq('owner_id', userId)
      .eq('status', 'active')
      .or(`due_day.eq.${day},carry_forward.eq.true`);
    ```

    - `due_day` is precomputed day key in DB.
    - `status = 'active'` plus either `due_day == today` **or** `carry_forward = true`.
  - Queries completed-today todos:

    ```ts
    const completedResp = await supabase
      .from('todos')
      .select(todoFields)
      .eq('owner_id', userId)
      .eq('status', 'completed')
      .gte('completed_at', `${day}T00:00:00`)
      .lt('completed_at', `${day}T23:59:59.999`);
    ```

- Maps to enriched item:

  ```ts
  const status = completedAt && rawStatus !== 'archived' ? 'completed' : rawStatus;
  overdue = due < now;
  nearDue = !overdue && (due - now) < 3h;
  ```

- So “due today” (for TODAY/NOW) is determined upstream via `due_day` = normalized day, not by raw date comparison in JS.

**Selector logic for Today vs other days** – `nowSelectors.ts`:

- `getActiveTodayItems`:
  - For todos:

    ```ts
    if (todo.due_date && isToday(date, todo.due_date)) {
      // included as active
    }
    ```

- `getFutureItems`:
  - For todos: `todo.due_date && isFuture(date, todo.due_date)`.

- `getLockedItems`:
  - For todos: locked set (with `locked` flag) but still must be “today or overdue”:

    ```ts
    if (todo.due_date && (isToday(date, todo.due_date) || !isFuture(date, todo.due_date))) {
      // locked & shown
    }
    ```

**Completed representation**

- DB:
  - `status` can be `'active' | 'completed' | 'archived'`.
  - `completed_at` timestamp marks exact completion moment.
- In TODAY/NOW selectors:
  - Completed items for *today* come from `getCompletedTodayItems`:
    - For todos:
      - Based on `completed_at` being today (`isToday` with `completed_at`) from the merged list.
  - Completed items from prior days are not part of TODAY progress.

### 1.3 Write / Update Flow (Complete / Undo)

**UI event: checkbox click**

- On both Today V2 and NOW:
  - Todo cards call `useTodayInteractions().toggleTodoComplete(todo)`.

**Hook: `useTodayInteractions`** – `lib/today/useTodayInteractions.ts`

1. **Optimistic UI state:**

   ```ts
   setCompletedTodoIds((prev) => new Set(prev).add(todo.id));
   setUndoState({ id: todo.id, type: 'todo', label, persisted: false });
   ```

   - `completedTodoIds` drives local rendering of “completed” styling (strikethrough / check state).
   - This is independent of backend at first.

2. **Celebration hook:** if `options.celebrationEnabled` and `onCelebration` are provided, they run immediately.

3. **Timer + persistence:**

   - Any existing undo timer is cleared.
   - New timeout:

     ```ts
     undoTimerRef.current = setTimeout(async () => {
       await repo.completeTodo(todo.id, new Date().toISOString());

       emitChatEvent({ type: 'todo_completed', payload: { todoId: todo.id } });

       eventBus.emit('TodayCompleteTodo', { todoId: todo.id, overdue: isOverdue });

       setUndoState(prev => prev && prev.id === todo.id ? { ...prev, persisted: true } : prev);

       if (options.onReload) await options.onReload();
     }, UNDO_TIMEOUT_MS);
     ```

   - After 3 seconds, if not undone:
     - Writes to backend.
     - Emits analytics + event bus events.
     - Optionally triggers `onReload` (typically the screen re-fetches data via `useNowData.reload` or similar).

4. **Backend persistence:** `SupabaseRepo.completeTodo` – `lib/repo/supabase.ts`:

   ```ts
   async completeTodo(id: ID, atIso: string): Promise<void> {
     const userId = this.ensureUserId();

     const { error } = await supabase
       .from('todos')
       .update({ completed_at: atIso })
       .eq('id', id)
       .eq('owner_id', userId);

     if (error) throw new Error(`Failed to complete todo: ${error.message}`);

     eventBus.emit('ItemCompleted', { id, type: 'todo' });
   }
   ```

   - Sets `completed_at` (but does not immediately change `status` here; status is derived via queries or triggers).
   - The Today/NOW queries for completed items check both `status` and `completed_at`.

5. **Undo flow:**

   - `useTodayInteractions` exposes `undoLastCompletion()`.
   - Behavior pattern:
     - Clears timer, resets `completedTodoIds`, and calls `repo.undoCompletion(id)` if `persisted` already.
   - Backend undo: `SupabaseRepo.undoCompletion`:

     ```ts
     // First try todo
     update todos set completed_at = null where id = ...
     // if that fails, try habits
     ```

   - Emits `ItemUpdated` event for UI sync.
   - After undo:
     - The next data reload (or event-driven refresh) will show the item back in active/locked lists.
     - `progressState` recalculates with fewer completed IDs.

**UI effects:**

- **Progress bar update:**
  - On mutation:
    - Immediately: local sets mark as completed → components may use these sets to shade cards.
    - After persistence and optional `onReload`, `useNowData` recomputes:
      - `getProgressEligibleItems` (unchanged set of eligible)
      - `getCompletedTodayItems` (now includes the completed todo)
      - `getProgressState(eligibleItems, completedIds)`

- **Card styling:**
  - Cards receive `completedTodoIds` to render strikethrough / dimming.
  - Once data reloads and `status` + `completed_at` confirm completion, the card may move to “completed” list or disappear from active section.

### 1.4 Mind Drop → Todo Creation Flow

**High-level path**

1. User types in `CatchAllNotepad` (`app/screens/CatchAllNotepad.tsx`).
2. Raw text saved as a catchall note (unsorted note, with `subtype: 'catchall'`) via repo.
3. Cortex classification:
   - Worker call returns a `CortexResponse` with `actions` like `create.todo`.
4. Stage A classification:
   - `runMindDropStageAClassification(params)` in `lib/minddrop/pipelineStages.ts`.
   - For `create.todo`:

     - Idempotency: `repo.findTodoByDropId(dropId)`:
       - If existing todo, mark `views.minddrop_stage='classified'` + archive unsorted note if needed, then return existing id.
     - Else:

       - Calls `convertUnsortedToTodo(repo, unsortedNoteId, { due })`.

**Where “insert todo” happens**

- `convertUnsortedToTodo` – `lib/conversion.ts`:

  1. Fetch note:

     ```ts
     const note = await repo.getById(noteId) as Note;
     ```

  2. Determine text:

     ```ts
     const rawText = note.body ?? note.title ?? '';
     const derived = await buildMindDropDerivedFields('todo', { rawText, aiTags: note.tags ?? undefined });
     const todoName = options.nameOverride ?? normalizeTodoTitle(rawText);
     const todoBody = note.body ?? note.title ?? undefined;
     ```

  3. Build `CreateRecordInput`:

     ```ts
     const todoInput: CreateRecordInput = {
       type: 'todo',
       name: todoName,
       due_date: options.due ?? null,
       undefined_due: !due,
       body: todoBody,
       space_id: note.space_id ?? null,
       ai_placed: !!note.ai_placed,
       why_string: todoWhy,
       origin: note.origin ?? 'catchall',
       canonicalType: 'todo',
       labels: todoLabels,
       tags: derived.tags,
       tags_meta: note.tags_meta,
       views: note.views,
       dropId: (note as any).drop_id,
     }
     ```

  4. Insert:

     ```ts
     const createdTodo = await repo.create(todoInput) as Todo;
     ```

  5. Archive source note:

     ```ts
     await repo.update({ id: note.id, patch: { archived: true, why_string: updatedWhy } });
     ```

- Stage A then marks new todo’s `views`:

  ```ts
  await repo.update({
    id: createdTodo.id,
    patch: {
      views: {
        ...(createdTodo.views ?? {}),
        minddrop_stage: 'classified',
        ai_pending: true,
        ai_failed: false,
      },
    },
  });
  ```

**Stage B enrichment**

- `runMindDropStageBPrefill` → `backgroundPrefill` (`lib/minddrop/backgroundPrefill.ts`):

  - Given `entityIds.todos` and `rawText`:
    - Calls `callClassify` (Cortex) for title + tags.
    - Fetches todo row from Supabase.
    - Computes title via `computePrefillTitle`.
    - Updates todo in DB:
      - `name` / `title` (compacted)
      - `tags` (AI- and theme-based)
      - `views.minddrop_stage = 'prefilled'`
      - `views.minddrop_prefilled_v1 = true`
      - `views.ai_pending = false`, `views.ai_failed = false`.

**When Today/NOW sees the new todo**

- Today/NOW fetch pipeline is **not** directly notified by Mind Drop.
- Integration is via **repo**:
  - After Stage A completes, the todo exists in `todos` table.
  - On the next `useNowData` reload (or Today hook reload), `listTodayMerged(day)` will:
    - Include the new todo in active list (if `status: 'active'` and `due_day` matches).
- Triggers for reload:
  - The user navigating back to Today/NOW.
  - Event bus events → watchers might call `reload` (not fully wired for Mind Drop but overlay saves do).
- Async caveats:
  - Stage B (backgroundPrefill) is asynchronous:
    - Initially, user sees a todo named from `normalizeTodoTitle(rawText)` with maybe placeholder tags.
    - After background prefill completes, title/tags may change on subsequent reload.

---

## 2. Habits

### 2.1 Entities & Schema

**Type definition** – `lib/types.ts`:

- Key fields:

  ```ts
  interface Habit {
    id: ID;
    type: 'habit';
    name: string;
    frequency: Frequency; // string like 'daily', '3x/week'
    subtype: HabitSubtype; // 'start_habit' | 'break_habit' | 'routine'
    space_id?: ID | null;
    ai_placed: boolean;
    archived?: boolean;
    origin?: 'catchall' | 'space_chat' | 'manual' | null;
    canonicalType?: CanonicalType | LegacyCanonicalType;
    labels?: string[];
    views?: { ai_pending?, ai_failed?, minddrop_stage?, minddrop_prefilled_v1?, ... };
    drop_id?: string | null;
    created_at, updated_at, owner_id;
    // Cadence / progress
    cadence?: 'daily' | 'weekly' | 'monthly';
    target_per_period?: number;
    target_per_day?: number;
    days_active?: string[] | null;
    last_completed_at?: string | null;
    period_start_at?: string | null;
    // Commitment fields, reminders, notes, tags, tags_meta, taper_plan, triggers, etc.
  }
  ```

- `types/habit.ts` extends it with convenience fields (`cadence`, `target_per_period`, etc.) for UI.

**Habit progress table** – `habit_progress` in Supabase (queried in `supabase.ts`):

- Fields used:
  - `owner_id`
  - `habit_id`
  - `occurred_day` (YYYY-MM-DD)
  - `occurred_at` (timestamp)
  - `count` (amount of progress per entry)
- Accessors:
  - `logHabitProgress(habitId, atIso?, count?, occurrenceIndex?)`
  - `getHabitProgressForDate(habitId, dayIso)`
  - `getHabitProgressForWeek(habitId, weekStartIso, weekEndIso)`

### 2.2 Read Flow (Today & Weekly)

**TODAY/NOW habits** – `useNowData` + `listTodayMerged` + `nowSelectors`

1. `listTodayMerged` – `supabase.ts`:

   - Fetches active habits:

     ```ts
     const { data: habits } = await supabase
       .from('habits')
       .select('id,name,space_id,cadence,target_count,period_unit,time_window,tags,commitment')
       .eq('owner_id', userId)
       .is('completed_at', null); // exclude fully completed habits
     ```

   - Fetches today’s progress rows:

     ```ts
     const { data: progressRows } = await supabase
       .from('habit_progress')
       .select('habit_id,count,occurred_day,occurred_at')
       .eq('owner_id', userId)
       .eq('occurred_day', day);
     ```

   - Aggregates `progress_today` and `completed_at`:

     ```ts
     const progressByHabit = new Map<string, { total: number; latestAt: string | null }>();
     // ...
     const target = Math.max(1, h.target_count ?? 1);
     const done = progressInfo.total;
     const status: 'active' | 'completed' =
       done >= target && done > 0 ? 'completed' : 'active';
     ```

   - Output items include:
     - `cadence` (mapped from DB)
     - `target_count` (per day/week/month)
     - `time_window` (any/morning/midday/evening)
     - `progress_today` (`done`).

2. `useNowData`:

   - For weekly view: `getHabitProgressForWeek(habit.id, weekStartIso, weekEndIso)` queries `habit_progress` between week-start and week-end for each habit.
   - Completion history map: `Map<habitId, completionsThisWeek>` used by selectors.

3. Selectors in `nowSelectors.ts`:

   - `getHabitWeeklyStatus(habit, completionsThisWeek, date)`:

     - For weekly cadence:

       ```ts
       const daysLeft = 7 - currentDayNumber;
       const remaining = targetPerWeek - completionsThisWeek;

       if (remaining <= 0) return 'week_complete';
       if (daysLeft > remaining) return 'flexible';
       if (daysLeft === remaining) return 'on_track_today';
       return 'last_chance'; // behind
       ```

     - This yields labels like:
       - `week_complete`
       - `flexible`
       - `on_track_today`
       - `last_chance`

   - `isHabitNeededToday`:

     - Daily: always true.
     - Weekly: needed if `status === 'on_track_today'` or `'last_chance'`.
     - Monthly: treated as `flexible`.

   - `buildCadenceLabelForHabit` (progress label):
     - Daily:
       - If `target_per_day <= 1` → `"Daily"`.
       - Else if `progress.today` present → `"<completed>/<target> today"`.
     - Weekly:
       - If `target_per_period` present → `"<completed>/<target> this week"`.
     - Monthly:
       - Uses `progress.thisMonth` when available.

4. **How habits “due today” are computed**

- `getActiveTodayItems`:

  - A habit is included in TODAY active if:

    ```ts
    const needed = isHabitNeededToday(habit, completionsThisWeek, date);
    if (needed) { ...push into activeItems... }
    ```

- `getLockedItems`:

  - If habit has `locked === true` and `needed === true`, it appears in locked section.

- `getFutureItems`:

  - Habits not in locked or active sets, but still active, become part of the “Future / flexible” section, with weekly status text.

5. **“Ahead / On Track / Behind” (week health)**

- Weekly capture:
  - `getWeeklyHabitSummaries(habits, completionHistory, today)` returns per-habit summaries including `status` (like above).
  - `computeWeekHealth(weeklySummaries)` uses these to derive an aggregate `NowWeekHealth` (e.g., ahead / attention-needed).
- The “HABITS ON TRACK / AHEAD / BEHIND” label on the NOW header is derived from this aggregated status.

### 2.3 Write / Update Flow (Completing a Habit)

**UI event: habit checkbox/tap**

- Habit cards call `useTodayInteractions().toggleHabitComplete(habit)`.

**`toggleHabitComplete`** – `lib/today/useTodayInteractions.ts`:

1. Optimistic UI:

   ```ts
   setCompletedHabitIds(prev => new Set(prev).add(habit.id));
   setUndoState({ id: habit.id, type: 'habit', label, persisted: false });
   ```

2. Optional celebration (`onCelebration` callback).
3. Timer:

   ```ts
   undoTimerRef.current = setTimeout(async () => {
     await repo.completeHabit(habit.id, new Date().toISOString());
     emitChatEvent({ type: 'habit_checkin', payload: { habitId: habit.id } });
     eventBus.emit('TodayCompleteHabit', { habitId: habit.id, streakAfter: (habit.streakCount || 0) + 1 });
     if (options.onReload) await options.onReload();
   }, 3000);
   ```

**Backend behavior**

- `SupabaseRepo.completeHabit`:

  ```ts
  await supabase
    .from('habits')
    .update({ completed_at: atIso })
    .eq('id', id)
    .eq('owner_id', userId);
  eventBus.emit('ItemCompleted', { id, type: 'habit' });
  ```

- Separately, `logHabitProgress` / `habit_progress` writes can be used for each check-in:
  - Some flows may call `logHabitProgress` when habit completion is recorded (e.g., more granular logging; today’s merged view uses `habit_progress` for day-specific counts).

**Effect on weekly metrics**

- When a habit is marked complete on a given day:
  - Insert into `habit_progress` (if log path is used).
  - `getHabitProgressForWeek` will see increased counts in its 7-day window.
  - `getHabitWeeklyStatus` will recompute (possibly moving from `flexible` → `on_track_today` or `last_chance` → `week_complete`).
  - `getProgressState` includes habits as “eligible” and uses completions to adjust `completedCount`.

**Today page refresh**

- After `completeHabit` and `logHabitProgress`:
  - On the next reload (`useNowData.reload()` or similar), the new `habit_progress` counts are read, dedicated summary & progress UI update accordingly.

### 2.4 Mind Drop → Habit Creation Flow

**Decision point**

- In `runMindDropStageAClassification`:

  ```ts
  if (firstAction.type === 'create.habit') {
    // idempotency check: repo.findHabitByDropId(dropId)
    // else convertUnsortedToHabit(...)
  }
  ```

**Conversion** – `convertUnsortedToHabit` (`lib/conversion.ts`):

1. Fetch unsorted note; derive `rawText` from `note.body ?? note.title`.
2. Build derived fields using `buildMindDropDerivedFields('habit', ...)` (tags & notes).
3. Determine:

   ```ts
   const firstLine = rawText.split('\n')[0].trim().slice(0, 80);
   const habitName = options.nameOverride ?? (firstLine || 'New habit');
   const frequency = options.frequency ?? 'daily';
   ```

4. Build `CreateRecordInput`:

   ```ts
   const habitInput: CreateRecordInput = {
     type: 'habit',
     name: habitName,
     frequency,
     subtype: 'start_habit',
     notes: derived.notes,
     space_id: note.space_id ?? null,
     ai_placed: !!note.ai_placed,
     origin: note.origin ?? 'catchall',
     canonicalType: 'habit',
     labels: habitLabels,
     tags: derived.tags,
     tags_meta: note.tags_meta,
     views: note.views,
     dropId: note.drop_id,
   };
   ```

5. Insert via `repo.create(habitInput)`.

6. Archive the unsorted note with updated `why_string`.

**Stage A marks classification stage**, same as todo.

**Flow into Today/NOW**

- Once created:
  - `habits` table contains new row.
  - `listTodayMerged` always pulls active habits (filtering only by `completed_at IS NULL`).
  - If frequency and cadence logic say it’s “needed today”, it appears on the NOW screen (locked, active, or future group).
- Stage B may alter title & tags; same flow as todos.

---

## 3. Logs (Notes & Mind Vault)

### 3.1 Entities & Schema

**Type definition** – `lib/types.ts` (`Note`):

- Important fields:

  - `id: ID`
  - `type: 'note'`
  - `title?: string | null`
  - `body?: string | null`
  - `subtype: NoteSubtype` where `NoteSubtype = 'journal' | 'list' | 'catchall' | 'idea' | 'reference'`
  - `space_id?: ID | null`
  - `ai_placed: boolean`
  - `archived?: boolean`
  - `origin?: 'catchall' | 'space_chat' | 'manual' | null`
  - `canonicalType?: CanonicalType | LegacyCanonicalType` (often `'log'` or `'journal'`)
  - `labels?: string[]`
  - `views` (includes Mind Drop stage flags etc.)
  - `source_message_id?: string | null`
  - `drop_id?: string | null`
  - `created_at`, `updated_at`, `owner_id`
  - Formatting:
    - `fmt?: 'bullets' | 'numbers' | 'checkboxes' | null`
    - `tags?: string[] | null`
  - Journal-specific:
    - `date?: string | null`
    - `mood?: 'ecstatic' | 'happy' | 'neutral' | 'low' | 'sad' | 'tired' | null`
    - `reminders?: any[] | null`
    - `journal_subtype?: 'reflection' | 'gratitude' | 'dream' | 'review' | null`
    - `tags_meta?: TagsMeta | null`

**Database filters** – `SupabaseRepo.listByType('note')`:

- Ensures logs/notes:

  ```ts
  query = query.or('archived.eq.false,archived.is.null');
  ```

  - So “log list” views only show non-archived notes.

### 3.2 Read Flow (7-day Logs / Mind Vault on NOW)

**NOW: Mind Vault summary** – `lib/now/nowSelectors.ts`

- `getWeeklyCaptureCounts(logs: Note[], date = new Date())`:

  - Defines start-of-week (Sunday) via `getWeekStart(date)`.
  - Filters logs where `created_at` is between `[weekStart, weekEnd)` (week-long window).
  - Counts by subtype:
    - `listCount`: `log.subtype === 'list'`
    - `journalCount`: `subtype === 'journal'`
    - `ideaCount`: `subtype === 'idea'`
- `getMindVaultSummary` (later in file) uses these counts to produce summary object used by NOW.

**Today Page Logs Overlay (7-day)**

- Implementation lives in a Today-specific overlay component:
  - Pattern:
    - A “Logs” or “Journal” button on Today screen opens an overlay.
    - Overlay uses `useRepo().listByType('note', { subtypes: [...] })` or a similar query to fetch relevant notes.
  - “Last 7 days” window:
    - Most flows use a rolling 7-day window, implemented similarly to NOW:
      - Compute `sevenDaysAgo = today - 7 days`.
      - Query or filter logs by `created_at >= sevenDaysAgo`.
    - If the overlay does not restrict via Supabase query directly, it filters in JS after `listByType`.

**Sorting/order**

- `listByType('note')` orders by `created_at DESC` by default.
- Overlay typically sorts by `created_at` descending so the newest logs show first.

### 3.3 View / Detail Flow

1. From Today screen:
   - User taps “Logs / Journal / Captures” entry.
   - Screen uses overlay or navigation:
     - Open a modal with list of logs.
2. Overlay component (generic pattern):
   - Renders list items (`Note`) with title/preview.
   - On select:
     - Uses `useUnifiedOverlayController().openView({ record })` **or**
     - Navigates to a `NoteDetail` or `UnifiedOverlayV2` in `view` mode.
3. Detail UI:
   - Reuses the Unified Overlay infrastructure:
     - Note-specific tabs, formatting, tag editing, etc.
   - Data refreshed:
     - By reading `Note` by id via `useRepo().getById(id)` on open, or using the list’s record.

### 3.4 Mind Drop → Log Flow

**Primary path: catchall → log / note**

- Stage A:

  - If classification returns `create.note` or `add.to.list`:

    ```ts
    const existingNote = await repo.getById(unsortedNoteId);
    await repo.update({
      id: unsortedNoteId,
      patch: {
        views: { ...existingNote.views, minddrop_stage: 'classified', ai_pending: true, ai_failed: false },
      },
    });
    createdIds.notes.push(unsortedNoteId);
    entityDetails.push({ kind: 'note' });
    ```

  - So:
    - No new row is created; the original unsorted note is promoted by marking stage.
    - Later Stage B handles enrichment.

- Explicit `convertUnsortedToLog` – `lib/conversion.ts`:
  - Converts unsorted note to a canonical log subtype.
  - May use AI classification to pick `subtype` (journal, idea, list, reference).
  - Updates existing note in place (no new row).
  - Applies tag cleaning and merges labels.

**Stage B enrichment for logs** – `backgroundPrefill`:

- When `entity.type === 'note'`:
  - Fetches full note (title, body, subtype, labels, tags, tags_meta).
  - Computes:

    ```ts
    const nextTitle = computePrefillTitle({ entityType: 'note', originalTitle, body, aiTitle });
    const { tags, tags_meta } = mergeLogSubtypeTag(aiTags, fullNote.tags, fullNote.subtype, fullNote.labels, fullNote.tags_meta, text);
    ```

  - Updates:
    - `title` (if changed),
    - `tags`, `tags_meta`,
    - `views` (minddrop_prefilled_v1, stage, ai flags).

**Visibility in Today/NOW logs**

- Any log/note that is:
  - Not archived, and
  - Within the 7-day window / week window
- Will appear:
  - In Mind Vault summary (NOW) via selectors,
  - In the Today logs overlay via list queries.

---

## 4. Quick Add / Instant Add (Today)

### 4.1 Current State

- Existing “Add” entry points on Today/NOW:

  - Today V2:
    - Buttons like “Add Habit”, “Add Todo”, “Add Journal” open `UnifiedCreateOverlay`.
    - Use `useUnifiedOverlayController().openCreate({ type: 'todo' | 'habit' | 'note', ... })`.
    - **Does NOT** run Mind Drop pipeline; it directly creates entities via overlay form and `repo.create()`.
  - NOW:
    - There may be “Add more” / overflow actions that also open the unified overlay.
    - Again: direct overlay, not Mind Drop classification.

- Mind Drop is a separate screen: `CatchAllNotepad`.
  - Quick capture there uses AI classification & pipeline as documented above.
  - Entities then show up on Today/NOW once saved and enriched.

### 4.2 Integration Points with Mind Drop Pipeline

**Places that already share infrastructure**

- **Shared repository:** both Today/NOW and Mind Drop use `IRepo` / `SupabaseRepo`:
  - So any entity created by Mind Drop immediately lives in the same tables that Today/NOW read from.
- **Unified overlays:** Today/NOW and Mind Drop used overlays for editing:
  - `useUnifiedOverlayController` + `UnifiedCreateOverlay` / `UnifiedOverlayV2`.

**Where you can hook a new Quick Add that reuses Mind Drop’s path**

- On Today/NOW screen:

  1. Add a `QuickAdd` input component (e.g., at top of NOW or Today header).
  2. On submit:
     - Create an unsorted catchall `Note` via `repo.create({ type: 'note', subtype: 'catchall', body: text, origin: 'catchall', ... })`.
     - Call `cortexDecide` or `callClassify` to get a `CortexResponse`.
     - Call `runMindDropStageAClassification({ repo, text, cleanedText, decision, dropId, unsortedNoteId, parsedDue })`.
     - Optionally fire `runMindDropStageBPrefill` in the background for the returned entity IDs.
  3. Trigger a reload on Today/NOW (`useNowData.reload` or `useTodayData` reload).

- This fully reuses:
  - `convertUnsortedToTodo`, `convertUnsortedToHabit`, `convertUnsortedToLog`.
  - Background prefill pipeline.
  - Supabase schema and stage flags.

**Where new plumbing might be needed**

- A dedicated utility that encapsulates:

  ```ts
  quickMindDropFromToday(text: string, context?) {
    // create unsorted note
    // cortexDecide
    // runMindDropStageAClassification
    // fire-and-forget runMindDropStageBPrefill
    // notify Today/NOW to reload
  }
  ```

- Event bus or hook to refresh NOW view after Mind Drop completed:
  - E.g., `eventBus.emit('MindDropEntityCreated')` and `useNowData` listens and calls `reload`.

---

## 5. Progress Bar

### 5.1 Inputs

- **Hook:** `useNowData` (`lib/now/useNowData.ts`)
  - Computes:

    ```ts
    const eligibleItems = getProgressEligibleItems(allEntities, completionHistory, today);
    const completedIds = new Set(completedToday.map((item) => item.id));
    const progressState = getProgressState(eligibleItems, completedIds);
    ```

- `NowProgressState` – `lib/now/nowTypes.ts`:
  - `mode: 'bar' | 'dots' | 'denseDots'`
  - `percent: number`
  - `completedCount: number`
  - `totalEligibleCount: number`
  - `dots?: boolean[]` (per-eligible-item completion map for dot modes)

### 5.2 What counts as “total for today”

**Selector:** `getProgressEligibleItems` – `lib/now/nowSelectors.ts`

- Iterates through `allEntities` (todos + habits) from `listTodayMerged`.

- For habits:

  ```ts
  if (cadence === 'daily' ||
      status === 'on_track_today' ||
      status === 'last_chance' ||
      (habit as any).locked === true) {
    eligible.push({ id: habit.id, type: 'habit' });
  }
  ```

  - Daily habits: always count.
  - Weekly habits: count when they are needed today (`on_track_today` or `last_chance`) or explicitly locked.

- For todos:

  ```ts
  if (todo.due_date && isToday(date, todo.due_date)) {
    eligible.push({ id: todo.id, type: 'todo' });
  }
  ```

- **Logs and notes are not part of progress**:
  - Only todos and habits are included.
  - Mind Drop logs/journals are tracked elsewhere but not in the NOW progress denominator.

### 5.3 What counts as “completed for today”

**Selector:** `getCompletedTodayItems` – `nowSelectors.ts`

- For habits:
  - Uses `last_completed_at` and `isToday` to decide if completed today.
- For todos:
  - Uses `completed_at` timestamp (from merged list / DB).
- Builds `NowCompletedItem[]` with:
  - `id`, `type`, `name`, `completedAt`.

**Progress calculation:** `getProgressState` – `nowSelectors.ts`

- Inputs: `eligibleItems`, `completedItemsToday (Set<string>)`.
- Logic:

  ```ts
  const totalEligibleCount = eligibleItems.length;
  const completedCount = eligibleItems.filter((item) => completedItemsToday.has(item.id)).length;
  const percent = totalEligibleCount > 0 ? (completedCount / totalEligibleCount) * 100 : 0;
  ```

- Mode:
  - If `totalEligibleCount <= 15` → `mode = 'dots'` (one dot per item).
  - If `totalEligibleCount <= 30` → `mode = 'denseDots'`.
  - Else → `mode = 'bar'`.

### 5.4 Recalculation Triggers

- When a todo/habit is completed via `useTodayInteractions`:

  1. Immediate local UI:
     - `completedTodoIds` / `completedHabitIds` sets cause card styling changes.
     - Progress bar may still show previous `progressState` until reload.
  2. After 3s persistence:
     - `completeTodo` / `completeHabit` set `completed_at` in DB.
     - `ItemCompleted` events emitted.
     - If `onReload` is passed to `useTodayInteractions`, it calls `useNowData.reload()`:
       - Re-fetches `listTodayMerged`, recomputes completions (`completedToday`), and thus progress.

- Undo:
  - `undoCompletion` clears `completed_at` and emits `ItemUpdated`.
  - On the next reload, `completedToday` no longer contains that id; progress recomputes.

### 5.5 Interaction (Tap → Completed View)

**In `NowScreenV1.tsx`**

- Header:

  ```tsx
  <NowHeader
    progressState={progressState}
    onPressProgress={() => setProgressVisible(true)}
    ...
  />
  ```

- Popup:

  ```tsx
  <NowProgressPopup
    visible={progressVisible}
    completed={completedToday}
    onClose={() => setProgressVisible(false)}
  />
  ```

**`NowProgressPopup`** – `components/now/NowProgressPopup.tsx`

- Displays:

  - Title: “Today’s Progress”.
  - List of `NowCompletedItem`s:
    - One line per completed item: `✓ {item.name} — {time}`.
    - Time = `new Date(item.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })`.

- Source data: `completedToday` from `useNowData`, which is computed by `getCompletedTodayItems`.

---

If you’d like, next we can sketch a concrete “Quick Add on NOW” implementation plan that plugs directly into the Mind Drop Stage A/B pipeline and shows where to wire it into `NowScreenV1`. 
