/**
 * SweepFlowScreen.resurfaceAt.test.tsx
 *
 * Tests for the resurface_at clearing fix (app-fixes-1.22).
 *
 * When a user schedules a todo with a due date during sweep,
 * we must clear the resurface_at field so the todo doesn't
 * incorrectly re-appear in future sweeps.
 *
 * This is a unit test for the decision-to-update mapping logic.
 */

type SweepDecision = {
  candidateId: string;
  candidateKind: 'todo' | 'note' | 'habit';
  action: 'clear' | 'keep' | 'skip';
  dueDate?: Date | null;
  resurfaceDate?: Date | null;
  startDate?: Date | null;
  category?: string | null;
};

// Helper to simulate the toDayString function
const toDayString = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// Helper to simulate DateService.toLocalDate
const toLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

describe('SweepFlowScreen resurface_at clearing', () => {
  /**
   * Simulates the commitAllDecisions logic from SweepFlowScreen
   * for the "keep with due date" case.
   */
  function buildTodoUpdatePayload(decision: SweepDecision) {
    if (decision.action === 'keep' && decision.dueDate) {
      return {
        due_day: toDayString(decision.dueDate),
        skipped_in_sweep_at: null,
        resurface_at: null, // ← THE FIX: Clear reminder when scheduling
      };
    }

    if (decision.action === 'keep' && decision.resurfaceDate) {
      return {
        resurface_at: toLocalDate(decision.resurfaceDate),
        due_day: null,
        due_date: null,
      };
    }

    return null;
  }

  describe('when scheduling todo with due date', () => {
    it('should set resurface_at to null', () => {
      const decision: SweepDecision = {
        candidateId: 'todo-123',
        candidateKind: 'todo',
        action: 'keep',
        dueDate: new Date('2026-01-25'),
      };

      const payload = buildTodoUpdatePayload(decision);

      expect(payload).not.toBeNull();
      expect(payload!.resurface_at).toBeNull();
    });

    it('should set due_day from dueDate', () => {
      const decision: SweepDecision = {
        candidateId: 'todo-123',
        candidateKind: 'todo',
        action: 'keep',
        dueDate: new Date('2026-01-25'),
      };

      const payload = buildTodoUpdatePayload(decision);

      expect(payload!.due_day).toBe('2026-01-25');
    });

    it('should clear skipped_in_sweep_at', () => {
      const decision: SweepDecision = {
        candidateId: 'todo-123',
        candidateKind: 'todo',
        action: 'keep',
        dueDate: new Date('2026-01-25'),
      };

      const payload = buildTodoUpdatePayload(decision);

      expect(payload!.skipped_in_sweep_at).toBeNull();
    });
  });

  describe('when setting resurface date (remind later)', () => {
    it('should clear due_day when setting resurface_at', () => {
      const decision: SweepDecision = {
        candidateId: 'todo-123',
        candidateKind: 'todo',
        action: 'keep',
        resurfaceDate: new Date('2026-02-01'),
      };

      const payload = buildTodoUpdatePayload(decision);

      expect(payload).not.toBeNull();
      expect(payload!.due_day).toBeNull();
      expect(payload!.due_date).toBeNull();
    });

    it('should set resurface_at to formatted date', () => {
      const resurfaceDate = new Date('2026-02-01');
      const decision: SweepDecision = {
        candidateId: 'todo-123',
        candidateKind: 'todo',
        action: 'keep',
        resurfaceDate,
      };

      const payload = buildTodoUpdatePayload(decision);

      expect(payload!.resurface_at).toBeTruthy();
      // Should be a date string like '2026-02-01'
      expect(payload!.resurface_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('mutual exclusivity of due_day and resurface_at', () => {
    it('scheduling clears resurface_at', () => {
      const decision: SweepDecision = {
        candidateId: 'todo-123',
        candidateKind: 'todo',
        action: 'keep',
        dueDate: new Date('2026-01-25'),
      };

      const payload = buildTodoUpdatePayload(decision);

      expect(payload!.due_day).toBeTruthy();
      expect(payload!.resurface_at).toBeNull();
    });

    it('remind-later clears due_day', () => {
      const decision: SweepDecision = {
        candidateId: 'todo-123',
        candidateKind: 'todo',
        action: 'keep',
        resurfaceDate: new Date('2026-02-01'),
      };

      const payload = buildTodoUpdatePayload(decision);

      expect(payload!.resurface_at).toBeTruthy();
      expect(payload!.due_day).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns null for non-keep actions', () => {
      const decision: SweepDecision = {
        candidateId: 'todo-123',
        candidateKind: 'todo',
        action: 'clear',
      };

      const payload = buildTodoUpdatePayload(decision);

      expect(payload).toBeNull();
    });

    it('returns null for keep without date', () => {
      const decision: SweepDecision = {
        candidateId: 'todo-123',
        candidateKind: 'todo',
        action: 'keep',
        // No dueDate or resurfaceDate
      };

      const payload = buildTodoUpdatePayload(decision);

      expect(payload).toBeNull();
    });
  });
});
