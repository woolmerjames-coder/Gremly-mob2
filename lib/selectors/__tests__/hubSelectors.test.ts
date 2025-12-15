/**
 * Tests for selectNeedsAttentionItems hub selector
 *
 * Tests are deterministic - all dates are fixed, no dependency on system time.
 *
 * New rules (P5.V2.3):
 * - Base filters: not archived, not completed, not in Today
 * - Qualifying rules (must match ONE):
 *   1. Todo with no due date AND created > 7 days ago
 *   2. Idea log older than 14 days
 *   3. Item with no tags AND no space older than 7 days
 */

import {
  selectNeedsAttentionItems,
  type NeedsAttentionItem,
  type NeedsAttentionOptions,
} from '../hubSelectors';
import type { Todo, Note } from '../../types';

// =============================================================================
// Test Fixtures
// =============================================================================

const NOW = '2025-12-14T12:00:00.000Z';
const TODAY = '2025-12-14'; // YYYY-MM-DD
const OWNER_ID = 'test-user-123';

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: `todo-${Math.random().toString(36).slice(2)}`,
    type: 'todo',
    name: 'Test Todo',
    ai_placed: false,
    created_at: '2025-12-01T10:00:00.000Z', // 13 days ago from NOW
    updated_at: '2025-12-01T10:00:00.000Z',
    owner_id: OWNER_ID,
    tags: ['test'], // Default tags to prevent unorganized rule
    ...overrides,
  };
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: `note-${Math.random().toString(36).slice(2)}`,
    type: 'note',
    subtype: 'catchall',
    ai_placed: false,
    created_at: '2025-12-01T10:00:00.000Z', // 13 days ago from NOW
    updated_at: '2025-12-01T10:00:00.000Z',
    owner_id: OWNER_ID,
    tags: ['test'], // Default tags to prevent unorganized rule
    ...overrides,
  };
}

function makeIdea(overrides: Partial<Note> = {}): Note {
  return makeNote({
    subtype: 'idea',
    title: 'Test Idea',
    ...overrides,
  });
}

// =============================================================================
// Tests: Todo missing due date older than 7 days (was 5)
// =============================================================================

