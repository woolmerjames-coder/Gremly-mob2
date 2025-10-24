/**
 * Conversation Pipeline Intent Integration Tests
 * Validates conservative intent gating, per-intent cooldowns, and exploration fallback.
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

jest.mock('../../lib/cortex/context/memory', () => ({
  buildContextWindow: jest.fn((messages) => (messages || []).slice(-8)),
  buildChatContext: jest.fn(async () => ({
    messages: [],
    summary: '',
    windowSize: 0,
    summaryLength: 0,
  })),
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
const mockedIsSmalltalk = require('../../lib/cortex/smalltalk').isSmalltalk as jest.Mock;

const baseContext: CortexContext = {
  userId: 'test-user',
  spaceId: 'test-space',
  lane: 'space_chat',
  uiSurface: 'chat',
  currentTurn: 1,
  recentIntentBuffer: [],
};

const createContext = (overrides: Partial<CortexContext> = {}): CortexContext => ({
  ...baseContext,
  ...overrides,
  currentTurn: overrides.currentTurn ?? baseContext.currentTurn,
  recentIntentBuffer: overrides.recentIntentBuffer ? [...overrides.recentIntentBuffer] : [],
  intentCooldownMap: overrides.intentCooldownMap
    ? { ...overrides.intentCooldownMap }
    : overrides.intentCooldownMap,
});

describe('Conversation Pipeline - Intent Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsSmalltalk.mockImplementation(() => false);
  });

  describe('Curiosity subroutine', () => {
    let curiosityEnv: string | undefined;

    beforeEach(() => {
      curiosityEnv = process.env.EXPO_PUBLIC_CHAT_CURIOSITY_PHASE;
      process.env.EXPO_PUBLIC_CHAT_CURIOSITY_PHASE = 'on';
    });

    afterEach(() => {
      if (curiosityEnv === undefined) {
        delete process.env.EXPO_PUBLIC_CHAT_CURIOSITY_PHASE;
      } else {
        process.env.EXPO_PUBLIC_CHAT_CURIOSITY_PHASE = curiosityEnv;
      }
    });

    it('asks a contextual follow-up question before intent detection', async () => {
      const ctx = createContext();
      const input: DecideInput = { text: 'I want to get in shape.' };

      const result = await runConversationPipeline(input, ctx);
      const meta = (result.meta ?? {}) as Record<string, any>;

      expect(mockedCortexDecide).not.toHaveBeenCalled();
      expect(result.replyText).toBe('Nice! What kind of workouts appeal most to you?');
      expect(result.suggestions).toEqual([]);
      expect(meta.curiosityPrompted).toBe(true);
      expect(result.mode).toBe('ask');
    });

    it('skips curiosity when the user requests an explicit action', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.4,
      });

      const ctx = createContext({ currentTurn: 2 });
      const input: DecideInput = { text: 'Add a habit to stretch daily.' };

      const result = await runConversationPipeline(input, ctx);
      const meta = (result.meta ?? {}) as Record<string, any>;

      expect(mockedCortexDecide).toHaveBeenCalledTimes(1);
      expect(meta.shouldOpenOverlay).toBe(true);
      expect(meta.intentRoutedAs).toBe('command');
    });
  });

  describe('High-confidence routing', () => {
    it('captures habit intent and primes cooldown without chips', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        explanation: 'Saved',
      });

      const ctx = createContext({ currentTurn: 3 });
      const input: DecideInput = { text: 'Start running every morning' };

      const result = await runConversationPipeline(input, ctx);
      const meta = (result.meta ?? {}) as Record<string, any>;

      expect(result.mode).toBe('ask');
      expect(result.suggestions).toEqual([]);
      expect(meta.intentRoutedAs).toBe('habit');
      expect(meta.detectedIntent?.confidence).toBeGreaterThanOrEqual(0.9);
      expect(ctx.intentCooldownMap?.habit).toBe(2);
      expect(ctx.intentCooldownTurns).toBe(2);
      expect(ctx.recentIntentBuffer?.[0]?.kind).toBe('habit');
    });

    it('flags question intents with supportive reply', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.4,
      });

      const ctx = createContext();
      const input: DecideInput = { text: 'How do I focus better?' };

      const result = await runConversationPipeline(input, ctx);
      const meta = (result.meta ?? {}) as Record<string, any>;

      expect(meta.intentRoutedAs).toBe('question');
      expect(result.suggestions).toEqual([]);
      expect(result.replyText).toBe('I can help you think through that.');
    });

    it('sets overlay metadata for explicit command even during cooldown', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.4,
      });

      const ctx = createContext({ intentCooldownMap: { habit: 1 }, currentTurn: 6 });
      const input: DecideInput = { text: 'Add a habit to stretch daily' };

      const result = await runConversationPipeline(input, ctx);
      const meta = (result.meta ?? {}) as Record<string, any>;

      expect(meta.shouldOpenOverlay).toBe(true);
      expect(meta.overlayKind).toBe('habit');
      expect(meta.intentRoutedAs).toBe('command');
      expect(result.replyText).toBe('Opening...');
      expect(result.suggestions).toEqual([]);
      expect(ctx.intentCooldownMap?.habit).toBe(2);
    });
  });

  describe('Cooldown enforcement', () => {
    it('suppresses creation when intent is cooling down', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.6,
      });

      const ctx = createContext({ intentCooldownMap: { todo: 1 }, currentTurn: 4 });
      const input: DecideInput = { text: 'Finish the report by Friday' };

      const result = await runConversationPipeline(input, ctx);
      const meta = (result.meta ?? {}) as Record<string, any>;

      expect(meta.intentCoolingDown).toBe('todo');
      expect(result.replyText).toContain("Let's keep exploring");
      expect(result.suggestions).toEqual([]);
    });

    it('decrements cooldown map when no new intent fires', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.2,
      });

      const ctx = createContext({ intentCooldownMap: { note: 1 }, currentTurn: 2 });
      const input: DecideInput = { text: 'Just checking in' };

      await runConversationPipeline(input, ctx);

      expect(ctx.intentCooldownMap?.note).toBeUndefined();
      expect(ctx.intentCooldownTurns).toBe(0);
    });
  });

  describe('Fallback behavior', () => {
    it('returns exploration fallback when no clear intent', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        suggestions: [],
        explanation: '',
        confidence: 0,
      });

      const ctx = createContext();
      const input: DecideInput = { text: 'Maybe later' };

      const result = await runConversationPipeline(input, ctx);
      const meta = (result.meta ?? {}) as Record<string, any>;

      expect(result.replyText).toBe("Let's explore that a bit more.");
      expect(meta.intentRoutedAs).toBe('exploration');
      expect(meta.fallback).toBe('exploration');
      expect(result.suggestions).toEqual([]);
    });

    it('suppresses follow-up smalltalk acknowledgments', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        explanation: '',
        confidence: 0,
      });

      mockedIsSmalltalk.mockReturnValueOnce(true);

      const ctx = createContext({ recentAssistantKind: 'smalltalk' });
      const input: DecideInput = { text: 'ok' };

      const result = await runConversationPipeline(input, ctx);
      const meta = (result.meta ?? {}) as Record<string, any>;

      expect(result.mode).toBe('keep');
      expect(result.replyText).toBeUndefined();
      expect(result.suggestions).toEqual([]);
      expect(meta.suppressedSmalltalk).toBe(true);
    });
  });
});
