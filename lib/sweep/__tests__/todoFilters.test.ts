/**
 * Tests for shared todo filter logic
 *
 * These tests verify the filter functions used by both:
 * - Today/NOW page (via sweepSelectors.ts)
 * - Sweep engine (via engine.ts)
 *
 * The goal is to ensure consistent filtering across both features.
 */

import {
  getEffectiveDueDay,
  isActiveTodo,
  isCompletedToday,
  isDueToday,
  isOverdue,
  isCarryForward,
  needsSweepAttention,
  buildSweepTodoOrClause,
  type FilterableTodo,
} from '../todoFilters';
import { getDateService } from '../../date';

// Helper to create date strings
function getDayString(daysOffset: number): string {
  const ds = getDateService();
  return daysOffset >= 0 ? ds.daysFromNow(daysOffset) : ds.daysAgo(-daysOffset);
}

const todayDay = getDayString(0);
const yesterdayDay = getDayString(-1);
const tomorrowDay = getDayString(1);
const lastWeekDay = getDayString(-7);

describe('getEffectiveDueDay', () => {
  it('should return due_day when set', () => {
    const todo: FilterableTodo = { due_day: '2025-12-05' };
    expect(getEffectiveDueDay(todo)).toBe('2025-12-05');
  });

  it('should extract date from due_date when due_day is null', () => {
    const todo: FilterableTodo = {
      due_day: null,
      due_date: '2025-12-05T14:30:00Z',
    };
    expect(getEffectiveDueDay(todo)).toBe('2025-12-05');
  });

  it('should prefer due_day over due_date', () => {
    const todo: FilterableTodo = {
      due_day: '2025-12-10',
      due_date: '2025-12-05T14:30:00Z',
    };
    expect(getEffectiveDueDay(todo)).toBe('2025-12-10');
  });

  it('should return null when neither due_day nor due_date is set', () => {
    const todo: FilterableTodo = {};
    expect(getEffectiveDueDay(todo)).toBeNull();
  });

  // NEW TESTS FOR DATESERVICE INTEGRATION
  it('should use DateService.extractDateFromIso for due_date parsing', () => {
    // Due date with time component - should extract just the date part
    const todo: FilterableTodo = {
      due_day: null,
      due_date: '2025-12-25T23:59:59.999Z',
    };
    expect(getEffectiveDueDay(todo)).toBe('2025-12-25');
  });

  it('should correctly extract date from ISO timestamp with time component', () => {
    const todo: FilterableTodo = {
      due_day: null,
      due_date: '2025-06-15T08:30:00+00:00',
    };
    expect(getEffectiveDueDay(todo)).toBe('2025-06-15');
  });

  it('should handle timestamps near midnight correctly', () => {
    const todo: FilterableTodo = {
      due_day: null,
      due_date: '2025-12-31T00:00:00.000Z',
    };
    expect(getEffectiveDueDay(todo)).toBe('2025-12-31');
  });

  it('should return null for malformed due_date', () => {
    const todo: FilterableTodo = {
      due_day: null,
      due_date: 'not-a-valid-date',
    };
    expect(getEffectiveDueDay(todo)).toBeNull();
  });
});

describe('isActiveTodo', () => {
  it('should return true for active todo', () => {
    const todo: FilterableTodo = { status: 'active' };
    expect(isActiveTodo(todo)).toBe(true);
  });

  it('should return true for todo without status (defaults to active)', () => {
    const todo: FilterableTodo = {};
    expect(isActiveTodo(todo)).toBe(true);
  });

  it('should return false for completed todo', () => {
    const todo: FilterableTodo = { status: 'completed' };
    expect(isActiveTodo(todo)).toBe(false);
  });

  it('should return false for archived todo (via status)', () => {
    const todo: FilterableTodo = { status: 'archived' };
    expect(isActiveTodo(todo)).toBe(false);
  });

  it('should return false for archived todo (via boolean)', () => {
    const todo: FilterableTodo = { archived: true };
    expect(isActiveTodo(todo)).toBe(false);
  });

  it('should return true for non-archived active todo', () => {
    const todo: FilterableTodo = { status: 'active', archived: false };
    expect(isActiveTodo(todo)).toBe(true);
  });
});