describe('selectNeedsAttentionItems - todo missing due date', () => {
  const defaultOpts: NeedsAttentionOptions = { nowIso: NOW, todayDate: TODAY };

  it('flags todo without due_day older than 7 days', () => {
    const todo = makeTodo({
      created_at: '2025-12-06T10:00:00.000Z', // 8 days ago
      due_day: null,
      due_date: null,
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('todo_missing_due_date_stale');
    expect(result[0].ageInDays).toBe(8);
    expect(result[0].item.id).toBe(todo.id);
  });

  it('does NOT flag todo without due_day that is only 6 days old', () => {
    const todo = makeTodo({
      created_at: '2025-12-08T10:00:00.000Z', // 6 days ago
      due_day: null,
      due_date: null,
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag todo with due_day set', () => {
    const todo = makeTodo({
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: '2025-12-20', // Has due day
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag todo with due_date set (even if due_day is null)', () => {
    const todo = makeTodo({
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: null,
      due_date: '2025-12-20T10:00:00.000Z', // Has due date
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('respects custom todoStaleDays threshold', () => {
    const todo = makeTodo({
      created_at: '2025-12-10T10:00:00.000Z', // 4 days ago
      due_day: null,
    });

    // Default (7 days) - should not flag
    const result1 = selectNeedsAttentionItems([todo], [], { nowIso: NOW, todayDate: TODAY });
    expect(result1).toHaveLength(0);

    // Custom threshold of 3 days - should flag
    const result2 = selectNeedsAttentionItems([todo], [], {
      nowIso: NOW,
      todayDate: TODAY,
      todoStaleDays: 3,
    });
    expect(result2).toHaveLength(1);
    expect(result2[0].reason).toBe('todo_missing_due_date_stale');
  });

  it('does NOT flag archived todos', () => {
    const todo = makeTodo({
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: null,
      archived: true,
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag completed todos', () => {
    const todo = makeTodo({
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: null,
      completed_at: '2025-12-10T10:00:00.000Z',
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag todo scheduled for today', () => {
    const todo = makeTodo({
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: TODAY, // Scheduled for today
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('flags exactly at 7 days threshold', () => {
    const todo = makeTodo({
      created_at: '2025-12-07T12:00:00.000Z', // Exactly 7 days ago
      due_day: null,
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(1);
    expect(result[0].ageInDays).toBe(7);
  });
});

// =============================================================================
// Tests: Idea note older than 14 days (was 7)
// =============================================================================

describe('selectNeedsAttentionItems - idea log older than 14 days', () => {
  const defaultOpts: NeedsAttentionOptions = { nowIso: NOW, todayDate: TODAY };

  it('flags idea note older than 14 days', () => {
    const idea = makeIdea({
      created_at: '2025-11-29T10:00:00.000Z', // 15 days ago
    });

    const result = selectNeedsAttentionItems([], [idea], defaultOpts);

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('idea_stale');
    expect(result[0].ageInDays).toBe(15);
    expect(result[0].item.id).toBe(idea.id);
  });

  it('does NOT flag idea note that is only 13 days old', () => {
    const idea = makeIdea({
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
    });

    const result = selectNeedsAttentionItems([], [idea], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag journal notes (only ideas)', () => {
    const journal = makeNote({
      subtype: 'journal',
      created_at: '2025-11-20T10:00:00.000Z', // 24 days ago
    });

    const result = selectNeedsAttentionItems([], [journal], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag list notes', () => {
    const list = makeNote({
      subtype: 'list',
      created_at: '2025-11-20T10:00:00.000Z', // 24 days ago
    });

    const result = selectNeedsAttentionItems([], [list], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag catchall notes', () => {
    const catchall = makeNote({
      subtype: 'catchall',
      created_at: '2025-11-20T10:00:00.000Z', // 24 days ago
    });

    const result = selectNeedsAttentionItems([], [catchall], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag reference notes', () => {
    const reference = makeNote({
      subtype: 'reference',
      created_at: '2025-11-20T10:00:00.000Z', // 24 days ago
    });

    const result = selectNeedsAttentionItems([], [reference], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('respects custom ideaStaleDays threshold', () => {
    const idea = makeIdea({
      created_at: '2025-12-10T10:00:00.000Z', // 4 days ago
    });

    // Default (14 days) - should not flag
    const result1 = selectNeedsAttentionItems([], [idea], { nowIso: NOW, todayDate: TODAY });
    expect(result1).toHaveLength(0);

    // Custom threshold of 3 days - should flag
    const result2 = selectNeedsAttentionItems([], [idea], {
      nowIso: NOW,
      todayDate: TODAY,
      ideaStaleDays: 3,
    });
    expect(result2).toHaveLength(1);
    expect(result2[0].reason).toBe('idea_stale');
  });

  it('does NOT flag archived ideas', () => {
    const idea = makeIdea({
      created_at: '2025-11-20T10:00:00.000Z', // 24 days ago
      archived: true,
    });

    const result = selectNeedsAttentionItems([], [idea], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('flags exactly at 14 days threshold', () => {
    const idea = makeIdea({
      created_at: '2025-11-30T12:00:00.000Z', // Exactly 14 days ago
    });

    const result = selectNeedsAttentionItems([], [idea], defaultOpts);

    expect(result).toHaveLength(1);
    expect(result[0].ageInDays).toBe(14);
  });
});

// =============================================================================
// Tests: Unorganized items (no tags AND no space) older than 7 days
// =============================================================================

describe('selectNeedsAttentionItems - unorganized items', () => {
  const defaultOpts: NeedsAttentionOptions = { nowIso: NOW, todayDate: TODAY };

  it('flags todo with no tags AND no space older than 7 days', () => {
    const todo = makeTodo({
      created_at: '2025-12-06T10:00:00.000Z', // 8 days ago
      due_day: '2025-12-20', // Has due day, so won't trigger stale rule
      space_id: null,
      tags: null,
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('unorganized_stale');
    expect(result[0].ageInDays).toBe(8);
  });

  it('flags note with no tags AND no space older than 7 days', () => {
    const note = makeNote({
      created_at: '2025-12-06T10:00:00.000Z', // 8 days ago
      subtype: 'catchall',
      space_id: null,
      tags: null,
    });

    const result = selectNeedsAttentionItems([], [note], defaultOpts);

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('unorganized_stale');
    expect(result[0].ageInDays).toBe(8);
  });

  it('does NOT flag item with tags (even if no space)', () => {
    const todo = makeTodo({
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: '2025-12-20',
      space_id: null,
      tags: ['work'],
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag item with space (even if no tags)', () => {
    const todo = makeTodo({
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: '2025-12-20',
      space_id: 'space-123',
      tags: null,
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag unorganized item that is only 6 days old', () => {
    const todo = makeTodo({
      created_at: '2025-12-08T10:00:00.000Z', // 6 days ago
      due_day: '2025-12-20',
      space_id: null,
      tags: null,
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag unorganized todo scheduled for today', () => {
    const todo = makeTodo({
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: TODAY, // Scheduled for today
      space_id: null,
      tags: null,
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('treats empty tags array same as null', () => {
    const todo = makeTodo({
      created_at: '2025-12-06T10:00:00.000Z', // 8 days ago
      due_day: '2025-12-20',
      space_id: null,
      tags: [], // Empty array
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('unorganized_stale');
  });

  it('respects custom unorganizedStaleDays threshold', () => {
    const todo = makeTodo({
      created_at: '2025-12-10T10:00:00.000Z', // 4 days ago
      due_day: '2025-12-20',
      space_id: null,
      tags: null,
    });

    // Default (7 days) - should not flag
    const result1 = selectNeedsAttentionItems([todo], [], defaultOpts);
    expect(result1).toHaveLength(0);

    // Custom threshold of 3 days - should flag
    const result2 = selectNeedsAttentionItems([todo], [], {
      nowIso: NOW,
      todayDate: TODAY,
      unorganizedStaleDays: 3,
    });
    expect(result2).toHaveLength(1);
    expect(result2[0].reason).toBe('unorganized_stale');
  });
});

// =============================================================================
// Tests: Combined scenarios
// =============================================================================

describe('selectNeedsAttentionItems - combined scenarios', () => {
  const defaultOpts: NeedsAttentionOptions = { nowIso: NOW, todayDate: TODAY };

  it('handles empty arrays', () => {
    const result = selectNeedsAttentionItems([], [], defaultOpts);

    expect(result).toEqual([]);
  });

  it('returns multiple items with different reasons', () => {
    const staleTodo = makeTodo({
      id: 'stale-todo',
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: null,
    });
    const staleIdea = makeIdea({
      id: 'stale-idea',
      created_at: '2025-11-20T10:00:00.000Z', // 24 days ago
    });
    const freshTodo = makeTodo({
      id: 'fresh-todo',
      created_at: '2025-12-13T10:00:00.000Z', // 1 day ago
      due_day: null,
    });

    const result = selectNeedsAttentionItems([staleTodo, freshTodo], [staleIdea], defaultOpts);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.item.id)).toContain('stale-todo');
    expect(result.map((r) => r.item.id)).toContain('stale-idea');
    expect(result.map((r) => r.item.id)).not.toContain('fresh-todo');
  });

  it('does not duplicate items for multiple matching rules', () => {
    // This todo matches stale rule - should only appear once even though
    // it also is unorganized
    const todo = makeTodo({
      id: 'multi-match-todo',
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: null,
      space_id: null,
      tags: null,
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('todo_missing_due_date_stale'); // Stale rule catches first
  });

  it('provides human-readable reason text', () => {
    const todo = makeTodo({
      created_at: '2025-12-06T10:00:00.000Z', // 8 days ago
      due_day: null,
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result[0].reasonText).toBe('Task has no due date and is 8 days old');
  });

  it('excludes items scheduled for today', () => {
    const todoForToday = makeTodo({
      id: 'today-todo',
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: TODAY,
      space_id: null,
      tags: null,
    });
    const todoNotForToday = makeTodo({
      id: 'not-today-todo',
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: null,
      space_id: null,
      tags: null,
    });

    const result = selectNeedsAttentionItems([todoForToday, todoNotForToday], [], defaultOpts);

    expect(result).toHaveLength(1);
    expect(result[0].item.id).toBe('not-today-todo');
  });
});

// =============================================================================
// Tests: Stability and determinism
// =============================================================================

describe('selectNeedsAttentionItems - stability', () => {
  const defaultOpts: NeedsAttentionOptions = { nowIso: NOW, todayDate: TODAY };

  it('returns same results for same inputs (deterministic)', () => {
    const todo = makeTodo({
      id: 'fixed-id',
      created_at: '2025-12-01T10:00:00.000Z',
      due_day: null,
    });

    const result1 = selectNeedsAttentionItems([todo], [], defaultOpts);
    const result2 = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result1).toEqual(result2);
  });

  it('different nowIso produces different results', () => {
    const todo = makeTodo({
      created_at: '2025-12-08T10:00:00.000Z', // 6 days ago from NOW
      due_day: null,
    });

    // At NOW (Dec 14), todo is 6 days old - not flagged (threshold is 7)
    const result1 = selectNeedsAttentionItems([todo], [], defaultOpts);
    expect(result1).toHaveLength(0);

    // At Dec 16, todo is 8 days old - flagged
    const result2 = selectNeedsAttentionItems([todo], [], {
      nowIso: '2025-12-16T12:00:00.000Z',
      todayDate: '2025-12-16',
    });
    expect(result2).toHaveLength(1);
  });

  it('different todayDate affects filtering', () => {
    const todo = makeTodo({
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: '2025-12-14', // TODAY
      space_id: null,
      tags: null,
    });

    // When todayDate matches due_day, item is excluded
    const result1 = selectNeedsAttentionItems([todo], [], {
      nowIso: NOW,
      todayDate: '2025-12-14',
    });
    expect(result1).toHaveLength(0);

    // When todayDate is different, item can be included
    const result2 = selectNeedsAttentionItems([todo], [], {
      nowIso: NOW,
      todayDate: '2025-12-15',
    });
    expect(result2).toHaveLength(1);
    expect(result2[0].reason).toBe('unorganized_stale');
  });
});
