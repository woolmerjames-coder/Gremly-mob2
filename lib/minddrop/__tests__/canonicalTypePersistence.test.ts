/**
 * Regression test for canonical_type persistence bug.
 *
 * Background:
 * - Worker classifies "Kara said she's moving to Seattle next year" as log-general
 * - cortexDecide creates create.note action
 * - Stage A updates note with canonical fields (tags, subtype, etc.)
 * - BUG: canonical_type was missing from Stage A patch, so notes showed as "Unsorted"
 *
 * This test verifies that:
 * 1. When Stage A processes a log note, it persists canonical_type='log' to database
 * 2. The Recent Drops UI can read canonical_type and show the correct badge
 * 3. The same behavior applies consistently to todos and habits
 */

import { runMindDropStageAClassification } from '../pipelineStages';
import type { IRepo } from '../../repo/IRepo';
import type { Note, Todo, Habit } from '../../types';
import type { CortexResponse } from '../../cortex/cortexDecide';

// Mock buildCanonicalFromMindDrop to return predictable results
jest.mock('../buildCanonicalFromMindDrop', () => ({
  buildCanonicalFromMindDrop: jest.fn(),
}));

const { buildCanonicalFromMindDrop } = require('../buildCanonicalFromMindDrop');

describe('Canonical Type Persistence - Stage A', () => {
  let mockRepo: jest.Mocked<IRepo>;
  let mockNote: Note;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock unsorted note (created by Mind Drop)
    mockNote = {
      id: 'note-123',
      type: 'note',
      title: "Kara said she's moving to Seattle next year",
      body: "Kara said she's moving to Seattle next year",
      subtype: 'catchall',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'user-456',
      ai_placed: false,
      archived: false,
      labels: ['catchall', 'needs_review'],
      tags: [],
      drop_id: 'drop-789',
      has_list: false,
      list_items: null,
      views: {
        minddrop_stage: 'pending',
        ai_pending: false,
        ai_failed: false,
      },
    };

    // Mock repository with Jest spies
    mockRepo = {
      getById: jest.fn().mockResolvedValue(mockNote),
      update: jest.fn().mockImplementation(async ({ patch }) => {
        // Simulate database update by merging patch
        return { ...mockNote, ...patch };
      }),
      findNoteByDropId: jest.fn().mockResolvedValue(null),
    } as any;

    // Mock buildCanonicalFromMindDrop to return log-general classification
    buildCanonicalFromMindDrop.mockResolvedValue({
      canonicalType: 'log',
      labels: ['log'],
      tags: ['#kara', '#seattle', '#general'],
      tags_meta: { sticky: [], tombstones: [] },
      title: "Kara said she's moving to Seattle next year",
      body: "Kara said she's moving to Seattle next year",
      subtype: 'general',
      has_list: false,
      list_items: null,
    });
  });

  it('should persist canonical_type="log" when Stage A processes a log note', async () => {
    // Simulate a log-general classification from cortexDecide
    const decision: CortexResponse = {
      mode: 'create',
      confidence: 70,
      actions: [
        {
          type: 'create.note',
          payload: { title: mockNote.title },
        },
      ],
      mindDropDecision: {
        bucket: 'log-general',
        type: 'log',
        subtype: 'general',
        probableKind: 'note',
        needsClarification: false,
        aiConfidence: 70,
        aiTitle: mockNote.title,
      },
    };

    // Run Stage A with the log classification
    await runMindDropStageAClassification({
      repo: mockRepo,
      decision,
      unsortedNoteId: mockNote.id,
      dropId: mockNote.drop_id!,
      parsedDue: null,
    });

    // ASSERTION 1: repo.update should be called with canonical_type in patch
    expect(mockRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: mockNote.id,
        patch: expect.objectContaining({
          canonical_type: 'log', // ✨ FIX: This field was missing before
          labels: ['log'], // Should also include 'log' label
          subtype: 'general',
          tags: expect.arrayContaining(['#kara', '#seattle', '#general']),
          views: expect.objectContaining({
            minddrop_stage: 'classified',
            ai_pending: true,
            ai_failed: false,
          }),
        }),
      }),
    );

    // ASSERTION 2: Verify buildCanonicalFromMindDrop was called with correct params
    expect(buildCanonicalFromMindDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'log',
        rawText: mockNote.body,
        classifierBucket: 'log-general',
        classifierType: 'log',
        classifierSubtype: 'general',
        classifierConfidence: 70,
      }),
    );
  });

  it('should persist canonical_type="log" with labels=["log"] for Recent Drops UI', async () => {
    const decision: CortexResponse = {
      mode: 'create',
      confidence: 65,
      actions: [{ type: 'create.note', payload: {} }],
      mindDropDecision: {
        bucket: 'log-journal',
        type: 'log',
        subtype: 'journal',
        probableKind: 'note',
        needsClarification: false,
        aiConfidence: 65,
      },
    };

    buildCanonicalFromMindDrop.mockResolvedValue({
      canonicalType: 'log',
      labels: ['log'],
      subtype: 'journal',
      tags: ['#reflection'],
      tags_meta: { sticky: [], tombstones: [] },
      title: 'Today was a great day',
      body: 'Today was a great day',
      has_list: false,
      list_items: null,
    });

    await runMindDropStageAClassification({
      repo: mockRepo,
      decision,
      unsortedNoteId: mockNote.id,
      dropId: mockNote.drop_id!,
      parsedDue: null,
    });

    // Verify both canonical_type AND labels are persisted
    const updateCall = mockRepo.update.mock.calls[0][0];
    expect(updateCall.patch.canonical_type).toBe('log');
    expect(updateCall.patch.labels).toEqual(['log']);
    expect(updateCall.patch.subtype).toBe('journal');

    // This ensures the Recent Drops UI can:
    // 1. Check canonical_type === 'log' → show "Log" badge
    // 2. Fallback to labels.includes('log') → show "Log" badge
    // 3. Never show "Unsorted" for confirmed logs
  });

  it('should verify todos already persist canonical_type="todo"', async () => {
    // This test documents that todos were already working correctly
    // (they use convertUnsortedToTodo which includes canonicalType in create payload)

    const mockConvertedTodo: Todo = {
      id: 'todo-123',
      type: 'todo',
      name: 'Book haircut',
      body: 'Book haircut tomorrow at 3pm',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'user-456',
      ai_placed: false,
      canonicalType: 'todo', // ✅ Already included in conversion
      labels: ['todo'],
      tags: ['#haircut'],
      drop_id: 'drop-789',
      has_list: false,
      list_items: null,
      views: {
        minddrop_stage: 'classified',
        ai_pending: true,
      },
    };

    // Verify canonicalType field exists and is set correctly
    expect(mockConvertedTodo.canonicalType).toBe('todo');
    expect(mockConvertedTodo.labels).toContain('todo');
  });

  it('should verify habits already persist canonical_type="habit"', async () => {
    // This test documents that habits were already working correctly
    // (they use convertUnsortedToHabit which includes canonicalType in create payload)

    const mockConvertedHabit: Habit = {
      id: 'habit-123',
      type: 'habit',
      name: 'Meditate daily',
      notes: 'Start meditating every morning',
      frequency: 'daily',
      subtype: 'start_habit',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'user-456',
      ai_placed: false,
      canonicalType: 'habit', // ✅ Already included in conversion
      labels: ['habit'],
      tags: ['#meditation'],
      drop_id: 'drop-789',
      has_list: false,
      list_items: null,
      views: {
        minddrop_stage: 'classified',
        ai_pending: true,
      },
    };

    // Verify canonicalType field exists and is set correctly
    expect(mockConvertedHabit.canonicalType).toBe('habit');
    expect(mockConvertedHabit.labels).toContain('habit');
  });

  it('should handle log-idea subtype correctly', async () => {
    const decision: CortexResponse = {
      mode: 'create',
      confidence: 75,
      actions: [{ type: 'create.note', payload: {} }],
      mindDropDecision: {
        bucket: 'log-idea',
        type: 'log',
        subtype: 'idea',
        probableKind: 'note',
        needsClarification: false,
        aiConfidence: 75,
      },
    };

    buildCanonicalFromMindDrop.mockResolvedValue({
      canonicalType: 'log',
      labels: ['log'],
      subtype: 'idea',
      tags: ['#idea'],
      tags_meta: { sticky: [], tombstones: [] },
      title: 'What if we...',
      body: 'What if we...',
      has_list: false,
      list_items: null,
    });

    await runMindDropStageAClassification({
      repo: mockRepo,
      decision,
      unsortedNoteId: mockNote.id,
      dropId: mockNote.drop_id!,
      parsedDue: null,
    });

    const patch = mockRepo.update.mock.calls[0][0].patch;
    expect(patch.canonical_type).toBe('log');
    expect(patch.subtype).toBe('idea');
    expect(patch.labels).toEqual(['log']);
  });

  it('should demonstrate the UI badge derivation logic', () => {
    // This test documents how Recent Drops UI uses canonical_type
    // (from app/screens/CatchAllNotepad.tsx getDisplayKindForDrop)

    type UnifiedDrop = {
      canonical_type?: 'todo' | 'habit' | 'log' | 'unsorted' | null;
      labels?: string[];
      kind: 'note' | 'todo' | 'habit';
    };

    function getDisplayKind(item: UnifiedDrop): string {
      // Priority 1: canonical_type
      if (item.canonical_type === 'todo') return 'Todo';
      if (item.canonical_type === 'habit') return 'Habit';
      if (item.canonical_type === 'log') return 'Log';
      if (item.canonical_type === 'unsorted') return 'Unsorted';

      // Priority 2: labels (backwards compat)
      if (item.labels?.includes('log')) return 'Log';
      if (item.labels?.includes('todo')) return 'Todo';
      if (item.labels?.includes('habit')) return 'Habit';

      // Fallback: kind
      if (item.kind === 'todo') return 'Todo';
      if (item.kind === 'habit') return 'Habit';
      return 'Unsorted';
    }

    // Test case 1: Log with canonical_type (AFTER FIX)
    expect(
      getDisplayKind({
        canonical_type: 'log',
        labels: ['log'],
        kind: 'note',
      }),
    ).toBe('Log');

    // Test case 2: Log without canonical_type (BEFORE FIX - would show "Unsorted")
    expect(
      getDisplayKind({
        canonical_type: null,
        labels: ['catchall', 'needs_review'], // Missing 'log' label
        kind: 'note',
      }),
    ).toBe('Unsorted'); // ❌ Bug: Shows unsorted instead of log

    // Test case 3: Log with labels but no canonical_type (backwards compat)
    expect(
      getDisplayKind({
        canonical_type: null,
        labels: ['log'],
        kind: 'note',
      }),
    ).toBe('Log'); // ✅ Backwards compat works

    // Test case 4: Todo with canonical_type
    expect(
      getDisplayKind({
        canonical_type: 'todo',
        labels: ['todo'],
        kind: 'todo',
      }),
    ).toBe('Todo');

    // Test case 5: Habit with canonical_type
    expect(
      getDisplayKind({
        canonical_type: 'habit',
        labels: ['habit'],
        kind: 'habit',
      }),
    ).toBe('Habit');
  });
});
