/**
 * Tests for convertUnsortedToTodo helper
 *
 * Verifies that clicking the Todo chip on an unsorted Mind Drop item:
 * 1. Creates a first-class todo record in the todos table
 * 2. Archives the original unsorted note
 * 3. Transfers all relevant metadata (tags, drop_id, etc.)
 * 4. Results in Recent drops showing the todo (not the archived note)
 */

import { convertUnsortedToTodo } from '../../lib/conversion';
import type { IRepo } from '../../lib/repo/IRepo';
import type { Note, Todo } from '../../lib/types';

describe('convertUnsortedToTodo', () => {
  let mockRepo: jest.Mocked<IRepo>;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    mockRepo = {
      getById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as any;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should convert unsorted note to todo and archive the note', async () => {
    const unsortedNote: Note = {
      id: 'note-123',
      type: 'note',
      title: 'Buy groceries',
      body: 'Buy groceries for the week',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review'],
      origin: 'catchall',
      ai_placed: true,
      why_string: 'Created via Mind Drop',
      tags: ['#shopping', '#groceries'],
      tags_meta: { sticky: [], tombstones: [] },
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
      drop_id: 'drop-456',
    } as any;

    const createdTodo: Todo = {
      id: 'todo-789',
      type: 'todo',
      name: 'Buy groceries for the week',
      body: 'Buy groceries for the week',
      due_date: null,
      undefined_due: true,
      labels: ['todo'],
      origin: 'catchall',
      ai_placed: true,
      why_string: 'Created via Mind Drop → [unsorted:note-123]',
      tags: ['#shopping', '#groceries'],
      tags_meta: { sticky: [], tombstones: [] },
      created_at: '2024-01-01T08:10:00Z',
      updated_at: '2024-01-01T08:10:00Z',
      canonicalType: 'todo',
      drop_id: 'drop-456',
    } as any;

    const archivedNote: Note = {
      ...unsortedNote,
      archived: true,
      why_string: 'Created via Mind Drop → [todo:todo-789]',
    };

    mockRepo.getById.mockResolvedValue(unsortedNote);
    mockRepo.create.mockResolvedValue(createdTodo);
    mockRepo.update.mockResolvedValue(archivedNote);

    const result = await convertUnsortedToTodo(mockRepo, 'note-123');

    expect(result.todo).toEqual(createdTodo);
    expect(result.updatedNote).toEqual(archivedNote);
    expect(mockRepo.getById).toHaveBeenCalledWith('note-123');
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'todo',
        name: 'Buy groceries for the week',
        canonicalType: 'todo',
        labels: ['todo'],
      }),
    );
    expect(mockRepo.update).toHaveBeenCalledWith({
      id: 'note-123',
      patch: {
        archived: true,
        why_string: expect.stringContaining('origin:todo-789'),
      },
    });
  });

  it('should derive todo name from first line of body text', async () => {
    const unsortedNote: Note = {
      id: 'note-123',
      type: 'note',
      title: 'Multi-line note',
      body: 'Buy milk\nBuy eggs\nBuy bread',
      subtype: 'catchall',
      labels: ['catchall'],
      origin: 'catchall',
      ai_placed: true,
      why_string: 'Created via Mind Drop',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
    } as any;

    const createdTodo: Todo = {
      id: 'todo-789',
      type: 'todo',
      name: 'Buy milk',
      body: 'Buy milk\nBuy eggs\nBuy bread',
      due_date: null,
      undefined_due: true,
      labels: ['todo'],
      origin: 'catchall',
      canonicalType: 'todo',
    } as any;

    mockRepo.getById.mockResolvedValue(unsortedNote);
    mockRepo.create.mockResolvedValue(createdTodo);
    mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true });

    await convertUnsortedToTodo(mockRepo, 'note-123');

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Buy milk',
      }),
    );
  });

  it('should remove catchall and needs_review labels, add todo label', async () => {
    const unsortedNote: Note = {
      id: 'note-123',
      type: 'note',
      title: 'Task',
      body: 'Do something',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review', 'important'],
      origin: 'catchall',
      ai_placed: true,
      why_string: 'Created via Mind Drop',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
    } as any;

    const createdTodo: Todo = {
      id: 'todo-789',
      type: 'todo',
      name: 'Do something',
      labels: ['important', 'todo'],
      canonicalType: 'todo',
    } as any;

    mockRepo.getById.mockResolvedValue(unsortedNote);
    mockRepo.create.mockResolvedValue(createdTodo);
    mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true });

    await convertUnsortedToTodo(mockRepo, 'note-123');

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: expect.arrayContaining(['todo', 'important']),
      }),
    );
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: expect.not.arrayContaining(['catchall', 'needs_review']),
      }),
    );
  });

  it('should use specified due date if provided', async () => {
    const unsortedNote: Note = {
      id: 'note-123',
      type: 'note',
      title: 'Task with due date',
      body: 'Complete report',
      subtype: 'catchall',
      labels: ['catchall'],
      origin: 'catchall',
      ai_placed: true,
      why_string: 'Created via Mind Drop',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
    } as any;

    const createdTodo: Todo = {
      id: 'todo-789',
      type: 'todo',
      name: 'Complete report',
      due_date: '2024-01-15T12:00:00Z',
      undefined_due: false,
      labels: ['todo'],
      canonicalType: 'todo',
    } as any;

    mockRepo.getById.mockResolvedValue(unsortedNote);
    mockRepo.create.mockResolvedValue(createdTodo);
    mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true });

    await convertUnsortedToTodo(mockRepo, 'note-123', {
      due: '2024-01-15T12:00:00Z',
    });

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        due_date: '2024-01-15T12:00:00Z',
        undefined_due: false,
      }),
    );
  });

  it('should throw error if note not found', async () => {
    mockRepo.getById.mockResolvedValue(null);

    await expect(convertUnsortedToTodo(mockRepo, 'note-123')).rejects.toThrow(
      'Note note-123 not found',
    );
  });

  it('should throw error if record is not a note', async () => {
    const todo: Todo = {
      id: 'todo-123',
      type: 'todo',
      name: 'Existing todo',
      labels: [],
      canonicalType: 'todo',
    } as any;

    mockRepo.getById.mockResolvedValue(todo);

    await expect(convertUnsortedToTodo(mockRepo, 'todo-123')).rejects.toThrow(
      'Note todo-123 not found',
    );
  });

  it('should preserve all metadata from note to todo', async () => {
    const unsortedNote: Note = {
      id: 'note-123',
      type: 'note',
      title: 'Task',
      body: 'Do something important',
      subtype: 'catchall',
      labels: ['catchall'],
      origin: 'catchall',
      ai_placed: true,
      why_string: 'Created via Mind Drop',
      tags: ['#work', '#urgent'],
      tags_meta: { sticky: ['#work'], tombstones: [] },
      space_id: 'space-456',
      views: { alsoShowIn: ['Hub:Catch-All'] },
      drop_id: 'drop-789',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
    } as any;

    const createdTodo: Todo = {
      id: 'todo-789',
      type: 'todo',
      name: 'Do something important',
      labels: ['todo'],
      canonicalType: 'todo',
    } as any;

    mockRepo.getById.mockResolvedValue(unsortedNote);
    mockRepo.create.mockResolvedValue(createdTodo);
    mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true });

    await convertUnsortedToTodo(mockRepo, 'note-123');

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['#work', '#urgent'],
        tags_meta: { sticky: ['#work'], tombstones: [] },
        space_id: 'space-456',
        views: { alsoShowIn: ['Hub:Catch-All'] },
        dropId: 'drop-789',
      }),
    );
  });

  it('should always archive the original unsorted note after conversion', async () => {
    const unsortedNote: Note = {
      id: 'note-123',
      type: 'note',
      title: 'Task',
      body: 'Do something',
      subtype: 'catchall',
      labels: ['catchall'],
      origin: 'catchall',
      ai_placed: true,
      why_string: 'Created via Mind Drop',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
    } as any;

    const createdTodo: Todo = {
      id: 'todo-789',
      type: 'todo',
      name: 'Do something',
      labels: ['todo'],
      canonicalType: 'todo',
    } as any;

    mockRepo.getById.mockResolvedValue(unsortedNote);
    mockRepo.create.mockResolvedValue(createdTodo);
    mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true });

    await convertUnsortedToTodo(mockRepo, 'note-123');

    expect(mockRepo.update).toHaveBeenCalledWith({
      id: 'note-123',
      patch: expect.objectContaining({
        archived: true,
      }),
    });
  });
});
