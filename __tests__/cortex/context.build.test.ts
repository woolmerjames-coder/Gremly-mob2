/**
 * Phase 10.7E: Context Building Tests
 * Test buildChatContext function with database integration
 */

import { buildChatContext, type ChatTurn } from '../../lib/cortex/context/memory';

describe('buildChatContext', () => {
  const mockRepo = {
    spaceChatMessages: {
      list: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds context with messages and summary when messages exist', async () => {
    // Mock 5 messages from database
    const mockMessages = [
      {
        id: '1',
        content: 'Hello, how are you?',
        role: 'user',
        created_at: '2025-10-23T10:00:00Z',
      },
      {
        id: '2',
        content: "I'm good, thanks!",
        role: 'assistant',
        created_at: '2025-10-23T10:01:00Z',
      },
      {
        id: '3',
        content: 'What can you help me with?',
        role: 'user',
        created_at: '2025-10-23T10:02:00Z',
      },
      {
        id: '4',
        content: 'I can help with todos, habits, and notes!',
        role: 'assistant',
        created_at: '2025-10-23T10:03:00Z',
      },
      {
        id: '5',
        content: 'Great, I need to remember something.',
        role: 'user',
        created_at: '2025-10-23T10:04:00Z',
      },
    ];

    mockRepo.spaceChatMessages.list.mockResolvedValue(mockMessages);

    const result = await buildChatContext({
      spaceId: 'test-space',
      repo: mockRepo,
      maxContext: 8,
      runningSummary: 'Previous summary about habits',
    });

    // Should have windowSize > 0
    expect(result.windowSize).toBeGreaterThan(0);
    expect(result.windowSize).toBe(5);

    // Should have summaryLength > 0
    expect(result.summaryLength).toBeGreaterThan(0);
    expect(result.summary).toBe('Previous summary about habits');

    // Should have messages in correct order (oldest first in context)
    expect(result.messages).toHaveLength(5);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].text).toBe('Hello, how are you?');
    expect(result.messages[4].role).toBe('user');
    expect(result.messages[4].text).toBe('Great, I need to remember something.');
  });

  it('generates summary when none exists and messages > 2', async () => {
    const mockMessages = [
      {
        id: '1',
        content: 'Tell me about habits',
        role: 'user',
        created_at: '2025-10-23T10:00:00Z',
      },
      {
        id: '2',
        content: 'Habits are routines you build over time.',
        role: 'assistant',
        created_at: '2025-10-23T10:01:00Z',
      },
      {
        id: '3',
        content: 'How do I start a habit?',
        role: 'user',
        created_at: '2025-10-23T10:02:00Z',
      },
    ];

    mockRepo.spaceChatMessages.list.mockResolvedValue(mockMessages);

    const result = await buildChatContext({
      spaceId: 'test-space',
      repo: mockRepo,
      maxContext: 8,
    });

    // Should not generate a summary (we removed auto-summarization)
    expect(result.summary).toBeUndefined();
    expect(result.windowSize).toBe(3);
  });

  it('respects max context window size', async () => {
    // Mock 10 messages
    const mockMessages = Array.from({ length: 10 }, (_, i) => ({
      id: `${i + 1}`,
      content: `Message ${i + 1}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      created_at: new Date(Date.now() + i * 1000).toISOString(),
    }));

    mockRepo.spaceChatMessages.list.mockResolvedValue(mockMessages);

    const result = await buildChatContext({
      spaceId: 'test-space',
      repo: mockRepo,
      maxContext: 5, // Only take last 5
    });

    // Should only have 5 messages
    expect(result.windowSize).toBe(5);
    expect(result.messages).toHaveLength(5);

    // Should be the last 5 messages (messages already in order from repo)
    expect(result.messages[0].text).toBe('Message 6');
    expect(result.messages[4].text).toBe('Message 10');
  });

  it('returns empty context when no repo provided', async () => {
    const result = await buildChatContext({
      spaceId: 'test-space',
      repo: null as any,
      maxContext: 8,
    });

    expect(result.windowSize).toBe(0);
    expect(result.messages).toHaveLength(0);
    expect(result.summaryLength).toBe(0);
  });

  it('returns empty context on database error', async () => {
    mockRepo.spaceChatMessages.list.mockRejectedValue(new Error('Database error'));

    const result = await buildChatContext({
      spaceId: 'test-space',
      repo: mockRepo,
      maxContext: 8,
    });

    expect(result.windowSize).toBe(0);
    expect(result.messages).toHaveLength(0);
  });

  it('uses EXPO_PUBLIC_CHAT_MAX_CONTEXT env variable as default', async () => {
    const originalEnv = process.env.EXPO_PUBLIC_CHAT_MAX_CONTEXT;
    process.env.EXPO_PUBLIC_CHAT_MAX_CONTEXT = '3';

    const mockMessages = Array.from({ length: 5 }, (_, i) => ({
      id: `${i + 1}`,
      content: `Message ${i + 1}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      created_at: new Date(Date.now() + i * 1000).toISOString(),
    }));

    mockRepo.spaceChatMessages.list.mockResolvedValue(mockMessages);

    const result = await buildChatContext({
      spaceId: 'test-space',
      repo: mockRepo,
    });

    // Should respect env variable (3 messages max)
    expect(result.windowSize).toBe(3);
    expect(result.messages).toHaveLength(3);

    // Restore
    process.env.EXPO_PUBLIC_CHAT_MAX_CONTEXT = originalEnv;
  });
});
