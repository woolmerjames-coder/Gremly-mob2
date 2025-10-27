import type { ID, SpaceChat, SpaceChatCreateInput, SpaceChatUpdateInput } from '../types';

/**
 * Repository interface for SpaceChat operations (Phase 8+ Spaces v2)
 * Handles chat/thread management within spaces
 */
export interface ISpaceChatRepo {
  /**
   * List all chats for a given space
   * @param spaceId - The space to list chats for
   * @param opts - Options for filtering (e.g., includeArchived)
   * @returns Array of SpaceChat objects
   */
  list(spaceId: ID, opts?: { includeArchived?: boolean }): Promise<SpaceChat[]>;

  /**
   * Create a new chat in a space
   * @param spaceId - The space to create the chat in
   * @param input - Chat creation data (title)
   * @returns The newly created SpaceChat
   */
  create(spaceId: ID, input: SpaceChatCreateInput): Promise<SpaceChat>;

  /**
   * Update an existing chat
   * @param chatId - The ID of the chat to update
   * @param patch - Partial update data
   * @returns The updated SpaceChat
   */
  update(chatId: ID, patch: SpaceChatUpdateInput): Promise<SpaceChat>;

  /**
   * Soft-delete a chat by setting archived_at timestamp
   * @param chatId - The ID of the chat to archive
   */
  delete(chatId: ID): Promise<void>;
}
