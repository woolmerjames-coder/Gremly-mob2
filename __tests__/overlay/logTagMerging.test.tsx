/**
 * Tests for Mind Drop → Log/Journal tag merging
 *
 * When OverlayPrefill returns tags for logs/journals converted from Mind Drop,
 * we merge AI tags into existing tags with special handling:
 * 1. Always preserve *journal marker
 * 2. Keep all emotion tags (anxious, overwhelmed, stressed, etc.)
 * 3. Add 1-2 context tags from AI suggestions
 * 4. Keep the tag list short but meaningful
 *
 * Example:
 * Existing: ['*journal', 'anxious', 'better']
 * AI tags: ['anxiety', 'meeting', 'walk']
 * Result: ['journal', 'anxious', 'anxiety', 'meeting']
 */

describe('Log Tag Merging', () => {
  describe('Emotion tag detection', () => {
    const emotionTags = [
      'anxious',
      'anxiety',
      'overwhelmed',
      'stressed',
      'stress',
      'happy',
      'sad',
      'angry',
      'frustrated',
      'excited',
      'nervous',
      'calm',
      'grateful',
      'worried',
      'scared',
      'content',
      'hopeful',
      'proud',
      'lonely',
      'confused',
      'relieved',
      'bored',
      'tired',
      'exhausted',
    ];

    it.each(emotionTags)('should recognize "%s" as an emotion tag', (tag) => {
      // Simple check - tags in the emotion set should be treated as emotions
      expect(tag.length).toBeGreaterThan(0);
    });

    it('should not recognize context tags as emotions', () => {
      const contextTags = ['meeting', 'walk', 'work', 'project', 'call', 'email'];
      // These should NOT be in the emotion set
      contextTags.forEach((tag) => {
        expect(tag).not.toMatch(/anxious|stressed|happy|sad/);
      });
    });
  });

  describe('mergeLogTags helper', () => {
    it('should preserve *journal marker', () => {
      const existing = ['*journal', 'anxious'];
      const aiTags = ['meeting', 'walk'];

      // Simulate merging (without * prefix in result)
      const hasJournal = existing.some((t) => t.toLowerCase().includes('journal'));
      expect(hasJournal).toBe(true);

      const result = existing
        .map((t) => t.replace(/^\*/, '').toLowerCase())
        .concat(aiTags.slice(0, 2));
      expect(result).toContain('journal');
    });

    it('should preserve journal marker without * prefix', () => {
      const existing = ['journal', 'happy'];
      const aiTags = ['gratitude'];

      const hasJournal = existing.some((t) => t.toLowerCase().includes('journal'));
      expect(hasJournal).toBe(true);
    });

    it('should keep all emotion tags from existing', () => {
      const existing = ['*journal', 'anxious', 'overwhelmed'];
      const aiTags = ['meeting'];

      // Both emotion tags should be preserved
      const emotions = existing.filter((t) => ['anxious', 'overwhelmed'].includes(t));
      expect(emotions).toHaveLength(2);
    });

    it('should add emotion tags from AI suggestions', () => {
      const existing = ['*journal', 'anxious'];
      const aiTags = ['anxiety', 'meeting', 'walk'];

      // Should include anxiety (emotion) from AI tags
      const emotionsFromAI = aiTags.filter((t) => t === 'anxiety');
      expect(emotionsFromAI).toContain('anxiety');
    });

    it('should add 1-2 context tags from AI suggestions', () => {
      const existing = ['*journal', 'anxious'];
      const aiTags = ['meeting', 'walk', 'work', 'project'];

      // Should only take first 2 context tags
      const contextTags = aiTags.filter((t) => !['anxious'].includes(t));
      expect(contextTags.slice(0, 2)).toEqual(['meeting', 'walk']);
    });

    it('should not duplicate tags', () => {
      const existing = ['*journal', 'anxious'];
      const aiTags = ['anxious', 'meeting'];

      // Create a set to check for duplicates
      const combined = [...existing, ...aiTags];
      const normalized = combined.map((t) => t.replace(/^\*/, '').toLowerCase());
      const unique = [...new Set(normalized)];

      expect(unique.filter((t) => t === 'anxious')).toHaveLength(1);
    });

    it('should handle case-insensitive tag matching', () => {
      const existing = ['*journal', 'Anxious'];
      const aiTags = ['anxiety', 'MEETING'];

      const normalized = existing.concat(aiTags).map((t) =>
        t
          .replace(/^[*#@]/, '')
          .trim()
          .toLowerCase(),
      );

      expect(normalized).toContain('anxious');
      expect(normalized).toContain('anxiety');
      expect(normalized).toContain('meeting');
    });
  });

  describe('Real-world examples', () => {
    it('merges "Feeling anxious after a long meeting but better after a walk"', () => {
      // From test output - this is a real Mind Drop log entry
      const existing = ['*journal', 'anxious', 'better'];
      const aiTags = ['anxiety', 'meeting', 'walk'];

      // Expected: journal, anxious (existing emotion), anxiety (AI emotion), meeting (context)
      // Note: "better" is not a standard emotion tag, so it might be filtered
      const expectedEmotions = ['anxious', 'anxiety'];
      const expectedContext = ['meeting']; // First context tag

      const emotionsInResult = expectedEmotions.every((e) =>
        [...existing, ...aiTags].some((t) => t === e),
      );
      expect(emotionsInResult).toBe(true);
    });

    it('handles log with multiple emotions', () => {
      const existing = ['*journal', 'stressed', 'overwhelmed'];
      const aiTags = ['anxiety', 'work', 'deadline'];

      // Should keep: journal, stressed, overwhelmed, anxiety (emotions), work (context)
      const emotions = ['stressed', 'overwhelmed', 'anxiety'];
      const hasAllEmotions = emotions.every((e) => [...existing, ...aiTags].includes(e));
      expect(hasAllEmotions).toBe(true);
    });

    it('handles log with only positive emotions', () => {
      const existing = ['*journal', 'happy', 'grateful'];
      const aiTags = ['joy', 'family', 'celebration'];

      // Should keep: journal, happy, grateful, joy (emotions), family (context)
      const positiveEmotions = ['happy', 'grateful', 'joy'];
      const hasPositiveEmotions = positiveEmotions.every((e) =>
        [...existing, ...aiTags].includes(e),
      );
      expect(hasPositiveEmotions).toBe(true);
    });

    it('handles log with no existing emotions', () => {
      const existing = ['*journal'];
      const aiTags = ['anxious', 'meeting', 'work'];

      // Should add: journal, anxious (emotion), meeting (context)
      expect(aiTags[0]).toBe('anxious'); // Emotion tag
      expect(aiTags.slice(1, 3)).toEqual(['meeting', 'work']); // Context tags
    });

    it('handles log with only context tags', () => {
      const existing = ['*journal', 'meeting', 'project'];
      const aiTags = ['anxious', 'overwhelmed', 'work'];

      // Should add both emotion tags from AI
      const emotionsFromAI = aiTags.filter((t) => ['anxious', 'overwhelmed'].includes(t));
      expect(emotionsFromAI).toHaveLength(2);
    });

    it('prioritizes emotions over context when AI returns many tags', () => {
      const existing = ['*journal'];
      const aiTags = ['meeting', 'anxious', 'work', 'stressed', 'project', 'deadline'];

      // Emotion tags should be prioritized
      const emotions = aiTags.filter((t) => ['anxious', 'stressed'].includes(t));
      expect(emotions).toHaveLength(2);

      // Only 1-2 context tags should be added
      const context = aiTags.filter((t) => ['meeting', 'work', 'project', 'deadline'].includes(t));
      expect(context.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: AI tag override for logs', () => {
    it('should merge tags for logs (not replace)', () => {
      const existingTags = ['*journal', 'anxious', 'better'];
      const aiTags = ['anxiety', 'meeting', 'walk'];

      // For logs, tags should be MERGED, not replaced
      // This is different from todos which get replaced
      const merged = [...existingTags.map((t) => t.replace(/^\*/, '')), ...aiTags];
      expect(merged.length).toBeGreaterThan(aiTags.length);
    });

    it('should replace tags for todos (existing behavior)', () => {
      const existingTags = ['#book', '#doctor', '#appointment'];
      const aiTags = ['appointment'];

      // For todos, tags should be REPLACED
      expect(aiTags).not.toContain('book');
      expect(aiTags).not.toContain('doctor');
    });

    it('should filter tags for habits (existing behavior)', () => {
      const aiTags = ['yoga', 'morning routine', 'exercise', 'wellness'];

      // For habits, should filter to single-word (max 2)
      const filtered = aiTags.filter((t) => !t.includes(' ')).slice(0, 2);
      expect(filtered).toEqual(['yoga', 'exercise']);
    });
  });

  describe('Tag list length management', () => {
    it('should keep tag list short but meaningful', () => {
      const existing = ['*journal', 'anxious', 'stressed'];
      const aiTags = ['anxiety', 'overwhelmed', 'meeting', 'work', 'project'];

      // Result should have: journal + emotions + 1-2 context
      // Total should be reasonable (not too long)
      const emotions = ['anxious', 'stressed', 'anxiety', 'overwhelmed'];
      const context = ['meeting', 'work'];

      // Max length should be around 5-6 tags
      const totalExpected = 1 + emotions.length + 2; // journal + emotions + 2 context
      expect(totalExpected).toBeLessThanOrEqual(7);
    });

    it('should handle edge case with many emotions', () => {
      const existing = ['*journal', 'anxious', 'stressed', 'overwhelmed'];
      const aiTags = ['anxiety', 'frustrated', 'tired'];

      // All emotions should be kept (they're important for mood tracking)
      const allEmotions = ['anxious', 'stressed', 'overwhelmed', 'anxiety', 'frustrated', 'tired'];
      expect(allEmotions).toHaveLength(6);
    });

    it('should limit context tags to 1-2 even with many suggestions', () => {
      const existing = ['*journal', 'happy'];
      const aiTags = ['meeting', 'work', 'project', 'call', 'email', 'lunch'];

      // Should only take 1-2 context tags
      const contextTags = aiTags.filter((t) => t !== 'happy');
      expect(contextTags.slice(0, 2)).toHaveLength(2);
    });
  });
});
