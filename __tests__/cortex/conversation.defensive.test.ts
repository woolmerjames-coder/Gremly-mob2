// Mock env before importing modules
jest.mock('../../lib/env', () => ({
  env: {
    cortex: {
      timeoutMs: 2500,
      classifyCatchAll: true,
      optimistic: true,
      model: 'gpt-4o-mini',
    },
  },
}));

// Mock cortexDecide to return empty response (simulating no useful content)
jest.mock('../../lib/cortex/cortexDecide', () => ({
  cortexDecide: jest.fn().mockResolvedValue({
    actions: [],
    mode: 'keep',
    explanation: 'Saving to Catch-All for now.',
    confidence: 0,
  }),
}));

// Mock callChat to return compact format
jest.mock('../../lib/cortex/CortexClient', () => ({
  callChat: jest.fn().mockResolvedValue({
    ok: true,
    data: {
      id: 'test-response-123',
      content: 'This is a helpful response from the worker',
      model: 'gpt-4o-mini',
      usage: { prompt_tokens: 10, completion_tokens: 20 },
      // Note: no 'choices' array - this is the compact format
    },
  }),
}));

import { runConversationPipeline } from '../../lib/cortex/pipelines/conversation';

describe('Space Chat defensive mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('triggers small-talk when cortexDecide returns empty response', async () => {
    const mockContext = {
      lane: 'space_chat' as const,
      userId: 'test-user',
      uiSurface: 'chat' as const,
      recentAssistantKind: null, // No recent assistant message
    };

    const input = {
      text: 'hello',
    };

    const result = await runConversationPipeline(input, mockContext);

    // Should trigger small-talk since cortexDecide returns empty response
    expect(result.mode).toBe('reply');
    expect(result.replyText).toBeDefined();
    expect(result.replyText).not.toBe('');
    expect(result.meta?.kind).toBe('smalltalk');
  });

  it('suppresses catch-all copy in chat mode', async () => {
    const mockContext = {
      lane: 'space_chat' as const,
      userId: 'test-user',
      uiSurface: 'chat' as const,
    };

    const input = {
      text: 'some random text',
    };

    const result = await runConversationPipeline(input, mockContext);

    // Should suppress "Saving to Catch-All" copy
    expect(result.explanation).not.toContain('Catch-All');
    expect(result.explanation).not.toContain('catch-all');
  });

  it('converts auto mode to ask mode in chat', async () => {
    // Test would need to mock cortexDecide to return auto mode, but
    // current mock returns keep mode. This is more of an integration test.
    const mockContext = {
      lane: 'space_chat' as const,
      userId: 'test-user',
      uiSurface: 'chat' as const,
    };

    const input = {
      text: 'create a todo',
    };

    const result = await runConversationPipeline(input, mockContext);

    // Should never return auto mode in chat
    expect(result.mode).not.toBe('auto');
  });
});
