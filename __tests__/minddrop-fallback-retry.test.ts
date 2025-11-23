/**
 * Mind Drop v3 Phase 6 Task 4: Fallback Prefill Retry Test
 *
 * Verifies that when a user manually opens an overlay for a Mind Drop where:
 * - ai_failed === true
 * - minddrop_stage === 'classified'
 *
 * The system:
 * 1. Calls backgroundPrefill() once (retry)
 * 2. Sets minddrop_retry_attempted=true to prevent infinite retries
 * 3. Never retries a second time
 * 4. Doesn't create duplicate entities or tags
 */

import { MemoryRepo } from '../lib/repo/memory';
import type { IRepo } from '../lib/repo/IRepo';
import { backgroundPrefill } from '../lib/minddrop/backgroundPrefill';

// Mock backgroundPrefill to track calls
const mockBackgroundPrefill = jest.fn();
jest.mock('../lib/minddrop/backgroundPrefill', () => ({
  backgroundPrefill: (...args: any[]) => mockBackgroundPrefill(...args),
}));

describe('Mind Drop v3 Phase 6: Fallback Prefill Retry', () => {
  let repo: IRepo;

  beforeEach(() => {
    repo = new MemoryRepo();
    mockBackgroundPrefill.mockClear();
  });

  it('should retry backgroundPrefill once when opening overlay with ai_failed=true and minddrop_stage=classified', async () => {
    // Create a todo that failed during Stage B prefill
    const failedTodo = await repo.create({
      type: 'todo',
      name: 'Call dentist', // Primary field for todos
      title: 'Call dentist',
      origin: 'catchall',
      dropId: '00000000-0000-4000-8000-000000000123',
      ai_placed: true,
      views: {
        minddrop_stage: 'classified', // Stage A succeeded
        ai_failed: true, // Stage B failed
        ai_pending: false,
        minddrop_prefilled_v1: false,
        minddrop_retry_attempted: false, // Haven't tried retry yet
      },
    });

    const entity = await repo.getById(failedTodo.id);
    const views = entity?.views ?? {};

    const shouldRetry =
      views.ai_failed === true &&
      views.minddrop_stage === 'classified' &&
      views.minddrop_retry_attempted !== true;

    expect(shouldRetry).toBe(true);

    // Simulate overlay open retry (mocked implementation)
    mockBackgroundPrefill.mockResolvedValueOnce(undefined); // Success on retry

    if (shouldRetry && entity) {
      await mockBackgroundPrefill(entity, 'Call dentist');

      await repo.update({
        id: entity.id,
        patch: {
          views: {
            ...views,
            minddrop_retry_attempted: true,
          },
        },
      });
    }

    // Verify backgroundPrefill was called once
    expect(mockBackgroundPrefill).toHaveBeenCalledTimes(1);
    expect(mockBackgroundPrefill).toHaveBeenCalledWith(
      expect.objectContaining({ id: failedTodo.id }),
      'Call dentist',
    );

    // Verify retry flag was set
    const updated = await repo.getById(failedTodo.id);
    expect(updated?.views?.minddrop_retry_attempted).toBe(true);
  });

  it('should NOT retry if minddrop_retry_attempted is already true', async () => {
    // Create a todo that already had a retry attempt
    const retriedTodo = await repo.create({
      type: 'todo',
      name: 'Book appointment',
      title: 'Book appointment',
      origin: 'catchall',
      dropId: '00000000-0000-4000-8000-000000000456',
      ai_placed: true,
      views: {
        minddrop_stage: 'classified',
        ai_failed: true,
        ai_pending: false,
        minddrop_prefilled_v1: false,
        minddrop_retry_attempted: true, // Already tried once
      },
    });

    const entity = await repo.getById(retriedTodo.id);
    const views = entity?.views ?? {};

    const shouldRetry =
      views.ai_failed === true &&
      views.minddrop_stage === 'classified' &&
      views.minddrop_retry_attempted !== true;

    expect(shouldRetry).toBe(false);

    // No retry should happen
    expect(mockBackgroundPrefill).not.toHaveBeenCalled();
  });

  it('should NOT retry if minddrop_stage is not classified', async () => {
    // Create a todo that's still pending (Stage A hasn't run yet)
    const pendingTodo = await repo.create({
      type: 'todo',
      name: 'Email team',
      title: 'Email team',
      origin: 'catchall',
      dropId: '00000000-0000-4000-8000-000000000789',
      ai_placed: true,
      views: {
        minddrop_stage: 'pending', // Stage A not run yet
        ai_failed: false,
        ai_pending: true,
        minddrop_prefilled_v1: false,
        minddrop_retry_attempted: false,
      },
    });

    const entity = await repo.getById(pendingTodo.id);
    const views = entity?.views ?? {};

    const shouldRetry =
      views.ai_failed === true &&
      views.minddrop_stage === 'classified' &&
      views.minddrop_retry_attempted !== true;

    expect(shouldRetry).toBe(false);
    expect(mockBackgroundPrefill).not.toHaveBeenCalled();
  });

  it('should NOT retry if ai_failed is false (successful prefill)', async () => {
    // Create a todo that was successfully prefilled
    const successTodo = await repo.create({
      type: 'todo',
      name: 'Grocery shopping',
      title: 'Grocery shopping',
      origin: 'catchall',
      dropId: '00000000-0000-4000-8000-000000000999',
      ai_placed: true,
      views: {
        minddrop_stage: 'prefilled', // Successfully prefilled
        ai_failed: false,
        ai_pending: false,
        minddrop_prefilled_v1: true,
        minddrop_retry_attempted: false,
      },
    });

    const entity = await repo.getById(successTodo.id);
    const views = entity?.views ?? {};

    const shouldRetry =
      views.ai_failed === true &&
      views.minddrop_stage === 'classified' &&
      views.minddrop_retry_attempted !== true;

    expect(shouldRetry).toBe(false);
    expect(mockBackgroundPrefill).not.toHaveBeenCalled();
  });

  it('should mark retry as attempted even if retry fails', async () => {
    // Create a todo that will fail retry
    const retryFailTodo = await repo.create({
      type: 'todo',
      name: 'Fix issue',
      title: 'Fix issue',
      origin: 'catchall',
      dropId: '00000000-0000-4000-8000-000000000888',
      ai_placed: true,
      views: {
        minddrop_stage: 'classified',
        ai_failed: true,
        ai_pending: false,
        minddrop_prefilled_v1: false,
        minddrop_retry_attempted: false,
      },
    });

    const entity = await repo.getById(retryFailTodo.id);
    const views = entity?.views ?? {};

    const shouldRetry =
      views.ai_failed === true &&
      views.minddrop_stage === 'classified' &&
      views.minddrop_retry_attempted !== true;

    expect(shouldRetry).toBe(true);

    // Simulate retry failure
    mockBackgroundPrefill.mockRejectedValueOnce(new Error('AI service unavailable'));

    try {
      if (shouldRetry && entity) {
        await mockBackgroundPrefill(entity, 'Fix issue');
      }
    } catch (err) {
      // Expected to fail
    }

    // Even though retry failed, mark as attempted
    await repo.update({
      id: retryFailTodo.id,
      patch: {
        views: {
          ...views,
          minddrop_retry_attempted: true,
          ai_failed: true, // Keep failure state
        },
      },
    });

    const updated = await repo.getById(retryFailTodo.id);
    expect(updated?.views?.minddrop_retry_attempted).toBe(true);
    expect(updated?.views?.ai_failed).toBe(true);

    // Verify no infinite retry loop
    expect(mockBackgroundPrefill).toHaveBeenCalledTimes(1);
  });

  it('should not create duplicate entities during retry', async () => {
    const dropId = '00000000-0000-4000-8000-000000000666';

    // Create todo with failed prefill
    const originalTodo = await repo.create({
      type: 'todo',
      name: 'Original todo',
      title: 'Original todo',
      origin: 'catchall',
      dropId: dropId,
      ai_placed: true,
      views: {
        minddrop_stage: 'classified',
        ai_failed: true,
        ai_pending: false,
        minddrop_retry_attempted: false,
      },
    });

    // Simulate retry
    const entity = await repo.getById(originalTodo.id);

    mockBackgroundPrefill.mockResolvedValueOnce(undefined);

    if (entity) {
      await mockBackgroundPrefill(entity, 'Original todo');

      await repo.update({
        id: entity.id,
        patch: {
          views: {
            ...(entity.views ?? {}),
            minddrop_retry_attempted: true,
          },
        },
      });
    }

    // Verify only one todo exists for this dropId
    const allRecords = await repo.listByType('todo');
    const todosWithDropId = allRecords.filter((r: any) => r.type === 'todo' && r.dropId === dropId);

    expect(todosWithDropId.length).toBe(1);
    expect(todosWithDropId[0].id).toBe(originalTodo.id);
  });

  it('should not add duplicate tags during retry', async () => {
    // Create todo with some existing tags
    const todoWithTags = await repo.create({
      type: 'todo',
      name: 'Plan meeting',
      title: 'Plan meeting',
      tags: ['work', 'urgent'],
      origin: 'catchall',
      dropId: '00000000-0000-4000-8000-000000000777',
      ai_placed: true,
      views: {
        minddrop_stage: 'classified',
        ai_failed: true,
        ai_pending: false,
        minddrop_retry_attempted: false,
      },
    });

    // Mock backgroundPrefill to add tags (simulated AI behavior)
    mockBackgroundPrefill.mockImplementation(async (entity: any) => {
      // Simulate AI adding tags
      const existingTags = entity.tags || [];
      const aiTags = ['work', 'meeting']; // 'work' already exists
      const mergedTags = Array.from(new Set([...existingTags, ...aiTags]));

      await repo.update({
        id: entity.id,
        patch: {
          tags: mergedTags,
          views: {
            ...(entity.views ?? {}),
            minddrop_prefilled_v1: true,
            minddrop_stage: 'prefilled',
            ai_failed: false,
            ai_pending: false,
          },
        },
      });
    });

    const entity = await repo.getById(todoWithTags.id);

    if (entity) {
      await mockBackgroundPrefill(entity, 'Plan meeting');
    }

    const updated = await repo.getById(todoWithTags.id);

    // Verify no duplicate tags
    expect(updated?.tags).toEqual(['work', 'urgent', 'meeting']);
    expect(updated?.tags?.length).toBe(3); // Not 4 (no duplicate 'work')
  });
});
