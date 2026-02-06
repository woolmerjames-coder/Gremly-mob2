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
        todos: [],
        habits: [],
        guides: [],
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
        habits: [{ name: 'h1' }, { name: 'h2' }, { name: 'h3' }],
        notes: [{}, {}],
      });

      expect(result?.summary.habitCount).toBe(3);
      expect(result?.summary.noteCount).toBe(2);
    });
  });

  describe('with events', () => {
    it('processes events with daysUntil calculation', () => {
      // Pin date so daysUntil is deterministic
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-12-15T12:00:00'));

      const result = buildSpaceContext({
        space: mockSpace,
        milestone: null,
        meta: null,
        countdown: null,
        todos: [],
        habits: [],
        notes: [],
        events: [
          { name: 'Concert', target_date: '2025-12-20', end_date: null, event_time: '19:00' },
          { name: 'Flight', target_date: '2025-12-18', end_date: null, event_time: null },
        ],
      });

      jest.useRealTimers();

      expect(result?.events).toHaveLength(2);
      // Sorted by date ascending
      expect(result!.events![0].name).toBe('Flight');
      expect(result!.events![0].date).toBe('2025-12-18');
      expect(result!.events![0].daysUntil).toBeGreaterThan(0);
      expect(result!.events![0].isPast).toBe(false);
      expect(result!.events![1].name).toBe('Concert');
      expect(result!.events![1].time).toBe('19:00');
      // Concert is further in the future than Flight
      expect(result!.events![1].daysUntil).toBeGreaterThan(result!.events![0].daysUntil);
    });

    it('excludes dateless events', () => {
      const result = buildSpaceContext({
        space: mockSpace,
        milestone: null,
        meta: null,
        countdown: null,
        todos: [],
        habits: [],
        notes: [],
        events: [
          { name: 'Someday Event', target_date: null, end_date: null, event_time: null },
          { title: 'Titled Event', target_date: '2025-12-20', end_date: null, event_time: null },
        ],
      });

      expect(result?.events).toHaveLength(1);
      expect(result!.events![0].name).toBe('Titled Event');
    });

    it('marks past events with isPast=true', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-12-15T12:00:00'));

      const result = buildSpaceContext({
        space: mockSpace,
        milestone: null,
        meta: null,
        countdown: null,
        todos: [],
        habits: [],
        notes: [],
        events: [
          { name: 'Past Event', target_date: '2025-12-10', end_date: null, event_time: null },
        ],
      });

      jest.useRealTimers();

      expect(result?.events).toHaveLength(1);
      expect(result!.events![0].isPast).toBe(true);
      expect(result!.events![0].daysUntil).toBeLessThan(0);
    });

    it('includes endDate when provided', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-12-15T12:00:00'));

      const result = buildSpaceContext({
        space: mockSpace,
        milestone: null,
        meta: null,
        countdown: null,
        todos: [],
        habits: [],
        notes: [],
        events: [
          { name: 'Trip', target_date: '2025-12-20', end_date: '2025-12-25', event_time: null },
        ],
      });

      jest.useRealTimers();

      expect(result!.events![0].endDate).toBe('2025-12-25');
    });

    it('returns undefined events when none provided', () => {
      const result = buildSpaceContext({
        space: mockSpace,
        milestone: null,
        meta: null,
        countdown: null,
        todos: [],
        habits: [],
        notes: [],
      });

      expect(result?.events).toBeUndefined();
    });
  });
});

describe('formatSpaceContextForPrompt', () => {
  it('formats basic space context', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      todos: [],
      habits: [],
      guides: [],
      summary: {
        todoCount: 0,
        completedTodoCount: 0,
        habitCount: 0,
        noteCount: 0,
      },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('Space: Traveling');
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
      todos: [],
      habits: [],
      guides: [],
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
      todos: [],
      habits: [],
      guides: [],
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
      todos: [],
      habits: [],
      guides: [],
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
      todos: [],
      habits: [],
      guides: [],
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

  it('formats open tasks', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      todos: [
        { title: 'Book flights', completed: false },
        { title: 'Get passport', completed: false },
        { title: 'Pack bags', completed: true },
      ],
      habits: [],
      guides: [],
      summary: {
        todoCount: 3,
        completedTodoCount: 1,
        habitCount: 0,
        noteCount: 0,
      },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('Open tasks:');
    expect(result).toContain('- Book flights');
    expect(result).toContain('- Get passport');
    // Completed task should not appear
    expect(result).not.toContain('Pack bags');
  });

  it('formats habit with frequency', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      todos: [],
      habits: [{ name: 'Practice Spanish', frequency: 'daily' }],
      guides: [],
      summary: {
        todoCount: 0,
        completedTodoCount: 0,
        habitCount: 1,
        noteCount: 0,
      },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('Current habits:');
    expect(result).toContain('- Practice Spanish (daily)');
  });

  it('formats multiple habits', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      todos: [],
      habits: [
        { name: 'Practice Spanish', frequency: 'daily' },
        { name: 'Review budget', frequency: 'weekly' },
        { name: 'Research destinations', frequency: 'daily', completionSummary: '3/7 this week' },
      ],
      guides: [],
      summary: {
        todoCount: 0,
        completedTodoCount: 0,
        habitCount: 3,
        noteCount: 0,
      },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('Current habits:');
    expect(result).toContain('- Practice Spanish (daily)');
    expect(result).toContain('- Review budget (weekly)');
    expect(result).toContain('- Research destinations (daily, 3/7 this week)');
  });

  it('omits sections when counts are zero', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      todos: [],
      habits: [],
      guides: [],
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

  it('formats key dates/events section', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      events: [
        { name: 'Flight', date: '2025-12-20', daysUntil: 5, isPast: false },
        { name: 'Hotel', date: '2025-12-20', endDate: '2025-12-25', daysUntil: 5, isPast: false },
        { name: 'Past Booking', date: '2025-12-10', daysUntil: -5, isPast: true },
      ],
      todos: [],
      habits: [],
      guides: [],
      summary: { todoCount: 0, completedTodoCount: 0, habitCount: 0, noteCount: 0 },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('Key dates:');
    expect(result).toContain('- Flight (2025-12-20) — in 5 days');
    expect(result).toContain('- Hotel (2025-12-20 - 2025-12-25) — in 5 days');
    expect(result).toContain('- Past Booking (2025-12-10) — 5 days ago');
  });

  it('formats event with time', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      events: [{ name: 'Dinner', date: '2025-12-20', time: '19:00', daysUntil: 5, isPast: false }],
      todos: [],
      habits: [],
      guides: [],
      summary: { todoCount: 0, completedTodoCount: 0, habitCount: 0, noteCount: 0 },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('- Dinner (2025-12-20 at 19:00) — in 5 days');
  });

  it('formats today and tomorrow events', () => {
    const context: SpaceContext = {
      spaceName: 'Traveling',
      events: [
        { name: 'Today Event', date: '2025-12-15', daysUntil: 0, isPast: false },
        { name: 'Tomorrow Event', date: '2025-12-16', daysUntil: 1, isPast: false },
      ],
      todos: [],
      habits: [],
      guides: [],
      summary: { todoCount: 0, completedTodoCount: 0, habitCount: 0, noteCount: 0 },
    };

    const result = formatSpaceContextForPrompt(context);
    expect(result).toContain('— today');
    expect(result).toContain('— tomorrow');
  });
});