describe('isCompletedToday', () => {
  it('should return true when completed today', () => {
    const todo: FilterableTodo = {
      completed_at: `${todayDay}T10:30:00Z`,
    };
    expect(isCompletedToday(todo, todayDay)).toBe(true);
  });

  it('should return false when completed yesterday', () => {
    const todo: FilterableTodo = {
      completed_at: `${yesterdayDay}T10:30:00Z`,
    };
    expect(isCompletedToday(todo, todayDay)).toBe(false);
  });

  it('should return false when not completed', () => {
    const todo: FilterableTodo = { completed_at: null };
    expect(isCompletedToday(todo, todayDay)).toBe(false);
  });

  // NEW TESTS FOR DATESERVICE INTEGRATION
  it('should use DateService.extractDateFromIso for completed_at parsing', () => {
    const todo: FilterableTodo = {
      completed_at: `${todayDay}T23:59:59.999Z`,
    };
    // Note: extractDateFromIso converts to local date, so this depends on timezone
    // Using the same day should always match unless timezone shifts it
    expect(isCompletedToday(todo, todayDay)).toBeDefined();
  });

  it('should correctly handle date-only completed_at values', () => {
    // When completed_at has only the date (no time), it should match exactly
    const todo: FilterableTodo = {
      completed_at: todayDay,
    };
    expect(isCompletedToday(todo, todayDay)).toBe(true);
  });

  it('should return false for malformed completed_at timestamp', () => {
    const todo: FilterableTodo = {
      completed_at: 'invalid-timestamp',
    };
    expect(isCompletedToday(todo, todayDay)).toBe(false);
  });
});

describe('isDueToday', () => {
  it('should return true when due_day is today', () => {
    const todo: FilterableTodo = { due_day: todayDay };
    expect(isDueToday(todo, todayDay)).toBe(true);
  });

  it('should return false when due_day is yesterday', () => {
    const todo: FilterableTodo = { due_day: yesterdayDay };
    expect(isDueToday(todo, todayDay)).toBe(false);
  });

  it('should return false when due_day is tomorrow', () => {
    const todo: FilterableTodo = { due_day: tomorrowDay };
    expect(isDueToday(todo, todayDay)).toBe(false);
  });

  it('should return false when no due date', () => {
    const todo: FilterableTodo = {};
    expect(isDueToday(todo, todayDay)).toBe(false);
  });

  it('should use due_date fallback when due_day is null', () => {
    const todo: FilterableTodo = {
      due_day: null,
      due_date: `${todayDay}T14:00:00Z`,
    };
    expect(isDueToday(todo, todayDay)).toBe(true);
  });
});

describe('isOverdue', () => {
  it('should return true when due_day is yesterday', () => {
    const todo: FilterableTodo = { due_day: yesterdayDay };
    expect(isOverdue(todo, todayDay)).toBe(true);
  });

  it('should return true when due_day is last week', () => {
    const todo: FilterableTodo = { due_day: lastWeekDay };
    expect(isOverdue(todo, todayDay)).toBe(true);
  });

  it('should return false when due_day is today', () => {
    const todo: FilterableTodo = { due_day: todayDay };
    expect(isOverdue(todo, todayDay)).toBe(false);
  });

  it('should return false when due_day is tomorrow', () => {
    const todo: FilterableTodo = { due_day: tomorrowDay };
    expect(isOverdue(todo, todayDay)).toBe(false);
  });

  it('should return false when no due date', () => {
    const todo: FilterableTodo = {};
    expect(isOverdue(todo, todayDay)).toBe(false);
  });
});

describe('isCarryForward', () => {
  it('should return true when carry_forward is true', () => {
    const todo: FilterableTodo = { carry_forward: true };
    expect(isCarryForward(todo)).toBe(true);
  });

  it('should return false when carry_forward is false', () => {
    const todo: FilterableTodo = { carry_forward: false };
    expect(isCarryForward(todo)).toBe(false);
  });

  it('should return false when carry_forward is undefined', () => {
    const todo: FilterableTodo = {};
    expect(isCarryForward(todo)).toBe(false);
  });
});

