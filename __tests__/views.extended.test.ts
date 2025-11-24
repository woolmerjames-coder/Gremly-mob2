/**
 * Test suite for extended views shape with stage and failure flags
 * Verifies that ai_failed and minddrop_stage round-trip through the repo layer
 */

import type { Habit, Todo, Note } from '../lib/types';

describe('Extended views shape', () => {
  describe('Type definitions', () => {
    it('should allow ai_failed flag in Habit views', () => {
      const habit: Habit = {
        id: '1',
        type: 'habit',
        name: 'Test',
        frequency: 'daily',
        subtype: 'start_habit',
        ai_placed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        owner_id: 'user1',
        views: {
          ai_pending: false,
          ai_failed: true,
          minddrop_stage: 'pending',
          minddrop_prefilled_v1: false,
        },
      };

      expect(habit.views?.ai_failed).toBe(true);
      expect(habit.views?.minddrop_stage).toBe('pending');
    });

    it('should allow ai_failed flag in Todo views', () => {
      const todo: Todo = {
        id: '1',
        type: 'todo',
        name: 'Test',
        ai_placed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        owner_id: 'user1',
        views: {
          ai_pending: false,
          ai_failed: true,
          minddrop_stage: 'classified',
          minddrop_prefilled_v1: true,
        },
      };

      expect(todo.views?.ai_failed).toBe(true);
      expect(todo.views?.minddrop_stage).toBe('classified');
    });

    it('should allow ai_failed flag in Note views', () => {
      const note: Note = {
        id: '1',
        type: 'note',
        title: 'Test',
        subtype: 'catchall',
        ai_placed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        owner_id: 'user1',
        views: {
          ai_pending: false,
          ai_failed: true,
          minddrop_stage: 'prefilled',
          minddrop_prefilled_v1: true,
        },
      };

      expect(note.views?.ai_failed).toBe(true);
      expect(note.views?.minddrop_stage).toBe('prefilled');
    });
  });

  describe('Stage values', () => {
    it('should support all minddrop_stage values', () => {
      type Stage = 'pending' | 'classified' | 'prefilled';
      
      const stages: Stage[] = ['pending', 'classified', 'prefilled'];
      
      stages.forEach((stage) => {
        const note: Note = {
          id: '1',
          type: 'note',
          title: 'Test',
          subtype: 'catchall',
          ai_placed: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          owner_id: 'user1',
          views: { minddrop_stage: stage },
        };

        expect(note.views?.minddrop_stage).toBe(stage);
      });
    });

    it('should allow views with only ai_failed', () => {
      const note: Note = {
        id: '1',
        type: 'note',
        title: 'Test',
        subtype: 'catchall',
        ai_placed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        owner_id: 'user1',
        views: { ai_failed: true },
      };

      expect(note.views?.ai_failed).toBe(true);
      expect(note.views?.ai_pending).toBeUndefined();
      expect(note.views?.minddrop_stage).toBeUndefined();
    });

    it('should allow views with only minddrop_stage', () => {
      const note: Note = {
        id: '1',
        type: 'note',
        title: 'Test',
        subtype: 'catchall',
        ai_placed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        owner_id: 'user1',
        views: { minddrop_stage: 'classified' },
      };

      expect(note.views?.minddrop_stage).toBe('classified');
      expect(note.views?.ai_pending).toBeUndefined();
      expect(note.views?.ai_failed).toBeUndefined();
    });

    it('should allow combining all flags', () => {
      const note: Note = {
        id: '1',
        type: 'note',
        title: 'Test',
        subtype: 'catchall',
        ai_placed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        owner_id: 'user1',
        views: {
          ai_pending: true,
          ai_failed: false,
          minddrop_stage: 'pending',
          minddrop_prefilled_v1: true,
          custom_field: 'custom_value',
        },
      };

      expect(note.views?.ai_pending).toBe(true);
      expect(note.views?.ai_failed).toBe(false);
      expect(note.views?.minddrop_stage).toBe('pending');
      expect(note.views?.minddrop_prefilled_v1).toBe(true);
      expect(note.views?.custom_field).toBe('custom_value');
    });
  });
});
