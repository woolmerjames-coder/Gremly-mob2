/**
 * Unit tests for SpaceChat repository (Phase 8+ Spaces v2)
 */

import { MemorySpaceChatRepo } from '../../lib/repo/memory';
// import { SpaceChat } from '../../lib/repo/types';

describe('Spaces v2 - SpaceChat Repository', () => {
  let repo: MemorySpaceChatRepo;
  const userId = 'test-user-chats';
  const spaceId = 'space-123';

  beforeEach(() => {
    repo = new MemorySpaceChatRepo(userId);
  });

  describe('create', () => {
    it('should create a new chat with required fields', async () => {
      const chat = await repo.create(spaceId, { title: 'Project Discussion' });

      expect(chat.id).toBeDefined();
      expect(chat.user_id).toBe(userId);
      expect(chat.space_id).toBe(spaceId);
      expect(chat.title).toBe('Project Discussion');
      expect(chat.pinned).toBe(false);
      expect(chat.archived_at).toBeNull();
      expect(chat.created_at).toBeDefined();
      expect(chat.updated_at).toBeDefined();
    });

    it('should create multiple chats for same space', async () => {
      await repo.create(spaceId, { title: 'Chat 1' });
      await repo.create(spaceId, { title: 'Chat 2' });
      await repo.create(spaceId, { title: 'Chat 3' });

      const chats = await repo.list(spaceId);
      expect(chats.length).toBe(3);
    });
  });

  describe('list', () => {
    it('should list all active chats for a space', async () => {
      await repo.create(spaceId, { title: 'Chat 1' });
      await repo.create(spaceId, { title: 'Chat 2' });

      const chats = await repo.list(spaceId);
      expect(chats.length).toBe(2);
    });

    it('should exclude archived chats by default', async () => {
      const chat1 = await repo.create(spaceId, { title: 'Active Chat' });
      const chat2 = await repo.create(spaceId, { title: 'To Archive' });

      // Archive chat2
      await repo.delete(chat2.id);

      const chats = await repo.list(spaceId);
      expect(chats.length).toBe(1);
      expect(chats[0].id).toBe(chat1.id);
    });

    it('should include archived chats when requested', async () => {
      await repo.create(spaceId, { title: 'Active Chat' });
      const chat2 = await repo.create(spaceId, { title: 'Archived Chat' });

      await repo.delete(chat2.id);

      const allChats = await repo.list(spaceId, { includeArchived: true });
      expect(allChats.length).toBe(2);
    });

    it('should sort by pinned first, then updated_at desc', async () => {
      const chat1 = await repo.create(spaceId, { title: 'Oldest' });
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      const chat2 = await repo.create(spaceId, { title: 'Middle' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const chat3 = await repo.create(spaceId, { title: 'Newest' });

      // Pin the oldest chat
      await repo.update(chat1.id, { pinned: true });

      const chats = await repo.list(spaceId);

      // Pinned chat should be first
      expect(chats[0].id).toBe(chat1.id);
      expect(chats[0].pinned).toBe(true);

      // Then sorted by updated_at desc (newest first)
      expect(chats[1].id).toBe(chat3.id);
      expect(chats[2].id).toBe(chat2.id);
    });

    it('should filter by space_id', async () => {
      const space1 = 'space-1';
      const space2 = 'space-2';

      await repo.create(space1, { title: 'Space 1 Chat' });
      await repo.create(space2, { title: 'Space 2 Chat' });

      const space1Chats = await repo.list(space1);
      const space2Chats = await repo.list(space2);

      expect(space1Chats.length).toBe(1);
      expect(space2Chats.length).toBe(1);
      expect(space1Chats[0].title).toBe('Space 1 Chat');
      expect(space2Chats[0].title).toBe('Space 2 Chat');
    });
  });

  describe('update', () => {
    it('should update title', async () => {
      const chat = await repo.create(spaceId, { title: 'Original Title' });
      const originalUpdatedAt = chat.updated_at;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repo.update(chat.id, { title: 'Updated Title' });

      expect(updated.title).toBe('Updated Title');
      expect(updated.updated_at).not.toBe(originalUpdatedAt);
    });

    it('should toggle pinned status', async () => {
      const chat = await repo.create(spaceId, { title: 'Test Chat' });

      const pinned = await repo.update(chat.id, { pinned: true });
      expect(pinned.pinned).toBe(true);

      const unpinned = await repo.update(chat.id, { pinned: false });
      expect(unpinned.pinned).toBe(false);
    });

    it('should update last_message_snippet', async () => {
      const chat = await repo.create(spaceId, { title: 'Discussion' });

      const updated = await repo.update(chat.id, {
        last_message_snippet: 'This is the latest message preview',
      });

      expect(updated.last_message_snippet).toBe('This is the latest message preview');
    });

    it('should update metadata_json', async () => {
      const chat = await repo.create(spaceId, { title: 'Metadata Test' });

      const metadata = {
        messageCount: 42,
        participants: ['user1', 'user2'],
        lastReadAt: new Date().toISOString(),
      };

      const updated = await repo.update(chat.id, { metadata_json: metadata });

      expect(updated.metadata_json).toEqual(metadata);
    });

    it('should throw error for non-existent chat', async () => {
      await expect(repo.update('non-existent-id', { title: 'Test' })).rejects.toThrow(
        'Chat not found',
      );
    });
  });

  describe('delete', () => {
    it('should soft-delete by setting archived_at', async () => {
      const chat = await repo.create(spaceId, { title: 'To Delete' });

      await repo.delete(chat.id);

      const allChats = await repo.list(spaceId, { includeArchived: true });
      const archivedChat = allChats.find((c) => c.id === chat.id);

      expect(archivedChat).toBeDefined();
      expect(archivedChat?.archived_at).not.toBeNull();
    });

    it('should not appear in default list after delete', async () => {
      const chat = await repo.create(spaceId, { title: 'To Delete' });

      await repo.delete(chat.id);

      const activeChats = await repo.list(spaceId);
      expect(activeChats.length).toBe(0);
    });

    it('should throw error for non-existent chat', async () => {
      await expect(repo.delete('non-existent-id')).rejects.toThrow('Chat not found');
    });
  });

  describe('CRUD workflow', () => {
    it('should support complete create-read-update-delete cycle', async () => {
      // Create
      const created = await repo.create(spaceId, { title: 'Workflow Chat' });
      expect(created.id).toBeDefined();

      // Read
      const chats = await repo.list(spaceId);
      expect(chats.length).toBe(1);
      expect(chats[0].id).toBe(created.id);

      // Update
      const updated = await repo.update(created.id, {
        title: 'Updated Workflow Chat',
        pinned: true,
      });
      expect(updated.title).toBe('Updated Workflow Chat');
      expect(updated.pinned).toBe(true);

      // Delete (soft)
      await repo.delete(created.id);
      const activeChats = await repo.list(spaceId);
      expect(activeChats.length).toBe(0);

      const archivedChats = await repo.list(spaceId, { includeArchived: true });
      expect(archivedChats.length).toBe(1);
      expect(archivedChats[0].archived_at).not.toBeNull();
    });
  });
});
