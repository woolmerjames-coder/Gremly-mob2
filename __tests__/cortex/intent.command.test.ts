/**
 * Phase 10.10: Explicit Command Intent Tests
 * Test that explicit command verbs trigger immediate overlay opening
 */

import { detectIntent } from '../../lib/cortex/intents/detectIntent';
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

describe('Explicit Command Intent Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('detectIntent', () => {
    it('detects "set" as command', () => {
      const result = detectIntent('Set a reminder to call mom');
      expect(result.isCommand).toBe(true);
      // "reminder" triggers note pattern
      expect(result.kind).toBe('note');
    });

    it('detects "add" as command', () => {
      const result = detectIntent('Add a habit to meditate daily');
      expect(result.isCommand).toBe(true);
      expect(result.kind).toBe('habit');
    });

    it('detects "create" as command', () => {
      const result = detectIntent('Create a todo to buy groceries');
      expect(result.isCommand).toBe(true);
      expect(result.kind).toBe('todo');
    });

    it('detects "remember" as note hint (NOT command)', () => {
      const result = detectIntent('Remember to pack lunch');
      expect(result.isCommand).toBe(false); // "remember" is a hint, not explicit command
      expect(result.kind).toBe('note');
    });

    it('detects "save" as command', () => {
      const result = detectIntent('Save this idea for later');
      expect(result.isCommand).toBe(true);
      expect(result.kind).toBe('idea');
    });

    it('detects "send" as command', () => {
      const result = detectIntent('Send an email to John');
      expect(result.isCommand).toBe(true);
      expect(result.kind).toBe('todo');
    });

    it('detects "log" as command', () => {
      const result = detectIntent('Log today was amazing');
      expect(result.isCommand).toBe(true);
      // "today was" triggers reflection pattern
      expect(result.kind).toBe('reflection');
    });

    it('does not detect command for non-command verbs', () => {
      const result = detectIntent('Maybe I should run more');
      expect(result.isCommand).toBe(false);
    });

    it('detects command case-insensitively', () => {
      const result = detectIntent('ADD a habit');
      expect(result.isCommand).toBe(true);
    });

    it('requires command verb at start of text', () => {
      const result = detectIntent('I want to add a habit');
      expect(result.isCommand).toBe(false);
    });
  });

  describe('Conversation Pipeline with Commands', () => {
    const mockContext: CortexContext = {
      userId: 'test-user',
      spaceId: 'test-space',
      lane: 'space_chat',
      uiSurface: 'chat',
      currentTurn: 1,
      lastChipTurn: -2,
      recentIntentBuffer: [],
    };

    it('opens overlay immediately for explicit command', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        explanation: 'Saved',
      });

      const input: DecideInput = {
        text: 'Add a habit to exercise daily',
      };

      const result = await runConversationPipeline(input, mockContext);

      expect(result.mode).toBe('ask');
      expect(result.suggestions).toContain('Add as habit');
      expect(result.replyText).toBe('Opening...');
      expect((result.meta as any)?.shouldOpenOverlay).toBe(true);
      expect((result.meta as any)?.overlayKind).toBe('habit');
    });

    it('bypasses cooldown for explicit command', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        explanation: 'Saved',
      });

      const input: DecideInput = {
        text: 'Create a todo to buy milk',
      };

      const ctx = {
        ...mockContext,
        currentTurn: 5,
        lastChipTurn: 4, // Recent chip shown
        intentCooldownTurns: 2, // Active cooldown
      };

      const result = await runConversationPipeline(input, ctx);

      // Should still open overlay despite cooldown
      expect(result.mode).toBe('ask');
      expect(result.suggestions).toContain('Add as todo');
      expect((result.meta as any)?.shouldOpenOverlay).toBe(true);
    });

    it('bypasses curiosity phase for explicit command', async () => {
      // Set environment to enable curiosity
      const originalEnv = process.env.EXPO_PUBLIC_CHAT_CURIOSITY_PHASE;
      process.env.EXPO_PUBLIC_CHAT_CURIOSITY_PHASE = 'true';

      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        explanation: 'Saved',
      });

      const input: DecideInput = {
        text: 'Save this note about the meeting',
      };

      const result = await runConversationPipeline(input, mockContext);

      // Should NOT ask curiosity question for explicit command
      expect(result.replyText).toBe('Opening...');
      expect((result.meta as any)?.isAwaitingClarification).toBeFalsy();
      expect((result.meta as any)?.shouldOpenOverlay).toBe(true);

      // Restore environment
      process.env.EXPO_PUBLIC_CHAT_CURIOSITY_PHASE = originalEnv;
    });

    it('logs explicit intent decision', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Set both __DEV__ equivalent and debug flag
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      process.env.EXPO_PUBLIC_DEBUG_CORTEX = 'on';

      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        explanation: 'Saved',
      });

      const input: DecideInput = {
        text: 'Set a reminder to call John',
      };

      await runConversationPipeline(input, mockContext);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[CORTEX][policy] explicit_intent',
        expect.objectContaining({
          isCommand: true,
          kind: 'note',
          action: 'open_overlay',
        }),
      );

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalNodeEnv;
      delete process.env.EXPO_PUBLIC_DEBUG_CORTEX;
    });

    it('does not trigger immediate overlay for non-command high confidence', async () => {
      mockedCortexDecide.mockResolvedValue({
        mode: 'keep',
        actions: [],
        confidence: 0.5,
        explanation: 'Saved',
      });

      const input: DecideInput = {
        text: 'I want to meditate every morning', // High confidence but not a command
      };

      // First-time intent - no prior buffer
      const ctx: CortexContext = {
        ...mockContext,
        recentIntentBuffer: [],
      };

      const result = await runConversationPipeline(input, ctx);

      // Phase 10.7B: Answer-First Policy
      // First-time high confidence intent should NOT show chip (needs reiteration)
      expect(result.mode).toBe('ask');
      expect(result.suggestions).toEqual([]); // No chip on first time
      expect(result.replyText).not.toBe('Opening...');
      expect((result.meta as any)?.shouldOpenOverlay).toBeFalsy();
    });
  });
});
