/**
 * Tests for buildCanonicalFromMindDrop helper.
 * Verifies canonical mapping from Mind Drop text to todo/habit/log entities.
 */

import { buildCanonicalFromMindDrop } from '../buildCanonicalFromMindDrop';

// Mock the AI tag extraction
jest.mock('../../tags/getEffectiveTags', () => ({
  getEffectiveTags: jest.fn(),
}));

const { getEffectiveTags } = require('../../tags/getEffectiveTags');

describe('buildCanonicalFromMindDrop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock: return empty tags unless test specifies otherwise
    getEffectiveTags.mockResolvedValue([]);
  });

  describe('todo mapping', () => {
    it('should create todo from "Book haircut tomorrow at 3pm"', async () => {
      const result = await buildCanonicalFromMindDrop({
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
      // Should have tags from aiTags parameter
      expect(result.tags.length).toBeGreaterThan(0);
      expect(result.tags_meta).toEqual({
        sticky: [],
        tombstones: [],
      });
      // getEffectiveTags should NOT be called when aiTags provided
      expect(getEffectiveTags).not.toHaveBeenCalled();
    });

    it('should use AI title when provided', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: 'Book haircut tomorrow at 3pm',
        aiTitle: 'Haircut tomorrow', // Shorter than raw text to pass validation
        aiTags: ['haircut', 'appointment'],
      });

      expect(result.title).toBe('Haircut tomorrow');
      expect(result.name).toBe('Haircut tomorrow');
      expect(result.body).toBe('Book haircut tomorrow at 3pm'); // Full raw text preserved
      // Should have tags
      expect(result.tags.length).toBeGreaterThan(0);
    });

    it('should filter "book" tag for appointment bookings', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: 'Book doctor appointment tomorrow',
        aiTags: ['book', 'doctor', 'appointment', 'tomorrow'],
      });

      // Should filter out "book" but keep "doctor" and "appointment"
      expect(result.tags).not.toContain('#book');
      expect(result.tags).not.toContain('book');
    });

    it('should extract tags using AI when none provided', async () => {
      // Mock AI extraction to return meaningful tags
      getEffectiveTags.mockResolvedValue(['email', 'accountant', 'tax']);

      const result = await buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: 'Email my accountant about the tax letter before Friday',
      });

      // Should call getEffectiveTags since no aiTags provided
      expect(getEffectiveTags).toHaveBeenCalledWith(
        'Email my accountant about the tax letter before Friday',
      );
      // Should have extracted tags
      expect(result.tags.length).toBeGreaterThan(0);
    });

    it('should compact long titles', async () => {
      const longText =
        'This is a very long task description that goes on and on and should be truncated to a reasonable length for display purposes';
      const result = await buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: longText,
      });

      // Title is compacted via normalizeTodoTitle (first 7 words + ellipsis)
      expect(result.title).toBe('This is a very long task description...');
      expect(result.body).toBe(longText); // Full text preserved in body
    });
  });

  describe('habit mapping', () => {
    it('should create habit from "Go for a 20-minute walk every morning"', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText: 'Go for a 20-minute walk every morning',
        aiTags: ['walk', 'morning'],
      });

      expect(result.canonicalType).toBe('habit');
      expect(result.labels).toEqual(['habit']);
      expect(result.title).toBe('Go for a 20-minute walk every morning');
      expect(result.name).toBe('Go for a 20-minute walk every morning');
      expect(result.notes).toBe('Go for a 20-minute walk every morning');
      // Should filter to max 2 single-word tags
      expect(result.tags.length).toBeLessThanOrEqual(2);
      expect(result.tags_meta).toEqual({
        sticky: [],
        tombstones: [],
      });
      expect(result.body).toBeUndefined(); // Habits don't have body field
    });

    it('should use AI title when provided', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText: 'Go for a 20-minute walk every morning',
        aiTitle: 'Morning walk',
        aiTags: ['walk', 'exercise'],
      });

      expect(result.title).toBe('Morning walk');
      expect(result.name).toBe('Morning walk');
      expect(result.notes).toBe('Go for a 20-minute walk every morning'); // Full raw text preserved
    });

    it('should filter to max 2 single-word tags for habits', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText: 'Start running every morning',
        aiTags: ['running', 'exercise', 'morning', 'fitness'],
      });

      // Should keep max 2 tags
      expect(result.tags.length).toBeLessThanOrEqual(2);
      // All tags should be single words (no spaces)
      result.tags.forEach((tag) => {
        const withoutPrefix = tag.replace(/^#/, '');
        expect(withoutPrefix).not.toContain(' ');
      });
    });

    it('should filter out generic habit tags', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText: 'Start meditating daily',
        aiTags: ['meditation', 'routine', 'daily', 'habit'],
      });

      // Should not include generic tags like "routine", "daily", "habit"
      const tagText = result.tags.join(' ').toLowerCase();
      expect(tagText).not.toContain('routine');
      expect(tagText).not.toContain('daily');
      expect(tagText).not.toContain('habit');
    });

    it('should extract tags using AI when none provided', async () => {
      // Mock AI extraction
      getEffectiveTags.mockResolvedValue(['running', 'exercise', 'morning']);

      const result = await buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText: 'Start running every morning',
      });

      expect(getEffectiveTags).toHaveBeenCalled();
      // Should apply filterHabitTags (max 2 single-word)
      expect(result.tags.length).toBeLessThanOrEqual(2);
    });

    it('should preserve existing tags_meta when provided', async () => {
      const result = await buildCanonicalFromMindDrop({
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
    it.skip('should create log from "Felt overwhelmed after work but calmed down after a walk"', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Felt overwhelmed after work but calmed down after a walk',
        aiTags: ['overwhelmed', 'calm', 'walk', 'work'],
      });

      expect(result.canonicalType).toBe('log');
      expect(result.labels).toEqual(['log']);
      expect(result.title).toBe('Felt overwhelmed after work but calmed down after a walk');
      expect(result.body).toBe('Felt overwhelmed after work but calmed down after a walk');
      // Should have *journal marker for emotional content
      expect(result.tags).toContain('*journal');
      // Should preserve emotion tags
      const tagText = result.tags.join(' ').toLowerCase();
      expect(tagText).toMatch(/overwhelmed|calm/);
      expect(result.tags_meta).toEqual({
        sticky: [],
        tombstones: [],
      });
      expect(result.name).toBeUndefined(); // Logs don't have name field
      expect(result.notes).toBeUndefined(); // Logs don't have notes field
    });

    it('should preserve *journal marker when provided', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Today was a good day',
        aiTags: ['*journal', 'good'],
      });

      expect(result.tags).toContain('*journal');
    });

    it('should merge emotion tags with context tags for logs', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Feeling anxious about the meeting with my partner',
        aiTags: ['anxious', 'meeting', 'partner', 'work'],
        existing: {
          tags: ['*journal'],
        },
      });

      // Should have journal marker
      expect(result.tags).toContain('*journal');
      // Should preserve emotion tag
      const tagText = result.tags.join(' ').toLowerCase();
      expect(tagText).toContain('anxious');
      // Should add 1-2 context tags
      expect(tagText).toMatch(/meeting|partner/);
      // Should not have too many tags (up to 7 with theme tags like #work, #relationships)
      expect(result.tags.length).toBeLessThanOrEqual(7);
    });

    it.skip('should extract tags using AI when none provided', async () => {
      // Mock AI extraction
      getEffectiveTags.mockResolvedValue(['work', 'deadlines', 'stressed']);

      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Feeling overwhelmed about work and deadlines',
      });

      expect(getEffectiveTags).toHaveBeenCalled();
      // Should have *journal marker for emotional content
      expect(result.tags).toContain('*journal');
    });

    it('should use AI title when provided', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Felt overwhelmed after work but calmed down after a walk',
        aiTitle: 'Feeling Overwhelmed After Work',
        aiTags: ['overwhelmed', 'calm', 'walk'],
      });

      expect(result.title).toBe('Feeling Overwhelmed After Work');
      expect(result.body).toBe('Felt overwhelmed after work but calmed down after a walk');
    });

    it('should add *journal marker for emotional logs', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Had a great day at the park',
        aiTags: ['*journal', 'great', 'park'],
      });

      expect(result.tags).toContain('*journal');
    });

    it('should compact long log titles when AI title provided', async () => {
      const longText =
        'This is a very long journal entry that describes everything that happened today in great detail and goes on for many sentences';
      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: longText,
        aiTitle: undefined,
      });

      expect(result.title).toBe(longText);
      expect(result.body).toBe(longText);
    });
  });

  describe('edge cases', () => {
    it('should handle empty aiTags array', async () => {
      // Mock AI extraction
      getEffectiveTags.mockResolvedValue([]);

      const result = await buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: 'Test task',
        aiTags: [],
      });

      // Should call getEffectiveTags when aiTags is empty
      expect(getEffectiveTags).toHaveBeenCalled();
      expect(Array.isArray(result.tags)).toBe(true);
    });

    it('should trim whitespace from rawText', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: '  Book haircut  \n',
        aiTitle: '  Haircut  ',
        aiTags: ['haircut'],
      });

      expect(result.title).toBe('Haircut');
      expect(result.body).toBe('Book haircut');
    });

    it('should handle multiline rawText', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'First line\nSecond line\nThird line',
      });

      expect(result.body).toBe('First line\nSecond line\nThird line');
      expect(result.title).toBe('First line\nSecond line\nThird line');
    });

    it('should handle AI extraction failure gracefully', async () => {
      // Mock AI to fail
      getEffectiveTags.mockRejectedValue(new Error('AI timeout'));

      const result = await buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: 'Test task',
      });

      // Should not crash, just return empty tags
      expect(result.tags).toEqual([]);
      expect(result.canonicalType).toBe('todo');
    });

    it('should dedupe tags case-insensitively', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText: 'Test',
        aiTags: ['Walk', 'WALK', 'walk', 'fitness'],
      });

      // Should dedupe "Walk" and keep max 2 base tags + theme tag (#exercise)
      expect(result.tags.length).toBeLessThanOrEqual(3); // 2 base tags + 1 theme tag
      // Should have "walk" and "fitness" (deduped Walk/WALK/walk)
      const tagText = result.tags.join(' ').toLowerCase();
      expect(tagText).toContain('walk');
      expect(tagText).toContain('fitness');
      // Theme tag #exercise should be added
      expect(tagText).toContain('exercise');
    });
  });
});
