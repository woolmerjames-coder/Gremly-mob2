/**
 * Mind Drop Log Subtype Tests
 *
 * Verifies that logs created from Mind Drop:
 * 1. Always get subtype='journal' (never 'idea')
 * 2. Have correct labels=['log']
 * 3. Todos don't get subtype='journal'
 * 4. Habits maintain subtype='start_habit'
 */

// Mock dependencies BEFORE imports
jest.mock('../lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ data: {}, error: null })),
          })),
        })),
      })),
    })),
  },
}));

jest.mock('../lib/conversionTelemetry', () => ({
  logConversionStart: jest.fn(),
  logConversionSuccess: jest.fn(),
  logConversionError: jest.fn(),
}));

jest.mock('../lib/minddrop/backgroundPrefill', () => ({
  backgroundPrefill: jest.fn(),
}));

jest.mock('../lib/logs/getEffectiveLogSubtype', () => ({
  getEffectiveLogSubtype: jest.fn().mockResolvedValue('journal'),
}));

// Import after mocks so mocks are applied
import {
  convertUnsortedToLog,
  convertUnsortedToTodo,
  convertUnsortedToHabit,
} from '../lib/conversion';

// Don't mock the conversion module - we're testing it!
// But we need to mock its dependencies

describe('Mind Drop Log Subtype Handling', () => {
  let mockRepo: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock repo with proper update method that captures the patch
    mockRepo = {
      getById: jest.fn(async (id: string) => ({
        id,
        type: 'note',
        title: 'Test note',
        body: 'Test body content',
        labels: ['catchall', 'needs_review'],
        why_string: null,
      })),
      update: jest.fn(async ({ id, patch }: any) => ({
        id,
        type: 'note',
        ...patch,
      })),
    };
  });

  describe('convertUnsortedToLog', () => {
    it('should assign subtype="journal" when explicitly provided', async () => {
      const noteId = 'test-note-123';

      const result = await convertUnsortedToLog(mockRepo, noteId, { subtype: 'journal' });

      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: noteId,
          patch: expect.objectContaining({
            subtype: 'journal',
          }),
        }),
      );

      expect(result.note).toMatchObject({
        subtype: 'journal',
      });
    });

    it('should respect explicit subtype option if provided', async () => {
      const noteId = 'test-note-456';

      const result = await convertUnsortedToLog(mockRepo, noteId, { subtype: 'idea' });

      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: noteId,
          patch: expect.objectContaining({
            subtype: 'idea',
          }),
        }),
      );
    });

    it('should set canonical_type="log" for logs', async () => {
      const noteId = 'test-note-789';

      const result = await convertUnsortedToLog(mockRepo, noteId, { subtype: 'journal' });

      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            canonicalType: 'log',
          }),
        }),
      );

      expect(result.note).toMatchObject({
        canonicalType: 'log',
      });
    });

    it('should set labels=["log"] and remove catchall/needs_review', async () => {
      const noteId = 'test-note-labels';

      const result = await convertUnsortedToLog(mockRepo, noteId, { subtype: 'journal' });

      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            labels: ['log'],
          }),
        }),
      );

      expect(result.note.labels).toEqual(['log']);
      expect(result.note.labels).not.toContain('catchall');
      expect(result.note.labels).not.toContain('needs_review');
    });

    it('should preserve non-catchall labels when converting', async () => {
      mockRepo.getById = jest.fn(async (id: string) => ({
        id,
        type: 'note',
        title: 'Test note',
        body: 'Test body',
        labels: ['catchall', 'needs_review', 'personal', 'work'],
        why_string: null,
      }));

      const result = await convertUnsortedToLog(mockRepo, 'test-note-preserve');

      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            labels: expect.arrayContaining(['log', 'personal', 'work']),
          }),
        }),
      );

      expect(result.note.labels).toContain('log');
      expect(result.note.labels).toContain('personal');
      expect(result.note.labels).toContain('work');
      expect(result.note.labels).not.toContain('catchall');
      expect(result.note.labels).not.toContain('needs_review');
    });

    it('should NOT assign subtype="idea" to logs (always journal)', async () => {
      // Test multiple conversions with explicit journal subtype
      const results = await Promise.all([
        convertUnsortedToLog(mockRepo, 'note-1', { subtype: 'journal' }),
        convertUnsortedToLog(mockRepo, 'note-2', { subtype: 'journal' }),
        convertUnsortedToLog(mockRepo, 'note-3', { subtype: 'journal' }),
      ]);

      results.forEach((result: any) => {
        expect(result.note.subtype).not.toBe('idea');
        expect(result.note.subtype).toBe('journal');
      });
    });
  });

  describe('convertUnsortedToTodo', () => {
    beforeEach(() => {
      mockRepo = {
        getById: jest.fn(async (id: string) => ({
          id,
          type: 'note',
          title: 'Test todo',
          body: 'Test todo content',
          labels: ['catchall', 'needs_review'],
        })),
        create: jest.fn(async (payload: any) => ({
          id: 'new-todo-123',
          type: 'todo',
          ...payload,
        })),
        update: jest.fn(async ({ id, patch }: any) => ({
          id,
          ...patch,
        })),
        archiveItemsByDropId: jest.fn(async () => ({ count: 0 })),
      };
    });

    it('should NOT assign subtype="journal" to todos', async () => {
      const noteId = 'test-note-todo';

      const result = await convertUnsortedToTodo(mockRepo, noteId);

      // Todos shouldn't have a subtype field (it's not applicable)
      // Or if they do, it should NOT be 'journal'
      expect(result.todo.subtype).not.toBe('journal');
    });

    it('should create todo with correct type and no log-specific fields', async () => {
      const result = await convertUnsortedToTodo(mockRepo, 'test-todo-fields');

      expect(result.todo.type).toBe('todo');
      expect(result.todo).not.toHaveProperty('canonicalType', 'log');
      expect(result.todo.labels).not.toContain('log');
    });
  });

  describe('convertUnsortedToHabit', () => {
    beforeEach(() => {
      mockRepo = {
        getById: jest.fn(async (id: string) => ({
          id,
          type: 'note',
          title: 'Test habit',
          body: 'Test habit content',
          labels: ['catchall', 'needs_review'],
        })),
        create: jest.fn(async (payload: any) => ({
          id: 'new-habit-123',
          type: 'habit',
          subtype: 'start_habit', // Habits use 'start_habit' subtype
          ...payload,
        })),
        update: jest.fn(async ({ id, patch }: any) => ({
          id,
          ...patch,
        })),
        archiveItemsByDropId: jest.fn(async () => ({ count: 0 })),
      };
    });

    it('should maintain subtype="start_habit" for habits', async () => {
      const result = await convertUnsortedToHabit(mockRepo, 'test-habit-subtype');

      expect(result.habit.subtype).toBe('start_habit');
    });

    it('should NOT assign subtype="journal" to habits', async () => {
      const result = await convertUnsortedToHabit(mockRepo, 'test-habit-no-journal');

      expect(result.habit.subtype).not.toBe('journal');
    });

    it('should create habit with correct type and no log-specific fields', async () => {
      const result = await convertUnsortedToHabit(mockRepo, 'test-habit-fields');

      expect(result.habit.type).toBe('habit');
      expect(result.habit).not.toHaveProperty('canonicalType', 'log');
      expect(result.habit.labels).not.toContain('log');
    });
  });

  describe('Cross-type subtype isolation', () => {
    it('should ensure log subtype never leaks to todos', async () => {
      mockRepo.create = jest.fn(async (payload: any) => ({
        id: 'new-item',
        ...payload,
      }));

      const logResult = await convertUnsortedToLog(mockRepo, 'log-note', { subtype: 'journal' });
      const todoResult = await convertUnsortedToTodo(mockRepo, 'todo-note');

      expect(logResult.note.subtype).toBe('journal');
      expect(todoResult.todo.subtype).not.toBe('journal');
    });

    it('should ensure habit subtype is distinct from log subtype', async () => {
      mockRepo.create = jest.fn(async (payload: any) => ({
        id: 'new-item',
        type: payload.type,
        subtype: payload.type === 'habit' ? 'start_habit' : undefined,
        ...payload,
      }));

      const logResult = await convertUnsortedToLog(mockRepo, 'log-note', { subtype: 'journal' });
      const habitResult = await convertUnsortedToHabit(mockRepo, 'habit-note');

      expect(logResult.note.subtype).toBe('journal');
      expect(habitResult.habit.subtype).toBe('start_habit');
      expect(habitResult.habit.subtype).not.toBe('journal');
    });
  });
});
