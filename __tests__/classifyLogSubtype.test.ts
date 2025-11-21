/**
 * Tests for classifyLogSubtype - Log Subtype Classification
 *
 * Tests both sync (deterministic) and async (AI with fallback) classifiers.
 * - classifyLogSubtypeSync: Pattern-based classification (fast, deterministic)
 * - classifyLogSubtype: AI-powered with deterministic fallback (async)
 *
 * Subtypes:
 * - journal: Personal reflections, feelings, daily experiences
 * - list: Items to check off or remember
 * - reference: Information to remember later
 * - idea: Creative thoughts or brainstorming
 * - plain: Default/unclassified
 */

import { classifyLogSubtypeSync } from '../lib/cortex/classifyLogSubtype';

// Mock the CortexClient for async tests
jest.mock('../lib/cortex/CortexClient', () => ({
  callClassify: jest.fn(),
}));

describe('classifyLogSubtype (Sync/Deterministic)', () => {
  describe('Journal entries', () => {
    it('detects "I feel" language', () => {
      expect(classifyLogSubtypeSync('I feel great today!')).toBe('journal');
      expect(classifyLogSubtypeSync("I'm feeling anxious about the meeting")).toBe('journal');
    });

    it('detects time-based reflections', () => {
      expect(classifyLogSubtypeSync('Today was amazing')).toBe('journal');
      expect(classifyLogSubtypeSync('This morning I woke up early')).toBe('journal');
      expect(classifyLogSubtypeSync('Tonight I realized something important')).toBe('journal');
      expect(classifyLogSubtypeSync('This evening went really well')).toBe('journal');
    });

    it('detects emotional language', () => {
      expect(classifyLogSubtypeSync('Feeling grateful for my friends')).toBe('journal');
      expect(classifyLogSubtypeSync('So anxious about the presentation')).toBe('journal');
      expect(classifyLogSubtypeSync('Really excited about tomorrow')).toBe('journal');
      expect(classifyLogSubtypeSync('Frustrated with how things are going')).toBe('journal');
    });

    it('detects past tense reflections', () => {
      expect(classifyLogSubtypeSync('I was happy to see progress today')).toBe('journal');
      expect(classifyLogSubtypeSync("I've been thinking about my goals")).toBe('journal');
      expect(classifyLogSubtypeSync('Had a rough day at work')).toBe('journal');
    });

    it('detects reflection keywords', () => {
      expect(classifyLogSubtypeSync('Reflecting on my week')).toBe('journal');
      expect(classifyLogSubtypeSync('My thoughts about the situation')).toBe('journal');
    });
  });

  describe('List entries', () => {
    it('detects bullet lists', () => {
      expect(classifyLogSubtypeSync('- Buy milk\n- Buy bread\n- Buy eggs')).toBe('list');
      expect(classifyLogSubtypeSync('* Item 1\n* Item 2\n* Item 3')).toBe('list');
      expect(classifyLogSubtypeSync('• First\n• Second\n• Third')).toBe('list');
    });

    it('detects numbered lists', () => {
      expect(classifyLogSubtypeSync('1. First task\n2. Second task\n3. Third task')).toBe('list');
    });

    it('detects checkbox lists', () => {
      expect(classifyLogSubtypeSync('[ ] Buy groceries\n[ ] Call mom\n[x] Finish report')).toBe(
        'list',
      );
      expect(classifyLogSubtypeSync('[X] Done task\n[ ] Pending task')).toBe('list');
    });

    it('detects single-line list indicators', () => {
      expect(classifyLogSubtypeSync('Groceries to buy')).toBe('list');
      expect(classifyLogSubtypeSync('Shopping list for the week')).toBe('list');
      expect(classifyLogSubtypeSync('Things to pack for the trip')).toBe('list');
      expect(classifyLogSubtypeSync('Items to remember')).toBe('list');
    });

    it('prioritizes list structure over other content', () => {
      expect(classifyLogSubtypeSync('I feel great about:\n- Task 1\n- Task 2')).toBe('list');
      expect(classifyLogSubtypeSync('Idea for app:\n* Feature A\n* Feature B')).toBe('list');
    });
  });

  describe('Idea entries', () => {
    it('detects explicit idea markers', () => {
      expect(classifyLogSubtypeSync('Idea: create a new feature for the app')).toBe('idea');
      expect(classifyLogSubtypeSync('Idea - improve the user interface')).toBe('idea');
    });

    it('detects speculative language', () => {
      expect(classifyLogSubtypeSync('What if we tried a different approach?')).toBe('idea');
      expect(classifyLogSubtypeSync('Maybe we could improve the design')).toBe('idea');
      expect(classifyLogSubtypeSync('Could we combine these two features?')).toBe('idea');
      expect(classifyLogSubtypeSync('We should brainstorm solutions')).toBe('idea');
    });

    it('detects creative/conceptual language', () => {
      expect(classifyLogSubtypeSync('Think about adding dark mode')).toBe('idea');
      expect(classifyLogSubtypeSync('Consider implementing notifications')).toBe('idea');
      expect(classifyLogSubtypeSync('Imagine if users could customize themes')).toBe('idea');
      expect(classifyLogSubtypeSync('Potential opportunity to expand market')).toBe('idea');
    });
  });

  describe('Reference entries', () => {
    it('detects information storage language', () => {
      expect(classifyLogSubtypeSync('Remember to call Sarah at 555-1234')).toBe('reference');
      expect(classifyLogSubtypeSync('Note: meeting is in Building C')).toBe('reference');
      expect(classifyLogSubtypeSync('Sarah mentioned the deadline is next Friday')).toBe(
        'reference',
      );
      expect(classifyLogSubtypeSync('He told me the password is abc123')).toBe('reference');
    });

    it('detects credential/technical info', () => {
      expect(classifyLogSubtypeSync('The password is securePass123')).toBe('reference');
      expect(classifyLogSubtypeSync('WiFi code: GUEST2024')).toBe('reference');
      expect(classifyLogSubtypeSync('Link: https://example.com/docs')).toBe('reference');
      expect(classifyLogSubtypeSync('Email: support@company.com')).toBe('reference');
      expect(classifyLogSubtypeSync('Phone number: 555-123-4567')).toBe('reference');
    });

    it('detects information keywords', () => {
      expect(classifyLogSubtypeSync('Info about the new policy')).toBe('reference');
      expect(classifyLogSubtypeSync('Details for the project timeline')).toBe('reference');
      expect(classifyLogSubtypeSync('Facts about the implementation')).toBe('reference');
    });
  });

  describe('Plain/default entries', () => {
    it('returns plain for empty or generic text', () => {
      expect(classifyLogSubtypeSync('')).toBe('plain');
      expect(classifyLogSubtypeSync('   ')).toBe('plain');
      expect(classifyLogSubtypeSync('Just a regular note')).toBe('plain');
      expect(classifyLogSubtypeSync('Some random text without keywords')).toBe('plain');
    });

    it('returns plain when no clear category matches', () => {
      expect(classifyLogSubtypeSync('Meeting at 3pm')).toBe('plain');
      expect(classifyLogSubtypeSync('Project update')).toBe('plain');
      expect(classifyLogSubtypeSync('Call dentist')).toBe('plain');
    });
  });

  describe('Priority and edge cases', () => {
    it('prioritizes list over journal when both present', () => {
      expect(
        classifyLogSubtypeSync('I feel great today:\n- Accomplished task 1\n- Finished task 2'),
      ).toBe('list');
    });

    it('handles mixed content correctly', () => {
      // List structure takes priority
      expect(
        classifyLogSubtypeSync('Thinking about improvements:\n1. Better UI\n2. Faster performance'),
      ).toBe('list');

      // Journal wins when no list structure
      expect(classifyLogSubtypeSync('Today I thought about maybe improving things')).toBe(
        'journal',
      );
    });

    it('handles case insensitivity', () => {
      expect(classifyLogSubtypeSync('I FEEL GREAT TODAY')).toBe('journal');
      expect(classifyLogSubtypeSync('IDEA: NEW FEATURE')).toBe('idea');
      expect(classifyLogSubtypeSync('REMEMBER TO CALL')).toBe('reference');
    });

    it('handles partial line breaks', () => {
      // Single-line list indicator + multiple lines = list
      expect(classifyLogSubtypeSync('Buy groceries:\nmilk\nbread')).toBe('list'); // "groceries" triggers list
      // Formatted list structure
      expect(classifyLogSubtypeSync('Buy groceries:\n- milk\n- bread')).toBe('list');
    });
  });
});

