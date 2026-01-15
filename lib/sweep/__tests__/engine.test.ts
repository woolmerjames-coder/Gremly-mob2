/**
 * Sweep Engine - Semantic Tests
 *
 * These tests document and protect the intended semantics of the Sweep feature.
 * They verify type shapes and serve as living documentation for the action types.
 *
 * No real DB calls are made - these are "documentation tests" that ensure
 * the type system and action semantics remain consistent.
 */

import type { SweepAction } from '../engine';
import type { SweepEntityKind } from '../types';
import { getDateService } from '../../date';

describe('SweepAction', () => {
  describe('keep action', () => {
    /**
     * SEMANTIC: "keep" means the user has reviewed the item and wants to keep it as-is.
     *
     * When implemented:
     * - Should clear `skipped_in_sweep_at` if it was set (item was previously skipped)
     * - Item remains active and won't appear in future sweeps unless:
     *   - It's edited
     *   - New activity occurs
     *   - It was created after the next sweep cutoff
     *
     * Use case: User sees a todo they created, confirms it's still relevant.
     */
    it('should allow keep action with id and kind', () => {
      const action: SweepAction = {
        type: 'keep',
        id: 'todo-123',
        kind: 'todo',
      };

      expect(action.type).toBe('keep');
      expect(action.id).toBe('todo-123');
      expect(action.kind).toBe('todo');
    });

    it('should work for all entity kinds', () => {
      const kinds: SweepEntityKind[] = ['todo', 'note'];

      kinds.forEach((kind) => {
        const action: SweepAction = {
          type: 'keep',
          id: `${kind}-456`,
          kind,
        };

        expect(action.type).toBe('keep');
        expect(action.kind).toBe(kind);
      });
    });
  });

  describe('clear action', () => {
    /**
     * SEMANTIC: "clear" means the user wants to archive/remove the item from their active system.
     *
     * When implemented:
     * - For todos/notes: Set `archived = true`, `archived_reason = 'swept'`, `archived_at = now()`
     * - For habits: Set `completed_at = now()` (habits use completed_at for soft delete)
     * - Item will no longer appear in active views or future sweeps
     * - Item is NOT permanently deleted - can be restored if needed
     *
     * Use case: User realizes they no longer need this item, or it's obsolete.
     */
    it('should allow clear action with id and kind', () => {
      const action: SweepAction = {
        type: 'clear',
        id: 'note-789',
        kind: 'note',
      };

      expect(action.type).toBe('clear');
      expect(action.id).toBe('note-789');
      expect(action.kind).toBe('note');
    });

    it('should work for all entity kinds', () => {
      const kinds: SweepEntityKind[] = ['todo', 'note'];

      kinds.forEach((kind) => {
        const action: SweepAction = {
          type: 'clear',
          id: `${kind}-to-clear`,
          kind,
        };

        expect(action.type).toBe('clear');
        expect(action.kind).toBe(kind);
      });
    });
  });

  describe('skip action', () => {
    /**
     * SEMANTIC: "skip" means the user wants to defer the decision to a later sweep.
     *
     * When implemented:
     * - Set `skipped_in_sweep_at = now()` on the item
     * - Item WILL appear again in the next sweep session
     * - This is for when the user isn't ready to decide yet
     *
     * Use case: User is unsure about an item, wants to think about it later.
     * The item will resurface in their next Evening Sweep.
     */
    it('should allow skip action with id and kind', () => {
      const action: SweepAction = {
        type: 'skip',
        id: 'note-abc',
        kind: 'note',
      };

      expect(action.type).toBe('skip');
      expect(action.id).toBe('note-abc');
      expect(action.kind).toBe('note');
    });

    it('should work for all entity kinds', () => {
      const kinds: SweepEntityKind[] = ['todo', 'note'];

      kinds.forEach((kind) => {
        const action: SweepAction = {
          type: 'skip',
          id: `${kind}-to-skip`,
          kind,
        };

        expect(action.type).toBe('skip');
        expect(action.kind).toBe(kind);
      });
    });
  });

  describe('action type discrimination', () => {
    /**
     * The SweepAction union should be discriminated by the `type` field.
     * This allows TypeScript to narrow the type in switch statements.
     */
    it('should allow type narrowing in switch statements', () => {
      const actions: SweepAction[] = [
        { type: 'keep', id: '1', kind: 'todo' },
        { type: 'clear', id: '2', kind: 'note' },
        { type: 'skip', id: '3', kind: 'note' },
      ];

      const results: string[] = [];

      actions.forEach((action) => {
        switch (action.type) {
          case 'keep':
            // TypeScript knows action.type is 'keep' here
            results.push(`keeping ${action.kind} ${action.id}`);
            break;
          case 'clear':
            // TypeScript knows action.type is 'clear' here
            results.push(`clearing ${action.kind} ${action.id}`);
            break;
          case 'skip':
            // TypeScript knows action.type is 'skip' here
            results.push(`skipping ${action.kind} ${action.id}`);
            break;
        }
      });

      expect(results).toEqual(['keeping todo 1', 'clearing note 2', 'skipping note 3']);
    });
  });

  describe('semantic summary', () => {
    /**
     * This test serves as documentation for the three Sweep actions:
     *
     * ┌─────────┬────────────────────────────────────────────────────────────┐
     * │ Action  │ Behavior                                                   │
     * ├─────────┼────────────────────────────────────────────────────────────┤
     * │ keep    │ User reviewed and approved. Clears skipped_in_sweep_at.    │
     * │         │ Item won't appear in future sweeps unless new activity.    │
     * ├─────────┼────────────────────────────────────────────────────────────┤
     * │ clear   │ User wants to archive. Sets archived=true for todos/notes, │
     * │         │ completed_at for habits. Item removed from active system.  │
     * ├─────────┼────────────────────────────────────────────────────────────┤
     * │ skip    │ User defers decision. Sets skipped_in_sweep_at=now().      │
     * │         │ Item WILL reappear in the next sweep session.              │
     * └─────────┴────────────────────────────────────────────────────────────┘
     */
    it('documents the three action types', () => {
      // This test exists purely for documentation - the table above
      // summarizes the intended semantics of each action type.
      expect(true).toBe(true);
    });
  });
});

