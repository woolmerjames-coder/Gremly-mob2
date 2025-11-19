/**
 * Tests for Mind Drop tag fallback behavior
 *
 * PART 1: Tag Fallback When Opening Overlay
 * ------------------------------------------
 * When converting unsorted note → todo/habit:
 * - If AI returns tags, use those
 * - If AI returns no tags, use tags from the source unsorted note
 * - Never leave tags empty if source had tags
 *
 * PART 2: Overlay Save Preserves Tags
 * ------------------------------------
 * When editing a todo/habit in the overlay:
 * - Changing title/due date/details should NOT wipe tags
 * - Tags should only change if user explicitly modifies them in UI
 */

import { convertUnsortedToTodo, convertUnsortedToHabit } from '../lib/conversion';
import type { IRepo } from '../lib/repo/IRepo';
import type { Note, Todo, Habit } from '../lib/types';

// Mock backgroundPrefill to control AI response
jest.mock('../lib/minddrop/backgroundPrefill', () => ({
  backgroundPrefill: jest.fn(),
}));

const mockUserId = 'test-user-123';

describe('Mind Drop Tag Fallback', () => {
  describe('PART 1: Tag Fallback on Todo/Habit Creation', () => {
    let mockRepo: jest.Mocked<IRepo>;

    beforeEach(() => {
      mockRepo = {
        getById: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      } as any;
    });

    test('GIVEN unsorted note with tags WHEN converting to todo AND AI returns no tags THEN todo gets source note tags', async () => {
      const unsortedNoteId = 'note-with-tags-123';
      const sourceTags = ['#appointment', '#dentist', '#health'];

      const unsortedNote: Note = {
        id: unsortedNoteId,
        type: 'note',
        title: 'Schedule dentist appointment for cleaning',
        body: 'Schedule dentist appointment for cleaning',
        subtype: 'catchall',
        tags: sourceTags, // Note has tags from Mind Drop input
        tags_meta: { sticky: [], tombstones: [] },
        labels: ['catchall', 'unsorted'],
        archived: false,
        ai_placed: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        owner_id: mockUserId,
        space_id: null,
        drop_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const createdTodo: Todo = {
        id: 'todo-123',
        type: 'todo',
        name: 'Schedule dentist appointment',
        body: 'Schedule dentist appointment for cleaning',
        due_date: null,
        undefined_due: true,
        tags: sourceTags, // Should inherit from note
        tags_meta: unsortedNote.tags_meta,
        labels: ['todo'],
        archived: false,
        ai_placed: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        owner_id: mockUserId,
        space_id: null,
        drop_id: unsortedNote.drop_id,
      };

      mockRepo.getById.mockResolvedValue(unsortedNote);
      mockRepo.create.mockResolvedValue(createdTodo);
      mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true } as Note);

      const result = await convertUnsortedToTodo(mockRepo, unsortedNoteId);

      // Verify todo was created with source tags
      expect(mockRepo.create).toHaveBeenCalled();
      const createCall = (mockRepo.create as jest.Mock).mock.calls[0][0];
      expect(createCall.tags).toEqual(sourceTags);
      expect(result.todo.tags).toEqual(sourceTags);
    });

    test('GIVEN unsorted note with tags WHEN converting to habit AND AI returns no tags THEN habit gets source note tags', async () => {
      const unsortedNoteId = 'note-habit-tags-456';
      const sourceTags = ['#meditation', '#wellness', '#mindfulness'];

      const unsortedNote: Note = {
        id: unsortedNoteId,
        type: 'note',
        title: 'Meditate for 10 minutes every morning',
        body: 'Meditate for 10 minutes every morning',
        subtype: 'catchall',
        tags: sourceTags,
        tags_meta: { sticky: [], tombstones: [] },
        labels: ['catchall', 'unsorted'],
        archived: false,
        ai_placed: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        owner_id: mockUserId,
        space_id: null,
        drop_id: '550e8400-e29b-41d4-a716-446655440002',
      };

      const createdHabit: Habit = {
        id: 'habit-456',
        type: 'habit',
        name: 'Meditate for 10 minutes',
        frequency: 'daily',
        subtype: 'start_habit',
        notes: 'Meditate for 10 minutes every morning',
        tags: sourceTags, // Should inherit from note
        tags_meta: unsortedNote.tags_meta,
        labels: ['habit'],
        archived: false,
        ai_placed: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        owner_id: mockUserId,
        space_id: null,
        drop_id: unsortedNote.drop_id,
      };

      mockRepo.getById.mockResolvedValue(unsortedNote);
      mockRepo.create.mockResolvedValue(createdHabit);
      mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true } as Note);

      const result = await convertUnsortedToHabit(mockRepo, unsortedNoteId, {
        frequency: 'daily',
      });

      // Verify habit was created with source tags
      expect(mockRepo.create).toHaveBeenCalled();
      const createCall = (mockRepo.create as jest.Mock).mock.calls[0][0];
      expect(createCall.tags).toEqual(sourceTags);
      expect(result.habit.tags).toEqual(sourceTags);
    });

    test('GIVEN unsorted note without tags WHEN converting to todo THEN todo gets tags extracted from text', async () => {
      const unsortedNoteId = 'note-no-tags-789';

      const unsortedNote: Note = {
        id: unsortedNoteId,
        type: 'note',
        title: 'Buy groceries',
        body: 'Buy groceries',
        subtype: 'catchall',
        tags: [], // No tags
        tags_meta: { sticky: [], tombstones: [] },
        labels: ['catchall', 'unsorted'],
        archived: false,
        ai_placed: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        owner_id: mockUserId,
        space_id: null,
        drop_id: '550e8400-e29b-41d4-a716-446655440003',
      };

      const createdTodo: Todo = {
        id: 'todo-789',
        type: 'todo',
        name: 'Buy groceries',
        body: 'Buy groceries',
        due_date: null,
        undefined_due: true,
        tags: ['#buy', '#groceries'], // Extracted from text via buildFallbackTags
        tags_meta: unsortedNote.tags_meta,
        labels: ['todo'],
        archived: false,
        ai_placed: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        owner_id: mockUserId,
        space_id: null,
        drop_id: unsortedNote.drop_id,
      };

      mockRepo.getById.mockResolvedValue(unsortedNote);
      mockRepo.create.mockResolvedValue(createdTodo);
      mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true } as Note);

      const result = await convertUnsortedToTodo(mockRepo, unsortedNoteId);

      // Verify todo was created with tags extracted from text (buildFallbackTags behavior)
      expect(mockRepo.create).toHaveBeenCalled();
      const createCall = (mockRepo.create as jest.Mock).mock.calls[0][0];
      expect(createCall.tags).toEqual(expect.arrayContaining(['#buy', '#groceries']));
      expect(result.todo.tags).toBeTruthy();
    });

    test('GIVEN unsorted note with complex tags WHEN converting to todo THEN todo preserves all source tags', async () => {
      const unsortedNoteId = 'note-complex-tags-101';
      const complexTags = ['#email', '#accountant', '#tax', '#deadline', '#important', '#finance'];

      const unsortedNote: Note = {
        id: unsortedNoteId,
        type: 'note',
        title: 'Email accountant about tax deadline',
        body: 'Email accountant about tax deadline',
        subtype: 'catchall',
        tags: complexTags,
        tags_meta: { sticky: ['#important'], tombstones: [] },
        labels: ['catchall', 'unsorted'],
        archived: false,
        ai_placed: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        owner_id: mockUserId,
        space_id: null,
        drop_id: '550e8400-e29b-41d4-a716-446655440004',
      };

      const createdTodo: Todo = {
        id: 'todo-complex-101',
        type: 'todo',
        name: 'Email accountant',
        body: 'Email accountant about tax deadline',
        due_date: null,
        undefined_due: true,
        tags: complexTags, // All tags preserved
        tags_meta: unsortedNote.tags_meta,
        labels: ['todo'],
        archived: false,
        ai_placed: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        owner_id: mockUserId,
        space_id: null,
        drop_id: unsortedNote.drop_id,
      };

      mockRepo.getById.mockResolvedValue(unsortedNote);
      mockRepo.create.mockResolvedValue(createdTodo);
      mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true } as Note);

      const result = await convertUnsortedToTodo(mockRepo, unsortedNoteId);

      // Verify all source tags were preserved
      expect(mockRepo.create).toHaveBeenCalled();
      const createCall = (mockRepo.create as jest.Mock).mock.calls[0][0];
      expect(createCall.tags).toEqual(complexTags);
      expect(createCall.tags).toHaveLength(6);
      expect(result.todo.tags).toEqual(complexTags);

      // Verify tags_meta was also preserved
      expect(createCall.tags_meta).toEqual(unsortedNote.tags_meta);
    });
  });

  describe('PART 2: Overlay Save Preserves Tags', () => {
    // Note: This tests the conversion layer. The overlay's toCreateOrUpdateInput
    // already has logic to preserve tags when not modified (shouldIncludeTags check).
    // These tests verify that the conversion helpers don't lose tags during the
    // unsorted → todo/habit transformation.

    test('GIVEN todo with tags WHEN converting from note THEN tags are preserved through conversion', async () => {
      const mockRepo: jest.Mocked<IRepo> = {
        getById: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      } as any;

      const sourceTags = ['#work', '#email', '#client'];
      const unsortedNote: Note = {
        id: 'note-preserve-123',
        type: 'note',
        title: 'Send proposal to client',
        body: 'Send proposal to client',
        subtype: 'catchall',
        tags: sourceTags,
        tags_meta: { sticky: ['#work'], tombstones: [] },
        labels: ['catchall', 'unsorted'],
        archived: false,
        ai_placed: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        owner_id: mockUserId,
        space_id: null,
        drop_id: '550e8400-e29b-41d4-a716-446655440005',
      };

      const createdTodo: Todo = {
        id: 'todo-preserve-123',
        type: 'todo',
        name: 'Send proposal to client',
        body: 'Send proposal to client',
        due_date: '2025-01-15',
        undefined_due: false,
        tags: sourceTags, // Tags preserved
        tags_meta: unsortedNote.tags_meta,
        labels: ['todo'],
        archived: false,
        ai_placed: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        owner_id: mockUserId,
        space_id: null,
        drop_id: unsortedNote.drop_id,
      };

      mockRepo.getById.mockResolvedValue(unsortedNote);
      mockRepo.create.mockResolvedValue(createdTodo);
      mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true } as Note);

      const result = await convertUnsortedToTodo(mockRepo, unsortedNote.id, {
        due: '2025-01-15',
      });

      // Verify tags and tags_meta were preserved
      const createCall = (mockRepo.create as jest.Mock).mock.calls[0][0];
      expect(createCall.tags).toEqual(sourceTags);
      expect(createCall.tags_meta).toEqual(unsortedNote.tags_meta);
      expect(result.todo.tags).toEqual(sourceTags);
    });

    test('GIVEN habit with tags WHEN converting from note THEN tags and sticky meta are preserved', async () => {
      const mockRepo: jest.Mocked<IRepo> = {
        getById: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      } as any;

      const sourceTags = ['#fitness', '#exercise', '#health'];
      const stickyTags = ['#fitness', '#health'];
      const unsortedNote: Note = {
        id: 'note-habit-preserve-456',
        type: 'note',
        title: 'Run 5km every morning',
        body: 'Run 5km every morning',
        subtype: 'catchall',
        tags: sourceTags,
        tags_meta: { sticky: stickyTags, tombstones: [] },
        labels: ['catchall', 'unsorted'],
        archived: false,
        ai_placed: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        owner_id: mockUserId,
        space_id: null,
        drop_id: '550e8400-e29b-41d4-a716-446655440006',
      };

      const createdHabit: Habit = {
        id: 'habit-preserve-456',
        type: 'habit',
        name: 'Run 5km',
        frequency: 'daily',
        subtype: 'start_habit',
        notes: 'Run 5km every morning',
        tags: sourceTags, // Tags preserved
        tags_meta: unsortedNote.tags_meta, // Sticky meta preserved
        labels: ['habit'],
        archived: false,
        ai_placed: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        owner_id: mockUserId,
        space_id: null,
        drop_id: unsortedNote.drop_id,
      };

      mockRepo.getById.mockResolvedValue(unsortedNote);
      mockRepo.create.mockResolvedValue(createdHabit);
      mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true } as Note);

      const result = await convertUnsortedToHabit(mockRepo, unsortedNote.id, {
        frequency: 'daily',
      });

      // Verify tags and tags_meta (including sticky) were preserved
      const createCall = (mockRepo.create as jest.Mock).mock.calls[0][0];
      expect(createCall.tags).toEqual(sourceTags);
      expect(createCall.tags_meta).toEqual(unsortedNote.tags_meta);
      expect(createCall.tags_meta.sticky).toEqual(stickyTags);
      expect(result.habit.tags).toEqual(sourceTags);
    });
  });
});
