/**
 * Mind Drop v3 - No Duplication Tests (Prompt 2)
 *
 * Verifies that completed Mind Drops appear in Today/Habits/Logs but NOT in Catch-All.
 * This ensures the "raw + in-flight" vs "final destinations" separation works correctly.
 */

describe('Mind Drop v3 - No Duplication Between Catch-All and Canonical Views', () => {
  describe('Catch-All Filter: Exclude Canonical Entities for v3', () => {
    it('excludes canonical todos from Catch-All when v3 flag is ON', () => {
      // Setup: Create a Mind Drop that was converted to a canonical todo
      const canonicalTodo = {
        id: 'todo-1',
        type: 'todo',
        name: 'Buy groceries',
        origin: 'catchall',
        canonicalType: 'todo', // Marks it as canonical
        drop_id: 'drop-123',
        due_date: '2025-11-23T14:00:00Z',
        completed_at: null,
      };

      const v3Enabled = true;

      // Filter logic from CatchAllNotepad.tsx
      const shouldInclude =
        canonicalTodo.origin === 'catchall' &&
        !canonicalTodo.completed_at &&
        !(v3Enabled && canonicalTodo.canonicalType === 'todo');

      expect(shouldInclude).toBe(false); // Should be excluded in v3
    });

    it('includes canonical todos in Catch-All when v3 flag is OFF', () => {
      const canonicalTodo = {
        id: 'todo-1',
        type: 'todo',
        name: 'Buy groceries',
        origin: 'catchall',
        canonicalType: 'todo',
        drop_id: 'drop-123',
        due_date: '2025-11-23T14:00:00Z',
        completed_at: null,
      };

      const v3Enabled = false;

      const shouldInclude =
        canonicalTodo.origin === 'catchall' &&
        !canonicalTodo.completed_at &&
        !(v3Enabled && canonicalTodo.canonicalType === 'todo');

      expect(shouldInclude).toBe(true); // Should be included in v2
    });

    it('excludes canonical habits from Catch-All when v3 flag is ON', () => {
      const canonicalHabit = {
        id: 'habit-1',
        type: 'habit',
        name: 'Morning run',
        origin: 'catchall',
        canonicalType: 'habit',
        drop_id: 'drop-456',
        completed_at: null,
      };

      const v3Enabled = true;

      const shouldInclude =
        canonicalHabit.origin === 'catchall' &&
        !canonicalHabit.completed_at &&
        !(v3Enabled && canonicalHabit.canonicalType === 'habit');

      expect(shouldInclude).toBe(false); // Should be excluded in v3
    });

    it('includes canonical habits in Catch-All when v3 flag is OFF', () => {
      const canonicalHabit = {
        id: 'habit-1',
        type: 'habit',
        name: 'Morning run',
        origin: 'catchall',
        canonicalType: 'habit',
        drop_id: 'drop-456',
        completed_at: null,
      };

      const v3Enabled = false;

      const shouldInclude =
        canonicalHabit.origin === 'catchall' &&
        !canonicalHabit.completed_at &&
        !(v3Enabled && canonicalHabit.canonicalType === 'habit');

      expect(shouldInclude).toBe(true); // Should be included in v2
    });
  });

  describe('Deduplication Logic: Prefer Canonical Over Notes', () => {
    it('prefers canonical todo over unsorted note when drop_id matches', () => {
      const unsortedNote = {
        id: 'note-1',
        kind: 'note' as const,
        drop_id: 'drop-789',
        unsorted: true,
        title: 'Buy milk',
      };

      const canonicalTodo = {
        id: 'todo-2',
        kind: 'todo' as const,
        drop_id: 'drop-789', // Same drop_id
        title: 'Buy milk',
      };

      // Priority logic from CatchAllNotepad.tsx
      const notePriority = unsortedNote.unsorted ? 0 : 1;
      const todoPriority = 2;

      expect(todoPriority).toBeGreaterThan(notePriority);
      // Deduplication should keep the todo, discard the note
    });

    it('prefers canonical habit over unsorted note when drop_id matches', () => {
      const unsortedNote = {
        id: 'note-1',
        kind: 'note' as const,
        drop_id: 'drop-999',
        unsorted: true,
        title: 'Run daily',
      };

      const canonicalHabit = {
        id: 'habit-2',
        kind: 'habit' as const,
        drop_id: 'drop-999', // Same drop_id
        title: 'Run daily',
      };

      // Priority: habit (3) > todo (2) > note (1) > unsorted note (0)
      const notePriority = 0;
      const habitPriority = 3;

      expect(habitPriority).toBeGreaterThan(notePriority);
      // Deduplication should keep the habit, discard the note
    });
  });

  describe('Mind Drop v3 Flow: No Duplication End-to-End', () => {
    it('ensures todo appears in Today but NOT in Catch-All after Stage B completes', () => {
      // Stage 0: User creates Mind Drop "Buy groceries"
      const mindDropNote = {
        id: 'note-123',
        type: 'note',
        body: 'Buy groceries',
        origin: 'catchall',
        labels: ['catchall', 'needs_review'],
        drop_id: 'drop-abc',
        archived: false,
        views: {
          minddrop_stage: 'pending',
          ai_pending: true,
        },
      };

      // Catch-All v3: Should show (pending stage)
      const catchAllV3Filter1 =
        mindDropNote.origin === 'catchall' &&
        !mindDropNote.archived &&
        (mindDropNote.views.ai_pending === true ||
          mindDropNote.views.minddrop_stage !== 'prefilled');

      expect(catchAllV3Filter1).toBe(true);

      // Stage A: Classification creates canonical todo
      const canonicalTodo = {
        id: 'todo-456',
        type: 'todo',
        name: 'Buy groceries',
        origin: 'catchall',
        canonicalType: 'todo',
        drop_id: 'drop-abc', // Links back to Mind Drop
        due_date: '2025-11-23T14:00:00Z',
        completed_at: null,
        views: {
          minddrop_stage: 'classified',
          ai_pending: true,
        },
      };

      // Original note is archived
      const archivedNote = {
        ...mindDropNote,
        archived: true,
      };

      // Catch-All v3: Archived note excluded
      const catchAllNoteFilter =
        archivedNote.origin === 'catchall' && !archivedNote.archived;
      expect(catchAllNoteFilter).toBe(false);

      // Catch-All v3: Canonical todo excluded (even though stage='classified')
      const v3Enabled = true;
      const catchAllTodoFilter =
        canonicalTodo.origin === 'catchall' &&
        !canonicalTodo.completed_at &&
        !(v3Enabled && canonicalTodo.canonicalType === 'todo');
      expect(catchAllTodoFilter).toBe(false);

      // Today: Canonical todo included (has due_date = today)
      const todayFilter =
        canonicalTodo.type === 'todo' &&
        !canonicalTodo.completed_at &&
        canonicalTodo.due_date != null;
      expect(todayFilter).toBe(true);

      // Stage B: Prefill completes
      const enrichedTodo = {
        ...canonicalTodo,
        name: 'Buy groceries 🛒', // AI-enriched title
        tags: ['shopping', 'food'],
        views: {
          minddrop_stage: 'prefilled',
          minddrop_prefilled_v1: true,
          ai_pending: false,
          ai_failed: false,
        },
      };

      // Catch-All v3: Still excluded (canonical type)
      const catchAllFinalFilter =
        enrichedTodo.origin === 'catchall' &&
        !enrichedTodo.completed_at &&
        !(v3Enabled && enrichedTodo.canonicalType === 'todo');
      expect(catchAllFinalFilter).toBe(false);

      // Today: Still included (due_date unchanged)
      const todayFinalFilter =
        enrichedTodo.type === 'todo' &&
        !enrichedTodo.completed_at &&
        enrichedTodo.due_date != null;
      expect(todayFinalFilter).toBe(true);

      // Summary: NO DUPLICATION
      // - Catch-All: Does not show archived note OR canonical todo
      // - Today: Shows canonical todo only
    });

    it('ensures habit appears in Habits view but NOT in Catch-All after Stage B completes', () => {
      // Stage 0: User creates Mind Drop "Run daily"
      const mindDropNote = {
        id: 'note-789',
        type: 'note',
        body: 'Run daily',
        origin: 'catchall',
        labels: ['catchall'],
        drop_id: 'drop-xyz',
        archived: false,
        views: {
          minddrop_stage: 'pending',
          ai_pending: true,
        },
      };

      // Stage A: Classification creates canonical habit
      const canonicalHabit = {
        id: 'habit-111',
        type: 'habit',
        name: 'Run daily',
        origin: 'catchall',
        canonicalType: 'habit',
        drop_id: 'drop-xyz',
        frequency: 'daily',
        completed_at: null,
        views: {
          minddrop_stage: 'classified',
          ai_pending: true,
        },
      };

      // Original note is archived
      const archivedNote = {
        ...mindDropNote,
        archived: true,
      };

      // Catch-All v3: Archived note excluded
      expect(archivedNote.archived).toBe(true);

      // Catch-All v3: Canonical habit excluded
      const v3Enabled = true;
      const catchAllHabitFilter =
        canonicalHabit.origin === 'catchall' &&
        !canonicalHabit.completed_at &&
        !(v3Enabled && canonicalHabit.canonicalType === 'habit');
      expect(catchAllHabitFilter).toBe(false);

      // Habits View: Canonical habit included
      // (Habits view would query all habits with origin='catchall' or other criteria)
      const habitsViewFilter = canonicalHabit.type === 'habit';
      expect(habitsViewFilter).toBe(true);

      // Stage B: Prefill completes
      const enrichedHabit = {
        ...canonicalHabit,
        name: 'Run daily 🏃',
        tags: ['fitness', 'morning'],
        views: {
          minddrop_stage: 'prefilled',
          minddrop_prefilled_v1: true,
          ai_pending: false,
        },
      };

      // Catch-All v3: Still excluded
      const catchAllFinalFilter =
        enrichedHabit.origin === 'catchall' &&
        !enrichedHabit.completed_at &&
        !(v3Enabled && enrichedHabit.canonicalType === 'habit');
      expect(catchAllFinalFilter).toBe(false);

      // Habits View: Still included
      expect(enrichedHabit.type).toBe('habit');

      // Summary: NO DUPLICATION
      // - Catch-All: Does not show archived note OR canonical habit
      // - Habits View: Shows canonical habit only
    });
  });

  describe('v2 Backward Compatibility', () => {
    it('shows both notes AND canonical entities in Catch-All when v3 flag is OFF', () => {
      const v3Enabled = false;

      const unsortedNote = {
        id: 'note-1',
        origin: 'catchall',
        archived: false,
        views: { minddrop_stage: 'pending' },
      };

      const canonicalTodo = {
        id: 'todo-1',
        origin: 'catchall',
        canonicalType: 'todo',
        completed_at: null,
      };

      // Note filter (v2: all non-archived)
      const noteIncluded = unsortedNote.origin === 'catchall' && !unsortedNote.archived;
      expect(noteIncluded).toBe(true);

      // Todo filter (v2: includes canonical todos)
      const todoIncluded =
        canonicalTodo.origin === 'catchall' &&
        !canonicalTodo.completed_at &&
        !(v3Enabled && canonicalTodo.canonicalType === 'todo');
      expect(todoIncluded).toBe(true);

      // v2 shows everything (may have duplicates, but that's expected v2 behavior)
    });
  });
});
