/**
 * Tests for saveToUnsortedTray views.ai_pending flag
 *
 * Verifies that Mind Drop unsorted notes are created with views.ai_pending: true
 * to mark them for background AI enrichment.
 */

import { saveToUnsortedTray } from '../app/screens/CatchAllNotepad';

// Constants from CatchAllNotepad.tsx
const CATCHALL_LABEL = 'catchall';
const UNSORTED_LABEL = 'needs_review';

describe('saveToUnsortedTray - views.ai_pending flag', () => {
  it('should set views.ai_pending: true on unsorted notes', async () => {
    let capturedInput: any = null;

    // Mock createNote function that captures the input
    const mockCreateNote = jest.fn(async (input: any) => {
      capturedInput = input;
      return {
        id: 'note-123',
        ...input,
        owner_id: 'user-456',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    await saveToUnsortedTray(mockCreateNote, 'Test note', { dropId: 'drop-123' });

    // Verify createNote was called
    expect(mockCreateNote).toHaveBeenCalledTimes(1);

    // Verify the captured input has views.ai_pending: true
    expect(capturedInput).toBeDefined();
    expect(capturedInput.views).toEqual({
      ai_pending: true,
      ai_failed: false,
      minddrop_stage: 'pending',
    });

    // Verify other expected fields remain unchanged
    expect(capturedInput.subtype).toBe('catchall');
    expect(capturedInput.labels).toEqual([CATCHALL_LABEL, UNSORTED_LABEL]);
    expect(capturedInput.type).toBe('note');
    expect(capturedInput.dropId).toBe('drop-123');
  });

  it('should set views.ai_pending: true even without dropId', async () => {
    let capturedInput: any = null;

    const mockCreateNote = jest.fn(async (input: any) => {
      capturedInput = input;
      return {
        id: 'note-456',
        ...input,
        owner_id: 'user-789',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    await saveToUnsortedTray(mockCreateNote, 'Another test note', {});

    expect(mockCreateNote).toHaveBeenCalledTimes(1);
    expect(capturedInput.views).toEqual({
      ai_pending: true,
      ai_failed: false,
      minddrop_stage: 'pending',
    });
    expect(capturedInput.subtype).toBe('catchall');
    expect(capturedInput.labels).toEqual([CATCHALL_LABEL, UNSORTED_LABEL]);
  });

  it('should return undefined when createNote throws an error', async () => {
    // Mock createNote that throws
    const mockCreateNote = jest.fn(async () => {
      throw new Error('Database error');
    });

    // Should not throw, just return undefined
    const result = await saveToUnsortedTray(mockCreateNote, 'Fallback test note', {
      dropId: 'drop-456',
    });

    expect(result).toBeUndefined();
    expect(mockCreateNote).toHaveBeenCalledTimes(1);
  });

  it('should set views.ai_pending: true with custom tags', async () => {
    let capturedInput: any = null;

    const mockCreateNote = jest.fn(async (input: any) => {
      capturedInput = input;
      return {
        id: 'note-234',
        ...input,
        owner_id: 'user-567',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    // Pass custom tags via options
    await saveToUnsortedTray(mockCreateNote, 'Book doctor appointment tomorrow', {
      tags: ['doctor', 'appointment'],
    });

    expect(mockCreateNote).toHaveBeenCalledTimes(1);
    expect(capturedInput.views).toEqual({
      ai_pending: true,
      ai_failed: false,
      minddrop_stage: 'pending',
    });
    expect(capturedInput.tags).toBeDefined();
    expect(capturedInput.tags).toEqual(['#doctor', '#appointment']);
  });
});
