/**
 * Tests for Mind Drop Pipeline Stage A: add.to.list action
 *
 * Verifies that "add X to Y list" flows work correctly:
 * - Appends to existing lists
 * - Creates new lists if not found
 * - Handles dropId deduplication
 * - Archives unsorted notes
 */

import { MemoryRepo } from '../lib/repo/memory';
import { runMindDropStageAClassification } from '../lib/minddrop/pipelineStages';
import type { CortexResponse } from '../lib/cortex/cortexDecide';
import type { Note } from '../lib/types';

describe('Mind Drop Pipeline - add.to.list action', () => {
  let repo: MemoryRepo;

  beforeEach(() => {
    repo = new MemoryRepo();
  });

  it('should create a new list when add.to.list is used and no list exists', async () => {
    // Arrange: Unsorted note
    const unsortedNote = (await repo.create({
      type: 'note',
      title: 'add milk to shopping list',
      body: 'add milk to shopping list',
      subtype: 'catchall',
      canonicalType: 'log',
      labels: ['log'],
      views: {
        minddrop_stage: 'pending',
        ai_pending: true,
      },
    })) as Note;

    // Mock Cortex decision
    const decision: CortexResponse = {
      actions: [
        {
          type: 'add.to.list',
          payload: {
            listKey: 'shopping',
            item: 'milk',
          },
        },
      ],
      mode: 'auto',
      confidence: 0.9,
    };

    const dropId = '550e8400-e29b-41d4-a716-446655440123';

    // Act: Run Stage A
    const result = await runMindDropStageAClassification({
      repo,
      text: 'add milk to shopping list',
      cleanedText: 'add milk to shopping list',
      decision,
      dropId,
      unsortedNoteId: unsortedNote.id,
    });

    // Assert: List created
    expect(result.entities.notes.length).toBe(1);
    expect(result.entityDetails[0].kind).toBe('note');

    const createdList = (await repo.getById(result.entities.notes[0])) as Note;
    expect(createdList.title).toBe('Shopping List');
    expect(createdList.has_list).toBe(true);
    expect(createdList.list_items).toHaveLength(1);
    expect(createdList.list_items![0].text).toBe('milk');
    expect(createdList.list_items![0].checked).toBe(false);
    expect(createdList.tags).toContain('shopping');
    expect((createdList as any).drop_id).toBe(dropId);
    expect(createdList.views?.minddrop_stage).toBe('classified');

    // Assert: Unsorted note archived
    const unsorted = await repo.getById(unsortedNote.id);
    expect((unsorted as any).archived).toBe(true);
  });

  it('should append to existing list when add.to.list is used and list exists', async () => {
    // Arrange: Existing shopping list
    const existingList = (await repo.create({
      type: 'note',
      title: 'Shopping List',
      subtype: 'reference',
      canonicalType: 'log',
      labels: ['log'],
      tags: ['shopping'],
      has_list: true,
      list_items: [
        { id: '550e8400-e29b-41d4-a716-446655440001', text: 'bread', checked: false },
        { id: '550e8400-e29b-41d4-a716-446655440002', text: 'eggs', checked: false },
      ],
    })) as Note;

    // Arrange: New unsorted note
    const unsortedNote = (await repo.create({
      type: 'note',
      title: 'add milk to shopping list',
      body: 'add milk to shopping list',
      subtype: 'catchall',
      canonicalType: 'log',
      labels: ['log'],
      views: {
        minddrop_stage: 'pending',
        ai_pending: true,
      },
    })) as Note;

    // Mock Cortex decision
    const decision: CortexResponse = {
      actions: [
        {
          type: 'add.to.list',
          payload: {
            listKey: 'shopping',
            item: 'milk',
          },
        },
      ],
      mode: 'auto',
      confidence: 0.9,
    };

    const dropId = '550e8400-e29b-41d4-a716-446655440456';

    // Act: Run Stage A
    const result = await runMindDropStageAClassification({
      repo,
      text: 'add milk to shopping list',
      cleanedText: 'add milk to shopping list',
      decision,
      dropId,
      unsortedNoteId: unsortedNote.id,
    });

    // Assert: Same list returned (not new one created)
    expect(result.entities.notes.length).toBe(1);
    expect(result.entities.notes[0]).toBe(existingList.id);

    const updatedList = (await repo.getById(existingList.id)) as Note;
    expect(updatedList.list_items).toHaveLength(3);
    expect(updatedList.list_items![0].text).toBe('bread');
    expect(updatedList.list_items![1].text).toBe('eggs');
    expect(updatedList.list_items![2].text).toBe('milk');
    expect(updatedList.views?.minddrop_stage).toBe('classified');

    // Assert: Unsorted note archived
    const unsorted = await repo.getById(unsortedNote.id);
    expect((unsorted as any).archived).toBe(true);
  });

  it('should handle dropId deduplication (no duplicate lists created on retry)', async () => {
    // Arrange: Unsorted note with dropId
    const unsortedNote = (await repo.create({
      type: 'note',
      title: 'add milk to shopping list',
      body: 'add milk to shopping list',
      subtype: 'catchall',
      canonicalType: 'log',
      labels: ['log'],
      views: {
        minddrop_stage: 'pending',
        ai_pending: true,
      },
    })) as Note;

    const decision: CortexResponse = {
      actions: [
        {
          type: 'add.to.list',
          payload: {
            listKey: 'shopping',
            item: 'milk',
          },
        },
      ],
      mode: 'auto',
      confidence: 0.9,
    };

    const dropId = '550e8400-e29b-41d4-a716-446655440789';

    // Act: Run Stage A first time
    const result1 = await runMindDropStageAClassification({
      repo,
      text: 'add milk to shopping list',
      cleanedText: 'add milk to shopping list',
      decision,
      dropId,
      unsortedNoteId: unsortedNote.id,
    });

    const firstListId = result1.entities.notes[0];
    const firstList = (await repo.getById(firstListId)) as Note;
    expect(firstList.list_items).toHaveLength(1);
    expect((firstList as any).drop_id).toBe(dropId);

    // Simulate retry: Create another unsorted note (mimicking a duplicate message)
    const retryNote = (await repo.create({
      type: 'note',
      title: 'add milk to shopping list',
      body: 'add milk to shopping list',
      subtype: 'catchall',
      canonicalType: 'log',
      labels: ['log'],
      views: {
        minddrop_stage: 'pending',
        ai_pending: true,
      },
    })) as Note;

    // Act: Run Stage A again with same dropId
    const result2 = await runMindDropStageAClassification({
      repo,
      text: 'add milk to shopping list',
      cleanedText: 'add milk to shopping list',
      decision,
      dropId, // SAME dropId
      unsortedNoteId: retryNote.id,
    });

    // Assert: Same list returned (no new list created)
    expect(result2.entities.notes[0]).toBe(firstListId);
    const reusedList = (await repo.getById(firstListId)) as Note;
    expect(reusedList.list_items).toHaveLength(1); // Still only 1 item (idempotency works)
    expect(reusedList.list_items![0].text).toBe('milk');

    // Assert: Retry note archived
    const retryNoteAfter = await repo.getById(retryNote.id);
    expect((retryNoteAfter as any).archived).toBe(true);
  });

  it('should handle multiple items in one add.to.list action', async () => {
    // Arrange: Unsorted note
    const unsortedNote = (await repo.create({
      type: 'note',
      title: 'add milk, bread, eggs to shopping list',
      body: 'add milk, bread, eggs to shopping list',
      subtype: 'catchall',
      canonicalType: 'log',
      labels: ['log'],
      views: {
        minddrop_stage: 'pending',
        ai_pending: true,
      },
    })) as Note;

    const decision: CortexResponse = {
      actions: [
        {
          type: 'add.to.list',
          payload: {
            listKey: 'shopping',
            item: 'milk, bread, eggs', // Comma-separated items
          },
        },
      ],
      mode: 'auto',
      confidence: 0.9,
    };

    const dropId = '550e8400-e29b-41d4-a716-446655440999';

    // Act: Run Stage A
    const result = await runMindDropStageAClassification({
      repo,
      text: 'add milk, bread, eggs to shopping list',
      cleanedText: 'add milk, bread, eggs to shopping list',
      decision,
      dropId,
      unsortedNoteId: unsortedNote.id,
    });

    // Assert: List created with 3 items
    const createdList = (await repo.getById(result.entities.notes[0])) as Note;
    expect(createdList.list_items).toHaveLength(3);
    expect(createdList.list_items!.map((i) => i.text)).toEqual(['milk', 'bread', 'eggs']);
  });

  it('should work with different list types (reading, packing)', async () => {
    // Arrange: Unsorted note for reading list
    const unsortedNote = (await repo.create({
      type: 'note',
      title: 'add Atomic Habits to reading list',
      body: 'add Atomic Habits to reading list',
      subtype: 'catchall',
      canonicalType: 'log',
      labels: ['log'],
      views: {
        minddrop_stage: 'pending',
        ai_pending: true,
      },
    })) as Note;

    const decision: CortexResponse = {
      actions: [
        {
          type: 'add.to.list',
          payload: {
            listKey: 'reading',
            item: 'Atomic Habits',
          },
        },
      ],
      mode: 'auto',
      confidence: 0.9,
    };

    const dropId = '550e8400-e29b-41d4-a716-446655440888';

    // Act: Run Stage A
    const result = await runMindDropStageAClassification({
      repo,
      text: 'add Atomic Habits to reading list',
      cleanedText: 'add Atomic Habits to reading list',
      decision,
      dropId,
      unsortedNoteId: unsortedNote.id,
    });

    // Assert: Reading list created
    const createdList = (await repo.getById(result.entities.notes[0])) as Note;
    expect(createdList.title).toBe('Reading List');
    expect(createdList.tags).toContain('reading');
    expect(createdList.list_items![0].text).toBe('Atomic Habits');
  });
});
