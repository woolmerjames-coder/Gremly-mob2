/**
 * Sweep Selectors Tests - Two-Date System
 *
 * Tests the sweep selector logic including the new two-date system:
 * - scheduled_date (do date): When user plans to work on it
 * - target_date (deadline): When something is due or happening
 * - due_day (legacy): Backwards compatibility, treated as do date
 */

import {
  isSweepEligible,
  selectSweepCandidates,
  getSweepCandidateCount,
  SweepEligibleTodo,
} from '../sweepSelectors';

// Mock getDateService
jest.mock('../../date', () => ({
  getDateService: () => ({
    extractLocalDate: (iso: string) => {
      if (!iso) return null;
      return iso.split('T')[0];
    },
    today: () => '2025-12-05',
  }),
}));

const TODAY = '2025-12-05';

describe('sweepSelectors - Two-Date System', () => {
  describe('isSweepEligible', () => {
    describe('basic eligibility', () => {
      it('returns false for non-todo items', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          type: 'habit',
        };
        expect(isSweepEligible(item, TODAY)).toBe(false);
      });

      it('returns false for completed items', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          status: 'completed',
        };
        expect(isSweepEligible(item, TODAY)).toBe(false);
      });

      it('returns false for archived items', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          archived: true,
        };
        expect(isSweepEligible(item, TODAY)).toBe(false);
      });

      it('returns false for items completed today', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          completed_at: '2025-12-05T10:00:00Z',
        };
        expect(isSweepEligible(item, TODAY)).toBe(false);
      });
    });

    describe('scheduled_date (new do date field)', () => {
      it('returns true when scheduled_date equals today', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          scheduled_date: '2025-12-05',
        };
        expect(isSweepEligible(item, TODAY)).toBe(true);
      });

      it('returns true when scheduled_date is before today (overdue)', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          scheduled_date: '2025-12-01',
        };
        expect(isSweepEligible(item, TODAY)).toBe(true);
      });

      it('returns false when scheduled_date is after today', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          scheduled_date: '2025-12-10',
        };
        expect(isSweepEligible(item, TODAY)).toBe(false);
      });
    });

    describe('due_day (legacy field)', () => {
      it('returns true when due_day equals today', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          due_day: '2025-12-05',
        };
        expect(isSweepEligible(item, TODAY)).toBe(true);
      });

      it('returns true when due_day is before today (overdue)', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          due_day: '2025-11-30',
        };
        expect(isSweepEligible(item, TODAY)).toBe(true);
      });

      it('returns false when due_day is after today', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          due_day: '2025-12-15',
        };
        expect(isSweepEligible(item, TODAY)).toBe(false);
      });
    });

    describe('scheduled_date takes priority over due_day', () => {
      it('uses scheduled_date when both are set', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          scheduled_date: '2025-12-05', // Today - eligible
          due_day: '2025-12-15', // Future - would be ineligible
        };
        expect(isSweepEligible(item, TODAY)).toBe(true);
      });

      it('uses scheduled_date even if due_day would make it eligible', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          scheduled_date: '2025-12-10', // Future - not eligible
          due_day: '2025-12-05', // Today - would be eligible
        };
        expect(isSweepEligible(item, TODAY)).toBe(false);
      });
    });

    describe('target_date (deadline) without scheduled do date', () => {
      it('returns true when has target_date but no scheduled_date or due_day', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          target_date: '2025-12-10', // Deadline in 5 days, no do date set
        };
        expect(isSweepEligible(item, TODAY)).toBe(true);
      });

      it('returns true for past deadline with no do date', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          target_date: '2025-12-01', // Deadline passed!
        };
        expect(isSweepEligible(item, TODAY)).toBe(true);
      });
    });

    describe('target_date with scheduled do date', () => {
      it('returns false when scheduled_date is in future (even with upcoming deadline)', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          target_date: '2025-12-08', // Deadline in 3 days
          scheduled_date: '2025-12-07', // Do date in 2 days
        };
        expect(isSweepEligible(item, TODAY)).toBe(false);
      });

      it('returns true when scheduled_date is today (with deadline)', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          target_date: '2025-12-08', // Deadline in 3 days
          scheduled_date: '2025-12-05', // Do date is today
        };
        expect(isSweepEligible(item, TODAY)).toBe(true);
      });
    });

    describe('carry_forward flag', () => {
      it('returns true when carry_forward is true (regardless of dates)', () => {
        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          carry_forward: true,
          scheduled_date: '2025-12-20', // Future date
        };
        expect(isSweepEligible(item, TODAY)).toBe(true);
      });
    });

    describe('undated recent items', () => {
      it('returns true for items created within last 3 days with no dates', () => {
        // Use actual recent date since the code uses new Date() internally
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          created_at: yesterday.toISOString(),
        };
        expect(isSweepEligible(item, TODAY)).toBe(true);
      });

      it('returns false for items created more than 3 days ago with no dates', () => {
        // Use actual old date since the code uses new Date() internally
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

        const item: SweepEligibleTodo = {
          id: '1',
          name: 'Test',
          created_at: fifteenDaysAgo.toISOString(),
        };
        expect(isSweepEligible(item, TODAY)).toBe(false);
      });
    });
  });

  describe('selectSweepCandidates', () => {
    it('filters to only eligible items', () => {
      const todos: SweepEligibleTodo[] = [
        { id: '1', name: 'Due today', scheduled_date: '2025-12-05' },
        { id: '2', name: 'Future', scheduled_date: '2025-12-15' },
        { id: '3', name: 'Overdue', scheduled_date: '2025-12-01' },
      ];

      const candidates = selectSweepCandidates(todos, TODAY);

      expect(candidates).toHaveLength(2);
      expect(candidates.map((c) => c.id)).toContain('1');
      expect(candidates.map((c) => c.id)).toContain('3');
      expect(candidates.map((c) => c.id)).not.toContain('2');
    });

    it('computes isOverdue correctly', () => {
      const todos: SweepEligibleTodo[] = [
        { id: '1', name: 'Due today', scheduled_date: '2025-12-05' },
        { id: '2', name: 'Overdue', scheduled_date: '2025-12-01' },
      ];

      const candidates = selectSweepCandidates(todos, TODAY);

      const dueToday = candidates.find((c) => c.id === '1');
      const overdue = candidates.find((c) => c.id === '2');

      expect(dueToday?.isOverdue).toBe(false);
      expect(overdue?.isOverdue).toBe(true);
    });

    it('computes hasUnscheduledDeadline correctly', () => {
      const todos: SweepEligibleTodo[] = [
        { id: '1', name: 'Has deadline, no do date', target_date: '2025-12-10' },
        {
          id: '2',
          name: 'Has both dates',
          target_date: '2025-12-10',
          scheduled_date: '2025-12-05',
        },
      ];

      const candidates = selectSweepCandidates(todos, TODAY);

      const unscheduled = candidates.find((c) => c.id === '1');
      const scheduled = candidates.find((c) => c.id === '2');

      expect(unscheduled?.hasUnscheduledDeadline).toBe(true);
      expect(scheduled?.hasUnscheduledDeadline).toBe(false);
    });

    it('computes daysUntilDeadline correctly', () => {
      const todos: SweepEligibleTodo[] = [
        { id: '1', name: 'Deadline in 5 days', target_date: '2025-12-10' },
        {
          id: '2',
          name: 'Deadline today',
          target_date: '2025-12-05',
          scheduled_date: '2025-12-05',
        },
        { id: '3', name: 'Deadline passed', target_date: '2025-12-01' },
      ];

      const candidates = selectSweepCandidates(todos, TODAY);

      const in5Days = candidates.find((c) => c.id === '1');
      const today = candidates.find((c) => c.id === '2');
      const passed = candidates.find((c) => c.id === '3');

      expect(in5Days?.daysUntilDeadline).toBe(5);
      expect(today?.daysUntilDeadline).toBe(0);
      expect(passed?.daysUntilDeadline).toBe(-4);
    });

    it('returns null for daysUntilDeadline when no target_date', () => {
      const todos: SweepEligibleTodo[] = [
        { id: '1', name: 'No deadline', scheduled_date: '2025-12-05' },
      ];

      const candidates = selectSweepCandidates(todos, TODAY);

      expect(candidates[0]?.daysUntilDeadline).toBeNull();
    });

    it('preserves all relevant fields in candidates', () => {
      const todos: SweepEligibleTodo[] = [
        {
          id: '1',
          name: 'Full todo',
          scheduled_date: '2025-12-05',
          target_date: '2025-12-08',
          due_day: '2025-12-05',
          space_id: 'space-1',
          tags: ['work', 'urgent'],
          carry_forward: false,
        },
      ];

      const candidates = selectSweepCandidates(todos, TODAY);
      const candidate = candidates[0];

      expect(candidate.scheduled_date).toBe('2025-12-05');
      expect(candidate.target_date).toBe('2025-12-08');
      expect(candidate.due_day).toBe('2025-12-05');
      expect(candidate.space_id).toBe('space-1');
      expect(candidate.tags).toEqual(['work', 'urgent']);
    });
  });

  describe('getSweepCandidateCount', () => {
    it('returns correct count of eligible items', () => {
      const todos: SweepEligibleTodo[] = [
        { id: '1', name: 'Eligible', scheduled_date: '2025-12-05' },
        { id: '2', name: 'Not eligible', scheduled_date: '2025-12-15' },
        { id: '3', name: 'Also eligible', scheduled_date: '2025-12-01' },
      ];

      const count = getSweepCandidateCount(todos, TODAY);

      expect(count).toBe(2);
    });

    it('returns 0 for empty array', () => {
      const count = getSweepCandidateCount([], TODAY);
      expect(count).toBe(0);
    });
  });
});
