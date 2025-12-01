/**
 * NowQuickAdd Log Shape Test
 *
 * Verifies that when NowQuickAdd pipeline classifies text as "log",
 * the resulting note has proper shape:
 * - subtype: 'journal' (not 'catchall')
 * - labels: ['log'] (not ['catchall', 'needs_review'])
 * - canonical_type: 'journal'
 *
 * This test specifically targets the fix for notes from Today screen
 * Quick Add showing up as "Unsorted" instead of proper journal entries.
 */

import { runMindDropStageAClassification } from '../lib/minddrop/pipelineStages';
import type { CortexResponse } from '../lib/cortex/cortexDecide';
import type { IRepo } from '../lib/repo/IRepo';

describe('NowQuickAdd Log Shape Classification', () => {
  // Mock repo with in-memory note storage
  const createMockRepo = () => {
    const notes: Record<string, any> = {};

    return {
      notes,
      getById: jest.fn(async (id: string) => notes[id] ?? null),
      update: jest.fn(async ({ id, patch }: { id: string; patch: any }) => {
        if (notes[id]) {
          notes[id] = { ...notes[id], ...patch };
        }
        return notes[id];
      }),
      findTodoByDropId: jest.fn(async () => null),
      findHabitByDropId: jest.fn(async () => null),
    } as unknown as IRepo & { notes: Record<string, any> };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update note shape when Cortex returns create.note action with log intent', async () => {
    // Arrange: Create an unsorted note (as saveToUnsortedTray would)
    const mockRepo = createMockRepo();
    const unsortedNoteId = 'note-123';

    // Simulate an unsorted note created by saveToUnsortedTray
    mockRepo.notes[unsortedNoteId] = {
      id: unsortedNoteId,
      type: 'note',
      title: 'Today has been a nice chill day of exercise and doing work',
      body: 'Today has been a nice chill day of exercise and doing work',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review'],
      views: {
        ai_pending: true,
        minddrop_stage: 'pending',
      },
    };

    // Mock Cortex decision: type "log" with create.note action
    const mockDecision: CortexResponse = {
      mode: 'auto',
      confidence: 0.85,
      actions: [
        {
          type: 'create.note',
          payload: {
            text: 'Today has been a nice chill day of exercise and doing work',
            subtype: 'everything_else' as any, // Raw subtype from Cortex
            spaceId: null,
          },
        },
      ],
      explanation: 'Classified as a journal entry',
      mindDropDecision: {
        probableKind: 'log',
        confidence: 0.85,
        needsClarification: false,
        logSubtype: 'journal',
      },
    };

    // Act: Run Stage A classification
    const result = await runMindDropStageAClassification({
      repo: mockRepo,
      text: 'Today has been a nice chill day of exercise and doing work',
      cleanedText: 'Today has been a nice chill day of exercise and doing work',
      decision: mockDecision,
      dropId: 'drop-abc',
      unsortedNoteId,
    });

    // Assert: Note should have proper log shape
    const updatedNote = mockRepo.notes[unsortedNoteId];

    expect(result.entities.notes).toContain(unsortedNoteId);
    expect(result.entityDetails[0]).toEqual({
      kind: 'note',
      noteSubtype: 'journal',
    });

    // Shape assertions - the core of this test
    expect(updatedNote.subtype).toBe('journal'); // NOT 'catchall'
    expect(updatedNote.labels).toContain('log');
    expect(updatedNote.labels).not.toContain('catchall');
    expect(updatedNote.labels).not.toContain('needs_review');
    expect(updatedNote.canonicalType).toBe('log'); // persistedToCanonical returns 'log' for journal/idea/list
    expect(updatedNote.ai_placed).toBe(true);

    // Stage/view assertions
    expect(updatedNote.views.minddrop_stage).toBe('classified');
    expect(updatedNote.views.ai_pending).toBe(true);
  });

  it('should use mindDropDecision.logSubtype when action.payload.subtype is undefined', async () => {
    const mockRepo = createMockRepo();
    const unsortedNoteId = 'note-456';

    mockRepo.notes[unsortedNoteId] = {
      id: unsortedNoteId,
      type: 'note',
      title: 'Had a great idea for a new app feature',
      body: 'Had a great idea for a new app feature',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review'],
      views: { ai_pending: true, minddrop_stage: 'pending' },
    };

    // Decision where payload.subtype is missing but mindDropDecision has logSubtype
    const mockDecision: CortexResponse = {
      mode: 'auto',
      confidence: 0.8,
      actions: [
        {
          type: 'create.note',
          payload: {
            text: 'Had a great idea for a new app feature',
            // No subtype in payload
            spaceId: null,
          },
        },
      ],
      explanation: 'Classified as an idea',
      mindDropDecision: {
        probableKind: 'log',
        confidence: 0.8,
        needsClarification: false,
        logSubtype: 'idea', // Should use this
      },
    };

    await runMindDropStageAClassification({
      repo: mockRepo,
      text: 'Had a great idea for a new app feature',
      cleanedText: 'Had a great idea for a new app feature',
      decision: mockDecision,
      dropId: 'drop-def',
      unsortedNoteId,
    });

    const updatedNote = mockRepo.notes[unsortedNoteId];
    expect(updatedNote.subtype).toBe('idea');
    expect(updatedNote.labels).toContain('log');
    expect(updatedNote.labels).not.toContain('catchall');
  });

  it('should map add.to.list action to list subtype', async () => {
    const mockRepo = createMockRepo();
    const unsortedNoteId = 'note-789';

    mockRepo.notes[unsortedNoteId] = {
      id: unsortedNoteId,
      type: 'note',
      title: '- milk\n- eggs\n- bread',
      body: '- milk\n- eggs\n- bread',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review'],
      views: { ai_pending: true, minddrop_stage: 'pending' },
    };

    const mockDecision: CortexResponse = {
      mode: 'auto',
      confidence: 0.9,
      actions: [
        {
          type: 'add.to.list',
          payload: {
            listKey: 'shopping',
            item: 'milk, eggs, bread',
            spaceId: null,
          },
        },
      ],
      explanation: 'Detected as a shopping list',
    };

    await runMindDropStageAClassification({
      repo: mockRepo,
      text: '- milk\n- eggs\n- bread',
      cleanedText: '- milk\n- eggs\n- bread',
      decision: mockDecision,
      dropId: 'drop-ghi',
      unsortedNoteId,
    });

    const updatedNote = mockRepo.notes[unsortedNoteId];
    expect(updatedNote.subtype).toBe('list');
    expect(updatedNote.labels).toContain('log');
    expect(updatedNote.labels).not.toContain('catchall');
  });

  it('should default to journal when subtype is everything_else', async () => {
    const mockRepo = createMockRepo();
    const unsortedNoteId = 'note-abc';

    mockRepo.notes[unsortedNoteId] = {
      id: unsortedNoteId,
      type: 'note',
      title: 'Random thought about life',
      body: 'Random thought about life',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review'],
      views: { ai_pending: true, minddrop_stage: 'pending' },
    };

    const mockDecision: CortexResponse = {
      mode: 'auto',
      confidence: 0.7,
      actions: [
        {
          type: 'create.note',
          payload: {
            text: 'Random thought about life',
            subtype: 'everything_else' as any, // Should map to 'journal'
            spaceId: null,
          },
        },
      ],
      explanation: 'General log entry',
    };

    await runMindDropStageAClassification({
      repo: mockRepo,
      text: 'Random thought about life',
      cleanedText: 'Random thought about life',
      decision: mockDecision,
      dropId: 'drop-jkl',
      unsortedNoteId,
    });

    const updatedNote = mockRepo.notes[unsortedNoteId];
    // 'everything_else' should map to 'journal' as the default log subtype
    expect(updatedNote.subtype).toBe('journal');
  });

  it('should preserve existing labels other than catchall/needs_review', async () => {
    const mockRepo = createMockRepo();
    const unsortedNoteId = 'note-preserve';

    mockRepo.notes[unsortedNoteId] = {
      id: unsortedNoteId,
      type: 'note',
      title: 'Some note with extra labels',
      body: 'Some note with extra labels',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review', 'important', 'work'],
      views: { ai_pending: true, minddrop_stage: 'pending' },
    };

    const mockDecision: CortexResponse = {
      mode: 'auto',
      confidence: 0.8,
      actions: [
        {
          type: 'create.note',
          payload: {
            text: 'Some note with extra labels',
            subtype: 'journal',
            spaceId: null,
          },
        },
      ],
      explanation: 'Journal entry',
    };

    await runMindDropStageAClassification({
      repo: mockRepo,
      text: 'Some note with extra labels',
      cleanedText: 'Some note with extra labels',
      decision: mockDecision,
      dropId: 'drop-mno',
      unsortedNoteId,
    });

    const updatedNote = mockRepo.notes[unsortedNoteId];
    expect(updatedNote.labels).toContain('log');
    expect(updatedNote.labels).toContain('important');
    expect(updatedNote.labels).toContain('work');
    expect(updatedNote.labels).not.toContain('catchall');
    expect(updatedNote.labels).not.toContain('needs_review');
  });
});