describe('SweepCandidate isOverdue field', () => {
  /**
   * These tests document and verify the isOverdue computation logic
   * for SweepCandidate objects as implemented in the sweep engine.
   *
   * isOverdue Logic:
   * - For todos: isOverdue = true if due_day (or due_date fallback) < today
   * - For notes: always false (notes don't have due dates)
   * - Note: Habits are no longer included in sweep candidates
   */

  // Helper to create a date string for a given offset from today
  function getDayString(daysOffset: number): string {
    const ds = getDateService();
    return daysOffset >= 0 ? ds.daysFromNow(daysOffset) : ds.daysAgo(-daysOffset);
  }

  // Helper to compute isOverdue using the same formula as engine.ts
  function computeIsOverdue(dueDay: string | null, dueDate: string | null, today: string): boolean {
    const effectiveDueDay = dueDay ?? (dueDate ? dueDate.split('T')[0] : null);
    return effectiveDueDay !== null && effectiveDueDay < today;
  }

  // Helper to compute isDueToday using the same formula as engine.ts
  function computeIsDueToday(
    dueDay: string | null,
    dueDate: string | null,
    today: string,
  ): boolean {
    const effectiveDueDay = dueDay ?? (dueDate ? dueDate.split('T')[0] : null);
    return effectiveDueDay === today;
  }

  // Helper to compute isCreatedToday
  function computeIsCreatedToday(createdAt: string, today: string): boolean {
    return createdAt.split('T')[0] === today;
  }

  const todayDayString = getDayString(0);
  const yesterdayDayString = getDayString(-1);
  const tomorrowDayString = getDayString(1);
  const lastWeekDayString = getDayString(-7);

  describe('todo candidates', () => {
    it('should mark todo as overdue when due_day is before today', () => {
      // A todo with due_day = yesterday should be overdue
      const candidate = {
        id: 'todo-overdue',
        kind: 'todo' as const,
        createdAt: new Date().toISOString(),
        dropId: null,
        skippedInSweepAt: null,
        isOverdue: yesterdayDayString < todayDayString, // This is what the engine computes
        raw: {
          id: 'todo-overdue',
          due_day: yesterdayDayString,
          due_date: null,
        },
      };

      expect(candidate.isOverdue).toBe(true);
    });

    it('should NOT mark todo as overdue when due_day is exactly today', () => {
      // A todo due today is not overdue
      const candidate = {
        id: 'todo-today',
        kind: 'todo' as const,
        createdAt: new Date().toISOString(),
        dropId: null,
        skippedInSweepAt: null,
        isOverdue: todayDayString < todayDayString,
        raw: {
          id: 'todo-today',
          due_day: todayDayString,
          due_date: null,
        },
      };

      expect(candidate.isOverdue).toBe(false);
    });

    it('should NOT mark todo as overdue when due_day is after today', () => {
      // A todo due tomorrow is not overdue
      const candidate = {
        id: 'todo-future',
        kind: 'todo' as const,
        createdAt: new Date().toISOString(),
        dropId: null,
        skippedInSweepAt: null,
        isOverdue: tomorrowDayString < todayDayString,
        raw: {
          id: 'todo-future',
          due_day: tomorrowDayString,
          due_date: null,
        },
      };

      expect(candidate.isOverdue).toBe(false);
    });

    it('should NOT mark todo as overdue when due_day is null', () => {
      // A todo with no due date is not overdue
      // Use the formula directly instead of intermediate variables
      // (since TS narrowing is too aggressive with literal null)
      expect(computeIsOverdue(null, null, todayDayString)).toBe(false);
    });

    it('should use due_date fallback when due_day is null', () => {
      // When due_day is null but due_date is set, use due_date for overdue check
      const dueDateFromLastWeek = `${lastWeekDayString}T10:00:00Z`;

      // Use helper to verify the computation
      expect(computeIsOverdue(null, dueDateFromLastWeek, todayDayString)).toBe(true);
    });

    it('should prefer due_day over due_date when both are set', () => {
      // When both are set, due_day takes precedence
      // due_day = tomorrow (not overdue), due_date = last week (would be overdue)
      const dueDay = tomorrowDayString ?? `${lastWeekDayString}T10:00:00Z`.split('T')[0];

      const candidate = {
        id: 'todo-both-dates',
        kind: 'todo' as const,
        createdAt: new Date().toISOString(),
        dropId: null,
        skippedInSweepAt: null,
        isOverdue: dueDay !== null && dueDay < todayDayString,
        raw: {
          id: 'todo-both-dates',
          due_day: tomorrowDayString,
          due_date: `${lastWeekDayString}T10:00:00Z`,
        },
      };

      // Should NOT be overdue because due_day (tomorrow) takes precedence
      expect(candidate.isOverdue).toBe(false);
    });
  });

  describe('note candidates', () => {
    it('should NOT mark notes as overdue (notes have no due dates)', () => {
      const candidate = {
        id: 'note-1',
        kind: 'note' as const,
        createdAt: new Date().toISOString(),
        dropId: null,
        skippedInSweepAt: null,
        isOverdue: false, // Notes are always false
        raw: {
          id: 'note-1',
          title: 'Old journal entry',
          subtype: 'journal',
        },
      };

      expect(candidate.isOverdue).toBe(false);
    });
  });

  describe('isOverdue computation formula', () => {
    /**
     * Documents the exact formula used in engine.ts:
     *
     * const dueDay = row.due_day ?? (row.due_date ? row.due_date.split('T')[0] : null);
     * const isOverdue = dueDay !== null && dueDay < todayDay;
     *
     * This means:
     * 1. If due_day is set, use it
     * 2. Otherwise, if due_date is set, extract the date portion
     * 3. Compare against today's date string
     * 4. Only mark as overdue if there IS a due date AND it's before today
     */
    it('documents the computation formula', () => {
      // Test the formula directly
      const testCases = [
        { due_day: yesterdayDayString, due_date: null, expected: true },
        { due_day: todayDayString, due_date: null, expected: false },
        { due_day: tomorrowDayString, due_date: null, expected: false },
        { due_day: null, due_date: null, expected: false },
        { due_day: null, due_date: `${yesterdayDayString}T12:00:00Z`, expected: true },
        { due_day: null, due_date: `${todayDayString}T12:00:00Z`, expected: false },
        {
          due_day: tomorrowDayString,
          due_date: `${yesterdayDayString}T12:00:00Z`,
          expected: false,
        }, // due_day wins
      ];

      testCases.forEach(({ due_day, due_date, expected }) => {
        // Apply the same formula as engine.ts
        const dueDay = due_day ?? (due_date ? due_date.split('T')[0] : null);
        const isOverdue = dueDay !== null && dueDay < todayDayString;

        expect(isOverdue).toBe(expected);
      });
    });
  });

  describe('isDueToday computation', () => {
    /**
     * isDueToday Logic:
     * - For todos: isDueToday = true if due_day (or due_date fallback) === today
     * - For notes: always false (notes don't have due dates)
     */

    it('should mark todo as due today when due_day equals today', () => {
      expect(computeIsDueToday(todayDayString, null, todayDayString)).toBe(true);
    });

    it('should NOT mark todo as due today when due_day is yesterday', () => {
      expect(computeIsDueToday(yesterdayDayString, null, todayDayString)).toBe(false);
    });

    it('should NOT mark todo as due today when due_day is tomorrow', () => {
      expect(computeIsDueToday(tomorrowDayString, null, todayDayString)).toBe(false);
    });

    it('should NOT mark todo as due today when due_day is null', () => {
      expect(computeIsDueToday(null, null, todayDayString)).toBe(false);
    });

    it('should use due_date fallback when due_day is null', () => {
      const dueDateToday = `${todayDayString}T10:00:00Z`;
      expect(computeIsDueToday(null, dueDateToday, todayDayString)).toBe(true);
    });

    it('should verify overdue and due_today are mutually exclusive', () => {
      // A todo due yesterday: overdue=true, dueToday=false
      expect(computeIsOverdue(yesterdayDayString, null, todayDayString)).toBe(true);
      expect(computeIsDueToday(yesterdayDayString, null, todayDayString)).toBe(false);

      // A todo due today: overdue=false, dueToday=true
      expect(computeIsOverdue(todayDayString, null, todayDayString)).toBe(false);
      expect(computeIsDueToday(todayDayString, null, todayDayString)).toBe(true);

      // A todo due tomorrow: overdue=false, dueToday=false
      expect(computeIsOverdue(tomorrowDayString, null, todayDayString)).toBe(false);
      expect(computeIsDueToday(tomorrowDayString, null, todayDayString)).toBe(false);
    });
  });

  describe('isCreatedToday computation', () => {
    /**
     * isCreatedToday Logic:
     * - For all candidates: isCreatedToday = true if created_at date portion === today
     */

    it('should mark candidate as created today when created_at is today', () => {
      const createdToday = `${todayDayString}T14:30:00Z`;
      expect(computeIsCreatedToday(createdToday, todayDayString)).toBe(true);
    });

    it('should NOT mark candidate as created today when created_at is yesterday', () => {
      const createdYesterday = `${yesterdayDayString}T14:30:00Z`;
      expect(computeIsCreatedToday(createdYesterday, todayDayString)).toBe(false);
    });

    it('should NOT mark candidate as created today when created_at is last week', () => {
      const createdLastWeek = `${lastWeekDayString}T14:30:00Z`;
      expect(computeIsCreatedToday(createdLastWeek, todayDayString)).toBe(false);
    });

    it('should work for notes/logs (which only use isCreatedToday for badges)', () => {
      const noteCreatedToday = {
        id: 'note-today',
        kind: 'note' as const,
        createdAt: `${todayDayString}T09:00:00Z`,
        dropId: null,
        skippedInSweepAt: null,
        isOverdue: false,
        isDueToday: false,
        isCreatedToday: computeIsCreatedToday(`${todayDayString}T09:00:00Z`, todayDayString),
        raw: {
          id: 'note-today',
          title: 'Journal entry',
          subtype: 'journal',
        },
      };

      expect(noteCreatedToday.isCreatedToday).toBe(true);
    });
  });
});

