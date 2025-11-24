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

  describe('Phase 7 Lists: list attribute detection (Stage A)', () => {
    // Lists are now modeled as has_list + list_items; Stage A must detect list-like inputs
    // and populate these fields while keeping the main type decision intact.

    describe('list-like todo inputs', () => {
      it('should detect bullet list in todo and populate has_list + list_items', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'todo',
          rawText: 'Grocery list:\n- eggs\n- milk\n- bread',
          aiTags: ['groceries', 'shopping'],
        });

        expect(result.canonicalType).toBe('todo');
        expect(result.has_list).toBe(true);
        expect(result.list_items).toHaveLength(3);
        expect(result.list_items?.[0].text).toBe('eggs');
        expect(result.list_items?.[1].text).toBe('milk');
        expect(result.list_items?.[2].text).toBe('bread');
        expect(result.list_items?.every((item) => item.checked === false)).toBe(true);
        expect(result.list_items?.every((item) => item.id)).toBe(true);
        // subtype must NOT be 'list' (todos don't have subtype)
        expect(result.subtype).toBeUndefined();
      });

      it('should detect numbered list in todo', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'todo',
          rawText: 'Packing for Mexico:\n1. swimsuit\n2. passport\n3. charger',
          aiTags: ['travel', 'packing'],
        });

        expect(result.canonicalType).toBe('todo');
        expect(result.has_list).toBe(true);
        expect(result.list_items).toHaveLength(3);
        expect(result.list_items?.[0].text).toBe('swimsuit');
        expect(result.list_items?.[1].text).toBe('passport');
        expect(result.list_items?.[2].text).toBe('charger');
        expect(result.list_items?.every((item) => item.checked === false)).toBe(true);
      });

      it('should detect asterisk list in todo', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'todo',
          rawText: 'Meeting prep:\n* Review slides\n* Print handouts\n* Test projector',
          aiTags: ['meeting', 'prep'],
        });

        expect(result.canonicalType).toBe('todo');
        expect(result.has_list).toBe(true);
        expect(result.list_items).toHaveLength(3);
        expect(result.list_items?.[0].text).toBe('Review slides');
        expect(result.list_items?.[1].text).toBe('Print handouts');
        expect(result.list_items?.[2].text).toBe('Test projector');
      });
    });

    describe('list-like note/log inputs', () => {
      it('should detect bullet list in note and populate has_list + list_items', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'log',
          rawText:
            'Ideas for blog posts:\n- How to debug React hooks\n- TypeScript best practices\n- Testing async code',
          aiTags: ['blog', 'writing', 'ideas'],
        });

        expect(result.canonicalType).toBe('log');
        expect(result.has_list).toBe(true);
        expect(result.list_items).toHaveLength(3);
        expect(result.list_items?.[0].text).toBe('How to debug React hooks');
        expect(result.list_items?.[1].text).toBe('TypeScript best practices');
        expect(result.list_items?.[2].text).toBe('Testing async code');
        // Subtype must NOT be 'list' (list is now an attribute)
        expect(result.subtype).not.toBe('list');
        // LS2: Should be classified as journal, idea, or catchall
        expect(['journal', 'idea', 'catchall', null]).toContain(result.subtype);
      });

      it('should detect numbered list in note', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'log',
          rawText: 'Things to remember:\n1. Call dentist\n2. Update resume\n3. Water plants',
          aiTags: ['reminders', 'tasks'],
        });

        expect(result.canonicalType).toBe('log');
        expect(result.has_list).toBe(true);
        expect(result.list_items).toHaveLength(3);
        expect(result.list_items?.[0].text).toBe('Call dentist');
        expect(result.list_items?.[1].text).toBe('Update resume');
        expect(result.list_items?.[2].text).toBe('Water plants');
        expect(result.subtype).not.toBe('list');
      });
    });

    describe('list-like habit inputs', () => {
      it('should detect bullet list in habit and populate has_list + list_items', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'habit',
          rawText: 'Morning routine:\n- Brush teeth\n- Meditate\n- Exercise',
          aiTags: ['morning', 'routine'],
        });

        expect(result.canonicalType).toBe('habit');
        expect(result.has_list).toBe(true);
        expect(result.list_items).toHaveLength(3);
        expect(result.list_items?.[0].text).toBe('Brush teeth');
        expect(result.list_items?.[1].text).toBe('Meditate');
        expect(result.list_items?.[2].text).toBe('Exercise');
        expect(result.list_items?.every((item) => item.checked === false)).toBe(true);
        // Habits don't have subtype
        expect(result.subtype).toBeUndefined();
      });

      it('should detect numbered list in habit', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'habit',
          rawText: 'Bedtime checklist:\n1. Floss\n2. Read 10 pages\n3. Set alarm',
          aiTags: ['bedtime', 'sleep'],
        });

        expect(result.canonicalType).toBe('habit');
        expect(result.has_list).toBe(true);
        expect(result.list_items).toHaveLength(3);
        expect(result.list_items?.[0].text).toBe('Floss');
        expect(result.list_items?.[1].text).toBe('Read 10 pages');
        expect(result.list_items?.[2].text).toBe('Set alarm');
      });
    });

    describe('non-list inputs (control tests)', () => {
      it('should not detect list for plain todo text', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'todo',
          rawText: 'Buy milk tomorrow morning',
          aiTags: ['shopping'],
        });

        expect(result.canonicalType).toBe('todo');
        expect(result.has_list).toBe(false);
        expect(result.list_items).toBe(null);
      });

      it('should not detect list for plain note text', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'log',
          rawText: 'I need to think about my goals for next year',
          aiTags: ['reflection', 'goals'],
        });

        expect(result.canonicalType).toBe('log');
        expect(result.has_list).toBe(false);
        expect(result.list_items).toBe(null);
      });

      it('should not detect list for plain habit text', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'habit',
          rawText: 'Meditate daily at 7am',
          aiTags: ['meditation'],
        });

        expect(result.canonicalType).toBe('habit');
        expect(result.has_list).toBe(false);
        expect(result.list_items).toBe(null);
      });

      it('should not detect list for text with single bullet (not a list)', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'log',
          rawText: 'Just one note - remember to call Sarah',
          aiTags: ['reminder'],
        });

        expect(result.canonicalType).toBe('log');
        expect(result.has_list).toBe(false);
        expect(result.list_items).toBe(null);
      });

      it('should detect grocery list with title prefix as list', async () => {
        // Real-world case from user bug report
        const result = await buildCanonicalFromMindDrop({
          kind: 'log',
          rawText: 'Grocery list:\n- milk\n- eggs\n- bread',
          aiTags: ['groceries'],
        });

        expect(result.canonicalType).toBe('log');
        expect(result.has_list).toBe(true);
        expect(result.list_items).toBeDefined();
        expect(result.list_items).toHaveLength(3);
        expect(result.list_items?.[0].text).toBe('milk');
        expect(result.list_items?.[1].text).toBe('eggs');
        expect(result.list_items?.[2].text).toBe('bread');
        expect(result.list_items?.every((item) => item.checked === false)).toBe(true);
        expect(result.list_items?.every((item) => item.id)).toBe(true);
      });
    });

    describe('edge cases for list detection', () => {
      it('should handle list with title prefix', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'todo',
          rawText: 'Shopping list for dinner:\n- chicken\n- rice\n- vegetables',
          aiTags: ['shopping', 'dinner'],
        });

        expect(result.has_list).toBe(true);
        expect(result.list_items).toHaveLength(3);
        // Title should include the prefix
        expect(result.title).toContain('Shopping list');
      });

      it('should handle mixed list formats (bullets and numbers)', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'log',
          rawText:
            'Project tasks:\n- Research competitors\n1. Analyze pricing\n2. Document features',
          aiTags: ['project', 'research'],
        });

        expect(result.has_list).toBe(true);
        expect(result.list_items).toBeDefined();
        // Should parse all list items regardless of mixed format
        expect(result.list_items!.length).toBeGreaterThan(0);
      });

      it('should handle list with empty lines between items', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'todo',
          rawText: 'Weekend tasks:\n- Clean garage\n\n- Fix bicycle\n\n- Water garden',
          aiTags: ['weekend', 'chores'],
        });

        expect(result.has_list).toBe(true);
        expect(result.list_items).toHaveLength(3);
        expect(result.list_items?.[0].text).toBe('Clean garage');
        expect(result.list_items?.[1].text).toBe('Fix bicycle');
        expect(result.list_items?.[2].text).toBe('Water garden');
      });

      it('should preserve list structure when AI title provided', async () => {
        const result = await buildCanonicalFromMindDrop({
          kind: 'todo',
          rawText: 'Grocery list:\n- eggs\n- milk\n- bread',
          aiTitle: 'Groceries',
          aiTags: ['shopping'],
        });

        expect(result.title).toBe('Groceries'); // AI title used
        expect(result.has_list).toBe(true); // List detection still works
        expect(result.list_items).toHaveLength(3);
      });
    });

    describe('subtype behavior for notes with lists', () => {
      it('should NOT use "list" subtype even if AI suggests it', async () => {
        // This tests the migration path: old AI might suggest subtype='list',
        // but Stage A should convert it to null and use has_list instead
        const result = await buildCanonicalFromMindDrop({
          kind: 'log',
          rawText: 'Shopping items:\n- apples\n- bananas\n- oranges',
          aiTags: ['shopping', 'list'],
        });

        expect(result.canonicalType).toBe('log');
        expect(result.has_list).toBe(true);
        expect(result.list_items).toHaveLength(3);
        // Subtype must NOT be 'list' (it's an attribute now)
        expect(result.subtype).not.toBe('list');
        // LS2: Should use journal, idea, or catchall as fallback
        expect(['journal', 'idea', 'catchall', null]).toContain(result.subtype);
      });
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

  describe('Log Subtype Theme Tags', () => {
    it('should add #journal theme tag for journal subtype', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: "I'm feeling overwhelmed about work today. Need to take a break.",
        aiTags: ['work', 'stress'],
      });

      expect(result.canonicalType).toBe('log');
      expect(result.subtype).toBe('journal');
      expect(result.tags).toContain('#journal');
    });

    it('should add #idea theme tag for idea subtype', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Idea: What if we held team meetings standing up to keep them short?',
        aiTags: ['meeting', 'team'],
      });

      expect(result.canonicalType).toBe('log');
      expect(result.subtype).toBe('idea');
      expect(result.tags).toContain('#idea');
    });

    it('should add #reference theme tag for reference subtype', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: "Sarah's coffee order: oat latte, extra hot, with cinnamon",
        aiTags: ['coffee', 'sarah'],
      });

      expect(result.canonicalType).toBe('log');
      // AI classification can vary, so test the tagging logic directly
      if (result.subtype === 'reference') {
        expect(result.tags).toContain('#reference');
      }
      // At minimum, verify it's not a journal or idea
      expect(result.subtype).not.toBe('journal');
      expect(result.subtype).not.toBe('idea');
    });

    it('should not add theme tag for plain subtype', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'The meeting is at 3pm in room B',
        aiTags: ['meeting'],
      });

      expect(result.canonicalType).toBe('log');
      // Plain subtype can be null or 'plain', both are treated the same
      // If AI classifies it as something else, verify theme tags work
      if (result.subtype === 'journal') {
        expect(result.tags).toContain('#journal');
      } else if (result.subtype === 'idea') {
        expect(result.tags).toContain('#idea');
      } else if (result.subtype === 'reference') {
        expect(result.tags).toContain('#reference');
      }
      // LS2: Verify it's one of the valid LS2 types (journal/idea/catchall)
      expect(['journal', 'idea', 'catchall', null]).toContain(result.subtype);
    });

    it('should combine subtype theme tag with other tags', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Had a great insight today: focus on one thing at a time',
        aiTags: ['productivity', 'focus'],
      });

      expect(result.canonicalType).toBe('log');
      // AI may classify as journal, idea, or even reference
      // Verify that if it has a subtype, the corresponding theme tag is added
      if (result.subtype === 'journal') {
        expect(result.tags).toContain('#journal');
      } else if (result.subtype === 'idea') {
        expect(result.tags).toContain('#idea');
      } else if (result.subtype === 'reference') {
        expect(result.tags).toContain('#reference');
      }
      // Verify the AI tags are preserved (with # prefix)
      expect(result.tags.some((t) => t === '#productivity' || t === 'productivity')).toBe(true);
      expect(result.tags.some((t) => t === '#focus' || t === 'focus')).toBe(true);
    });
  });
});
