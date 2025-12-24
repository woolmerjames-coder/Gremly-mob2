/**
 * Overlay Stale Entity Tests
 *
 * Verifies that the overlay properly resets state between sessions,
 * preventing data from entity A appearing when viewing/editing entity B.
 *
 * These tests focus on the v2Reducer RESET action which is the key mechanism
 * for preventing stale entity data.
 */

import { v2Reducer, initialV2State } from '../components/overlay/overlayV2.state';

describe('Overlay Stale Entity Prevention', () => {
  describe('v2Reducer RESET action', () => {
    it('should return fresh initialV2State when RESET is dispatched', () => {
      // Start with a state that has been modified (simulating editing entity A)
      const dirtyState = {
        ...initialV2State,
        baseType: 'todo' as const,
        tags: ['existing-tag'],
        spaceId: 'some-space',
        todo: {
          ...initialV2State.todo,
          title: 'Some title',
          details: 'Some details',
          due_day: '2025-01-15',
        },
        commitment: true,
        commitmentNote: 'Some commitment',
        userEditedTitle: true,
        logSubtypeOverride: 'journal' as const,
      };

      // Dispatch RESET (what happens when switching to entity B)
      const resetState = v2Reducer(dirtyState, { type: 'RESET' });

      // Verify all fields are reset to initial values
      expect(resetState.baseType).toBe('log'); // initialV2State default
      expect(resetState.tags).toEqual([]);
      expect(resetState.spaceId).toBeUndefined(); // undefined = never set (initial state)
      expect(resetState.todo.title).toBe('');
      expect(resetState.todo.details).toBe('');
      expect(resetState.todo.due_day).toBeNull();
      expect(resetState.commitment).toBe(false);
      expect(resetState.commitmentNote).toBe('');
      expect(resetState.userEditedTitle).toBe(false);
      expect(resetState.logSubtypeOverride).toBeNull();

      // Verify it's a new object (not the same reference)
      expect(resetState).not.toBe(initialV2State);
      expect(resetState).toEqual(initialV2State);
    });

    it('should clear undo stack on RESET', () => {
      const stateWithUndo = {
        ...initialV2State,
        undoStack: [
          { kind: 'type' as const, prev: { baseType: 'log' as const } },
          { kind: 'tag' as const, prev: { tags: ['old-tag'] } },
        ],
      };

      const resetState = v2Reducer(stateWithUndo, { type: 'RESET' });

      expect(resetState.undoStack).toEqual([]);
    });

    it('should reset habit state on RESET', () => {
      const stateWithHabit = {
        ...initialV2State,
        baseType: 'habit' as const,
        habit: {
          ...initialV2State.habit,
          title: 'Daily Exercise',
          notes: 'Some notes about the habit',
        },
      };

      const resetState = v2Reducer(stateWithHabit, { type: 'RESET' });

      expect(resetState.baseType).toBe('log');
      expect(resetState.habit.title).toBe('');
      expect(resetState.habit.notes).toBe('');
    });

    it('should reset log state on RESET', () => {
      const stateWithLog = {
        ...initialV2State,
        baseType: 'log' as const,
        log: {
          ...initialV2State.log,
          title: 'My Note Title',
          body: 'My detailed note body content',
        },
      };

      const resetState = v2Reducer(stateWithLog, { type: 'RESET' });

      expect(resetState.baseType).toBe('log');
      expect(resetState.log.title).toBe('');
      expect(resetState.log.body).toBe('');
    });

    it('should reset todo-specific flags on RESET', () => {
      const stateWithTodo = {
        ...initialV2State,
        baseType: 'todo' as const,
        todo: {
          ...initialV2State.todo,
          title: 'My Todo',
          details: 'Todo details',
          due_day: '2025-01-20',
          due_time: '14:00',
          time_estimate_minutes: 30,
        },
      };

      const resetState = v2Reducer(stateWithTodo, { type: 'RESET' });

      expect(resetState.todo.title).toBe('');
      expect(resetState.todo.details).toBe('');
      expect(resetState.todo.due_day).toBeNull();
      expect(resetState.todo.due_time).toBeNull();
      expect(resetState.todo.time_estimate_minutes).toBeNull();
    });

    it('should reset all entity-specific fields to prevent cross-entity data leakage', () => {
      // Simulate state from Entity A (a todo with lots of data)
      const entityAState = {
        ...initialV2State,
        baseType: 'todo' as const,
        tags: ['tag-from-entity-a', 'another-tag'],
        spaceId: 'space-a',
        todo: {
          ...initialV2State.todo,
          title: 'Entity A Todo Title',
          details: 'Entity A details that should NOT appear in Entity B',
          due_day: '2025-01-15',
          due_time: '14:00',
        },
        habit: {
          ...initialV2State.habit,
          title: 'Some habit title from A',
        },
        log: {
          ...initialV2State.log,
          title: 'Some log title from A',
          body: 'Some log body from A',
        },
        commitment: true,
        commitmentNote: 'Commitment from entity A',
        userEditedTitle: true,
      };

      // RESET action should clear ALL of this
      const resetState = v2Reducer(entityAState, { type: 'RESET' });

      // Verify NO data from entity A remains
      expect(resetState.baseType).toBe('log');
      expect(resetState.tags).toEqual([]);
      expect(resetState.spaceId).toBeUndefined(); // undefined = never set (initial state)

      // Todo fields reset
      expect(resetState.todo.title).toBe('');
      expect(resetState.todo.details).toBe('');
      expect(resetState.todo.due_day).toBeNull();
      expect(resetState.todo.due_time).toBeNull();

      // Habit fields reset
      expect(resetState.habit.title).toBe('');

      // Log fields reset
      expect(resetState.log.title).toBe('');
      expect(resetState.log.body).toBe('');

      // Meta fields reset
      expect(resetState.commitment).toBe(false);
      expect(resetState.commitmentNote).toBe('');
      expect(resetState.userEditedTitle).toBe(false);
    });
  });
});
