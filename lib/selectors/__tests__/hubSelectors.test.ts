/**
 * Tests for selectNeedsAttentionItems hub selector
 *
 * Tests are deterministic - all dates are fixed, no dependency on system time.
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
// Tests: Todo missing due date older than 5 days
// =============================================================================

describe('selectNeedsAttentionItems - todo missing due date', () => {
  const defaultOpts: NeedsAttentionOptions = { nowIso: NOW };

  it('flags todo without due_day older than 5 days', () => {
    const todo = makeTodo({
      created_at: '2025-12-08T10:00:00.000Z', // 6 days ago
      due_day: null,
      due_date: null,
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('todo_missing_due_date_stale');
    expect(result[0].ageInDays).toBe(6);
    expect(result[0].item.id).toBe(todo.id);
  });

  it('does NOT flag todo without due_day that is only 4 days old', () => {
    const todo = makeTodo({
      created_at: '2025-12-10T10:00:00.000Z', // 4 days ago
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

    // Default (5 days) - should not flag
    const result1 = selectNeedsAttentionItems([todo], [], { nowIso: NOW });
    expect(result1).toHaveLength(0);

    // Custom threshold of 3 days - should flag
    const result2 = selectNeedsAttentionItems([todo], [], {
      nowIso: NOW,
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

  it('flags exactly at 5 days threshold', () => {
    const todo = makeTodo({
      created_at: '2025-12-09T12:00:00.000Z', // Exactly 5 days ago
      due_day: null,
    });

    const result = selectNeedsAttentionItems([todo], [], defaultOpts);

    expect(result).toHaveLength(1);
    expect(result[0].ageInDays).toBe(5);
  });
});

// =============================================================================
// Tests: Idea note older than 7 days
// =============================================================================

describe('selectNeedsAttentionItems - idea log older than 7 days', () => {
  const defaultOpts: NeedsAttentionOptions = { nowIso: NOW };

  it('flags idea note older than 7 days', () => {
    const idea = makeIdea({
      created_at: '2025-12-06T10:00:00.000Z', // 8 days ago
    });

    const result = selectNeedsAttentionItems([], [idea], defaultOpts);

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('idea_stale');
    expect(result[0].ageInDays).toBe(8);
    expect(result[0].item.id).toBe(idea.id);
  });

  it('does NOT flag idea note that is only 6 days old', () => {
    const idea = makeIdea({
      created_at: '2025-12-08T10:00:00.000Z', // 6 days ago
    });

    const result = selectNeedsAttentionItems([], [idea], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag journal notes (only ideas)', () => {
    const journal = makeNote({
      subtype: 'journal',
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
    });

    const result = selectNeedsAttentionItems([], [journal], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag list notes', () => {
    const list = makeNote({
      subtype: 'list',
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
    });

    const result = selectNeedsAttentionItems([], [list], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag catchall notes', () => {
    const catchall = makeNote({
      subtype: 'catchall',
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
    });

    const result = selectNeedsAttentionItems([], [catchall], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('does NOT flag reference notes', () => {
    const reference = makeNote({
      subtype: 'reference',
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
    });

    const result = selectNeedsAttentionItems([], [reference], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('respects custom ideaStaleDays threshold', () => {
    const idea = makeIdea({
      created_at: '2025-12-10T10:00:00.000Z', // 4 days ago
    });

    // Default (7 days) - should not flag
    const result1 = selectNeedsAttentionItems([], [idea], { nowIso: NOW });
    expect(result1).toHaveLength(0);

    // Custom threshold of 3 days - should flag
    const result2 = selectNeedsAttentionItems([], [idea], {
      nowIso: NOW,
      ideaStaleDays: 3,
    });
    expect(result2).toHaveLength(1);
    expect(result2[0].reason).toBe('idea_stale');
  });

  it('does NOT flag archived ideas', () => {
    const idea = makeIdea({
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      archived: true,
    });

    const result = selectNeedsAttentionItems([], [idea], defaultOpts);

    expect(result).toHaveLength(0);
  });

  it('flags exactly at 7 days threshold', () => {
    const idea = makeIdea({
      created_at: '2025-12-07T12:00:00.000Z', // Exactly 7 days ago
    });

    const result = selectNeedsAttentionItems([], [idea], defaultOpts);

    expect(result).toHaveLength(1);
    expect(result[0].ageInDays).toBe(7);
  });
});

// =============================================================================
// Tests: Optional no-space rule (feature-flagged)
// =============================================================================

describe('selectNeedsAttentionItems - no-space rule (feature-flagged)', () => {
  const NOW_ISO = NOW;

  it('does NOT flag items without space by default', () => {
    const todo = makeTodo({ space_id: null });
    const note = makeNote({ space_id: null });

    const result = selectNeedsAttentionItems([todo], [note], { nowIso: NOW_ISO });

    // Should only find the todo for missing due date, not for no space
    const noSpaceResults = result.filter((r) => r.reason === 'no_space_assigned');
    expect(noSpaceResults).toHaveLength(0);
  });

  it('flags todo without space when includeNoSpace is true', () => {
    const todo = makeTodo({
      space_id: null,
      due_day: '2025-12-20', // Has due day, so won't trigger stale rule
    });

    const result = selectNeedsAttentionItems([todo], [], {
      nowIso: NOW_ISO,
      includeNoSpace: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('no_space_assigned');
    expect(result[0].reasonText).toBe('Task has no space assigned');
  });

  it('flags note without space when includeNoSpace is true', () => {
    const note = makeNote({
      space_id: null,
      subtype: 'journal', // Not an idea, so won't trigger stale rule
      created_at: '2025-12-12T10:00:00.000Z', // 2 days ago
    });

    const result = selectNeedsAttentionItems([], [note], {
      nowIso: NOW_ISO,
      includeNoSpace: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('no_space_assigned');
    expect(result[0].reasonText).toBe('Note has no space assigned');
  });

  it('does NOT flag items with space_id when includeNoSpace is true', () => {
    const todo = makeTodo({
      space_id: 'space-123',
      due_day: '2025-12-20',
    });
    const note = makeNote({
      space_id: 'space-123',
      subtype: 'journal',
      created_at: '2025-12-12T10:00:00.000Z',
    });

    const result = selectNeedsAttentionItems([todo], [note], {
      nowIso: NOW_ISO,
      includeNoSpace: true,
    });

    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// Tests: Combined scenarios
// =============================================================================

describe('selectNeedsAttentionItems - combined scenarios', () => {
  it('handles empty arrays', () => {
    const result = selectNeedsAttentionItems([], [], { nowIso: NOW });

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
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
    });
    const freshTodo = makeTodo({
      id: 'fresh-todo',
      created_at: '2025-12-13T10:00:00.000Z', // 1 day ago
      due_day: null,
    });

    const result = selectNeedsAttentionItems([staleTodo, freshTodo], [staleIdea], { nowIso: NOW });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.item.id)).toContain('stale-todo');
    expect(result.map((r) => r.item.id)).toContain('stale-idea');
    expect(result.map((r) => r.item.id)).not.toContain('fresh-todo');
  });

  it('does not duplicate items for multiple matching rules', () => {
    // This todo matches stale rule - should only appear once even though
    // it also has no space_id
    const todo = makeTodo({
      id: 'multi-match-todo',
      created_at: '2025-12-01T10:00:00.000Z', // 13 days ago
      due_day: null,
      space_id: null,
    });

    // Without includeNoSpace, only stale rule triggers
    const result1 = selectNeedsAttentionItems([todo], [], { nowIso: NOW });
    expect(result1).toHaveLength(1);
    expect(result1[0].reason).toBe('todo_missing_due_date_stale');

    // With includeNoSpace, still only one item (stale rule catches first)
    const result2 = selectNeedsAttentionItems([todo], [], {
      nowIso: NOW,
      includeNoSpace: true,
    });
    expect(result2).toHaveLength(1);
    expect(result2[0].reason).toBe('todo_missing_due_date_stale');
  });

  it('provides human-readable reason text', () => {
    const todo = makeTodo({
      created_at: '2025-12-08T10:00:00.000Z', // 6 days ago
      due_day: null,
    });

    const result = selectNeedsAttentionItems([todo], [], { nowIso: NOW });

    expect(result[0].reasonText).toBe('Task has no due date and is 6 days old');
  });
});

// =============================================================================
// Tests: Stability and determinism
// =============================================================================

describe('selectNeedsAttentionItems - stability', () => {
  it('returns same results for same inputs (deterministic)', () => {
    const todo = makeTodo({
      id: 'fixed-id',
      created_at: '2025-12-01T10:00:00.000Z',
      due_day: null,
    });

    const result1 = selectNeedsAttentionItems([todo], [], { nowIso: NOW });
    const result2 = selectNeedsAttentionItems([todo], [], { nowIso: NOW });

    expect(result1).toEqual(result2);
  });

  it('different nowIso produces different results', () => {
    const todo = makeTodo({
      created_at: '2025-12-10T10:00:00.000Z', // 4 days ago from NOW
      due_day: null,
    });

    // At NOW (Dec 14), todo is 4 days old - not flagged
    const result1 = selectNeedsAttentionItems([todo], [], { nowIso: NOW });
    expect(result1).toHaveLength(0);

    // At Dec 16, todo is 6 days old - flagged
    const result2 = selectNeedsAttentionItems([todo], [], {
      nowIso: '2025-12-16T12:00:00.000Z',
    });
    expect(result2).toHaveLength(1);
  });
});