describe('classifyLogSubtype (Async/AI with Fallback)', () => {
  // Import after mocking
  const { classifyLogSubtype } = require('../lib/cortex/classifyLogSubtype');
  const { callClassify } = require('../lib/cortex/CortexClient');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses AI result when available and valid', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: 'journal',
        tags: [],
        spaceName: null,
        confidence: 0.95,
        title: null,
      },
    });

    const result = await classifyLogSubtype('Some text');
    expect(result).toBe('journal');
    expect(callClassify).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user', content: 'Some text' }),
        ]),
        timeoutMs: 3000,
      }),
    );
  });

  it('falls back to sync classifier when AI fails', async () => {
    callClassify.mockResolvedValue({
      ok: false,
      error: 'timeout',
    });

    const result = await classifyLogSubtype('I feel great today!');
    expect(result).toBe('journal'); // Fallback should still work
  });

  it('validates AI responses and rejects invalid subtypes', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: 'invalid_type', // Not a valid LogSubtype
        tags: [],
        spaceName: null,
        confidence: 0.95,
        title: null,
      },
    });

    const result = await classifyLogSubtype('Some text');
    // Should fall back to sync classifier for invalid AI response
    expect(result).toBe('plain');
  });

  it('handles AI exceptions gracefully', async () => {
    callClassify.mockRejectedValue(new Error('Network error'));

    const result = await classifyLogSubtype('- Item 1\n- Item 2');
    expect(result).toBe('list'); // Fallback should detect list structure
  });

  it('limits text length sent to AI', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: 'plain',
        tags: [],
        spaceName: null,
        confidence: 0.5,
        title: null,
      },
    });

    const longText = 'a'.repeat(1000);
    await classifyLogSubtype(longText);

    expect(callClassify).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: longText.slice(0, 500), // Should be truncated to 500 chars
          }),
        ]),
      }),
    );
  });
});