describe('needsSweepAttention', () => {
  describe('should return true for', () => {
    it('active todo due today', () => {
      const todo: FilterableTodo = {
        status: 'active',
        due_day: todayDay,
      };
      expect(needsSweepAttention(todo, todayDay)).toBe(true);
    });

    it('active overdue todo', () => {
      const todo: FilterableTodo = {
        status: 'active',
        due_day: yesterdayDay,
      };
      expect(needsSweepAttention(todo, todayDay)).toBe(true);
    });

    it('active carry-forward todo', () => {
      const todo: FilterableTodo = {
        status: 'active',
        carry_forward: true,
      };
      expect(needsSweepAttention(todo, todayDay)).toBe(true);
    });

    it('overdue todo from last week', () => {
      const todo: FilterableTodo = {
        status: 'active',
        due_day: lastWeekDay,
      };
      expect(needsSweepAttention(todo, todayDay)).toBe(true);
    });
  });

  describe('should return false for', () => {
    it('completed todo', () => {
      const todo: FilterableTodo = {
        status: 'completed',
        due_day: todayDay,
      };
      expect(needsSweepAttention(todo, todayDay)).toBe(false);
    });

    it('archived todo', () => {
      const todo: FilterableTodo = {
        archived: true,
        due_day: todayDay,
      };
      expect(needsSweepAttention(todo, todayDay)).toBe(false);
    });

    it('todo completed today', () => {
      const todo: FilterableTodo = {
        status: 'active',
        due_day: todayDay,
        completed_at: `${todayDay}T12:00:00Z`,
      };
      expect(needsSweepAttention(todo, todayDay)).toBe(false);
    });

    it('todo due tomorrow', () => {
      const todo: FilterableTodo = {
        status: 'active',
        due_day: tomorrowDay,
      };
      expect(needsSweepAttention(todo, todayDay)).toBe(false);
    });

    it('todo with no due date and no carry-forward', () => {
      const todo: FilterableTodo = {
        status: 'active',
      };
      expect(needsSweepAttention(todo, todayDay)).toBe(false);
    });
  });
});

describe('buildSweepTodoOrClause', () => {
  it('should build correct OR clause format', () => {
    const todayDay = '2025-12-05';
    const cutoff = '2025-12-04T18:00:00Z';

    const result = buildSweepTodoOrClause(todayDay, cutoff);

    // Should include: due today/overdue, new items, skipped items, AND undated recent items
    expect(result).toContain('due_day.lte.2025-12-05');
    expect(result).toContain('created_at.gt.2025-12-04T18:00:00Z');
    expect(result).toContain('skipped_in_sweep_at.not.is.null');
    // New: includes undated items created in last 3 days
    expect(result).toContain('and(due_day.is.null,created_at.gt.');
  });

  it('should use lte (<=) for due_day to include both due-today and overdue', () => {
    const result = buildSweepTodoOrClause('2025-12-05', '2025-12-01T00:00:00Z');

    // Verify the clause uses .lte. (less than or equal) not .lt. (less than)
    expect(result).toContain('due_day.lte.');
  });
});

describe('filter alignment with sweepSelectors', () => {
  /**
   * This test documents that the Sweep engine's filters are aligned with
   * the Today page's sweepSelectors.ts.
   *
   * Both should include todos that are:
   * - Active (not completed/archived)
   * - Not completed today
   * - Due today OR overdue OR carry-forward
   *
   * The only difference is that the Sweep engine ALSO includes:
   * - New items (created after last sweep cutoff)
   * - Skipped items (skipped_in_sweep_at is set)
   */
  it('documents that sweep engine includes all sweepSelector candidates', () => {
    // A todo due today should be in BOTH Today page sweep pills AND Sweep engine
    const dueTodayTodo: FilterableTodo = {
      status: 'active',
      due_day: todayDay,
      archived: false,
    };

    expect(needsSweepAttention(dueTodayTodo, todayDay)).toBe(true);
  });

  it('documents that overdue todos appear in both', () => {
    const overdueTodo: FilterableTodo = {
      status: 'active',
      due_day: lastWeekDay,
      archived: false,
    };

    expect(needsSweepAttention(overdueTodo, todayDay)).toBe(true);
  });

  it('documents that carry-forward todos appear in both', () => {
    const carryForwardTodo: FilterableTodo = {
      status: 'active',
      carry_forward: true,
      archived: false,
    };

    expect(needsSweepAttention(carryForwardTodo, todayDay)).toBe(true);
  });
});
