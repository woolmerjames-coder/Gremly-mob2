import { getRandomFallback } from '../confirmationFallbacks';

describe('confirmationFallbacks', () => {
  describe('getRandomFallback', () => {
    it('returns a string for todo bucket', () => {
      const result = getRandomFallback('todo');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns a string for habit bucket', () => {
      const result = getRandomFallback('habit');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns a string for log bucket with journal subtype', () => {
      const result = getRandomFallback('log', 'journal');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns a string for log bucket with idea subtype', () => {
      const result = getRandomFallback('log', 'idea');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns a string for log bucket with general subtype', () => {
      const result = getRandomFallback('log', 'general');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns a string for log bucket with null subtype', () => {
      const result = getRandomFallback('log', null);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns a string for unknown bucket (falls back to general)', () => {
      const result = getRandomFallback('unknown-bucket');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns from TODO_FALLBACKS pool for todo bucket', () => {
      // Run multiple times to check we get valid todo fallbacks
      const todoMessages = [
        "This one won't slip away",
        'Consider it on the radar',
        'Future you will see this',
        'Queued up and waiting',
        'Not going anywhere now',
        'Safe on the list',
        "You'll come back to this",
        "Stored for when you're ready",
        'Holding onto this for you',
        "It'll be here when you need it",
      ];

      // Run 20 times to get a sample
      for (let i = 0; i < 20; i++) {
        const result = getRandomFallback('todo');
        expect(todoMessages).toContain(result);
      }
    });

    it('returns from HABIT_FALLBACKS pool for habit bucket', () => {
      const habitMessages = [
        'Starting something good here',
        'One step at a time',
        'Building something that matters',
        'The first rep is the hardest',
        'Showing up is the work',
        'This is how it starts',
        'Rooting for you on this',
        'Small moves, real change',
        'Consistency beats intensity',
        'Here for the long haul',
      ];

      for (let i = 0; i < 20; i++) {
        const result = getRandomFallback('habit');
        expect(habitMessages).toContain(result);
      }
    });

    it('returns from JOURNAL_FALLBACKS pool for log/journal', () => {
      const journalMessages = [
        'Thanks for sharing that',
        "That's worth holding onto",
        'No judgment, just listening',
        'Sometimes saying it helps',
        'Feelings noted, space made',
        'That took courage to write',
        'Sitting with this alongside you',
        'Your words are safe here',
        'Honored you shared that',
        'This matters, even if messy',
      ];

      for (let i = 0; i < 20; i++) {
        const result = getRandomFallback('log', 'journal');
        expect(journalMessages).toContain(result);
      }
    });

    it('returns from IDEA_FALLBACKS pool for log/idea', () => {
      const ideaMessages = [
        'Spark safely stored away',
        'Worth coming back to later',
        'Letting this one breathe',
        'Could turn into something',
        'Seeds for future thinking',
        'Interesting thread to pull',
        'Tucked away for pondering',
        'The vault of maybes grows',
        'Something to chew on later',
        'Good instinct to capture this',
      ];

      for (let i = 0; i < 20; i++) {
        const result = getRandomFallback('log', 'idea');
        expect(ideaMessages).toContain(result);
      }
    });

    it('returns from GENERAL_FALLBACKS pool for log/general', () => {
      const generalMessages = [
        'Tucked away for later',
        'Safe in the vault now',
        'Stored for future reference',
        "This won't get lost",
        'Here when you need it',
        'Filed for safekeeping',
        'Keeping this one handy',
        "Won't disappear on you",
        'Saved and accounted for',
        'Holding onto this one',
      ];

      for (let i = 0; i < 20; i++) {
        const result = getRandomFallback('log', 'general');
        expect(generalMessages).toContain(result);
      }
    });

    it('returns different results on multiple calls (randomness check)', () => {
      // Call 50 times and check we get at least 2 different results
      const results = new Set<string>();
      for (let i = 0; i < 50; i++) {
        results.add(getRandomFallback('todo'));
      }
      // Should have at least 2 unique results (very unlikely to get same 50 times)
      expect(results.size).toBeGreaterThanOrEqual(2);
    });
  });
});