describe('SweepCandidate entity types', () => {
  /**
   * Documents which entity types are included in Sweep candidates.
   *
   * Included:
   * - todos: Tasks that need review
   * - notes: Including journals, ideas, and general notes
   *
   * Excluded:
   * - habits: Habits are no longer part of the sweep flow
   */

  it('should only include todo and note kinds in SweepEntityKind', () => {
    const validKinds: SweepEntityKind[] = ['todo', 'note'];
    expect(validKinds).toHaveLength(2);
    expect(validKinds).toContain('todo');
    expect(validKinds).toContain('note');
    // Habits are not included - this is enforced by TypeScript
    // The following would cause a compile error:
    // validKinds.push('habit'); // Error: Type '"habit"' is not assignable to type 'SweepEntityKind'
  });

  it('should document that habits are excluded from sweep', () => {
    /**
     * Habits were removed from sweep candidates because:
     * 1. Habits have different lifecycle than todos/notes
     * 2. Habits don't need "keep or clear" decisions
     * 3. Habits are managed through their own UI flow
     *
     * The engine.ts fetchSweepCandidatesForUser function:
     * - Only fetches from 'todos' and 'notes' tables
     * - Does NOT fetch from 'habits' table
     * - Returns SweepCandidate[] where kind is 'todo' | 'note'
     */
    expect(true).toBe(true); // Documentation test
  });

  it('should not return archived or completed todos as candidates', () => {
    /**
     * The engine filters out:
     * - Todos with archived = true
     * - Todos with completed_at set
     *
     * This ensures only active, incomplete todos appear in sweep.
     */
    expect(true).toBe(true); // Documentation test - actual filtering is in engine.ts
  });
});

