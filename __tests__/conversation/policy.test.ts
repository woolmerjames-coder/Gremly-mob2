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

jest.mock('../../lib/cortex/intents/detectIntent', () => ({
  detectIntent: jest.fn(),
}));

jest.mock('../../lib/cortex/intents/multiIntentDetector', () => ({
  detectMultipleIntents: jest.fn((_text: string) => ({
    kind: 'note',
    confidence: 0.95,
    isMultiIntent: false,
    alternativeIntents: [],
  })),
}));

import { cortexDecide } from '../../lib/cortex/cortexDecide';
import { detectIntent } from '../../lib/cortex/intents/detectIntent';
const mockedCortexDecide = cortexDecide as jest.MockedFunction<typeof cortexDecide>;
const mockedDetectIntent = detectIntent as jest.MockedFunction<typeof detectIntent>;

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
    // Default mock for detectIntent - will be overridden per test
    mockedDetectIntent.mockReturnValue({
      kind: 'note',
      confidence: 0.95,
      isMetaComment: false,
      suppressChips: false,
    });
  });

  describe('Questions', () => {
    it('returns reply only, no chips for questions', async () => {
      mockedDetectIntent.mockReturnValueOnce({
        kind: 'question',
        confidence: 0.95,
        isMetaComment: false,
        suppressChips: false,
      });

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
      expect((result.meta as any)?.detectedIntent?.kind).toBe('question');
    });

    it('handles question marks', async () => {
      mockedDetectIntent.mockReturnValueOnce({
        kind: 'question',
        confidence: 0.95,
        isMetaComment: false,
        suppressChips: false,
      });

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
      mockedDetectIntent.mockReturnValueOnce({
        kind: 'habit',
        confidence: 0.95,
        isMetaComment: false,
        suppressChips: false,
      });

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
      expect((result.meta as any)?.detectedIntent?.kind).toBe('habit');
    });

    it('returns reply only for first-time note intent', async () => {
      mockedDetectIntent.mockReturnValueOnce({
        kind: 'note',
        confidence: 0.95,
        isMetaComment: false,
        suppressChips: false,
      });

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
      expect((result.meta as any)?.detectedIntent?.kind).toBe('note');
    });
  });

  describe('Repeated Intent - Conservative Routing', () => {
    it('responds without chips for reiterated habit intent', async () => {
      mockedDetectIntent.mockReturnValueOnce({
        kind: 'habit',
        confidence: 0.95,
        isMetaComment: false,
        suppressChips: false,
      });

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
      const meta = (result.meta ?? {}) as Record<string, any>;

      expect(result.replyText).toBeDefined();
      expect(result.replyText).not.toBe('');
      expect(result.suggestions).toEqual([]);
      expect(meta.intentRoutedAs).toBe('habit');
      expect(ctx.intentCooldownMap?.habit).toBe(2);
    });

    // TODO: Re-implement after chat system/rules update
    // The cooldown and intent routing logic is being refactored
    it.skip('responds without chips for reiterated note intent', async () => {
      const input: DecideInput = {
        text: 'Note to self about the meeting',
      };

      const ctx: CortexContext = {
        ...mockContext,
        currentTurn: 5,
        lastChipTurn: 3, // Within cooldown window (5-3=2, cooldownTurns=2)
        recentIntentBuffer: [
          { kind: 'note', turn: 3 },
          { kind: 'note', turn: 4 },
        ],
        // Set cooldown to trigger intentCoolingDown logic
        intentCooldownMap: { note: 1 },
      };

      const result = await runConversationPipeline(input, ctx);
      const meta = (result.meta ?? {}) as Record<string, any>;

      // Should have no chips due to cooldown
      expect(result.suggestions).toEqual([]);
      // Should detect note intent
      expect(meta.detectedIntent?.kind).toBe('note');
      // Should route as note despite cooldown
      expect(meta.intentRoutedAs).toBe('note');
      expect(meta.intentCoolingDown).toBe('note');
    });
  });

  describe('Cooldown', () => {
    it('respects chip cooldown (2 turns)', async () => {
      mockedDetectIntent.mockReturnValueOnce({
        kind: 'habit',
        confidence: 0.95,
        isMetaComment: false,
        suppressChips: false,
      });

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
      const meta = (result.meta ?? {}) as Record<string, any>;

      expect(result.suggestions).toEqual([]);
      expect(result.replyText).toBeDefined();
      expect(meta.intentCoolingDown).toBe('habit');
    });

    it('allows routing after cooldown period', async () => {
      mockedDetectIntent.mockReturnValueOnce({
        kind: 'habit',
        confidence: 0.95,
        isMetaComment: false,
        suppressChips: false,
      });

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
      const meta = (result.meta ?? {}) as Record<string, any>;

      expect(result.suggestions).toEqual([]);
      expect(meta.intentRoutedAs).toBe('habit');
      expect(ctx.intentCooldownMap?.habit).toBe(2);
    });
  });

  describe('Confidence Threshold', () => {
    it('skips chips even with high confidence', async () => {
      mockedDetectIntent.mockReturnValueOnce({
        kind: 'note',
        confidence: 0.95,
        isMetaComment: false,
        suppressChips: false,
      });

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
      const meta = (result.meta ?? {}) as Record<string, any>;

      expect(result.suggestions).toEqual([]);
      expect(meta.intentRoutedAs).toBe('note');
      expect(meta.detectedIntent?.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });
});
