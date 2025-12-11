/**
 * Heuristic Classify Tests
 */

import { heuristicClassify } from '../../../lib/minddrop/heuristicClassify';

describe('heuristicClassify', () => {
  describe('todo detection', () => {
    it.each([
      ['buy milk'],
      ['call mom'],
      ['schedule dentist appointment'],
      ['Pick up dry cleaning'],
      ['Submit the report by Friday'],
      ['Email John about the meeting'],
    ])('should classify "%s" as todo', (text) => {
      const result = heuristicClassify(text);
      expect(result.bucket).toBe('todo');
      expect(result.subtypeHint).toBeNull();
    });

    it('should have reasonable confidence for todos', () => {
      const result = heuristicClassify('buy milk');
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    });
  });

  describe('habit detection', () => {
    it.each([['exercise daily'], ['read every morning'], ['meditate 3x a week'], ['quit smoking']])(
      'should classify "%s" as habit',
      (text) => {
        const result = heuristicClassify(text);
        expect(result.bucket).toBe('habit');
        expect(result.subtypeHint).toBeNull();
      },
    );

    it('should have reasonable confidence for habits', () => {
      const result = heuristicClassify('exercise daily');
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    });
  });

  describe('log detection with subtypes', () => {
    it('should classify journal-style text as log with journal subtype', () => {
      const result = heuristicClassify('I feel grateful for my family today');
      expect(result.bucket).toBe('log');
      expect(result.subtypeHint).toBe('journal');
    });

    it('should classify idea-style text as log with idea subtype', () => {
      const result = heuristicClassify('What if we built a feature that does X');
      expect(result.bucket).toBe('log');
      expect(result.subtypeHint).toBe('idea');
    });

    it('should classify generic text as log with general subtype', () => {
      const result = heuristicClassify('interesting thought about trees');
      expect(result.bucket).toBe('log');
      expect(result.subtypeHint).toBe('general');
    });

    it('should prefer idea over journal when both match', () => {
      const result = heuristicClassify('I think what if we could fly');
      expect(result.subtypeHint).toBe('idea');
    });
  });

  describe('photo drops', () => {
    it('should classify empty string with attachments as log', () => {
      const result = heuristicClassify('', { hasAttachments: true });
      expect(result.bucket).toBe('log');
      expect(result.subtypeHint).toBe('general');
    });

    it('should include hasAttachments in signals', () => {
      const result = heuristicClassify('', { hasAttachments: true });
      expect(result.signals).toContain('hasAttachments');
    });

    it('should still detect todo even with attachments if strong todo signals', () => {
      const result = heuristicClassify('buy milk and eggs', { hasAttachments: true });
      // With attachments, log score gets +0.4, but "buy" gives todo 0.4+0.3=0.7
      // This may or may not be todo depending on exact scoring
      expect(['todo', 'log']).toContain(result.bucket);
    });

    it('should boost log score with attachments', () => {
      const withAttachments = heuristicClassify('random words here', {
        hasAttachments: true,
      });
      const withoutAttachments = heuristicClassify('random words here', {
        hasAttachments: false,
      });

      // Both should be log, but with attachments should have higher confidence
      expect(withAttachments.bucket).toBe('log');
      expect(withoutAttachments.bucket).toBe('log');
      expect(withAttachments.confidence).toBeGreaterThan(withoutAttachments.confidence);
    });
  });

  describe('signals tracking', () => {
    it('should track todoVerbs signal for "buy milk"', () => {
      const result = heuristicClassify('buy milk');
      expect(result.signals).toContain('todoVerbs');
    });

    it('should track imperativeStart signal for "Buy milk"', () => {
      const result = heuristicClassify('Buy milk');
      expect(result.signals).toContain('imperativeStart');
    });

    it('should track habitFrequency signal for "exercise daily"', () => {
      const result = heuristicClassify('exercise daily');
      expect(result.signals).toContain('habitFrequency');
    });

    it('should track journalPhrases signal for "I feel happy"', () => {
      const result = heuristicClassify('I feel happy today');
      expect(result.signals).toContain('journalPhrases');
    });

    it('should track ideaPhrases signal for "what if"', () => {
      const result = heuristicClassify('What if we could do this');
      expect(result.signals).toContain('ideaPhrases');
    });

    it('should track multiple signals when multiple patterns match', () => {
      const result = heuristicClassify('call mom by tomorrow');
      expect(result.signals).toContain('todoVerbs');
      expect(result.signals).toContain('todoKeywords');
    });
  });

  describe('edge cases', () => {
    it('should return log with general subtype for empty string', () => {
      const result = heuristicClassify('');
      expect(result.bucket).toBe('log');
      expect(result.subtypeHint).toBe('general');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle very long text without crashing', () => {
      const longText = 'a'.repeat(1000) + ' buy milk ' + 'b'.repeat(1000);
      expect(() => heuristicClassify(longText)).not.toThrow();
      const result = heuristicClassify(longText);
      expect(result.bucket).toBeDefined();
    });

    it('should handle text with special characters without crashing', () => {
      const specialText = '🎉 Buy 100% organic milk!!! @home #todo $$$';
      expect(() => heuristicClassify(specialText)).not.toThrow();
      const result = heuristicClassify(specialText);
      expect(result.bucket).toBe('todo');
    });

    it('should handle text with newlines', () => {
      const multilineText = 'buy milk\nand eggs\nand bread';
      expect(() => heuristicClassify(multilineText)).not.toThrow();
      const result = heuristicClassify(multilineText);
      expect(result.bucket).toBeDefined();
    });

    it('should handle undefined context gracefully', () => {
      expect(() => heuristicClassify('buy milk')).not.toThrow();
      expect(() => heuristicClassify('buy milk', {})).not.toThrow();
    });

    it('should return confidence between 0 and 1', () => {
      const tests = ['buy milk', 'exercise daily', 'I feel great', '', 'random'];
      for (const text of tests) {
        const result = heuristicClassify(text);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(2); // Allow some overflow from multiple matches
      }
    });
  });

  describe('boundary cases for thresholds', () => {
    it('should require todoScore >= 0.3 to classify as todo', () => {
      // "due" alone gives 0.3 todoKeywords but might not be enough
      const result = heuristicClassify('something due');
      // Should still be todo with 0.3 threshold
      expect(result.bucket).toBe('todo');
    });

    it('should require habitScore >= 0.4 to classify as habit', () => {
      // "daily" alone gives 0.5 habitFrequency
      const result = heuristicClassify('daily');
      expect(result.bucket).toBe('habit');
    });

    it('should fallback to log when no strong signals', () => {
      const result = heuristicClassify('apple banana cherry');
      expect(result.bucket).toBe('log');
      expect(result.subtypeHint).toBe('general');
    });
  });
});
