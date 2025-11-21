/**
 * Tests for Habit Tag Replacement Logic
 *
 * When habits are created from Mind Drop with generic tags like #doing or #habit,
 * the AI tag override should replace them with meaningful activity tags.
 *
 * Example: "Start doing 15 minutes of yoga every morning" with tag #doing
 * should become tags like #yoga #exercise when AI suggestions arrive.
 */

import React from 'react';

// Mock the helper functions that would be in UnifiedOverlayV2.tsx
// In the actual implementation, these are internal functions

/**
 * Generic/placeholder tags that AI creates when it can't extract meaningful habits.
 */
const GENERIC_HABIT_TAGS = new Set([
  'doing',
  'habit',
  'routine',
  'task',
  'activity',
  'action',
  'daily',
  'practice',
]);

/**
 * Check if a tag list contains ONLY generic/placeholder habit tags.
 */
function hasOnlyGenericHabitTags(tags: string[]): boolean {
  if (!tags || tags.length === 0) return true;

  const normalizedTags = tags.map((tag) =>
    tag
      .trim()
      .toLowerCase()
      .replace(/^[#@*]/, ''),
  );

  return normalizedTags.every((tag) => GENERIC_HABIT_TAGS.has(tag));
}

/**
 * Filter habit tags to keep only single-word, concrete activity tags (max 2).
 */
function filterHabitTags(tags: string[]): string[] {
  if (!tags || tags.length === 0) return [];

  const singleWordTags = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => {
      if (tag.includes(' ')) return false;
      if (!tag) return false;
      return true;
    });

  return singleWordTags.slice(0, 2);
}

describe('Habit Tag Replacement Logic', () => {
  describe('hasOnlyGenericHabitTags', () => {
    it('should return true for empty tag array', () => {
      expect(hasOnlyGenericHabitTags([])).toBe(true);
    });

    it('should return true for single generic tag "doing"', () => {
      expect(hasOnlyGenericHabitTags(['doing'])).toBe(true);
    });

    it('should return true for single generic tag "habit"', () => {
      expect(hasOnlyGenericHabitTags(['habit'])).toBe(true);
    });

    it('should return true for multiple generic tags', () => {
      expect(hasOnlyGenericHabitTags(['doing', 'habit', 'routine'])).toBe(true);
    });

    it('should return true for generic tags with prefixes', () => {
      expect(hasOnlyGenericHabitTags(['#doing', '@habit', '*routine'])).toBe(true);
    });

    it('should return false for specific activity tag "yoga"', () => {
      expect(hasOnlyGenericHabitTags(['yoga'])).toBe(false);
    });

    it('should return false for specific activity tag "exercise"', () => {
      expect(hasOnlyGenericHabitTags(['exercise'])).toBe(false);
    });

    it('should return false for mixed generic and specific tags', () => {
      expect(hasOnlyGenericHabitTags(['doing', 'yoga'])).toBe(false);
    });

    it('should return false for specific tags only', () => {
      expect(hasOnlyGenericHabitTags(['yoga', 'exercise'])).toBe(false);
    });

    it('should handle case-insensitive matching', () => {
      expect(hasOnlyGenericHabitTags(['DOING', 'Habit', 'RoUtInE'])).toBe(true);
    });

    it('should handle whitespace in tags', () => {
      expect(hasOnlyGenericHabitTags(['  doing  ', '  habit  '])).toBe(true);
    });
  });

  describe('Habit Tag Replacement Scenarios', () => {
    it('should replace generic "doing" tag with specific AI tags', () => {
      const currentTags = ['doing'];
      const aiTags = ['yoga', 'morning routine', 'exercise', 'mindfulness'];
      const hasOnlyGeneric = hasOnlyGenericHabitTags(currentTags);

      expect(hasOnlyGeneric).toBe(true);

      const finalTags = hasOnlyGeneric ? filterHabitTags(aiTags) : currentTags;

      expect(finalTags).toEqual(['yoga', 'exercise']);
      expect(finalTags).not.toContain('doing');
      expect(finalTags).not.toContain('morning routine'); // filtered out (multi-word)
    });

    it('should replace generic "habit" tag with specific AI tags', () => {
      const currentTags = ['habit'];
      const aiTags = ['meditation', 'breathing', 'wellness'];
      const hasOnlyGeneric = hasOnlyGenericHabitTags(currentTags);

      expect(hasOnlyGeneric).toBe(true);

      const finalTags = hasOnlyGeneric ? filterHabitTags(aiTags) : currentTags;

      expect(finalTags).toEqual(['meditation', 'breathing']);
      expect(finalTags).not.toContain('habit');
    });

    it('should replace multiple generic tags with AI tags', () => {
      const currentTags = ['doing', 'routine', 'daily'];
      const aiTags = ['running', 'cardio', 'fitness'];
      const hasOnlyGeneric = hasOnlyGenericHabitTags(currentTags);

      expect(hasOnlyGeneric).toBe(true);

      const finalTags = hasOnlyGeneric ? filterHabitTags(aiTags) : currentTags;

      expect(finalTags).toEqual(['running', 'cardio']);
    });

    it('should keep existing specific tags (not replace)', () => {
      const currentTags = ['yoga', 'stretching'];
      const aiTags = ['exercise', 'morning', 'wellness'];
      const hasOnlyGeneric = hasOnlyGenericHabitTags(currentTags);

      expect(hasOnlyGeneric).toBe(false);

      const finalTags = hasOnlyGeneric ? filterHabitTags(aiTags) : currentTags;

      expect(finalTags).toEqual(['yoga', 'stretching']);
      expect(finalTags).not.toContain('exercise');
    });

    it('should keep mixed tags if any are specific', () => {
      const currentTags = ['doing', 'yoga'];
      const aiTags = ['exercise', 'wellness'];
      const hasOnlyGeneric = hasOnlyGenericHabitTags(currentTags);

      expect(hasOnlyGeneric).toBe(false);

      const finalTags = hasOnlyGeneric ? filterHabitTags(aiTags) : currentTags;

      expect(finalTags).toEqual(['doing', 'yoga']);
    });

    it('should handle empty AI tags gracefully', () => {
      const currentTags = ['doing'];
      const aiTags: string[] = [];
      const hasOnlyGeneric = hasOnlyGenericHabitTags(currentTags);

      expect(hasOnlyGeneric).toBe(true);

      const finalTags = hasOnlyGeneric ? filterHabitTags(aiTags) : currentTags;

      expect(finalTags).toEqual([]);
    });

    it('should filter multi-word AI tags even when replacing', () => {
      const currentTags = ['habit'];
      const aiTags = ['yoga practice', 'morning routine', 'exercise'];
      const hasOnlyGeneric = hasOnlyGenericHabitTags(currentTags);

      expect(hasOnlyGeneric).toBe(true);

      const finalTags = hasOnlyGeneric ? filterHabitTags(aiTags) : currentTags;

      expect(finalTags).toEqual(['exercise']);
      expect(finalTags).not.toContain('yoga practice');
      expect(finalTags).not.toContain('morning routine');
    });

    it('should limit replacement tags to max 2', () => {
      const currentTags = ['doing'];
      const aiTags = ['yoga', 'meditation', 'exercise', 'stretching', 'breathing'];
      const hasOnlyGeneric = hasOnlyGenericHabitTags(currentTags);

      expect(hasOnlyGeneric).toBe(true);

      const finalTags = hasOnlyGeneric ? filterHabitTags(aiTags) : currentTags;

      expect(finalTags).toEqual(['yoga', 'meditation']);
      expect(finalTags.length).toBe(2);
    });

    it('should handle real-world yoga example', () => {
      // Text: "Start doing 15 minutes of yoga every morning"
      // Initial AI creates generic tag: #doing
      // Better AI should suggest: yoga, exercise, morning routine, wellness
      const currentTags = ['doing'];
      const aiTags = ['yoga', 'morning routine', 'exercise', 'wellness'];
      const hasOnlyGeneric = hasOnlyGenericHabitTags(currentTags);

      expect(hasOnlyGeneric).toBe(true);

      const finalTags = hasOnlyGeneric ? filterHabitTags(aiTags) : currentTags;

      expect(finalTags).toEqual(['yoga', 'exercise']);
      expect(finalTags).toContain('yoga');
      expect(finalTags).toContain('exercise');
      expect(finalTags).not.toContain('doing');
    });
  });

  describe('Generic Tag Detection Edge Cases', () => {
    it('should treat "task" as generic', () => {
      expect(hasOnlyGenericHabitTags(['task'])).toBe(true);
    });

    it('should treat "activity" as generic', () => {
      expect(hasOnlyGenericHabitTags(['activity'])).toBe(true);
    });

    it('should treat "action" as generic', () => {
      expect(hasOnlyGenericHabitTags(['action'])).toBe(true);
    });

    it('should treat "practice" as generic', () => {
      expect(hasOnlyGenericHabitTags(['practice'])).toBe(true);
    });

    it('should not treat "yoga" as generic', () => {
      expect(hasOnlyGenericHabitTags(['yoga'])).toBe(false);
    });

    it('should not treat "meditation" as generic', () => {
      expect(hasOnlyGenericHabitTags(['meditation'])).toBe(false);
    });

    it('should not treat "running" as generic', () => {
      expect(hasOnlyGenericHabitTags(['running'])).toBe(false);
    });

    it('should not treat "reading" as generic', () => {
      expect(hasOnlyGenericHabitTags(['reading'])).toBe(false);
    });

    it('should handle all generic tags at once', () => {
      const allGeneric = [
        'doing',
        'habit',
        'routine',
        'task',
        'activity',
        'action',
        'daily',
        'practice',
      ];
      expect(hasOnlyGenericHabitTags(allGeneric)).toBe(true);
    });

    it('should return false if even one tag is specific', () => {
      const mostlyGeneric = ['doing', 'habit', 'routine', 'yoga'];
      expect(hasOnlyGenericHabitTags(mostlyGeneric)).toBe(false);
    });
  });
});
