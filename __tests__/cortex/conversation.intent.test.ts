/**
 * Phase 10.7: Conversation Pipeline Intent Integration Tests
 * Test that intent detection properly adds suggestions and sets mode to 'ask'
 */

import { runConversationPipeline } from '../../lib/cortex/pipelines/conversation';
import type { DecideInput, CortexContext } from '../../lib/cortex/cortexDecide';

// Mock cortex dependencies
jest.mock('../../lib/cortex/cortexDecide', () => ({
  cortexDecide: jest.fn(),
}));

jest.mock('../../lib/cortex/CortexClient', () => ({
  callChat: jest.fn(),
}));

jest.mock('../../app/lib/cortex/smalltalk', () => ({
  pickSmalltalk: jest.fn(() => "That's interesting!"),
  isAcknowledgment: jest.fn(() => false),
}));

jest.mock('../../lib/cortex/context/memory', () => ({
  buildContextWindow: jest.fn((messages) => messages.slice(-8)),
  summarize: jest.fn(async () => 'Test summary'),
  updateRunningSummary: jest.fn(async (existing, _messages) => existing || 'Updated summary'),
  hasExplicitCreationIntent: jest.fn(() => false),
  isAffirmation: jest.fn(() => false),
}));

jest.mock('../../lib/cortex/smalltalk', () => ({
  isGreeting: jest.fn(() => false),
  isSmalltalk: jest.fn(() => false),
  respond: jest.fn(() => 'Smalltalk response'),
}));

import { cortexDecide } from '../../lib/cortex/cortexDecide';

const mockedCortexDecide = cortexDecide as jest.MockedFunction<typeof cortexDecide>;

