# Quick Add on NOW – Implementation Plan

## 0. Goal & Constraints

**Goal:** Add a "Quick Add" entry point on the NOW screen that lets the user type a short thought (like Mind Drop), runs it through the existing Mind Drop Stage A/B pipeline, and surfaces the resulting todo/habit/log back in the NOW / Today flows.

**Key Constraints:**
- Reuse existing Mind Drop code paths as much as possible (Stage A/B, conversions, background prefill).
- Do **not** fork or duplicate the pipeline; Quick Add should be a thinner UX shim over existing primitives.
- Keep `NowScreenV1` relatively small: isolate most new logic into hooks and helpers.
- Maintain undo/optimistic behavior consistent with the rest of Today/NOW.

---

## 1. High-Level UX & Data Flow

1. User taps a **Quick Add input** on `NowScreenV1` (e.g., a small text field above Active section).
2. User types a short phrase and hits **Enter** or presses a small action button.
3. Client:
   - Creates a minimal **unsorted note** row (same as Mind Drop initial note) via repo or a helper.
   - Immediately calls Mind Drop **Stage A classification** for that note.
   - Depending on the classification result, it converts the note into a `Todo`, `Habit`, or `Note` using existing conversion helpers.
   - Optionally kicks off **Stage B / background prefill** for title/tags.
4. The resulting entity (todo/habit/log) is written via existing repo methods.
5. `useNowData` + `nowSelectors` pick up the new entity and the NOW UI updates.

---

## 2. Reusing Existing Mind Drop Infrastructure

### 2.1. Existing Pieces to Reuse

- `CatchAllNotepad` (reference only; do not call from Quick Add):
  - Patterns for creating the initial unsorted note.
  - How it calls Stage A/B helpers.
- `lib/minddrop/pipelineStages.ts`:
  - `runMindDropStageAClassification` – orchestrates classification + conversion.
  - `runMindDropStageBPrefill` – optional AI prefill/enrichment stage.
- `lib/minddrop/backgroundPrefill.ts`:
  - Logic invoked by Stage B to enrich titles/tags.
- `lib/conversion.ts`:
  - `convertUnsortedToTodo`
  - `convertUnsortedToHabit`
  - `convertUnsortedToLog`
- `lib/repo/IRepo.ts` / `lib/repo/supabase.ts`:
  - Methods to create initial unsorted note (pattern already exists in Mind Drop).
  - Existing `create`, `update`, and type-specific operations for todos/habits/logs.

### 2.2. New Small Helper: `runQuickAddMindDrop` (Wrapper)

**File:** `lib/minddrop/runQuickAddMindDrop.ts` (new)

**Responsibility:** Thin wrapper that:
- Accepts a raw text input and optional context (e.g., `source: 'now_quick_add'`).
- Creates an unsorted note row via repo.
- Invokes `runMindDropStageAClassification` with minimal options tailored for Quick Add.
- Optionally invokes `runMindDropStageBPrefill`.
- Returns the **final created entity** (todo/habit/log) or at least its ID/type.

**Signature sketch (conceptual):**
- `runQuickAddMindDrop(text: string, opts?: { source?: string }): Promise<{ type: 'todo' | 'habit' | 'note'; id: string }>`

**Internal steps:**
1. Use the same helper or repo call as `CatchAllNotepad` to create the base note.
2. Call `runMindDropStageAClassification` with that note ID.
3. Inspect the result to learn what entity was created (todo/habit/note) and its ID.
4. Kick off `runMindDropStageBPrefill` in the background (no need to block UI).
5. Resolve with `{ type, id }` so the caller can optionally navigate or highlight.

---

## 3. NOW Screen Integration

### 3.1. UI Entry Point on `NowScreenV1`

**File:** `app/screens/NowScreenV1.tsx`

Add a small **Quick Add** component near the top of the screen:

