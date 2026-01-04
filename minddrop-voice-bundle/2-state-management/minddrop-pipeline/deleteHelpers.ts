/**
 * Phase 1A: Mind Drop Delete Helpers
 *
 * Provides helper functions for deleting Mind Drop items by drop_id.
 * This fixes the "zombie unsorted" problem where an unsorted note reappears
 * after a converted todo/habit is deleted.
 */

import type { IRepo } from '../repo/IRepo';

/**
 * Delete (soft archive) all entities with the given drop_id.
 *
 * This function archives:
 * - All todos with this drop_id
 * - All habits with this drop_id
 * - All notes (including unsorted) with this drop_id
 *
 * Entities are soft-deleted by setting:
 * - For todos: status='archived', archived_reason='user_deleted_drop'
 * - For habits: archived=true, archived_reason='user_deleted_drop'
 * - For notes: archived=true, archived_reason='user_deleted_drop'
 *
 * This operation is idempotent - calling it multiple times is safe.
 *
 * @param repo - The repository instance to use for deletion
 * @param dropId - The drop_id to search for and archive
 * @returns Promise that resolves when all items are archived
 *
 * @example
 * ```typescript
 * // Delete all items from a Mind Drop
 * await deleteByDropId(repo, 'drop_123');
 * ```
 */
export async function deleteByDropId(repo: IRepo, dropId: string): Promise<void> {
  if (!dropId) {
    throw new Error('[deleteByDropId] dropId is required');
  }

  // Use the repo's archiveItemsByDropId method which handles all entity types
  await repo.archiveItemsByDropId(dropId, 'user_deleted_drop');
}

/**
 * Delete a single entity by ID, or if it has a drop_id, delete all entities
 * with that drop_id.
 *
 * This is a convenience wrapper that:
 * 1. Checks if the entity has a drop_id
 * 2. If yes, uses deleteByDropId to archive all related entities
 * 3. If no, falls back to single entity deletion
 *
 * @param repo - The repository instance
 * @param entityId - The ID of the entity to delete
 * @param entityType - The type of entity ('todo', 'habit', 'note', 'log')
 * @param dropId - Optional drop_id if already known (avoids fetch)
 * @returns Promise that resolves when deletion is complete
 *
 * @example
 * ```typescript
 * // Delete by entity, will auto-detect drop_id
 * await deleteEntityOrDrop(repo, 'todo_123', 'todo');
 *
 * // Delete with known drop_id (more efficient)
 * await deleteEntityOrDrop(repo, 'todo_123', 'todo', 'drop_456');
 * ```
 */
export async function deleteEntityOrDrop(
  repo: IRepo,
  entityId: string,
  entityType: 'todo' | 'habit' | 'note' | 'log',
  dropId?: string | null,
): Promise<void> {
  if (!entityId) {
    throw new Error('[deleteEntityOrDrop] entityId is required');
  }

  // If drop_id is provided and not null, use it
  if (dropId) {
    await deleteByDropId(repo, dropId);
    return;
  }

  // Otherwise, try to fetch the entity to check for drop_id
  try {
    const entity = await repo.getById(entityId);

    // If entity has drop_id, delete all items with that drop_id
    if (entity?.drop_id) {
      await deleteByDropId(repo, entity.drop_id);
    } else {
      // No drop_id: fallback to single-item delete
      await repo.remove(entityId);
    }
  } catch (error) {
    // If fetch fails, fallback to single-item delete
    console.error(
      '[deleteEntityOrDrop] Failed to fetch entity, falling back to single delete:',
      error,
    );
    await repo.remove(entityId);
  }
}
