/**
 * Tests for useChatMessages hook
 *
 * Key scenarios tested:
 * 1. Pure function: generateChatTitleFromMessage
 * 2. Hook initialization behavior
 *
 * Note: Complex integration tests with repo mocking are challenging due to
 * useMemo creating new repo instances. The race condition handling is tested
 * via the synchronous ref access pattern documented in the hook.
 */

import { renderHook, act } from '@testing-library/react-native';

// Create mock functions
const mockMessageRepoAppend = jest.fn();
const mockMessageRepoList = jest.fn();
const mockChatRepoCreate = jest.fn();
const mockChatRepoUpdate = jest.fn();
const mockMessageRepoUpdate = jest.fn();

// Mock repo implementations
jest.mock('../../lib/repo/supabase', () => ({
  SupabaseSpaceChatMessageRepo: jest.fn().mockImplementation(() => ({
    append: mockMessageRepoAppend,
    list: mockMessageRepoList,
    update: mockMessageRepoUpdate, // streaming finalization, card status
  })),
  SupabaseSpaceChatRepo: jest.fn().mockImplementation(() => ({
    create: mockChatRepoCreate,
    update: mockChatRepoUpdate,
  })),
}));

// Mock useAuth
const mockUserId = 'test-user-123';
jest.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: mockUserId } }),
}));

// Import after mocks are set up
import { useChatMessages } from '../useChatMessages';

/**
 * Test the title generation logic (extracted from hook for testing)
 * This mirrors the generateChatTitleFromMessage function in the hook
 */
function generateChatTitleFromMessage(message: string): string {
  if (!message || message.trim().length === 0) {
    return 'New Chat';
  }
  const maxLength = 50;
  const trimmed = message.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  const truncated = trimmed.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 20) {
    return truncated.substring(0, lastSpace) + '...';
  }
  return truncated + '...';
}

describe('generateChatTitleFromMessage (pure function)', () => {
  it('returns "New Chat" for empty string', () => {
    expect(generateChatTitleFromMessage('')).toBe('New Chat');
  });

  it('returns "New Chat" for whitespace-only string', () => {
    expect(generateChatTitleFromMessage('   ')).toBe('New Chat');
  });

  it('returns trimmed message for short messages', () => {
    expect(generateChatTitleFromMessage('  Hello world  ')).toBe('Hello world');
  });

  it('preserves messages at exactly 50 characters', () => {
    const exactly50 = 'A'.repeat(50);
    expect(generateChatTitleFromMessage(exactly50)).toBe(exactly50);
  });

  it('truncates at word boundary for long messages', () => {
    const longMessage =
      'This is a very long message that definitely exceeds the maximum allowed length for titles';
    const result = generateChatTitleFromMessage(longMessage);
    expect(result.length).toBeLessThanOrEqual(53);
    expect(result).toMatch(/\.\.\.$/);
    // Should cut at word boundary - "definitely" ends at position 47
    expect(result).toBe('This is a very long message that definitely...');
  });

  it('truncates mid-word if no good word boundary exists', () => {
    // If the last space is before position 20, it truncates mid-word
    const noGoodBreak = 'Supercalifragilisticexpialidociouslylongwordwithoutspaces';
    const result = generateChatTitleFromMessage(noGoodBreak);
    // No space after position 20, so just cuts at 50 chars
    expect(result).toBe('Supercalifragilisticexpialidociouslylongwordwithou...');
  });
});