- Just under the greeting / progress header, above Active items.
- Consists of:
  - A single-line `TextInput` for the quick thought.
  - A subtle placeholder like: "Quick add using Mind Drop…".
  - Optional action button (e.g., "Add" or paper-plane icon) and/or submit on Enter.

Implementation-wise, avoid bloating `NowScreenV1` by introducing a small presentational component.

### 3.2. New Component: `NowQuickAddBar`

**File:** `components/now/NowQuickAddBar.tsx` (new)

**Props:**
- `onSubmit(text: string): Promise<void>` – caller wires this to Mind Drop pipeline.
- `isSubmitting: boolean` – to show spinner/disable input.

**Behavior:**
- Local state for `text`.
- On submit:
  - Trim text; if empty, no-op.
  - Call `onSubmit(text)`, then clear the input on success.
  - Optionally show a small error inline if it fails.

`NowScreenV1` will import and place this component in the layout.

### 3.3. New Hook: `useNowQuickAdd`

**File:** `lib/now/useNowQuickAdd.ts` (new)

**Responsibility:** State + side effects for Quick Add logic, bridging UI and Mind Drop pipeline.

**Signature sketch:**
- `useNowQuickAdd(): { onQuickAdd(text: string): Promise<void>; isSubmitting: boolean }`

**Internal behavior:**
1. Grabs `repo` instance / Mind Drop helpers via existing hooks or context used in `CatchAllNotepad`.
2. Maintains `isSubmitting` state.
3. `onQuickAdd(text)`:
   - Sets `isSubmitting = true`.
   - Calls `runQuickAddMindDrop(text, { source: 'now_quick_add' })`.
   - On success:
     - Optionally trigger a light haptic / toast.
     - Optionally scroll to top or briefly highlight the new item (future enhancement).
   - On failure:
     - Surface error (toast, inline error) but keep NOW stable.
   - Finally, sets `isSubmitting = false`.

4. After the entity is created, **no extra manual refresh** should be necessary if:
   - `SupabaseRepo` emits the usual update events, and
   - `useNowData` subscribes to the correct reactive source (as it does today).
   If the data is not auto-refreshing, we can:
   - Expose a `refetch()` from `useNowData` and call it here, or
   - Emit a dedicated event that NOW’s data hook listens to.

### 3.4. Wiring into `NowScreenV1`

Within `NowScreenV1`:

1. Import the new hook and component:
   - `useNowQuickAdd` from `lib/now/useNowQuickAdd`.
   - `NowQuickAddBar` from `components/now/NowQuickAddBar`.
2. Inside the component body:
   - Call `const { onQuickAdd, isSubmitting } = useNowQuickAdd();`
3. In JSX layout:
   - Insert `<NowQuickAddBar onSubmit={onQuickAdd} isSubmitting={isSubmitting} />` below the header.

This keeps `NowScreenV1` focused on composition, not business logic.

---

## 4. Hooks & Data Integration Details

### 4.1. Accessing Repo and Mind Drop Helpers

In `useNowQuickAdd`:

- Mirror the patterns used in `CatchAllNotepad` to obtain:
  - The `repo`/client used to create the unsorted note.
  - Functions or context for invoking `runMindDropStageAClassification` and `runMindDropStageBPrefill`.
- If these are not directly exposed as hooks yet, create a small shared helper:
  - E.g., `useMindDropPipeline()` in `lib/minddrop/useMindDropPipeline.ts` that exposes:
    - `runStageAForNote(noteId: string)`
    - `runStageBForNote(noteId: string)`

For Quick Add, that hook can be used by both `CatchAllNotepad` and `useNowQuickAdd` to avoid duplication.

### 4.2. Minimal Unsorted Note Creation

- Ensure there is a common helper that creates the base Mind Drop note with the same shape as `CatchAllNotepad` uses (e.g., note type, status, tags, `source` metadata).
- Add `source = 'now_quick_add'` or similar to distinguish events/analytics.

### 4.3. Ensuring NOW Picks Up New Items

