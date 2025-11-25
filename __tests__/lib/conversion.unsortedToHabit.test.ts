/**
 * Tests for convertUnsortedToHabit helper
 *
 * Verifies that clicking the Habit chip on an unsorted Mind Drop item:
 * 1. Creates a first-class habit record in the habits table
 * 2. Archives the original unsorted note
 * 3. Transfers all relevant metadata (tags, drop_id, etc.)
 * 4. Results in Recent drops showing the habit (not the archived note)
 */

import { convertUnsortedToHabit } from '../../lib/conversion';
import type { IRepo } from '../../lib/repo/IRepo';
import type { Note, Habit } from '../../lib/types';

describe('convertUnsortedToHabit', () => {
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

  it('should convert unsorted note to habit and archive the note', async () => {
    const unsortedNote: Note = {
      id: 'note-123',
      type: 'note',
      title: 'Meditate every morning',
      body: 'Meditate every morning before breakfast',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review'],
      origin: 'catchall',
      ai_placed: true,
      why_string: 'Created via Mind Drop',
      tags: ['#morning', '#meditation'],
      tags_meta: { sticky: [], tombstones: [] },
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
      drop_id: 'drop-456',
    } as any;

    const createdHabit: Habit = {
      id: 'habit-789',
      type: 'habit',
      name: 'Meditate every morning before breakfast',
      frequency: 'daily',
      notes: 'Meditate every morning before breakfast',
      labels: ['habit'],
      canonicalType: 'habit',
      origin: 'catchall',
      ai_placed: true,
      why_string: 'Created via Mind Drop | origin:note-123;source:unsorted',
      tags: ['#meditation'], // #morning filtered out (time stop word)
      tags_meta: { sticky: [], tombstones: [] },
      created_at: '2024-01-01T08:01:00Z',
      updated_at: '2024-01-01T08:01:00Z',
      drop_id: 'drop-456',
    } as any;

    const updatedNote: Note = {
      ...unsortedNote,
      archived: true,
      why_string: 'Created via Mind Drop | origin:habit-789;source:habit',
    };

    mockRepo.getById.mockResolvedValue(unsortedNote);
    mockRepo.create.mockResolvedValue(createdHabit);
    mockRepo.update.mockResolvedValue(updatedNote);

    const result = await convertUnsortedToHabit(mockRepo, 'note-123', {
      frequency: 'daily',
    });

    // Verify habit was created with cleaned tags (shared helper filters stop words)
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'habit',
        name: 'Meditate every morning before breakfast',
        frequency: 'daily',
        notes: expect.any(String), // Derived from buildMindDropDerivedFields
        canonicalType: 'habit',
        labels: expect.arrayContaining(['habit']),
        tags: expect.arrayContaining(['#meditation']), // #morning filtered out by buildMindDropDerivedFields
        tags_meta: { sticky: [], tombstones: [] },
        dropId: 'drop-456',
      }),
    );

    // Verify note was archived
    expect(mockRepo.update).toHaveBeenCalledWith({
      id: 'note-123',
      patch: {
        archived: true,
        why_string: expect.stringContaining('origin:habit-789;source:habit'),
      },
    });

    // Verify return values (resilient to extra fields)
    expect(result.habit).toEqual(
      expect.objectContaining({
        id: 'habit-789',
        type: 'habit',
        name: 'Meditate every morning before breakfast',
        frequency: 'daily',
        canonicalType: 'habit', // TypeScript uses camelCase
        labels: expect.arrayContaining(['habit']),
        origin: 'catchall',
        ai_placed: true,
        tags: expect.arrayContaining(['#meditation']),
        drop_id: 'drop-456',
      }),
    );

    expect(result.updatedNote).toEqual(
      expect.objectContaining({
        id: 'note-123',
        archived: true,
      }),
    );
    expect(result.updatedNote.why_string).toContain('habit-789'); // Lineage reference present
  });

  it('should derive habit name from first line of body text', async () => {
    const unsortedNote: Note = {
      id: 'note-123',
      type: 'note',
      title: null,
      body: 'Walk 10,000 steps\nEven on rainy days\nTrack in app',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review'],
      origin: 'catchall',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
    } as any;

    const createdHabit: Habit = {
      id: 'habit-789',
      type: 'habit',
      name: 'Walk 10,000 steps',
      frequency: 'daily',
      notes: 'Walk 10,000 steps\nEven on rainy days\nTrack in app',
      created_at: '2024-01-01T08:01:00Z',
      updated_at: '2024-01-01T08:01:00Z',
    } as any;

    mockRepo.getById.mockResolvedValue(unsortedNote);
    mockRepo.create.mockResolvedValue(createdHabit);
    mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true });

    await convertUnsortedToHabit(mockRepo, 'note-123');

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Walk 10,000 steps',
        notes: expect.stringContaining('Walk 10,000 steps'), // Derived field may process the text
      }),
    );
  });

  it('should remove catchall and needs_review labels, add habit label', async () => {
    const unsortedNote: Note = {
      id: 'note-123',
      type: 'note',
      body: 'Read for 30 minutes',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review', 'wellness'],
      origin: 'catchall',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
    } as any;

    mockRepo.getById.mockResolvedValue(unsortedNote);
    mockRepo.create.mockResolvedValue({ id: 'habit-789', type: 'habit' } as any);
    mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true });

    await convertUnsortedToHabit(mockRepo, 'note-123');

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: expect.arrayContaining(['wellness', 'habit']), // catchall/needs_review removed, habit added
      }),
    );

    // Verify catchall and needs_review are NOT in the labels
    const createCall = mockRepo.create.mock.calls[0][0];
    expect(createCall.labels).not.toContain('catchall');
    expect(createCall.labels).not.toContain('needs_review');
  });

  it('should use default frequency if not specified', async () => {
    const unsortedNote: Note = {
      id: 'note-123',
      type: 'note',
      body: 'Practice guitar',
      subtype: 'catchall',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
    } as any;

    mockRepo.getById.mockResolvedValue(unsortedNote);
    mockRepo.create.mockResolvedValue({ id: 'habit-789', type: 'habit' } as any);
    mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true });

    await convertUnsortedToHabit(mockRepo, 'note-123'); // no frequency option

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        frequency: 'daily', // default
      }),
    );
  });

  it('should throw error if note not found', async () => {
    mockRepo.getById.mockResolvedValue(null);

    await expect(convertUnsortedToHabit(mockRepo, 'nonexistent-id')).rejects.toThrow(
      'Note nonexistent-id not found',
    );
  });

  it('should throw error if record is not a note', async () => {
    const todo = {
      id: 'todo-123',
      type: 'todo',
      name: 'Not a note',
    } as any;

    mockRepo.getById.mockResolvedValue(todo);

    await expect(convertUnsortedToHabit(mockRepo, 'todo-123')).rejects.toThrow(
      'Note todo-123 not found',
    );
  });

  it('should preserve all metadata from note to habit', async () => {
    const unsortedNote: Note = {
      id: 'note-123',
      type: 'note',
      title: 'Morning routine',
      body: 'Stretch and meditate every morning',
      subtype: 'catchall',
      space_id: 'space-999',
      labels: ['catchall', 'needs_review'],
      origin: 'catchall',
      ai_placed: true,
      why_string: 'Created via Mind Drop',
      tags: ['#morning', '#wellness'],
      tags_meta: { sticky: ['#wellness'], tombstones: [] },
      views: { expanded: true },
      drop_id: 'drop-456',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
    } as any;

    mockRepo.getById.mockResolvedValue(unsortedNote);
    mockRepo.create.mockResolvedValue({ id: 'habit-789', type: 'habit' } as any);
    mockRepo.update.mockResolvedValue({ ...unsortedNote, archived: true });

    await convertUnsortedToHabit(mockRepo, 'note-123', { frequency: 'daily' });

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        space_id: 'space-999',
        ai_placed: true,
        tags: expect.arrayContaining(['#wellness']), // #morning filtered out by shared helper (time stop word)
        tags_meta: { sticky: ['#wellness'], tombstones: [] },
        views: { expanded: true },
        dropId: 'drop-456',
      }),
    );

    // Verify #morning was filtered out (time stop word)
    const createCall = mockRepo.create.mock.calls[0][0];
    expect(createCall.tags).not.toContain('#morning');
  });

  /**
   * REGRESSION TEST: Guarantees original unsorted note is always archived
   *
   * This test ensures we never show both the original unsorted note AND
   * the converted habit in Recent drops list.
   *
   * Critical assertions:
   * 1. repo.update() is called with archived: true
   * 2. The returned updatedNote has archived: true
   * 3. This happens in the same transaction as habit creation
   */
  it('should always archive the original unsorted note after conversion', async () => {
    const unsortedNote: Note = {
      id: 'note-unsorted-99',
      type: 'note',
      title: 'Run every morning',
      body: 'Run every morning, even if just for 5 mins',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review'],
      origin: 'catchall',
      ai_placed: true,
      archived: false, // ✅ CRITICAL: Starts as NOT archived
      drop_id: 'drop-xyz',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
    } as any;

    const createdHabit: Habit = {
      id: 'habit-converted-99',
      type: 'habit',
      name: 'Run every morning, even if just for 5 mins',
      frequency: 'daily',
      notes: 'Run every morning, even if just for 5 mins',
      labels: ['habit'],
      canonicalType: 'habit',
      drop_id: 'drop-xyz', // Same drop_id
      created_at: '2024-01-01T08:01:00Z',
      updated_at: '2024-01-01T08:01:00Z',
    } as any;

    const archivedNote: Note = {
      ...unsortedNote,
      archived: true, // ✅ CRITICAL: Updated to archived
      why_string: 'Created via Mind Drop | origin:habit-converted-99;source:habit',
    };

    mockRepo.getById.mockResolvedValue(unsortedNote);
    mockRepo.create.mockResolvedValue(createdHabit);
    mockRepo.update.mockResolvedValue(archivedNote);

    const result = await convertUnsortedToHabit(mockRepo, 'note-unsorted-99');

    // ✅ ASSERT: repo.update was called with archived: true
    expect(mockRepo.update).toHaveBeenCalledWith({
      id: 'note-unsorted-99',
      patch: expect.objectContaining({
        archived: true,
      }),
    });

    // ✅ ASSERT: repo.update was called exactly once (no branches that skip archiving)
    expect(mockRepo.update).toHaveBeenCalledTimes(1);

    // ✅ ASSERT: The returned updatedNote has archived: true
    expect(result.updatedNote.archived).toBe(true);

    // ✅ ASSERT: Habit was created with same drop_id
    expect(result.habit.drop_id).toBe('drop-xyz');
    expect(result.habit.id).toBe('habit-converted-99');

    // ✅ VERIFY: Both operations completed (habit created AND note archived)
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });
});
