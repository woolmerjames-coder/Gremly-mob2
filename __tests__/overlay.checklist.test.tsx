/**
 * __tests__/overlay.checklist.test.tsx
 *
 * Tests for checklist behavior in UnifiedOverlayV2.
 * Phase 7 Lists: Tests enabling, adding, toggling checklist items.
 */

import { v2Reducer, initialV2State, type V2State } from '../components/overlay/overlayV2.state';
import type { ListItem } from '../lib/lists/types';

describe('Overlay Checklist State Management', () => {
  describe('ENABLE_CHECKLIST action', () => {
    it('should enable checklist on todo', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          title: 'Shopping list',
          has_list: false,
          list_items: null,
        },
      };

      const newState = v2Reducer(state, { type: 'ENABLE_CHECKLIST' });

      expect(newState.todo.has_list).toBe(true);
      expect(newState.todo.list_items).toBe(null); // null when no autoParseFrom
    });

    it('should auto-parse body text into list items when enabling', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          title: 'Packing',
          details: '- passport\n- sunscreen\n- hat',
          has_list: false,
          list_items: null,
        },
      };

      const newState = v2Reducer(state, {
        type: 'ENABLE_CHECKLIST',
        autoParseFrom: '- passport\n- sunscreen\n- hat',
      });

      expect(newState.todo.has_list).toBe(true);
      expect(newState.todo.list_items).toHaveLength(3);
      expect(newState.todo.list_items?.[0].text).toBe('passport');
      expect(newState.todo.list_items?.[1].text).toBe('sunscreen');
      expect(newState.todo.list_items?.[2].text).toBe('hat');
      expect(newState.todo.list_items?.every((item) => item.checked === false)).toBe(true);
    });

    it('should enable checklist on note', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'log',
        log: {
          ...initialV2State.log,
          title: 'Ideas',
          has_list: false,
          list_items: null,
        },
      };

      const newState = v2Reducer(state, { type: 'ENABLE_CHECKLIST' });

      expect(newState.log.has_list).toBe(true);
      expect(newState.log.list_items).toBe(null); // null when no autoParseFrom
    });

    it('should enable checklist on habit', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'habit',
        habit: {
          ...initialV2State.habit,
          title: 'Morning routine',
          has_list: false,
          list_items: null,
        },
      };

      const newState = v2Reducer(state, { type: 'ENABLE_CHECKLIST' });

      expect(newState.habit.has_list).toBe(true);
      expect(newState.habit.list_items).toBe(null); // null when no autoParseFrom
    });
  });

  describe('ADD_CHECKLIST_ITEM action', () => {
    it('should add item to empty todo checklist', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          has_list: true,
          list_items: [],
        },
      };

      const newState = v2Reducer(state, {
        type: 'ADD_CHECKLIST_ITEM',
        text: 'milk',
      });

      expect(newState.todo.list_items).toHaveLength(1);
      expect(newState.todo.list_items?.[0].text).toBe('milk');
      expect(newState.todo.list_items?.[0].checked).toBe(false);
      expect(newState.todo.list_items?.[0].id).toBeTruthy();
    });

    it('should add multiple items sequentially', () => {
      let state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          has_list: true,
          list_items: [],
        },
      };

      state = v2Reducer(state, { type: 'ADD_CHECKLIST_ITEM', text: 'eggs' });
      state = v2Reducer(state, { type: 'ADD_CHECKLIST_ITEM', text: 'milk' });
      state = v2Reducer(state, { type: 'ADD_CHECKLIST_ITEM', text: 'bread' });

      expect(state.todo.list_items).toHaveLength(3);
      expect(state.todo.list_items?.[0].text).toBe('eggs');
      expect(state.todo.list_items?.[1].text).toBe('milk');
      expect(state.todo.list_items?.[2].text).toBe('bread');
    });

    it('should trim whitespace from item text', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          has_list: true,
          list_items: [],
        },
      };

      const newState = v2Reducer(state, {
        type: 'ADD_CHECKLIST_ITEM',
        text: '  trimmed  ',
      });

      expect(newState.todo.list_items?.[0].text).toBe('trimmed');
    });

    it('should not add empty items', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          has_list: true,
          list_items: [],
        },
      };

      const newState = v2Reducer(state, {
        type: 'ADD_CHECKLIST_ITEM',
        text: '   ',
      });

      expect(newState.todo.list_items).toEqual([]);
    });
  });

  describe('TOGGLE_CHECKLIST_ITEM action', () => {
    it('should toggle item from unchecked to checked', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          has_list: true,
          list_items: [
            { id: 'item-1', text: 'Task 1', checked: false },
            { id: 'item-2', text: 'Task 2', checked: false },
          ],
        },
      };

      const newState = v2Reducer(state, {
        type: 'TOGGLE_CHECKLIST_ITEM',
        itemId: 'item-1',
      });

      expect(newState.todo.list_items?.[0].checked).toBe(true);
      expect(newState.todo.list_items?.[1].checked).toBe(false); // Other items unchanged
    });

    it('should toggle item from checked to unchecked', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          has_list: true,
          list_items: [{ id: 'item-1', text: 'Task', checked: true }],
        },
      };

      const newState = v2Reducer(state, {
        type: 'TOGGLE_CHECKLIST_ITEM',
        itemId: 'item-1',
      });

      expect(newState.todo.list_items?.[0].checked).toBe(false);
    });

    it('should not mutate original state', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          has_list: true,
          list_items: [{ id: 'item-1', text: 'Task', checked: false }],
        },
      };

      const newState = v2Reducer(state, {
        type: 'TOGGLE_CHECKLIST_ITEM',
        itemId: 'item-1',
      });

      expect(state.todo.list_items?.[0].checked).toBe(false); // Original unchanged
      expect(newState.todo.list_items?.[0].checked).toBe(true); // New state updated
    });
  });

  describe('REMOVE_CHECKLIST_ITEM action', () => {
    it('should remove item by ID', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          has_list: true,
          list_items: [
            { id: 'item-1', text: 'Keep', checked: false },
            { id: 'item-2', text: 'Remove', checked: false },
            { id: 'item-3', text: 'Keep too', checked: false },
          ],
        },
      };

      const newState = v2Reducer(state, {
        type: 'REMOVE_CHECKLIST_ITEM',
        itemId: 'item-2',
      });

      expect(newState.todo.list_items).toHaveLength(2);
      expect(newState.todo.list_items?.[0].id).toBe('item-1');
      expect(newState.todo.list_items?.[1].id).toBe('item-3');
    });

    it('should handle removing last item', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          has_list: true,
          list_items: [{ id: 'item-1', text: 'Only item', checked: false }],
        },
      };

      const newState = v2Reducer(state, {
        type: 'REMOVE_CHECKLIST_ITEM',
        itemId: 'item-1',
      });

      expect(newState.todo.list_items).toEqual([]);
      expect(newState.todo.has_list).toBe(true); // Still enabled, just empty
    });
  });

  describe('UPDATE_CHECKLIST_ITEM action', () => {
    it('should update item text', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          has_list: true,
          list_items: [
            { id: 'item-1', text: 'Old text', checked: false },
            { id: 'item-2', text: 'Keep this', checked: false },
          ],
        },
      };

      const newState = v2Reducer(state, {
        type: 'UPDATE_CHECKLIST_ITEM',
        itemId: 'item-1',
        text: 'New text',
      });

      expect(newState.todo.list_items?.[0].text).toBe('New text');
      expect(newState.todo.list_items?.[1].text).toBe('Keep this'); // Other items unchanged
    });

    it('should preserve text as-is when updating (no trimming)', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          has_list: true,
          list_items: [{ id: 'item-1', text: 'Original', checked: false }],
        },
      };

      const newState = v2Reducer(state, {
        type: 'UPDATE_CHECKLIST_ITEM',
        itemId: 'item-1',
        text: '  Updated  ',
      });

      expect(newState.todo.list_items?.[0].text).toBe('  Updated  ');
    });
  });

  describe('DISABLE_CHECKLIST action', () => {
    it('should disable checklist on todo', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'todo',
        todo: {
          ...initialV2State.todo,
          has_list: true,
          list_items: [
            { id: 'item-1', text: 'Item 1', checked: false },
            { id: 'item-2', text: 'Item 2', checked: true },
          ],
        },
      };

      const newState = v2Reducer(state, { type: 'DISABLE_CHECKLIST' });

      expect(newState.todo.has_list).toBe(false);
      expect(newState.todo.list_items).toBe(null);
    });

    it('should disable checklist on note', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'log',
        log: {
          ...initialV2State.log,
          has_list: true,
          list_items: [{ id: 'item-1', text: 'Item', checked: false }],
        },
      };

      const newState = v2Reducer(state, { type: 'DISABLE_CHECKLIST' });

      expect(newState.log.has_list).toBe(false);
      expect(newState.log.list_items).toBe(null);
    });

    it('should disable checklist on habit', () => {
      const state: V2State = {
        ...initialV2State,
        baseType: 'habit',
        habit: {
          ...initialV2State.habit,
          has_list: true,
          list_items: [{ id: 'item-1', text: 'Step', checked: false }],
        },
      };

      const newState = v2Reducer(state, { type: 'DISABLE_CHECKLIST' });

      expect(newState.habit.has_list).toBe(false);
      expect(newState.habit.list_items).toBe(null);
    });
  });

  describe('Cross-entity type support', () => {
    it('should support checklists on all three entity types', () => {
      // Todo
      const todoState = v2Reducer(
        { ...initialV2State, baseType: 'todo' },
        { type: 'ENABLE_CHECKLIST' },
      );
      expect(todoState.todo.has_list).toBe(true);

      // Note/Log
      const noteState = v2Reducer(
        { ...initialV2State, baseType: 'log' },
        { type: 'ENABLE_CHECKLIST' },
      );
      expect(noteState.log.has_list).toBe(true);

      // Habit
      const habitState = v2Reducer(
        { ...initialV2State, baseType: 'habit' },
        { type: 'ENABLE_CHECKLIST' },
      );
      expect(habitState.habit.has_list).toBe(true);
    });
  });
});
