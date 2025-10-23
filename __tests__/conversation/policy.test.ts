/**
 * Phase 10.7B: Answer-First Policy Tests
 * Tests for questions → no chips, reiteration → chips, cooldown
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
  pickSmalltalk: jest.fn(() => 'Interesting!'),
  isAcknowledgment: jest.fn(() => false),
}));

import { cortexDecide } from '../../lib/cortex/cortexDecide';
const mockedCortexDecide = cortexDecide as jest.MockedFunction<typeof cortexDecide>;

describe('Answer-First Policy', () => {
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
    mockedCortexDecide.mockResolvedValue({
      mode: 'keep',
      actions: [],
      confidence: 0.5,
    });
  });

  describe('Questions', () => {
    it('returns reply only, no chips for questions', async () => {
      const input: DecideInput = {
        text: 'What is the best time to exercise?',
      };

      const result = await runConversationPipeline(input, mockContext);

      // Should have reply
      expect(result.replyText).toBeDefined();
      expect(result.replyText).not.toBe('');

      // Should NOT have chips
      expect(result.suggestions).toEqual([]);

      // Should detect question intent
      expect(result.meta?.detectedIntent?.kind).toBe('question');
    });

    it('handles question marks', async () => {
      const input: DecideInput = {
        text: 'Should I start running?',
      };

      const result = await runConversationPipeline(input, mockContext);

      expect(result.suggestions).toEqual([]);
      expect(result.replyText).toBeTruthy();
    });
  });

  describe('Non-Questions - First Time', () => {
    it('returns reply only (no chip) for first-time habit intent', async () => {
      const input: DecideInput = {
        text: 'I want to run every morning',
      };

      const ctx: CortexContext = {
        ...mockContext,
        currentTurn: 1,
        recentIntentBuffer: [], // No prior intents
      };

      const result = await runConversationPipeline(input, ctx);

      // Should have reply
      expect(result.replyText).toBeDefined();

      // Should NOT show chip (first time, no reiteration)
      expect(result.suggestions).toEqual([]);

      // Should detect habit
      expect(result.meta?.detectedIntent?.kind).toBe('habit');
    });

    it('returns reply only for first-time note intent', async () => {
      const input: DecideInput = {
        text: 'Remember to cancel gym',
      };

      const ctx: CortexContext = {
        ...mockContext,
        currentTurn: 1,
        recentIntentBuffer: [],
      };

      const result = await runConversationPipeline(input, ctx);

      expect(result.replyText).toBeDefined();
      expect(result.suggestions).toEqual([]);
      expect(result.meta?.detectedIntent?.kind).toBe('note');
    });
  });

  describe('Repeated Intent - Shows Chip', () => {
    it('shows chip for reiterated habit intent', async () => {
      const input: DecideInput = {
        text: 'I want to meditate daily',
      };

      const ctx: CortexContext = {
        ...mockContext,
        currentTurn: 3,
        lastChipTurn: 0, // Last chip was at turn 0, cooldown passed
        recentIntentBuffer: [
          { kind: 'habit', turn: 1 }, // Previous habit intent at turn 1
        ],
      };

      const result = await runConversationPipeline(input, ctx);

      // Should have reply with subtle nudge
      expect(result.replyText).toBeDefined();
      expect(result.replyText).toContain('save this if you like');

      // Should show ONE chip
      expect(result.suggestions?.length).toBe(1);
      expect(result.suggestions?.[0]).toBe('Add as habit');

      // Should mark that chip was shown
      expect(result.meta?.showedChip).toBe(true);
    });

    it('shows chip for reiterated note intent', async () => {
      const input: DecideInput = {
        text: 'Remember: buy milk',
      };

      const ctx: CortexContext = {
        ...mockContext,
        currentTurn: 5,
        lastChipTurn: 2,
        recentIntentBuffer: [
          { kind: 'note', turn: 3 },
          { kind: 'note', turn: 4 },
        ],
      };

      const result = await runConversationPipeline(input, ctx);

      expect(result.suggestions?.length).toBe(1);
      expect(result.suggestions?.[0]).toBe('Add as note');
      expect(result.meta?.showedChip).toBe(true);
    });
  });

  describe('Cooldown', () => {
    it('respects chip cooldown (2 turns)', async () => {
      const input: DecideInput = {
        text: 'Run every day',
      };

      const ctx: CortexContext = {
        ...mockContext,
        currentTurn: 3,
        lastChipTurn: 2, // Only 1 turn ago, within cooldown
        recentIntentBuffer: [{ kind: 'habit', turn: 1 }],
      };

      const result = await runConversationPipeline(input, ctx);

      // Should NOT show chip due to cooldown
      expect(result.suggestions).toEqual([]);

      // But should still have reply
      expect(result.replyText).toBeDefined();
    });

    it('allows chip after cooldown period', async () => {
      const input: DecideInput = {
        text: 'Meditate daily',
      };

      const ctx: CortexContext = {
        ...mockContext,
        currentTurn: 10,
        lastChipTurn: 7, // 3 turns ago, cooldown passed (≥2)
        recentIntentBuffer: [{ kind: 'habit', turn: 8 }],
      };

      const result = await runConversationPipeline(input, ctx);

      // Cooldown passed, should show chip
      expect(result.suggestions?.length).toBe(1);
    });
  });

  describe('Confidence Threshold', () => {
    it('requires ≥0.8 confidence for chips', async () => {
      // detectIntent returns 0.8 for notes, which meets threshold
      const input: DecideInput = {
        text: 'Remember something',
      };

      const ctx: CortexContext = {
        ...mockContext,
        currentTurn: 5,
        lastChipTurn: 2,
        recentIntentBuffer: [{ kind: 'note', turn: 3 }],
      };

      const result = await runConversationPipeline(input, ctx);

      // Should meet 0.8 threshold
      expect(result.meta?.detectedIntent?.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });
});
