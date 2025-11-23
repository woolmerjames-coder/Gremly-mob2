/**
 * Tests for saveToUnsortedTray views.ai_pending flag
 *
 * Verifies that Mind Drop unsorted notes are created with views.ai_pending: true
 * to mark them for background AI enrichment.
 */

import { saveToUnsortedTray } from '../app/screens/CatchAllNotepad';
import type { IRepo } from '../lib/repo/IRepo';

// Constants from CatchAllNotepad.tsx
const CATCHALL_LABEL = 'catchall';
const UNSORTED_LABEL = 'needs_review';

describe('saveToUnsortedTray - views.ai_pending flag', () => {
  it('should set views.ai_pending: true on unsorted notes', async () => {
    let capturedInput: any = null;

    // Mock repo with addUnsorted that captures the input
    const mockRepo = {
      addUnsorted: jest.fn(async (_userId: any, input: any) => {
        capturedInput = input;
        return {
          id: 'note-123',
          ...input,
          owner_id: 'user-456',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }),
      create: jest.fn(),
    } as unknown as IRepo;

    await saveToUnsortedTray(mockRepo, 'Test note', { dropId: 'drop-123' });

    // Verify addUnsorted was called
    expect(mockRepo.addUnsorted).toHaveBeenCalledTimes(1);

    // Verify the captured input has views.ai_pending: true
    expect(capturedInput).toBeDefined();
    expect(capturedInput.views).toEqual({ ai_pending: true });

    // Verify other expected fields remain unchanged
    expect(capturedInput.subtype).toBe('catchall');
    expect(capturedInput.labels).toEqual([CATCHALL_LABEL, UNSORTED_LABEL]);
    expect(capturedInput.type).toBe('note');
    expect(capturedInput.dropId).toBe('drop-123');
  });

  it('should set views.ai_pending: true even without dropId', async () => {
    let capturedInput: any = null;

    const mockRepo = {
      addUnsorted: jest.fn(async (_userId: any, input: any) => {
        capturedInput = input;
        return {
          id: 'note-456',
          ...input,
          owner_id: 'user-789',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }),
      create: jest.fn(),
    } as unknown as IRepo;

    await saveToUnsortedTray(mockRepo, 'Another test note', {});

    expect(mockRepo.addUnsorted).toHaveBeenCalledTimes(1);
    expect(capturedInput.views).toEqual({ ai_pending: true });
    expect(capturedInput.subtype).toBe('catchall');
    expect(capturedInput.labels).toEqual([CATCHALL_LABEL, UNSORTED_LABEL]);
  });

  it('should preserve views.ai_pending when creating fallback via repo.create', async () => {
    let capturedInput: any = null;

    // Mock repo without addUnsorted, triggering create fallback
    const mockRepo = {
      create: jest.fn(async (input: any) => {
        capturedInput = input;
        return {
          id: 'note-789',
          ...input,
          owner_id: 'user-012',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }),
    } as unknown as IRepo;

    await saveToUnsortedTray(mockRepo, 'Fallback test note', { dropId: 'drop-456' });

    // Verify create was called as fallback
    expect(mockRepo.create).toHaveBeenCalledTimes(1);

    // Verify views.ai_pending is still set in fallback path
    expect(capturedInput).toBeDefined();
    expect(capturedInput.views).toEqual({ ai_pending: true });
    expect(capturedInput.subtype).toBe('catchall');
    expect(capturedInput.labels).toEqual([CATCHALL_LABEL, UNSORTED_LABEL]);
    expect(capturedInput.dropId).toBe('drop-456');
  });

  it('should set views.ai_pending: true with custom tags', async () => {
    let capturedInput: any = null;

    const mockRepo = {
      addUnsorted: jest.fn(async (_userId: any, input: any) => {
        capturedInput = input;
        return {
          id: 'note-234',
          ...input,
          owner_id: 'user-567',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }),
      create: jest.fn(),
    } as unknown as IRepo;

    // Pass custom tags via options
    await saveToUnsortedTray(mockRepo, 'Book doctor appointment tomorrow', {
      tags: ['doctor', 'appointment'],
    });

    expect(mockRepo.addUnsorted).toHaveBeenCalledTimes(1);
    expect(capturedInput.views).toEqual({ ai_pending: true });
    expect(capturedInput.tags).toBeDefined();
    expect(capturedInput.tags).toEqual(['#doctor', '#appointment']);
  });
});
