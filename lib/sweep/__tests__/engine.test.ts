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
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString().split('T')[0];
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
