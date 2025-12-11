/**
 * Tests for buildSpaceContext - builds AI context from Space data
 */

import { buildSpaceContext, formatSpaceContextForPrompt, SpaceContext } from '../buildSpaceContext';

describe('buildSpaceContext', () => {
  const mockSpace = { id: 'space-1', name: 'Traveling' };

  describe('when space is null', () => {
    it('returns null', () => {
      const result = buildSpaceContext({
        space: null,
        milestone: null,
        meta: null,
        countdown: null,
        todos: [],
        habits: [],
        notes: [],
      });
      expect(result).toBeNull();
    });
  });

  describe('with basic space data', () => {
    it('returns context with space name and empty summary', () => {
      const result = buildSpaceContext({
        space: mockSpace,
        milestone: null,
        meta: null,
        countdown: null,
        todos: [],
        habits: [],
        notes: [],
      });

      expect(result).toEqual({
        spaceName: 'Traveling',
        milestone: undefined,
        meta: undefined,
        summary: {
          todoCount: 0,
          completedTodoCount: 0,
          habitCount: 0,
          noteCount: 0,
        },
      });
    });
  });

  describe('with milestone', () => {
    it('includes milestone with countdown', () => {
      const result = buildSpaceContext({
        space: mockSpace,
        milestone: {
          name: 'Central America Trip',
          target_date: '2025-02-01',
          status: 'active',
        },
        meta: null,
        countdown: { days: 53, isPast: false },
        todos: [],
        habits: [],
        notes: [],
      });

      expect(result?.milestone).toEqual({
        name: 'Central America Trip',
        targetDate: '2025-02-01',
        daysRemaining: 53,
        isPast: false,
      });
    });

    it('handles past milestone', () => {
      const result = buildSpaceContext({
        space: mockSpace,
        milestone: {
          name: 'Old Goal',
          target_date: '2024-01-01',
          status: 'active',
        },
        meta: null,
        countdown: { days: 10, isPast: true },
        todos: [],
        habits: [],
        notes: [],
      });

      expect(result?.milestone).toEqual({
        name: 'Old Goal',
        targetDate: '2024-01-01',
        daysRemaining: 10,
        isPast: true,
      });
    });

    it('defaults countdown to 0 when null', () => {
      const result = buildSpaceContext({
        space: mockSpace,
        milestone: {
          name: 'Goal',
          target_date: '2025-02-01',
          status: 'active',
        },
        meta: null,
        countdown: null,
        todos: [],
        habits: [],
        notes: [],
      });

      expect(result?.milestone?.daysRemaining).toBe(0);
      expect(result?.milestone?.isPast).toBe(false);
    });
  });

  describe('with meta (why/notes)', () => {
    it('includes why from meta', () => {
      const result = buildSpaceContext({
        space: mockSpace,
        milestone: null,
        meta: { why: 'To explore new cultures' },
        countdown: null,
        todos: [],
        habits: [],
        notes: [],
      });

      expect(result?.meta).toEqual({
        why: 'To explore new cultures',
        notes: undefined,
      });
    });

    it('omits meta when empty', () => {
      const result = buildSpaceContext({
        space: mockSpace,
        milestone: null,
        meta: { why: '', notes: '' },
        countdown: null,
        todos: [],
        habits: [],
        notes: [],
      });

      expect(result?.meta).toEqual({
        why: undefined,
        notes: undefined,
      });
    });
  });

  describe('summary counts', () => {
    it('counts todos correctly including completed', () => {
      const result = buildSpaceContext({
        space: mockSpace,
        milestone: null,
        meta: null,
        countdown: null,
        todos: [
          { completed_at: null },
          { completed_at: '2025-01-01T00:00:00Z' },
          { completed_at: null },
          { completed_at: '2025-01-02T00:00:00Z' },
        ],
        habits: [],
        notes: [],
      });

      expect(result?.summary.todoCount).toBe(4);
      expect(result?.summary.completedTodoCount).toBe(2);
    });

    it('counts habits and notes', () => {
      const result = buildSpaceContext({
        space: mockSpace,
        milestone: null,
        meta: null,
        countdown: null,
        todos: [],
        habits: [{}, {}, {}],
        notes: [{}, {}],
      });

      expect(result?.summary.habitCount).toBe(3);
      expect(result?.summary.noteCount).toBe(2);
    });
  });
});

describe('formatSpaceContextForPrompt', () => {
  it('formats basic space context', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      summary: {
        todoCount: 0,
        completedTodoCount: 0,
        habitCount: 0,
        noteCount: 0,
      },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('Space: Traveling');
    expect(result).toContain('Use this only for general awareness');
  });

  it('formats milestone with days remaining', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      milestone: {
        name: 'Central America Trip',
        targetDate: '2025-02-01',
        daysRemaining: 53,
        isPast: false,
      },
      summary: {
        todoCount: 0,
        completedTodoCount: 0,
        habitCount: 0,
        noteCount: 0,
      },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('Goal: "Central America Trip" (53 days remaining)');
  });

  it('formats milestone that is today', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      milestone: {
        name: 'Trip',
        targetDate: '2025-02-01',
        daysRemaining: 0,
        isPast: false,
      },
      summary: {
        todoCount: 0,
        completedTodoCount: 0,
        habitCount: 0,
        noteCount: 0,
      },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('Goal: "Trip" (target is today)');
  });

  it('formats past milestone', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      milestone: {
        name: 'Old Trip',
        targetDate: '2024-01-01',
        daysRemaining: -10,
        isPast: true,
      },
      summary: {
        todoCount: 0,
        completedTodoCount: 0,
        habitCount: 0,
        noteCount: 0,
      },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('Goal: "Old Trip" (10 days past target)');
  });

  it('includes why when present', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      meta: { why: 'To explore new cultures' },
      summary: {
        todoCount: 0,
        completedTodoCount: 0,
        habitCount: 0,
        noteCount: 0,
      },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('Why: To explore new cultures');
  });

  it('formats todo counts', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      summary: {
        todoCount: 5,
        completedTodoCount: 2,
        habitCount: 0,
        noteCount: 0,
      },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('3 open todos, 2 completed');
  });

  it('formats habit count singular', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      summary: {
        todoCount: 0,
        completedTodoCount: 0,
        habitCount: 1,
        noteCount: 0,
      },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('1 habit being tracked');
  });

  it('formats habit count plural', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      summary: {
        todoCount: 0,
        completedTodoCount: 0,
        habitCount: 3,
        noteCount: 0,
      },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('3 habits being tracked');
  });

  it('omits sections when counts are zero', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      summary: {
        todoCount: 0,
        completedTodoCount: 0,
        habitCount: 0,
        noteCount: 0,
      },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).not.toContain('open todos');
    expect(result).not.toContain('habit');
  });
});