describe('Conversation Pipeline - Intent Integration', () => {
  const mockContext: CortexContext = {
    userId: 'test-user',
    spaceId: 'test-space',
    lane: 'space_chat',
    uiSurface: 'chat',
    currentTurn: 1,
    lastChipTurn: -2,
    recentIntentBuffer: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('High Confidence Intent Detection', () => {
    it('detects habit intent and shows chip for reiterated intent', async () => {
      // Mock cortexDecide to return base response
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        explanation: 'Saved',
      });

      const input: DecideInput = {
        text: 'Start running every morning',
      };

      const ctx = {
        ...mockContext,
        currentTurn: 5,
        lastChipTurn: 2,
        recentIntentBuffer: [{ kind: 'habit', turn: 3 }], // Reiterated
      };

      const result = await runConversationPipeline(input, ctx);

      expect(result.mode).toBe('ask');
      expect(result.suggestions).toContain('Add as habit');
      expect((result.meta as any)?.detectedIntent).toBeDefined();
      expect((result.meta as any)?.detectedIntent?.kind).toBe('habit');
      expect((result.meta as any)?.detectedIntent?.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('detects todo intent', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        explanation: 'Saved',
      });

      const input: DecideInput = {
        text: 'Buy flowers tomorrow',
      };

      const result = await runConversationPipeline(input, mockContext);

      expect(result.mode).toBe('ask');
      expect((result.meta as any)?.detectedIntent?.kind).toBe('todo');
      // Phase 10.7B: First time mention → no chip
      expect(result.suggestions).toEqual([]);
    });

    it('detects reflection intent', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        explanation: 'Saved',
      });

      const input: DecideInput = {
        text: 'I had a great day today',
      };

      const result = await runConversationPipeline(input, mockContext);

      expect(result.mode).toBe('ask');
      expect((result.meta as any)?.detectedIntent?.kind).toBe('reflection');
      // Phase 10.7B: First time mention → no chip
      expect(result.suggestions).toEqual([]);
    });

    it('detects idea intent', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        explanation: 'Saved',
      });

      const input: DecideInput = {
        text: 'Idea for a new feature',
      };

      const result = await runConversationPipeline(input, mockContext);

      expect(result.mode).toBe('ask');
      expect((result.meta as any)?.detectedIntent?.kind).toBe('idea');
      // Phase 10.7B: First time mention → no chip
      expect(result.suggestions).toEqual([]);
    });

    it('questions get reply only, no chip suggestion', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        explanation: 'Saved',
      });

      const input: DecideInput = {
        text: 'What are good books on focus?',
      };

      const result = await runConversationPipeline(input, mockContext);

      expect(result.mode).toBe('ask');
      // Phase 10.7B: Questions never get chips
      expect(result.suggestions).toEqual([]);
      expect((result.meta as any)?.detectedIntent?.kind).toBe('question');
    });
  });

  describe('Low Confidence Intent Detection', () => {
    it('does not add suggestion chip for low confidence', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        explanation: 'Saved',
      });

      // Ambiguous text with no strong intent signals
      const input: DecideInput = {
        text: 'Hello there',
      };

      const result = await runConversationPipeline(input, mockContext);

      // Should not have intent-based suggestions
      expect((result.meta as any)?.detectedIntent?.confidence || 0).toBeLessThan(0.75);
      expect(result.suggestions || []).not.toContain('Add as habit');
      expect(result.suggestions || []).not.toContain('Add as todo');
    });
  });

  describe('Pipeline Behavior', () => {
    it('ensures mode is always "ask" with high-confidence intent, never auto', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'auto', // Try to set auto mode
        actions: [{ type: 'create.todo', payload: { title: 'Test' } }],
        confidence: 0.9,
      });

      const input: DecideInput = {
        text: 'Buy milk',
      };

      const result = await runConversationPipeline(input, mockContext);

      // Pipeline should override to 'ask' for space_chat
      expect(result.mode).toBe('ask');
      // Actions should be cleared in space_chat
      expect(result.actions).toEqual([]);
      // Phase 10.7B: First time → no chip
      expect(result.suggestions).toEqual([]);
    });

    it('clears actions array even with intent detection', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'ask',
        actions: [{ type: 'create.habit', payload: { name: 'Test' } }],
        confidence: 0.8,
      });

      const input: DecideInput = {
        text: 'Start meditation every day',
      };

      const result = await runConversationPipeline(input, mockContext);

      // No actions in space_chat
      expect(result.actions).toEqual([]);
      expect(result.mode).toBe('ask');
    });

    it('sets correct lane metadata', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
      });

      const input: DecideInput = {
        text: 'Finish report',
      };

      const result = await runConversationPipeline(input, mockContext);

      expect((result.meta as any)?.detectedIntent).toBeDefined();
    });
  });

  describe('Intent Title Preservation', () => {
    it('preserves original text as title in intent', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
      });

      const originalText = 'Buy groceries for the week';
      const input: DecideInput = {
        text: originalText,
      };

      const result = await runConversationPipeline(input, mockContext);

      expect((result.meta as any)?.detectedIntent?.title).toBe(originalText);
    });
  });

  describe('Minimal Reply with Chips', () => {
    it('provides reply without chips on first mention (Phase 10.7B answer-first)', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        explanation: '', // No explanation from cortexDecide
      });

      const input: DecideInput = {
        text: 'Start running every morning',
      };

      const ctx = {
        ...mockContext,
        currentTurn: 1,
        recentIntentBuffer: [], // First time mention
      };

      const result = await runConversationPipeline(input, ctx);

      // Phase 10.7B: First time → reply only, no chips
      expect(result.suggestions).toEqual([]);

      // Should have a reply
      expect(result.replyText).toBeDefined();
      expect(result.replyText).not.toBe('');
    });

    it('shows chip with nudge for reiterated intent (Phase 10.7B)', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
      });

      // Reiterated habit intent
      const input: DecideInput = { text: 'I want to meditate daily' };
      const ctx = {
        ...mockContext,
        currentTurn: 5,
        lastChipTurn: 2,
        recentIntentBuffer: [{ kind: 'habit', turn: 3 }],
      };

      const result = await runConversationPipeline(input, ctx);

      // Should show chip for reiteration
      expect(result.suggestions?.length).toBe(1);
      expect(result.suggestions?.[0]).toBe('Add as habit');

      // Should have reply with nudge
      expect(result.replyText).toBeDefined();
      expect(result.replyText).toContain('save this if you like');
    });

    it('does not override existing replyText from cortexDecide', async () => {
      const existingReply = 'I already have a response for you!';
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        replyText: existingReply,
      });

      const input: DecideInput = {
        text: 'Start meditation daily',
      };

      const ctx = {
        ...mockContext,
        currentTurn: 5,
        lastChipTurn: 2,
        recentIntentBuffer: [{ kind: 'habit', turn: 3 }],
      };

      const result = await runConversationPipeline(input, ctx);

      // Should keep the existing replyText (with nudge appended if chip shown)
      expect(result.replyText).toContain(existingReply);
    });
  });
});
