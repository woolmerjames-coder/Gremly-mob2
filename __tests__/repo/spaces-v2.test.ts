/**
 * Unit tests for Spaces v2 repository methods (Phase 8+)
 */

import { MemoryRepo } from '../../lib/repo/memory';
import type { Space } from '../../lib/types';

describe('Spaces v2 - Space Repository Methods', () => {
  let repo: MemoryRepo;
  const userId = 'test-user-spaces-v2';

  beforeEach(() => {
    repo = new MemoryRepo(userId);
  });

  describe('getSpaceById', () => {
    it('should return space with all Phase 8 fields', async () => {
      const created = await repo.createSpace({
        name: 'My Space',
        icon: '🚀',
        theme: 'mint',
      });

      const fetched = await repo.getSpaceById(created.id);

      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.name).toBe('My Space');
      expect(fetched?.icon).toBe('🚀');
      expect(fetched?.theme).toBe('mint');
    });

    it('should return null for non-existent space', async () => {
      const fetched = await repo.getSpaceById('non-existent-id');
      expect(fetched).toBeNull();
    });
  });

  describe('updateSpace', () => {
    it('should update Phase 8 fields', async () => {
      const created = await repo.createSpace({
        name: 'Original Name',
        icon: '⭐️',
        theme: 'mint',
      });

      const updated = await repo.updateSpace(created.id, {
        name: 'Updated Name',
        icon: '🎯',
        theme: 'periwinkle',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.icon).toBe('🎯');
      expect(updated.theme).toBe('periwinkle');
    });

    it('should update summary_cached field', async () => {
      const created = await repo.createSpace({
        name: 'Work Space',
      });

      // Update summary fields (simulating AI update)
      const updated = await repo.updateSpace(created.id, {
        summary_cached: 'This space contains work-related items',
        summary_updated_at: new Date().toISOString(),
      });

      expect(updated.summary_cached).toBe('This space contains work-related items');
      expect(updated.summary_updated_at).toBeDefined();
    });

    it('should update layout_state_json field', async () => {
      const created = await repo.createSpace({
        name: 'Layout Test',
      });

      const layoutState = {
        collapsedSections: ['habits', 'notes'],
        sortOrder: 'alphabetical',
      };

      const updated = await repo.updateSpace(created.id, {
        layout_state_json: layoutState,
      });

      expect(updated.layout_state_json).toEqual(layoutState);
    });

    it('should set archived_at timestamp', async () => {
      const created = await repo.createSpace({
        name: 'To Archive',
      });

      const archivedAt = new Date().toISOString();
      const updated = await repo.updateSpace(created.id, {
        archived_at: archivedAt,
      });

      expect(updated.archived_at).toBe(archivedAt);
    });
  });

  describe('getSpaceSummary', () => {
    it('should return cached summary', async () => {
      const created = await repo.createSpace({
        name: 'Test Space',
      });

      // Set a summary
      await repo.updateSpace(created.id, {
        summary_cached: 'A test space with various items',
      });

      const summary = await repo.getSpaceSummary(created.id);
      expect(summary).toBe('A test space with various items');
    });

    it('should return null if no summary cached', async () => {
      const created = await repo.createSpace({
        name: 'No Summary Space',
      });

      const summary = await repo.getSpaceSummary(created.id);
      expect(summary).toBeNull();
    });

    it('should return null for non-existent space', async () => {
      const summary = await repo.getSpaceSummary('non-existent-id');
      expect(summary).toBeNull();
    });
  });

  describe('archived spaces', () => {
    it('should still retrieve archived space by ID', async () => {
      const created = await repo.createSpace({
        name: 'Archived Space',
      });

      // Archive the space
      await repo.updateSpace(created.id, {
        archived_at: new Date().toISOString(),
      });

      const fetched = await repo.getSpaceById(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.archived_at).toBeDefined();
    });
  });
});