- Verify that `listTodayMerged` and related repo methods include newly created todos/habits in the "today" set based on:
  - `due_at` / `scheduled_for` for todos.
  - Default cadence for habits.
- For Quick Add, we should:
  - Default todo due date to **today**.
  - For habits, default cadence in a way that they appear in NOW (e.g., daily or appropriate schedule).
- Confirm that `useNowData` subscribes to changes emitted when new entities are created.
- If not, extend `useNowData` to expose a `refetch()` that `useNowQuickAdd` can call after a successful pipeline run.

---

## 5. Edge Cases & UX Considerations

### 5.1. Slow AI / Offline

- If Cortex/AI is slow or unavailable:
  - Still create the base note and show a small message: "We’ll classify this in the background." (Optional).
  - Return early so the UI does not block for too long.
- In the minimal implementation:
  - Keep it simple: show a spinner during Stage A, and surface an error toast if it fails.

### 5.2. Classification Ambiguity

- Stage A may be uncertain between todo/habit/log.
- Rely on existing behavior in `runMindDropStageAClassification` – Quick Add should not add special branching unless required.
- If Stage A returns no decision, fallback strategies:
  - Default to todo.
  - Or leave as note and let the user triage later.

### 5.3. Multiple Rapid Adds

- Support multiple adds back-to-back:
  - Do not lock the whole NOW screen; only disable the input while a single request is running.
  - Optionally allow queuing multiple quick adds (v2).

### 5.4. Error Handling

- Use the same error reporting UX as Today/NOW interactions (`useTodayInteractions`) to keep things consistent.
- Provide a simple, non-blocking toast on failure: "Quick Add failed. Please try again.".

---

## 6. Implementation Phases

### Phase 1 – Plumbing & Wrapper

1. Extract/create shared helpers from `CatchAllNotepad`:
   - `createUnsortedNote(text, source)`.
   - `runMindDropStageAClassification(noteId)` wrapper.
   - `runMindDropStageBPrefill(noteId)` wrapper.
2. Implement `runQuickAddMindDrop` in `lib/minddrop/runQuickAddMindDrop.ts` using these helpers.
3. Add unit/behavior tests around `runQuickAddMindDrop` where feasible, focusing on:
   - Correctly creating notes.
   - Invoking Stage A and returning the resulting entity type/ID.

### Phase 2 – NOW UI Wiring

1. Create `components/now/NowQuickAddBar.tsx` with the simple input + submit UX.
2. Create `lib/now/useNowQuickAdd.ts` that uses `runQuickAddMindDrop`.
3. Wire `NowQuickAddBar` + `useNowQuickAdd` into `NowScreenV1`.
4. Manually verify:
   - New todos/habits appear in NOW.
   - Progress bar and completed items behave correctly after completion.

### Phase 3 – Polishing & Telemetry (Optional)

1. Add analytics/telemetry for Quick Add usage, classification results, and fallbacks.
2. Add light animations/highlights for newly added items.
3. Expand tests to cover error paths, offline, and ambiguous classifications.

---

## 7. Where to Wire in `NowScreenV1`

**File:** `app/screens/NowScreenV1.tsx`

Concrete wiring steps:

1. **Imports:**
   - Add imports for `NowQuickAddBar` and `useNowQuickAdd` at the top.
2. **Hook usage:**
   - Inside `NowScreenV1` component body, call `useNowQuickAdd()` to retrieve `onQuickAdd` and `isSubmitting`.
3. **Layout placement:**
   - In the JSX tree, find the section where the header/greeting and progress bar are rendered.
   - Insert `<NowQuickAddBar onSubmit={onQuickAdd} isSubmitting={isSubmitting} />` directly below the greeting/progress container.
4. **Styling:**
   - Use existing NOW typography and spacing tokens so the new bar fits visually.

This ensures Quick Add is a **first-class NOW affordance** but remains a thin shim over the Mind Drop Stage A/B pipeline, aligning with your goal of reusing existing architecture without duplicating logic.