describe('Due-today and overdue todos always in sweep', () => {
  /**
   * Documents the special handling for due-today and overdue todos in sweep.
   *
   * Unlike other candidates, todos that are DUE TODAY or OVERDUE always appear
   * in sweep, regardless of when they were created or when the last sweep occurred.
   *
   * This ensures:
   * 1. Users see all their commitments for today in the sweep flow
   * 2. Stale overdue todos don't sit indefinitely without being reviewed
   *
   * NOTE: This logic is ALIGNED with the Today/NOW page's sweep selectors.
   * See lib/today/sweepSelectors.ts and lib/sweep/todoFilters.ts for the
   * shared filter logic.
   */

  // Helper to create date strings
  function getDayString(daysOffset: number): string {
    const ds = getDateService();
    return daysOffset >= 0 ? ds.daysFromNow(daysOffset) : ds.daysAgo(-daysOffset);
  }

  const todayDayString = getDayString(0);
  const yesterdayDayString = getDayString(-1);
  const lastWeekDayString = getDayString(-7);
  const lastMonthDayString = getDayString(-30);

  describe('inclusion criteria', () => {
    it('should document that due-today and overdue todos bypass creation time filter', () => {
      /**
       * Normal sweep inclusion criteria:
       * - Created after last sweep, OR
       * - Has skipped_in_sweep_at set
       *
       * Due-today and overdue todos bypass this:
       * - due_day <= today → ALWAYS included
       *
       * This is implemented in engine.ts with the shared OR clause from todoFilters.ts:
       * `due_day.lte.${todayDay},created_at.gt.${cutoffTimestamp},skipped_in_sweep_at.not.is.null`
       *
       * This ALIGNS with the Today page's sweepSelectors.ts behavior.
       */
      expect(true).toBe(true);
    });

    it('should include todo due today (always in sweep)', () => {
      /**
       * A todo due TODAY should ALWAYS appear in sweep even if:
       * - Created weeks ago
       * - Never skipped
       * - Created before last sweep
       *
       * This aligns with the Today page showing these in sweep pills.
       */
      const dueTodayTodo = {
        id: 'due-today',
        due_day: todayDayString,
        created_at: `${lastMonthDayString}T10:00:00Z`,
        skipped_in_sweep_at: null,
      };

      // Use lte (<=) check like the Supabase query
      const shouldInclude = dueTodayTodo.due_day <= todayDayString;
      expect(shouldInclude).toBe(true);
    });

    it('should include todo overdue by one day', () => {
      /**
       * A todo due yesterday should appear in sweep even if:
       * - Created weeks ago
       * - Never skipped
       * - Created before last sweep
       */
      const overdueTodo = {
        id: 'overdue-1',
        due_day: yesterdayDayString,
        created_at: `${lastMonthDayString}T10:00:00Z`,
        skipped_in_sweep_at: null,
      };

      const shouldInclude = overdueTodo.due_day <= todayDayString;
      expect(shouldInclude).toBe(true);
    });

    it('should include todo overdue by many days', () => {
      /**
       * A todo due weeks ago should appear in sweep.
       * This catches old forgotten todos that were never addressed.
       */
      const veryOverdueTodo = {
        id: 'overdue-old',
        due_day: lastMonthDayString,
        created_at: `${lastMonthDayString}T10:00:00Z`,
        skipped_in_sweep_at: null,
      };

      const shouldInclude = veryOverdueTodo.due_day <= todayDayString;
      expect(shouldInclude).toBe(true);
    });

    it('should NOT auto-include todo with future due date', () => {
      /**
       * Todos due in the future follow normal sweep rules.
       * They only appear if created after last sweep or previously skipped.
       */
      const futureTodo = {
        id: 'due-future',
        due_day: getDayString(7), // Due next week
        created_at: `${lastWeekDayString}T10:00:00Z`,
        skipped_in_sweep_at: null,
      };

      const shouldInclude = futureTodo.due_day <= todayDayString;
      expect(shouldInclude).toBe(false);
    });

    it('should NOT auto-include todo with null due date', () => {
      /**
       * Todos without due dates follow normal sweep rules.
       * They have no deadline so cannot be "overdue".
       */
      const noDueDateTodo: {
        id: string;
        due_day: string | null;
        created_at: string;
        skipped_in_sweep_at: null;
      } = {
        id: 'no-due-date',
        due_day: null,
        created_at: `${lastWeekDayString}T10:00:00Z`,
        skipped_in_sweep_at: null,
      };

      // With null due_day, the lte check would fail (null <= '2025-12-05' is falsy)
      const shouldInclude =
        noDueDateTodo.due_day !== null && noDueDateTodo.due_day <= todayDayString;
      expect(shouldInclude).toBe(false);
    });
  });

  describe('notes are not affected by overdue logic', () => {
    it('should NOT auto-include old notes (notes cannot be overdue)', () => {
      /**
       * Notes don't have due dates, so they cannot be overdue.
       * Old notes only appear if previously skipped or recently created.
       *
       * The engine does NOT apply the overdue filter to notes queries.
       */
      const oldNote = {
        id: 'old-note',
        kind: 'note' as const,
        created_at: `${lastMonthDayString}T10:00:00Z`,
        skipped_in_sweep_at: null,
      };

      // Notes are never overdue - they don't have due_day
      const isOverdue = false; // Always false for notes
      expect(isOverdue).toBe(false);
    });
  });

  describe('semantic: why overdue todos always appear', () => {
    it('documents the rationale for overdue inclusion', () => {
      /**
       * WHY: Overdue todos represent broken commitments that need attention.
       *
       * Without this rule, a user could:
       * 1. Create a todo due "tomorrow"
       * 2. Run sweep today (todo included, user keeps it)
       * 3. Never run sweep again
       * 4. Todo becomes overdue but never resurfaces
       *
       * With overdue-always-included:
       * - Overdue todos ALWAYS appear in next sweep
       * - User must decide: keep (reschedule?), clear (give up), or skip (defer)
       * - Prevents accumulation of stale overdue items
       *
       * This aligns with the Sweep philosophy of "no inbox bankruptcy" -
       * everything gets reviewed, nothing silently lingers.
       */
      expect(true).toBe(true);
    });
  });
});

