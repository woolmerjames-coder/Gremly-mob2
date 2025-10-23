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

import { cortexDecide } from '../../lib/cortex/cortexDecide';

const mockedCortexDecide = cortexDecide as jest.MockedFunction<typeof cortexDecide>;

describe('Conversation Pipeline - Intent Integration', () => {
  const mockContext: CortexContext = {
    userId: 'test-user',
    spaceId: 'test-space',
    lane: 'space_chat',
    uiSurface: 'chat',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('High Confidence Intent Detection', () => {
    it('adds suggestion chip for habit intent', async () => {
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

      const result = await runConversationPipeline(input, mockContext);

      expect(result.mode).toBe('ask');
      expect(result.suggestions).toContain('Add as habit');
      expect(result.meta?.detectedIntent).toBeDefined();
      expect(result.meta?.detectedIntent?.kind).toBe('habit');
      expect(result.meta?.detectedIntent?.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('adds suggestion chip for todo intent', async () => {
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
      expect(result.suggestions).toContain('Add as todo');
      expect(result.meta?.detectedIntent?.kind).toBe('todo');
    });

    it('adds suggestion chip for reflection intent', async () => {
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
      expect(result.suggestions).toContain('Add as reflection');
      expect(result.meta?.detectedIntent?.kind).toBe('reflection');
    });

    it('adds suggestion chip for idea intent', async () => {
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
      expect(result.suggestions).toContain('Add as idea');
      expect(result.meta?.detectedIntent?.kind).toBe('idea');
    });

    it('adds "Ask this question" for question intent', async () => {
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
      expect(result.suggestions).toContain('Ask this question');
      expect(result.meta?.detectedIntent?.kind).toBe('question');
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
      expect(result.meta?.detectedIntent?.confidence || 0).toBeLessThan(0.75);
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
      // Intent suggestion should be added
      expect(result.suggestions).toContain('Add as todo');
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

      expect(result.meta?.detectedIntent).toBeDefined();
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

      expect(result.meta?.detectedIntent?.title).toBe(originalText);
    });
  });
});
