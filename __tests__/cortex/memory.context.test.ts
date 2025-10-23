/**
 * Phase 10.7E: Tests for buildChatContext
 * Ensures context building is null-safe and handles edge cases
 */

import { buildChatContext } from '../../lib/cortex/context/memory';

describe('buildChatContext', () => {
  test('returns empty on missing list()', async () => {
    const ctx = await buildChatContext({
      repo: {} as any,
      spaceId: 'test-space-id',
    });

    expect(ctx.messages).toEqual([]);
    expect(ctx.summary).toBeUndefined();
    expect(ctx.windowSize).toBe(0);
    expect(ctx.summaryLength).toBe(0);
  });

  test('returns empty on null repo', async () => {
    const ctx = await buildChatContext({
      repo: null as any,
      spaceId: 'test-space-id',
    });

    expect(ctx.messages).toEqual([]);
    expect(ctx.windowSize).toBe(0);
  });

  test('trims to maxContext and preserves chronological order', async () => {
    const repo = {
      spaceChatMessages: {
        list: async () => [
          { id: '1', role: 'user', content: 'A', created_at: '2024-01-01T00:00:00Z' },
          { id: '2', role: 'assistant', content: 'B', created_at: '2024-01-01T00:01:00Z' },
          { id: '3', role: 'user', content: 'C', created_at: '2024-01-01T00:02:00Z' },
        ],
      },
    } as any;

    const ctx = await buildChatContext({
      repo,
      spaceId: 'test-space-id',
      maxContext: 2,
    });

    expect(ctx.messages.map((m) => m.text)).toEqual(['B', 'C']); // last 2 in order
    expect(ctx.windowSize).toBe(2);
  });

  test('filters out empty content', async () => {
    const repo = {
      spaceChatMessages: {
        list: async () => [
          { id: '1', role: 'user', content: 'Valid message', created_at: '2024-01-01T00:00:00Z' },
          { id: '2', role: 'assistant', content: '', created_at: '2024-01-01T00:01:00Z' },
          { id: '3', role: 'user', content: '   ', created_at: '2024-01-01T00:02:00Z' },
          {
            id: '4',
            role: 'assistant',
            content: 'Another valid',
            created_at: '2024-01-01T00:03:00Z',
          },
        ],
      },
    } as any;

    const ctx = await buildChatContext({
      repo,
      spaceId: 'test-space-id',
    });

    expect(ctx.messages.map((m) => m.text)).toEqual(['Valid message', 'Another valid']);
    expect(ctx.windowSize).toBe(2);
  });

  test('includes running summary when provided', async () => {
    const repo = {
      spaceChatMessages: {
        list: async () => [
          { id: '1', role: 'user', content: 'Hello', created_at: '2024-01-01T00:00:00Z' },
        ],
      },
    } as any;

    const ctx = await buildChatContext({
      repo,
      spaceId: 'test-space-id',
      runningSummary: 'Previous conversation about exercise',
    });

    expect(ctx.summary).toBe('Previous conversation about exercise');
    expect(ctx.summaryLength).toBeGreaterThan(0);
  });

  test('handles repo.list returning undefined gracefully', async () => {
    const repo = {
      spaceChatMessages: {
        list: async () => undefined,
      },
    } as any;

    const ctx = await buildChatContext({
      repo,
      spaceId: 'test-space-id',
    });

    expect(ctx.messages).toEqual([]);
    expect(ctx.windowSize).toBe(0);
  });

  test('handles repo.list returning null gracefully', async () => {
    const repo = {
      spaceChatMessages: {
        list: async () => null,
      },
    } as any;

    const ctx = await buildChatContext({
      repo,
      spaceId: 'test-space-id',
    });

    expect(ctx.messages).toEqual([]);
    expect(ctx.windowSize).toBe(0);
  });

  test('handles repo.list throwing error gracefully', async () => {
    const repo = {
      spaceChatMessages: {
        list: async () => {
          throw new Error('Database connection failed');
        },
      },
    } as any;

    const ctx = await buildChatContext({
      repo,
      spaceId: 'test-space-id',
    });

    expect(ctx.messages).toEqual([]);
    expect(ctx.windowSize).toBe(0);
  });

  test('respects default maxContext from env', async () => {
    const repo = {
      spaceChatMessages: {
        list: async () =>
          Array.from({ length: 20 }, (_, i) => ({
            id: String(i),
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${i}`,
            created_at: `2024-01-01T00:${String(i).padStart(2, '0')}:00Z`,
          })),
      },
    } as any;

    const ctx = await buildChatContext({
      repo,
      spaceId: 'test-space-id',
      // No maxContext specified, should use default (8)
    });

    expect(ctx.messages.length).toBeLessThanOrEqual(8);
    expect(ctx.windowSize).toBe(ctx.messages.length);
  });

  test('treats system role as user role', async () => {
    const repo = {
      spaceChatMessages: {
        list: async () => [
          {
            id: '1',
            role: 'system',
            content: 'System message',
            created_at: '2024-01-01T00:00:00Z',
          },
          { id: '2', role: 'user', content: 'User message', created_at: '2024-01-01T00:01:00Z' },
        ],
      },
    } as any;

    const ctx = await buildChatContext({
      repo,
      spaceId: 'test-space-id',
    });

    expect(ctx.messages[0].role).toBe('user'); // system treated as user
    expect(ctx.messages[0].text).toBe('System message');
    expect(ctx.messages[1].role).toBe('user');
  });
});
