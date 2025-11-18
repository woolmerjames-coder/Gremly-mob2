/**
 * Tests for buildCanonicalFromMindDrop helper.
 * Verifies canonical mapping from Mind Drop text to todo/habit/log entities.
 */

import { buildCanonicalFromMindDrop } from '../buildCanonicalFromMindDrop';

describe('buildCanonicalFromMindDrop', () => {
  describe('todo mapping', () => {
    it('should create todo from "Book haircut tomorrow at 3pm"', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: 'Book haircut tomorrow at 3pm',
        aiTags: ['haircut', 'appointment'],
      });

      expect(result.canonicalType).toBe('todo');
      expect(result.labels).toEqual(['todo']);
      expect(result.title).toBe('Book haircut tomorrow at 3pm');
      expect(result.name).toBe('Book haircut tomorrow at 3pm');
      expect(result.body).toBe('Book haircut tomorrow at 3pm');
      expect(result.details).toBe('Book haircut tomorrow at 3pm');
      expect(result.tags).toEqual(['#haircut', '#appointment']);
      expect(result.tags_meta).toEqual({
        sticky: [],
        tombstones: [],
      });
    });

    it('should use AI title when provided', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: 'Book haircut tomorrow at 3pm',
        aiTitle: 'Haircut appointment tomorrow',
        aiTags: ['haircut', 'appointment'],
      });

      expect(result.title).toBe('Haircut appointment tomorrow');
      expect(result.name).toBe('Haircut appointment tomorrow');
      expect(result.body).toBe('Book haircut tomorrow at 3pm'); // Full raw text preserved
    });

    it('should filter junk words from tags', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: 'Book haircut tomorrow at 3pm',
        aiTags: ['book', 'haircut', 'tomorrow', 'at'], // 'tomorrow' and 'at' are junk
      });

      // filterAndNormalizeTags should remove 'tomorrow' and 'at'
      expect(result.tags).toEqual(['#book', '#haircut']);
    });

    it('should generate fallback tags when none provided', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: 'Book haircut tomorrow at 3pm',
      });

      expect(result.tags).toBeDefined();
      expect(Array.isArray(result.tags)).toBe(true);
      // buildFallbackTags will extract some meaningful tags
    });

    it('should compact long titles', () => {
      const longText =
        'This is a very long task description that goes on and on and should be truncated to a reasonable length for display purposes';
      const result = buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: longText,
      });

      // Should be compacted to ~60 chars or use first line
      expect(result.title.length).toBeLessThanOrEqual(63); // 60 + '...'
      expect(result.body).toBe(longText); // Full text preserved in body
    });
  });

  describe('habit mapping', () => {
    it('should create habit from "Go for a 20-minute walk every morning"', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText: 'Go for a 20-minute walk every morning',
        aiTags: ['walk', 'morning'],
      });

      expect(result.canonicalType).toBe('habit');
      expect(result.labels).toEqual(['habit']);
      expect(result.title).toBe('Go for a 20-minute walk every morning');
      expect(result.name).toBe('Go for a 20-minute walk every morning');
      expect(result.notes).toBe('Go for a 20-minute walk every morning');
      expect(result.tags).toEqual(['#walk']);
      expect(result.tags_meta).toEqual({
        sticky: [],
        tombstones: [],
      });
      expect(result.body).toBeUndefined(); // Habits don't have body field
    });

    it('should use AI title when provided', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText: 'Go for a 20-minute walk every morning',
        aiTitle: 'Morning walk',
        aiTags: ['walk', 'morning'],
      });

      expect(result.title).toBe('Morning walk');
      expect(result.name).toBe('Morning walk');
      expect(result.notes).toBe('Go for a 20-minute walk every morning'); // Full raw text preserved
    });

    it('should filter time-related junk words from tags', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText: 'Go for a 20-minute walk every morning',
        aiTags: ['walk', 'every', 'morning', 'minute'], // 'every' and 'minute' are junk
      });

      // filterAndNormalizeTags should remove 'every' and 'minute'
      expect(result.tags).toEqual(['#walk']);
    });

    it('should preserve existing tags_meta when provided', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText: 'Go for a walk',
        existing: {
          tags_meta: {
            sticky: ['fitness'],
            tombstones: ['exercise'],
          },
        },
      });

      expect(result.tags_meta).toEqual({
        sticky: ['fitness'],
        tombstones: ['exercise'],
      });
    });
  });

  describe('log mapping', () => {
    it('should create log from "Felt overwhelmed after work but calmed down after a walk"', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Felt overwhelmed after work but calmed down after a walk',
        aiTags: ['overwhelmed', 'calm', 'walk'],
      });

      expect(result.canonicalType).toBe('log');
      expect(result.labels).toEqual(['log']);
      expect(result.title).toBe('Felt overwhelmed after work but calmed down after a walk');
      expect(result.body).toBe('Felt overwhelmed after work but calmed down after a walk');
      expect(result.tags).toEqual(['#overwhelmed', '#calm', '#walk']);
      expect(result.tags_meta).toEqual({
        sticky: [],
        tombstones: [],
      });
      expect(result.name).toBeUndefined(); // Logs don't have name field
      expect(result.notes).toBeUndefined(); // Logs don't have notes field
    });

    it('should use AI title when provided', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Felt overwhelmed after work but calmed down after a walk',
        aiTitle: 'Feeling Overwhelmed After Work',
        aiTags: ['overwhelmed', 'calm', 'walk'],
      });

      expect(result.title).toBe('Feeling Overwhelmed After Work');
      expect(result.body).toBe('Felt overwhelmed after work but calmed down after a walk'); // Full raw text preserved
    });

    it('should filter filler words from tags', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Felt overwhelmed after work but calmed down after a walk',
        aiTags: ['overwhelmed', 'calm', 'after', 'walk'], // 'after' is junk (in TAG_STOP_WORDS)
      });

      // filterAndNormalizeTags should remove 'after' (but NOT 'but' - not in TAG_STOP_WORDS)
      expect(result.tags).toEqual(['#overwhelmed', '#calm', '#walk']);
    });

    it('should preserve *journal marker in tags', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Had a great day at the park',
        aiTags: ['*journal', 'great', 'day', 'park'],
      });

      // *journal should be preserved (it's not in TAG_STOP_WORDS)
      expect(result.tags).toContain('*journal');
    });

    it('should compact long log titles', () => {
      const longText =
        'This is a very long journal entry that describes everything that happened today in great detail and goes on for many sentences';
      const result = buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: longText,
        aiTitle: undefined,
      });

      // Should be compacted to ~60 chars
      expect(result.title.length).toBeLessThanOrEqual(63);
      expect(result.body).toBe(longText); // Full text preserved in body
    });
  });

  describe('edge cases', () => {
    it('should handle empty aiTags array', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: 'Test task',
        aiTags: [],
      });

      expect(result.tags).toBeDefined();
      expect(Array.isArray(result.tags)).toBe(true);
    });

    it('should trim whitespace from rawText', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: '  Book haircut  \n',
        aiTitle: '  Haircut  ',
      });

      expect(result.title).toBe('Haircut');
      expect(result.body).toBe('Book haircut');
    });

    it('should handle multiline rawText', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'First line\nSecond line\nThird line',
      });

      expect(result.body).toBe('First line\nSecond line\nThird line');
      // Title should use first line if no aiTitle
      expect(result.title).toBe('First line');
    });

    it('should normalize tags (strip # and @ and preserve format)', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: 'Test',
        aiTags: ['#tag1', '@tag2', 'tag3'],
      });

      // filterAndNormalizeTags normalizes format - @ mentions are kept, # tags keep the #
      expect(result.tags).toContain('#tag1');
      expect(result.tags).toContain('@tag2');
      expect(result.tags).toContain('#tag3');
      expect(result.tags.length).toBe(3);
    });

    it('should lowercase and dedupe tags', () => {
      const result = buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText: 'Test',
        aiTags: ['Walk', 'WALK', 'walk', 'fitness'],
      });

      // Should dedupe to single 'walk'
      expect(result.tags).toEqual(['#walk', '#fitness']);
    });
  });
});