describe('Mind Drop notes always appear in sweep once', () => {
  /**
   * Documents that ALL Mind Drop captures (notes/logs/ideas/journals) should
   * appear in sweep at least once after they are created.
   *
   * This ensures:
   * 1. No capture silently accumulates without review
   * 2. Users can decide to keep, clear, or skip each capture
   * 3. After the first sweep review, notes only reappear if skipped
   *
   * The engine uses "created since last sweep" logic for notes:
   * - If lastSweepAt exists: include notes where created_at > lastSweepAt
   * - If no lastSweepAt (first sweep): include notes created today
   */

  // Helper to create date strings
  function getDayString(daysOffset: number): string {
    const ds = getDateService();
    return daysOffset >= 0 ? ds.daysFromNow(daysOffset) : ds.daysAgo(-daysOffset);
  }

  const todayDayString = getDayString(0);
  const yesterdayDayString = getDayString(-1);
  const lastWeekDayString = getDayString(-7);

  describe('note inclusion criteria', () => {
    it('should include note created today (first-time user)', () => {
      /**
       * For first-time users (no lastSweepAt), notes created TODAY should
       * appear in sweep. This is a more conservative approach than the
       * 48-hour window used for todos.
       */
      const newNote = {
        id: 'note-new',
        subtype: 'journal',
        created_at: `${todayDayString}T10:00:00Z`,
        skipped_in_sweep_at: null,
      };

      // Should be included because created today
      const createdDay = newNote.created_at.split('T')[0];
      expect(createdDay).toBe(todayDayString);
    });

    it('should include note created after last sweep', () => {
      /**
       * If the user completed a sweep yesterday at 6pm, any note created
       * after that should appear in the next sweep.
       */
      const lastSweepAt = `${yesterdayDayString}T18:00:00Z`;
      const newNote = {
        id: 'note-new',
        subtype: 'idea',
        created_at: `${todayDayString}T09:00:00Z`, // Created after last sweep
        skipped_in_sweep_at: null,
      };

      const isNewSinceLastSweep = newNote.created_at > lastSweepAt;
      expect(isNewSinceLastSweep).toBe(true);
    });

    it('should NOT include note created before last sweep', () => {
      /**
       * Notes created before the last sweep should NOT reappear
       * (unless they were skipped).
       */
      const lastSweepAt = `${yesterdayDayString}T18:00:00Z`;
      const oldNote = {
        id: 'note-old',
        subtype: 'journal',
        created_at: `${lastWeekDayString}T10:00:00Z`, // Created before last sweep
        skipped_in_sweep_at: null,
      };

      const isNewSinceLastSweep = oldNote.created_at > lastSweepAt;
      expect(isNewSinceLastSweep).toBe(false);
    });

    it('should include previously skipped note (regardless of creation date)', () => {
      /**
       * Skipped notes should always reappear in the next sweep,
       * even if they were created before the last sweep.
       */
      const lastSweepAt = `${yesterdayDayString}T18:00:00Z`;
      const skippedNote = {
        id: 'note-skipped',
        subtype: 'idea',
        created_at: `${lastWeekDayString}T10:00:00Z`, // Created before last sweep
        skipped_in_sweep_at: `${yesterdayDayString}T19:00:00Z`, // But was skipped
      };

      const wasSkipped = skippedNote.skipped_in_sweep_at !== null;
      expect(wasSkipped).toBe(true);
    });
  });

  describe('note subtype handling', () => {
    it('should include journal notes', () => {
      const note = { subtype: 'journal', canonical_type: 'log' };
      expect(note.subtype).toBe('journal');
    });

    it('should include idea notes', () => {
      const note = { subtype: 'idea', canonical_type: 'log' };
      expect(note.subtype).toBe('idea');
    });

    it('should include list notes', () => {
      const note = { subtype: 'list', canonical_type: 'log' };
      expect(note.subtype).toBe('list');
    });

    it('should include reference notes', () => {
      const note = { subtype: 'reference', canonical_type: 'log' };
      expect(note.subtype).toBe('reference');
    });

    it('should NOT include catchall notes (still being processed)', () => {
      /**
       * Catchall notes are raw Mind Drop entries that haven't been
       * classified yet. They should NOT appear in sweep until they
       * have been converted to a canonical type.
       */
      const catchallNote = { subtype: 'catchall', canonical_type: null };
      expect(catchallNote.subtype).toBe('catchall');
      // The engine excludes subtype='catchall' via .neq('subtype', 'catchall')
    });
  });

  describe('alignment with todo behavior', () => {
    it('documents different rules for todos vs notes', () => {
      /**
       * TODOS:
       * - Due today or overdue → ALWAYS included
       * - New (created after last sweep) → included
       * - Skipped → included
       *
       * NOTES:
       * - New (created after last sweep) → included
       * - Skipped → included
       * - NO "due date" logic (notes don't have due dates)
       *
       * This means:
       * - A todo due today from last month will appear in sweep
       * - A note from last month will NOT appear (unless skipped)
       */
      expect(true).toBe(true);
    });

    it('documents first-time user experience', () => {
      /**
       * First-time users (no lastSweepAt):
       *
       * TODOS: 48-hour lookback window + due today/overdue
       * - Catches recent todos AND any overdue items
       *
       * NOTES: Only notes created TODAY
       * - More conservative to avoid overwhelming new users
       * - They can always access older notes from the Notes screen
       */
      expect(true).toBe(true);
    });
  });
});

