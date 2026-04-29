/**
 * Tests for SupabaseSpaceChatMessageRepo - Phase 10.5
 */

import { SupabaseSpaceChatMessageRepo } from '../../lib/repo/supabase';
import { SpaceChatMessageInsert } from '../../lib/types';

// Mock supabase client following existing patterns
jest.mock('../../lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      onAuthStateChange: jest
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));

describe('SupabaseSpaceChatMessageRepo', () => {
  let repo: SupabaseSpaceChatMessageRepo;
  let mockFrom: jest.Mock;

  beforeEach(() => {
    repo = new SupabaseSpaceChatMessageRepo('user-1');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('../../lib/supabase/client');
    mockFrom = supabase.from as jest.Mock;
    mockFrom.mockClear();
  });

  describe('list', () => {
    it('should fetch messages for a chat ordered by created_at asc', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: [
              {
                id: '1',
                chat_id: 'chat-1',
                scope_id: 'space-1',
                user_id: 'user-1',
                role: 'user',
                content: 'Hello',
                metadata_json: null,
                created_at: '2023-01-01T00:00:00Z',
              },
              {
                id: '2',
                chat_id: 'chat-1',
                scope_id: 'space-1',
                user_id: 'user-1',
                role: 'assistant',
                content: 'Hi there!',
                metadata_json: null,
                created_at: '2023-01-01T00:01:00Z',
              },
            ],
            error: null,
          }),
        }),
      });

      mockFrom.mockReturnValue({
        select: mockSelect,
      });

      const messages = await repo.list('chat-1');

      expect(mockFrom).toHaveBeenCalledWith('space_chat_messages');
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({
        id: '1',
        chat_id: 'chat-1',
        scope_id: 'space-1',
        role: 'user',
        content: 'Hello',
      });
    });

    it('should throw error when user ID not available', async () => {
      const repoWithoutUser = new SupabaseSpaceChatMessageRepo();

      await expect(repoWithoutUser.list('chat-1')).rejects.toThrow('User ID not available');
    });
  });

  describe('append', () => {
    it('should insert a new message and return it', async () => {
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: '3',
              chat_id: 'chat-1',
              scope_id: 'space-1',
              user_id: 'user-1',
              role: 'user',
              content: 'Test message',
              metadata_json: null,
              created_at: '2023-01-01T00:02:00Z',
            },
            error: null,
          }),
        }),
      });

      mockFrom.mockReturnValue({
        insert: mockInsert,
      });

      const input: SpaceChatMessageInsert = {
        chat_id: 'chat-1',
        scope_id: 'space-1',
        role: 'user',
        content: 'Test message',
      };

      const result = await repo.append(input);

      expect(mockFrom).toHaveBeenCalledWith('space_chat_messages');
      expect(result).toMatchObject({
        id: '3',
        chat_id: 'chat-1',
        scope_id: 'space-1',
        role: 'user',
        content: 'Test message',
        user_id: 'user-1',
      });
    });

    it('should include metadata when provided', async () => {
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: '4',
              chat_id: 'chat-1',
              scope_id: 'space-1',
              user_id: 'user-1',
              role: 'assistant',
              content: 'AI response',
              metadata_json: { confidence: 0.95 },
              created_at: '2023-01-01T00:03:00Z',
            },
            error: null,
          }),
        }),
      });

      mockFrom.mockReturnValue({
        insert: mockInsert,
      });

      const input: SpaceChatMessageInsert = {
        chat_id: 'chat-1',
        scope_id: 'space-1',
        role: 'assistant',
        content: 'AI response',
        metadata_json: { confidence: 0.95 },
      };

      const result = await repo.append(input);

      expect(result.metadata_json).toEqual({ confidence: 0.95 });
    });

    it('should throw error when user ID not available', async () => {
      const repoWithoutUser = new SupabaseSpaceChatMessageRepo();
      const input: SpaceChatMessageInsert = {
        chat_id: 'chat-1',
        scope_id: 'space-1',
        role: 'user',
        content: 'Test',
      };

      await expect(repoWithoutUser.append(input)).rejects.toThrow('User ID not available');
    });
  });
});