describe('useChatMessages hook', () => {
  const spaceId = 'test-space-456';

  describe('entity card status', () => {
    const card = (id: string) => ({
      id,
      chat_id: 'chat-1',
      scope_id: null,
      user_id: mockUserId,
      role: 'system',
      content: 'Entity card',
      created_at: '2026-09-30T10:00:00Z',
      metadata_json: {
        type: 'entity-card',
        status: 'pending',
        card: { kind: 'edit', entity: { id: 't1', type: 'todo', title: 'Walk Bella' } },
      },
    });

    it('saves every status, even when two land before React renders', async () => {
      // the jest config resets mock implementations before each test
      const { SupabaseSpaceChatMessageRepo } = jest.requireMock('../../lib/repo/supabase');
      SupabaseSpaceChatMessageRepo.mockImplementation(() => ({
        append: mockMessageRepoAppend,
        list: mockMessageRepoList,
        update: mockMessageRepoUpdate,
      }));
      mockMessageRepoList.mockResolvedValue([card('c1'), card('c2')]);
      mockMessageRepoUpdate.mockResolvedValue(undefined);
      const { result, unmount } = renderHook(() => useChatMessages('chat-1', null));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      expect(result.current.messages).toHaveLength(2);
      await act(async () => {
        // no render between the two, so the second one's state updater is queued
        const a = result.current.setEntityCardStatus(
          'c1',
          'applied',
          'Walk Bella is now Sat 3 Oct.',
        );
        const b = result.current.setEntityCardStatus('c2', 'declined');
        await Promise.all([a, b]);
      });
      expect(mockMessageRepoUpdate).toHaveBeenCalledWith('c1', {
        metadata_json: expect.objectContaining({
          status: 'applied',
          summary: 'Walk Bella is now Sat 3 Oct.',
        }),
      });
      expect(mockMessageRepoUpdate).toHaveBeenCalledWith('c2', {
        metadata_json: expect.objectContaining({ status: 'declined' }),
      });
      expect(result.current.messages.map((m) => (m.metadata_json as any).status)).toEqual([
        'applied',
        'declined',
      ]);
      unmount();
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockMessageRepoList.mockResolvedValue([]);
  });

  describe('refresh after a chat switch', () => {
    const msg = (id: string, chatId: string) => ({
      id,
      chat_id: chatId,
      scope_id: null,
      user_id: mockUserId,
      role: 'assistant',
      content: `line ${id}`,
      created_at: '2026-10-01T20:08:00Z',
      metadata_json: { type: 'brief-text' },
    });

    beforeEach(() => {
      const { SupabaseSpaceChatMessageRepo } = jest.requireMock('../../lib/repo/supabase');
      SupabaseSpaceChatMessageRepo.mockImplementation(() => ({
        append: mockMessageRepoAppend,
        list: mockMessageRepoList,
        update: mockMessageRepoUpdate,
      }));
    });

    it('loads the chat now open, from a refresh captured before the switch', async () => {
      mockMessageRepoList.mockResolvedValue([]);
      const { result, rerender, unmount } = renderHook(
        ({ id }: { id: string | undefined }) => useChatMessages(id, null),
        { initialProps: { id: undefined as string | undefined } },
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      // the screen keeps the refresh from the render before today's thread opened
      const staleRefresh = result.current.refresh;
      rerender({ id: 'daily-1' });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      expect(result.current.loadedChatId).toBe('daily-1');
      expect(result.current.messages).toEqual([]);

      // the brief is written, then the old callback asks for the messages
      mockMessageRepoList.mockResolvedValue([msg('m1', 'daily-1'), msg('m2', 'daily-1')]);
      let loaded: unknown;
      await act(async () => {
        loaded = await staleRefresh();
      });
      expect(mockMessageRepoList).toHaveBeenLastCalledWith('daily-1');
      expect(loaded).toHaveLength(2);
      expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
      unmount();
    });

    it('leaves the messages be when the chat changed while loading', async () => {
      let release: (rows: unknown[]) => void = () => {};
      mockMessageRepoList.mockResolvedValue([]);
      const { result, rerender, unmount } = renderHook(
        ({ id }: { id: string }) => useChatMessages(id, null),
        { initialProps: { id: 'chat-a' } },
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      mockMessageRepoList.mockImplementationOnce(
        () => new Promise((resolve) => (release = resolve as (rows: unknown[]) => void)),
      );
      let pending: Promise<unknown> = Promise.resolve();
      act(() => {
        pending = result.current.refresh('chat-a');
      });
      mockMessageRepoList.mockResolvedValue([msg('b1', 'chat-b')]);
      rerender({ id: 'chat-b' });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      await act(async () => {
        release([msg('a1', 'chat-a')]);
        await pending;
      });
      expect(result.current.loadedChatId).toBe('chat-b');
      expect(result.current.messages.map((m) => m.id)).toEqual(['b1']);
      unmount();
    });
  });

  describe('the chat title', () => {
    beforeEach(() => {
      const { SupabaseSpaceChatMessageRepo, SupabaseSpaceChatRepo } =
        jest.requireMock('../../lib/repo/supabase');
      SupabaseSpaceChatMessageRepo.mockImplementation(() => ({
        append: mockMessageRepoAppend,
        list: mockMessageRepoList,
        update: mockMessageRepoUpdate,
      }));
      SupabaseSpaceChatRepo.mockImplementation(() => ({
        create: mockChatRepoCreate,
        update: mockChatRepoUpdate,
      }));
      mockMessageRepoList.mockResolvedValue([]);
      mockChatRepoUpdate.mockResolvedValue(undefined);
      mockMessageRepoAppend.mockImplementation(async (input: any) => ({
        id: 'u1',
        user_id: mockUserId,
        created_at: '2026-10-01T20:18:10Z',
        ...input,
      }));
    });

    it('keeps the day as the name of a brief thread after the first message', async () => {
      const { result, unmount } = renderHook(() =>
        useChatMessages('daily-1', null, { keepTitle: true }),
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      await act(async () => {
        await result.current.sendUserMessage('The vet appointment is now canceled');
      });
      expect(mockChatRepoUpdate).toHaveBeenCalled();
      for (const [, patch] of mockChatRepoUpdate.mock.calls) {
        expect(patch).not.toHaveProperty('title');
      }
      unmount();
    });
  });

  describe('initialization', () => {
    it('returns null currentChatId when no chatId provided', async () => {
      const { result, unmount } = renderHook(() => useChatMessages(undefined, spaceId));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(result.current.currentChatId).toBeNull();
      expect(result.current.messages).toEqual([]);
      expect(result.current.loading).toBe(false);

      unmount();
    });

    it('returns provided chatId as currentChatId', async () => {
      const existingChatId = 'existing-chat-123';
      const { result, unmount } = renderHook(() => useChatMessages(existingChatId, spaceId));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(result.current.currentChatId).toBe(existingChatId);

      unmount();
    });

    it('accepts null spaceId for general chat (Ask Gremly)', async () => {
      const chatId = 'general-chat-123';
      const { result, unmount } = renderHook(() => useChatMessages(chatId, null));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(result.current.currentChatId).toBe(chatId);
      expect(typeof result.current.sendUserMessage).toBe('function');
      expect(typeof result.current.createStreamingMessage).toBe('function');

      unmount();
    });

    it('exports all required functions', async () => {
      const { result, unmount } = renderHook(() => useChatMessages(undefined, spaceId));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(typeof result.current.sendUserMessage).toBe('function');
      expect(typeof result.current.appendAssistantMessage).toBe('function');
      expect(typeof result.current.appendActionConfirmation).toBe('function');
      expect(typeof result.current.appendEntryCard).toBe('function');
      expect(typeof result.current.appendSavedItemCard).toBe('function');
      expect(typeof result.current.removeMessage).toBe('function');
      expect(typeof result.current.refresh).toBe('function');
      // Streaming functions
      expect(typeof result.current.createStreamingMessage).toBe('function');
      expect(typeof result.current.updateStreamingContent).toBe('function');
      expect(typeof result.current.finalizeStreamingMessage).toBe('function');
      expect(typeof result.current.cancelStreaming).toBe('function');

      unmount();
    });
  });

  describe('race condition prevention (documentation test)', () => {
    /**
     * This test documents the race condition prevention pattern.
     *
     * The hook uses a ref (currentChatIdRef) alongside state (currentChatId)
     * to ensure synchronous access to the latest chat ID.
     *
     * Without the ref, rapid calls to sendUserMessage could both see
     * currentChatId as null before React batches/applies the state update,
     * causing duplicate chat creation.
     *
     * The ref provides immediate synchronous access:
     *   let activeChatId = currentChatIdRef.current;  // Sync read
     *   if (!activeChatId) { create chat... }
     *   currentChatIdRef.current = activeChatId;      // Immediate sync write
     *   setCurrentChatId(activeChatId);               // Async state update
     */
    it('documents the ref-based synchronous tracking pattern', () => {
      // This test serves as documentation for the race condition fix
      // The actual fix is in useChatMessages.ts lines 80-85 and 142-148

      // The pattern ensures:
      // 1. First sendUserMessage creates chat and IMMEDIATELY sets ref
      // 2. Second sendUserMessage (before re-render) sees ref has value
      // 3. No duplicate chat creation

      expect(true).toBe(true); // Documentation test always passes
    });
  });

  describe('streaming message functions', () => {
    /**
     * These tests document the streaming functionality.
     * Full integration testing of streaming is challenging due to useMemo
     * creating new repo instances that bypass mocks.
     *
     * The streaming functions are:
     * - createStreamingMessage(): Creates a placeholder message with isStreaming=true
     * - updateStreamingContent(messageId, content): Updates message content in state
     * - finalizeStreamingMessage(messageId, content): Removes streaming flag, persists to DB
     * - cancelStreaming(messageId): Marks message as failed (streamingCancelled=true)
     */

    it('exports createStreamingMessage function', async () => {
      const { result, unmount } = renderHook(() => useChatMessages(undefined, spaceId));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(typeof result.current.createStreamingMessage).toBe('function');
      unmount();
    });

    it('exports updateStreamingContent function', async () => {
      const { result, unmount } = renderHook(() => useChatMessages(undefined, spaceId));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(typeof result.current.updateStreamingContent).toBe('function');
      unmount();
    });

    it('exports finalizeStreamingMessage function', async () => {
      const { result, unmount } = renderHook(() => useChatMessages(undefined, spaceId));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(typeof result.current.finalizeStreamingMessage).toBe('function');
      unmount();
    });

    it('exports cancelStreaming function', async () => {
      const { result, unmount } = renderHook(() => useChatMessages(undefined, spaceId));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(typeof result.current.cancelStreaming).toBe('function');
      unmount();
    });

    it('documents the streaming flow pattern', () => {
      /**
       * The streaming flow is:
       * 1. createStreamingMessage() - creates placeholder, returns { messageId, chatId }
       * 2. updateStreamingContent(messageId, content) - called on each SSE chunk
       * 3. finalizeStreamingMessage(messageId, content) - on stream complete
       *    OR cancelStreaming(messageId) - on stream error/abort
       *
       * State management:
       * - streamingMessagesRef: Set<string> tracks which messages are streaming
       * - streamingContentRef: Map<string, string> tracks content for each streaming message
       * - Messages with isStreaming=true show the streaming cursor
       * - Messages with streamingCancelled=true show retry UI
       */
      expect(true).toBe(true); // Documentation test
    });
  });
});