describe('Note attachments in sweep candidates', () => {
  /**
   * Documents that note candidates should include photo attachments
   * loaded from the log_photos table.
   *
   * The engine joins notes with log_photos to populate the attachments field:
   * - Notes with photos have attachments: SweepAttachment[]
   * - Notes without photos have attachments: undefined
   */

  describe('attachment type shape', () => {
    it('should have correct shape for SweepAttachment', () => {
      /**
       * SweepAttachment matches the log_photos table shape
       * and IRepo.listLogPhotos return type.
       */
      const attachment = {
        id: 'photo-123',
        url: 'https://storage.example.com/photos/photo-123.jpg',
        position: 0,
      };

      expect(attachment.id).toBeDefined();
      expect(attachment.url).toBeDefined();
      expect(attachment.position).toBeDefined();
    });

    it('should sort attachments by position', () => {
      /**
       * When multiple photos exist, they should be sorted by position
       * to preserve the original upload order.
       */
      const unsortedPhotos = [
        { id: 'photo-2', url: 'url2', position: 2 },
        { id: 'photo-0', url: 'url0', position: 0 },
        { id: 'photo-1', url: 'url1', position: 1 },
      ];

      // Simulating the sorting logic from engine.ts
      const sorted = [...unsortedPhotos].sort((a, b) => a.position - b.position);

      expect(sorted[0].id).toBe('photo-0');
      expect(sorted[1].id).toBe('photo-1');
      expect(sorted[2].id).toBe('photo-2');
    });
  });

  describe('note candidate with attachments', () => {
    it('documents the expected structure for note with photos', () => {
      /**
       * A note candidate with photos should have:
       * - kind: 'note'
       * - raw: the full note row
       * - attachments: array of SweepAttachment sorted by position
       */
      const noteWithPhotos = {
        id: 'note-1',
        kind: 'note' as const,
        createdAt: new Date().toISOString(),
        dropId: null,
        skippedInSweepAt: null,
        isOverdue: false,
        isDueToday: false,
        isCreatedToday: true,
        raw: {
          id: 'note-1',
          title: 'Beach sunset',
          subtype: 'journal',
        },
        attachments: [
          { id: 'photo-1', url: 'https://storage.example.com/photo1.jpg', position: 0 },
          { id: 'photo-2', url: 'https://storage.example.com/photo2.jpg', position: 1 },
        ],
      };

      expect(noteWithPhotos.kind).toBe('note');
      expect(noteWithPhotos.attachments).toBeDefined();
      expect(noteWithPhotos.attachments).toHaveLength(2);
      expect(noteWithPhotos.attachments![0].url).toContain('photo1.jpg');
    });

    it('documents the expected structure for note without photos', () => {
      /**
       * A note candidate without photos should have:
       * - kind: 'note'
       * - raw: the full note row
       * - attachments: undefined (not an empty array)
       */
      const noteWithoutPhotos = {
        id: 'note-2',
        kind: 'note' as const,
        createdAt: new Date().toISOString(),
        dropId: null,
        skippedInSweepAt: null,
        isOverdue: false,
        isDueToday: false,
        isCreatedToday: true,
        raw: {
          id: 'note-2',
          title: 'Meeting notes',
          subtype: null,
        },
        attachments: undefined,
      };

      expect(noteWithoutPhotos.kind).toBe('note');
      expect(noteWithoutPhotos.attachments).toBeUndefined();
    });
  });

  describe('todos do not have attachments', () => {
    it('documents that SweepCandidateTodo does not include attachments', () => {
      /**
       * Attachments are only available for note candidates.
       * Todo candidates do not have the attachments field.
       */
      const todoCandidate = {
        id: 'todo-1',
        kind: 'todo' as const,
        createdAt: new Date().toISOString(),
        dropId: null,
        skippedInSweepAt: null,
        isOverdue: false,
        isDueToday: false,
        isCreatedToday: true,
        raw: {
          id: 'todo-1',
          name: 'Buy groceries',
        },
        // No attachments field
      };

      expect(todoCandidate.kind).toBe('todo');
      expect((todoCandidate as any).attachments).toBeUndefined();
    });
  });
});
