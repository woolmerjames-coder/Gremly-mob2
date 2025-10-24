/**
 * Tests for conversation pipeline small-talk fallback
 */

// Mock env before importing modules
jest.mock('../../lib/env', () => ({
  env: {
    cortex: {
      timeoutMs: 2500,
      classifyCatchAll: true,
      optimistic: true,
      model: 'gpt-4o-mini',
      url: 'https://test.example.com', // Required for FEATURE_CHAT
    },
  },
}));

// Mock cortexDecide to return controlled responses (must be before importing the pipeline)
jest.mock('../../lib/cortex/cortexDecide', () => ({
  cortexDecide: jest.fn(),
}));
import { cortexDecide } from '../../lib/cortex/cortexDecide';
const mockCortexDecide = cortexDecide as jest.MockedFunction<typeof cortexDecide>;

import { runConversationPipeline } from '../../lib/cortex/pipelines/conversation';
import type { DecideInput, CortexContext } from '../../lib/cortex/cortexDecide';

describe('Conversation Pipeline - Small-talk', () => {
  const mockCtx: CortexContext = {
    userId: 'test-user',
    uiSurface: 'chat',
    lane: 'space_chat',
    activeSpaceId: 'space-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return small-talk reply when no suggestions and empty explanation', async () => {
    // Mock cortexDecide to return empty response
    mockCortexDecide.mockResolvedValue({
      actions: [],
      suggestions: [],
      explanation: '',
      mode: 'keep',
    });

    const input: DecideInput = { text: 'just chatting here' };
    const result = await runConversationPipeline(input, mockCtx);
    const meta = (result.meta ?? {}) as Record<string, any>;

    expect(result.mode).toBe('ask');
    expect(result.replyText).toBe("Let's explore that a bit more.");
    expect(result.actions).toEqual([]);
    expect(result.suggestions).toEqual([]);
    expect((result.meta as any)?.lane).toBe('space_chat');
    expect(meta.intentRoutedAs).toBe('exploration');
    expect(meta.fallback).toBe('exploration');
  });

  it('should not trigger small-talk if last assistant was small-talk and user acks', async () => {
    // Mock cortexDecide to return empty response
    mockCortexDecide.mockResolvedValue({
      actions: [],
      suggestions: [],
      explanation: '',
      mode: 'keep',
    });

    const ctxWithSmalltalk: CortexContext = {
      ...mockCtx,
      recentAssistantKind: 'smalltalk',
    };

    const input: DecideInput = { text: 'ok' };
    const result = await runConversationPipeline(input, ctxWithSmalltalk);

    expect(result.mode).toBe('keep');
    expect(result.replyText).toBeUndefined();
  });

  it('should not trigger small-talk if user sends acknowledgment', async () => {
    // Mock cortexDecide to return empty response
    mockCortexDecide.mockResolvedValue({
      actions: [],
      suggestions: [],
      explanation: '',
      mode: 'keep',
    });

    const input: DecideInput = { text: 'thanks' };
    const result = await runConversationPipeline(input, mockCtx);

    expect(result.mode).toBe('ask');
    expect(result.replyText).toBe("Let's explore that a bit more.");
  });

  it('should not trigger small-talk if explanation exists', async () => {
    // Mock cortexDecide to return response with explanation
    mockCortexDecide.mockResolvedValue({
      actions: [],
      suggestions: [],
      explanation: 'I can help with that!',
      mode: 'ask',
    });

    const input: DecideInput = { text: 'random text' };
    const result = await runConversationPipeline(input, mockCtx);

    expect(result.mode).toBe('ask'); // Original mode preserved
    expect(result.replyText).toBeUndefined();
    expect(result.explanation).toBe('I can help with that!');
  });

  it('clears cortex suggestions for chat lane', async () => {
    mockCortexDecide.mockResolvedValue({
      actions: [],
      suggestions: ['Create a todo', 'Make a note'],
      explanation: '',
      mode: 'ask',
    });

    const input: DecideInput = { text: 'random text' };
    const result = await runConversationPipeline(input, mockCtx);

    expect(result.mode).toBe('ask');
    expect(result.replyText).toBe("Let's explore that a bit more.");
    expect(result.suggestions).toEqual([]);
  });

  it('should ensure lane remains space_chat in greeting response', async () => {
    // Mock cortexDecide to return empty response
    mockCortexDecide.mockResolvedValue({
      actions: [],
      suggestions: [],
      explanation: '',
      mode: 'keep',
    });

    const input: DecideInput = { text: 'hello there' };
    const result = await runConversationPipeline(input, mockCtx);

    expect((result.meta as any)?.lane).toBe('space_chat');
    expect(result.meta?.kind).toBe('greeting'); // Phase 10.10: Greetings now have their own kind
  });

  it('should suppress catch-all copy in explanations and trigger small-talk', async () => {
    // Mock cortexDecide to return response with catch-all copy
    mockCortexDecide.mockResolvedValue({
      actions: [],
      suggestions: [],
      explanation: 'Saving to Catch-All Notepad for later review',
      mode: 'auto',
    });

    const input: DecideInput = { text: 'some text' };
    const result = await runConversationPipeline(input, mockCtx);
    const meta = (result.meta ?? {}) as Record<string, any>;

    expect(result.explanation).toBe('');
    expect(result.mode).toBe('ask');
    expect(result.replyText).toBe("Let's explore that a bit more.");
    expect(meta.fallback).toBe('exploration');
  });
});
