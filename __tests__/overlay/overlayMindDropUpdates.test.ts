/**
 * Tests for overlay Mind Drop update flow using buildCanonicalFromMindDrop.
 * Verifies that editing Mind Drop items maintains canonical title/body/tags.
 */

import { buildCanonicalFromMindDrop } from '../../lib/minddrop/buildCanonicalFromMindDrop';

describe('Overlay Mind Drop Updates', () => {
  describe('Todo updates', () => {
    it('should use canonical mapper for editing haircut todo', async () => {
      const rawText = 'Book haircut tomorrow at 3pm';
      const aiTitle = 'Haircut appointment tomorrow';
      const aiTags = ['#haircut', '#appointment'];

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText,
        aiTitle,
        aiTags,
        existing: {
          origin: 'catchall',
          drop_id: 'test-drop-id',
        },
      });

      // Verify canonical fields are correct
      expect(canonical.canonicalType).toBe('todo');
      expect(canonical.title).toBe('Haircut appointment tomorrow');
      expect(canonical.name).toBe('Haircut appointment tomorrow');
      expect(canonical.body).toBe('Book haircut tomorrow at 3pm');
      expect(canonical.details).toBe('Book haircut tomorrow at 3pm');
      expect(canonical.tags).toEqual(['#haircut', '#appointment']);
      expect(canonical.labels).toEqual(['todo']);

      // Simulates overlay save path spreading canonical into update patch
      const updatePatch = {
        ...canonical,
        due_at: '2025-11-18T21:00:00.000Z',
        space_id: null,
        origin: 'catchall',
        commitment: false,
      };

      expect(updatePatch.title).toBe('Haircut appointment tomorrow');
      expect(updatePatch.body).toBe('Book haircut tomorrow at 3pm');
      expect(updatePatch.tags).toEqual(['#haircut', '#appointment']);
    });

    it('should preserve full raw text in body after title edit', async () => {
      const rawText = 'Book haircut tomorrow at 3pm';
      const newTitle = 'Haircut @ 3pm'; // User edited title

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText,
        aiTitle: newTitle,
        aiTags: ['#haircut'],
      });

      // Title updated, but full text preserved in body
      expect(canonical.title).toBe('Haircut @ 3pm');
      expect(canonical.body).toBe('Book haircut tomorrow at 3pm');
    });

    it('should clean tags when user adds junk words', async () => {
      const rawText = 'Book haircut tomorrow at 3pm';
      const userAddedTags = ['#haircut', '#tomorrow', '#at', '#3pm']; // 'tomorrow' and 'at' are junk

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText,
        aiTags: userAddedTags,
      });

      // Junk words filtered out
      expect(canonical.tags).toEqual(['#haircut', '#3pm']);
    });
  });

  describe('Habit updates', () => {
    it('should use canonical mapper for editing running habit', async () => {
      const rawText = 'Go for a 20-minute walk every morning';
      const aiTitle = 'Morning walk';
      const aiTags = ['#walk'];

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText,
        aiTitle,
        aiTags,
        existing: {
          origin: 'catchall',
          drop_id: 'test-drop-id',
        },
      });

      // Verify canonical fields
      expect(canonical.canonicalType).toBe('habit');
      expect(canonical.title).toBe('Morning walk');
      expect(canonical.name).toBe('Morning walk');
      expect(canonical.notes).toBe('Go for a 20-minute walk every morning');
      expect(canonical.tags).toEqual(['#walk']);
      expect(canonical.labels).toEqual(['habit']);
      expect(canonical.body).toBeUndefined(); // Habits don't have body

      // Simulates overlay save spreading canonical
      const updatePatch = {
        ...canonical,
        frequency: 'daily',
        space_id: null,
        origin: 'catchall',
      };

      expect(updatePatch.notes).toBe('Go for a 20-minute walk every morning');
      expect(updatePatch.tags).toEqual(['#walk']);
    });

    it('should preserve full sentence in notes after title edit', async () => {
      const rawText = 'Go for a 20-minute walk every morning';
      const newTitle = '20min morning walk'; // User edited

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText,
        aiTitle: newTitle,
        aiTags: ['#walk', '#fitness'],
      });

      // Title compacted, full text in notes
      expect(canonical.title).toBe('20min morning walk');
      expect(canonical.notes).toBe('Go for a 20-minute walk every morning');
    });

    it('should filter time-related junk from habit tags', async () => {
      const rawText = 'Go for a 20-minute walk every morning';
      const userTags = ['#walk', '#every', '#morning', '#minute']; // 'every', 'morning', 'minute' are junk

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText,
        aiTags: userTags,
      });

      // Only meaningful tag preserved
      expect(canonical.tags).toEqual(['#walk']);
    });
  });

  describe('Log updates', () => {
    it('should use canonical mapper for editing overwhelmed log', async () => {
      const rawText = 'Felt overwhelmed after work but calmed down after a walk';
      const aiTitle = 'Feeling Overwhelmed After Work';
      const aiTags = ['#overwhelmed', '#calm', '#walk'];

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText,
        aiTitle,
        aiTags,
        existing: {
          origin: 'catchall',
          drop_id: 'test-drop-id',
        },
      });

      // Verify canonical fields
      expect(canonical.canonicalType).toBe('log');
      expect(canonical.title).toBe('Feeling Overwhelmed After Work');
      expect(canonical.body).toBe('Felt overwhelmed after work but calmed down after a walk');
      expect(canonical.tags).toEqual(['#overwhelmed', '#calm', '#walk']);
      expect(canonical.labels).toEqual(['log']);
      expect(canonical.name).toBeUndefined(); // Logs don't have name
      expect(canonical.notes).toBeUndefined(); // Logs don't have notes

      // Simulates overlay save spreading canonical
      const updatePatch = {
        type: 'note' as const,
        subtype: 'catchall' as const,
        ...canonical,
        space_id: null,
        origin: 'catchall',
        mood: null,
      };

      expect(updatePatch.title).toBe('Feeling Overwhelmed After Work');
      expect(updatePatch.body).toBe('Felt overwhelmed after work but calmed down after a walk');
      expect(updatePatch.tags).toEqual(['#overwhelmed', '#calm', '#walk']);
    });

    it('should preserve full story in body with compact title', async () => {
      const rawText = 'Felt overwhelmed after work but calmed down after a walk';
      const compactTitle = 'Overwhelmed → Calm'; // User edited to shorter

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText,
        aiTitle: compactTitle,
        aiTags: ['#overwhelmed', '#calm'],
      });

      // Compact title, full story preserved
      expect(canonical.title).toBe('Overwhelmed → Calm');
      expect(canonical.body).toBe('Felt overwhelmed after work but calmed down after a walk');
    });

    it('should preserve emotion tags and filter filler words', async () => {
      const rawText = 'Felt overwhelmed after work but calmed down after a walk';
      const userTags = ['#overwhelmed', '#calm', '#after', '#walk']; // 'after' is junk

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText,
        aiTags: userTags,
      });

      // Emotion tags preserved, filler removed
      expect(canonical.tags).toEqual(['#overwhelmed', '#calm', '#walk']);
    });

    it('should preserve *journal marker in log tags', async () => {
      const rawText = 'Today was a wonderful day';
      const journalTags = ['*journal', '#wonderful', '#day']; // 'day' is junk but *journal preserved

      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText,
        aiTags: journalTags,
      });

      // *journal and meaningful tags preserved
      expect(canonical.tags).toContain('*journal');
      expect(canonical.tags).toContain('#wonderful');
      // 'day' filtered out by TAG_STOP_WORDS
    });
  });

  describe('Consistency across updates', () => {
    it('should return same structure for same Mind Drop text across all types', async () => {
      const rawText = 'Test Mind Drop sentence';

      const todoCanonical = await buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText,
      });

      const habitCanonical = await buildCanonicalFromMindDrop({
        kind: 'habit',
        rawText,
      });

      const logCanonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText,
      });

      // All should have same base fields
      expect(todoCanonical.canonicalType).toBe('todo');
      expect(habitCanonical.canonicalType).toBe('habit');
      expect(logCanonical.canonicalType).toBe('log');

      // All preserve raw text
      expect(todoCanonical.body).toBe(rawText);
      expect(habitCanonical.notes).toBe(rawText);
      expect(logCanonical.body).toBe(rawText);

      // All have proper labels
      expect(todoCanonical.labels).toEqual(['todo']);
      expect(habitCanonical.labels).toEqual(['habit']);
      expect(logCanonical.labels).toEqual(['log']);
    });
  });
});
