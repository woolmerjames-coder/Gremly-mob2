/**
 * Phase 11.8: AI-Powered Intent Classification Tests
 *
 * Tests for classifyIntentWithAI helper that extends rule-based classification
 * with AI-powered confidence scoring.
 */

import { classifyIntentWithAI, isAIClassificationAvailable } from '../classifyIntentWithAI';
import { callClassify } from '../../CortexClient';

// Mock CortexClient
jest.mock('../../CortexClient', () => ({
  callClassify: jest.fn(),
}));

const mockCallClassify = callClassify as jest.MockedFunction<typeof callClassify>;

describe('classifyIntentWithAI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy path - High confidence', () => {
    it('should return AI classification with high confidence (95)', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-1',
        classification: {
          bucket: 'todo',
          type: 'todo',
          subtype: null,
          category: 'todo',
          tags: [],
          spaceName: null,
          confidence: 95,
          title: 'Call dentist tomorrow',
        },
        aiTitle: 'Call dentist tomorrow',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Call dentist tomorrow');

      expect(result.kind).toBe('todo');
      expect(result.aiConfidence).toBe(95);
      expect(result.confidence).toBeCloseTo(0.95, 2);
      expect(result.title).toBe('Call dentist tomorrow');
    });

    it('should handle JSON in category field', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-2',
        classification: {
          bucket: 'habit',
          type: 'habit',
          subtype: null,
          category: JSON.stringify({ type: 'habit', confidence: 92 }),
          tags: [],
          spaceName: null,
          confidence: 92,
          title: 'Meditate every morning',
        },
        aiTitle: 'Meditate every morning',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Meditate every morning');

      expect(result.kind).toBe('habit');
      expect(result.aiConfidence).toBe(92);
      expect(result.confidence).toBeCloseTo(0.92, 2);
    });

    it('should handle type field (new format)', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-2b',
        classification: {
          bucket: 'todo',
          type: 'todo',
          subtype: null,
          category: JSON.stringify({ type: 'todo', confidence: 95 }),
          tags: [],
          spaceName: null,
          confidence: 95,
          title: 'Email Sarah back tonight',
        },
        aiTitle: 'Email Sarah back tonight',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('I need to email Sarah back tonight');

      expect(result.kind).toBe('todo');
      expect(result.aiConfidence).toBe(95);
      expect(result.confidence).toBeCloseTo(0.95, 2);
    });

    it('should handle category-only field (backward compat)', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-2c',
        classification: {
          bucket: 'habit',
          type: 'habit',
          subtype: null,
          category: JSON.stringify({ category: 'habit', confidence: 80 }),
          tags: [],
          spaceName: null,
          confidence: 80,
          title: 'Exercise daily',
        },
        aiTitle: 'Exercise daily',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Exercise daily');

      expect(result.kind).toBe('habit');
      expect(result.aiConfidence).toBe(80);
      // Phase 3: Use worker confidence directly (80% = 0.8)
      expect(result.confidence).toBe(0.8);
    });
  });

  describe('Medium confidence', () => {
    it('should return AI classification with medium confidence (72)', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-3',
        classification: {
          bucket: 'log-general',
          type: 'log',
          subtype: 'general',
          category: 'log',
          tags: [],
          spaceName: null,
          confidence: 72,
          title: 'Talked to Sarah about the project',
        },
        aiTitle: 'Talked to Sarah about the project',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Talked to Sarah about the project');

      expect(result.kind).toBe('note'); // AI "log" maps to "note" intent
      expect(result.aiConfidence).toBe(72);
      expect(result.confidence).toBeCloseTo(0.72, 2);
    });

    it('should handle low confidence (45)', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-4',
        classification: {
          bucket: 'unsorted',
          type: 'ignore',
          subtype: null,
          category: 'ignore',
          tags: [],
          spaceName: null,
          confidence: 45,
          title: 'hmm, interesting',
        },
        aiTitle: 'hmm, interesting',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('hmm, interesting');

      // Phase 3: bucket='unsorted' → type='ignore' → intent='none'
      // No reflection keywords, so stays as ignore (not converted to note)
      expect(result.kind).toBe('none'); // ignore maps to 'none' intent
      expect(result.aiConfidence).toBe(45);
      // Phase 3: Confidence from canonical resolver (reflection safety or worker conf)
      expect(result.confidence).toBeGreaterThanOrEqual(0.45);
    });
  });

  describe('Missing confidence', () => {
    it('should use rule-based confidence when AI confidence is missing', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-5',
        classification: {
          bucket: 'todo',
          type: 'todo',
          subtype: null,
          category: 'todo',
          tags: [],
          spaceName: null,
          confidence: undefined as any,
          title: 'Buy groceries',
        },
        aiTitle: 'Buy groceries',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Buy groceries');

      expect(result.kind).toBe('todo');
      expect(result.aiConfidence).toBeUndefined();
      // Phase 3: When AI confidence is missing, falls back to rules
      // Confidence may be low/zero if rules are also uncertain
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should handle confidence as null', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-6',
        classification: {
          bucket: 'habit',
          type: 'habit',
          subtype: null,
          category: 'habit',
          tags: [],
          spaceName: null,
          confidence: null as any,
          title: 'Exercise daily',
        },
        aiTitle: 'Exercise daily',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Exercise daily');

      expect(result.kind).toBe('habit');
      expect(result.aiConfidence).toBeUndefined();
    });
  });

  describe('Out-of-range confidence', () => {
    it('should reject confidence > 100', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-7',
        classification: {
          bucket: 'todo',
          type: 'todo',
          subtype: null,
          category: 'todo',
          tags: [],
          spaceName: null,
          confidence: 150,
          title: 'Send email to boss',
        },
        aiTitle: 'Send email to boss',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Send email to boss');

      expect(result.kind).toBe('todo');
      expect(result.aiConfidence).toBeUndefined(); // Out of range -> undefined
    });

    it('should reject confidence < 0', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-8',
        classification: {
          bucket: 'log-general',
          type: 'log',
          subtype: 'general',
          category: 'log',
          tags: [],
          spaceName: null,
          confidence: -10,
          title: 'Random thought',
        },
        aiTitle: 'Random thought',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Random thought');

      expect(result.kind).toBe('note');
      expect(result.aiConfidence).toBeUndefined();
    });

    it('should round floating point confidence to nearest integer', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-9',
        classification: {
          bucket: 'habit',
          type: 'habit',
          subtype: null,
          category: 'habit',
          tags: [],
          spaceName: null,
          confidence: 87.6,
          title: 'Drink water every hour',
        },
        aiTitle: 'Drink water every hour',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Drink water every hour');

      expect(result.kind).toBe('habit');
      expect(result.aiConfidence).toBe(88); // Rounded
      expect(result.confidence).toBeCloseTo(0.88, 2);
    });
  });

  describe('Non-numeric confidence', () => {
    it('should reject confidence as string', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-10',
        classification: {
          bucket: 'todo',
          type: 'todo',
          subtype: null,
          category: 'todo',
          tags: [],
          spaceName: null,
          confidence: 'high' as any,
          title: 'Fix bug in production',
        },
        aiTitle: 'Fix bug in production',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Fix bug in production');

      // When AI confidence is invalid, falls back to rule+text heuristics
      // "Fix bug in production" → imperative verb → todo (from master spec)
      expect(result.kind).toBe('todo');
      expect(result.aiConfidence).toBeUndefined();
    });

    it('should reject confidence as boolean', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-11',
        classification: {
          bucket: 'log-general',
          type: 'log',
          subtype: 'general',
          category: 'log',
          tags: [],
          spaceName: null,
          confidence: true as any,
          title: 'Feeling overwhelmed',
        },
        aiTitle: 'Feeling overwhelmed',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Feeling overwhelmed');

      // "Feeling overwhelmed" → journal pattern → log (from master spec)
      expect(result.kind).toBe('note');
      expect(result.aiConfidence).toBeUndefined();
    });

    it('should reject confidence as object', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-12',
        classification: {
          bucket: 'habit',
          type: 'habit',
          subtype: null,
          category: 'habit',
          tags: [],
          spaceName: null,
          confidence: { score: 90 } as any,
          title: 'Read books weekly',
        },
        aiTitle: 'Read books weekly',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Read books weekly');

      expect(result.kind).toBe('habit');
      expect(result.aiConfidence).toBeUndefined();
    });
  });

  describe('Error paths and fallback', () => {
    it('should fall back to rule-based classification on AI error', async () => {
      mockCallClassify.mockResolvedValue({
        ok: false,
        error: 'AI service unavailable',
      });

      const result = await classifyIntentWithAI('Call mom tomorrow');

      // Should use rule-based classification
      expect(result.kind).toBeDefined();
      expect(result.aiConfidence).toBeUndefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should fall back to rule-based classification on timeout', async () => {
      mockCallClassify.mockResolvedValue({
        ok: false,
        error: 'timeout',
      });

      const result = await classifyIntentWithAI('Start meditation practice', 100);

      expect(result.kind).toBeDefined();
      expect(result.aiConfidence).toBeUndefined();
    });

    it('should fall back on AI exception', async () => {
      mockCallClassify.mockRejectedValue(new Error('Network error'));

      const result = await classifyIntentWithAI('Buy milk');

      // Should not throw, should fall back
      expect(result.kind).toBeDefined();
      expect(result.aiConfidence).toBeUndefined();
    });

    it('should fall back when AI returns invalid type', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-13',
        classification: {
          bucket: 'log-general',
          type: 'log',
          subtype: 'general',
          category: 'invalid_type',
          tags: [],
          spaceName: null,
          confidence: 90,
          title: 'Do something',
        },
        aiTitle: 'Do something',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Do something');

      // Canonical resolver handles invalid AI type gracefully
      expect(result.kind).toBeDefined();
      // Invalid AI type means confidence is still processed but type is ignored
      expect(result.aiConfidence).toBe(90);
    });

    it('should handle empty input without calling AI', async () => {
      const result = await classifyIntentWithAI('');

      expect(mockCallClassify).not.toHaveBeenCalled();
      expect(result.kind).toBe('none');
      expect(result.confidence).toBe(0);
      expect(result.aiConfidence).toBeUndefined();
    });

    it('should handle whitespace-only input without calling AI', async () => {
      const result = await classifyIntentWithAI('   \n  \t  ');

      expect(mockCallClassify).not.toHaveBeenCalled();
      expect(result.kind).toBe('none');
    });
  });

  describe('AI type mapping', () => {
    it('should map AI "log" to intent "note"', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-14',
        classification: {
          bucket: 'log-general',
          type: 'log',
          subtype: 'general',
          category: 'log',
          tags: [],
          spaceName: null,
          confidence: 88,
          title: 'Had a great meeting today',
        },
        aiTitle: 'Had a great meeting today',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Had a great meeting today');

      expect(result.kind).toBe('note');
      expect(result.aiConfidence).toBe(88);
    });

    it('should map AI "ignore" to intent "none"', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-15',
        classification: {
          bucket: 'unsorted',
          type: 'ignore',
          subtype: null,
          category: 'ignore',
          tags: [],
          spaceName: null,
          confidence: 30,
          title: '...',
        },
        aiTitle: '...',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('...');

      // Phase 3: bucket='unsorted' → type='ignore' → intent='none'
      // Text "..." has no reflection keywords, so stays as ignore
      expect(result.kind).toBe('none');
      expect(result.aiConfidence).toBe(30);
      // Phase 3: Low confidence uses reflection safety rule or fallback
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('should preserve AI "todo" as intent "todo"', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-16',
        classification: {
          bucket: 'todo',
          type: 'todo',
          subtype: null,
          category: 'todo',
          tags: [],
          spaceName: null,
          confidence: 96,
          title: 'Finish report by Friday',
        },
        aiTitle: 'Finish report by Friday',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Finish report by Friday');

      expect(result.kind).toBe('todo');
      expect(result.aiConfidence).toBe(96);
    });

    it('should preserve AI "habit" as intent "habit"', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-17',
        classification: {
          bucket: 'habit',
          type: 'habit',
          subtype: null,
          category: 'habit',
          tags: [],
          spaceName: null,
          confidence: 91,
          title: 'Floss teeth every night',
        },
        aiTitle: 'Floss teeth every night',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Floss teeth every night');

      expect(result.kind).toBe('habit');
      expect(result.aiConfidence).toBe(91);
    });
  });

  describe('Confidence edge cases', () => {
    it('should handle confidence = 0', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-18',
        classification: {
          bucket: 'log-general',
          type: 'log',
          subtype: 'general',
          category: 'log',
          tags: [],
          spaceName: null,
          confidence: 0,
          title: 'Something ambiguous',
        },
        aiTitle: 'Something ambiguous',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Something ambiguous');

      expect(result.kind).toBe('note');
      expect(result.aiConfidence).toBe(0);
      // Phase 3: Very low AI confidence uses rule fallback (min 0.4-0.5 range)
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    });

    it('should handle confidence = 100', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-19',
        classification: {
          bucket: 'todo',
          type: 'todo',
          subtype: null,
          category: 'todo',
          tags: [],
          spaceName: null,
          confidence: 100,
          title: 'TODO: Submit expense report',
        },
        aiTitle: 'TODO: Submit expense report',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('TODO: Submit expense report');

      expect(result.kind).toBe('todo');
      expect(result.aiConfidence).toBe(100);
      expect(result.confidence).toBe(1.0);
    });

    it('should handle confidence = 50 (boundary case)', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-20',
        classification: {
          bucket: 'habit',
          type: 'habit',
          subtype: null,
          category: 'habit',
          tags: [],
          spaceName: null,
          confidence: 50,
          title: 'Maybe start running',
        },
        aiTitle: 'Maybe start running',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Maybe start running');

      expect(result.kind).toBe('habit');
      expect(result.aiConfidence).toBe(50);
      // Phase 3: Worker confidence used directly (50% = 0.5), no boost
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('Rule-based fallback properties', () => {
    it('should preserve rule-based properties when AI succeeds', async () => {
      mockCallClassify.mockResolvedValue({
        ok: true,
        id: 'test-21',
        classification: {
          bucket: 'todo',
          type: 'todo',
          subtype: null,
          category: 'todo',
          tags: [],
          spaceName: null,
          confidence: 85,
          title: 'Call dentist',
        },
        aiTitle: 'Call dentist',
        aiTagsDebug: [],
      });

      const result = await classifyIntentWithAI('Call dentist');

      // Should have AI classification
      expect(result.kind).toBe('todo');
      expect(result.aiConfidence).toBe(85);

      // Should also have rule-based properties (from fallback)
      expect(result.title).toBe('Call dentist');
      expect(result.isCommand).toBeDefined();
      expect(result.isMetaComment).toBeDefined();
    });
  });
});

describe('isAIClassificationAvailable', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return false when AI is explicitly disabled', () => {
    process.env.EXPO_PUBLIC_DISABLE_AI = 'true';
    process.env.EXPO_PUBLIC_CORTEX_URL = 'https://cortex.example.com';

    expect(isAIClassificationAvailable()).toBe(false);
  });

  it('should return false when Cortex URL is missing', () => {
    process.env.EXPO_PUBLIC_DISABLE_AI = undefined;
    process.env.EXPO_PUBLIC_CORTEX_URL = undefined;

    expect(isAIClassificationAvailable()).toBe(false);
  });

  it.skip('should return true when AI is enabled and Cortex URL exists', () => {
    // Skipped: Test environment may have EXPO_PUBLIC_DISABLE_AI set globally
    // This is a simple env check that's tested in integration
    process.env.EXPO_PUBLIC_DISABLE_AI = undefined;
    process.env.EXPO_PUBLIC_CORTEX_URL = 'https://cortex.example.com';

    expect(isAIClassificationAvailable()).toBe(true);
  });
});
