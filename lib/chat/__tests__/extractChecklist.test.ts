/**
 * Unit tests for extractChecklist helper functions
 *
 * Tests the bullet parsing and checklist conversion utilities
 * used to convert plain notes to interactive checklists.
 */

import {
  contentHasBullets,
  extractChecklistFromContent,
  toChecklistItems,
  convertContentToChecklist,
} from '../extractChecklist';

describe('extractChecklist', () => {
  describe('contentHasBullets', () => {
    it('returns true for content with dash bullets', () => {
      expect(contentHasBullets('- Item one\n- Item two')).toBe(true);
    });

    it('returns true for content with asterisk bullets', () => {
      expect(contentHasBullets('* First\n* Second')).toBe(true);
    });

    it('returns true for content with bullet point character', () => {
      expect(contentHasBullets('• Point one\n• Point two')).toBe(true);
    });

    it('returns true for single bullet in longer content', () => {
      const content = `Here is some intro text.

- Just one bullet point

And some closing text.`;
      expect(contentHasBullets(content)).toBe(true);
    });

    it('returns false for content without bullets', () => {
      expect(contentHasBullets('Just regular text here')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(contentHasBullets('')).toBe(false);
    });

    it('returns false for null', () => {
      expect(contentHasBullets(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(contentHasBullets(undefined)).toBe(false);
    });

    it('returns false for dash without space (not a bullet)', () => {
      expect(contentHasBullets('-no space')).toBe(false);
    });
  });

  describe('extractChecklistFromContent', () => {
    it('extracts simple bullet list', () => {
      const content = `- First item
- Second item
- Third item`;

      const result = extractChecklistFromContent(content);

      expect(result.hasBullets).toBe(true);
      expect(result.items).toEqual(['First item', 'Second item', 'Third item']);
      expect(result.preamble).toBeNull();
      expect(result.postamble).toBeNull();
    });

    it('extracts preamble before bullets', () => {
      const content = `Here are some suggestions:

- Item one
- Item two`;

      const result = extractChecklistFromContent(content);

      expect(result.hasBullets).toBe(true);
      expect(result.preamble).toBe('Here are some suggestions:');
      expect(result.items).toEqual(['Item one', 'Item two']);
      expect(result.postamble).toBeNull();
    });

    it('extracts postamble after bullets', () => {
      const content = `- Step one
- Step two

Remember to take breaks!`;

      const result = extractChecklistFromContent(content);

      expect(result.hasBullets).toBe(true);
      expect(result.preamble).toBeNull();
      expect(result.items).toEqual(['Step one', 'Step two']);
      expect(result.postamble).toBe('Remember to take breaks!');
    });

    it('extracts both preamble and postamble', () => {
      const content = `Here are ways to stay consistent:

- Start with just 5 minutes
- Pick the same time daily
- Track your streak

Remember, consistency beats intensity!`;

      const result = extractChecklistFromContent(content);

      expect(result.hasBullets).toBe(true);
      expect(result.preamble).toBe('Here are ways to stay consistent:');
      expect(result.items).toEqual([
        'Start with just 5 minutes',
        'Pick the same time daily',
        'Track your streak',
      ]);
      expect(result.postamble).toBe('Remember, consistency beats intensity!');
    });

    it('handles different bullet characters', () => {
      const content = `• Bullet point
* Asterisk
- Dash`;

      const result = extractChecklistFromContent(content);

      expect(result.hasBullets).toBe(true);
      expect(result.items).toEqual(['Bullet point', 'Asterisk', 'Dash']);
    });

    it('handles indented bullets', () => {
      const content = `  - Indented item
    - More indented`;

      const result = extractChecklistFromContent(content);

      expect(result.hasBullets).toBe(true);
      expect(result.items).toEqual(['Indented item', 'More indented']);
    });

    it('returns content as preamble when no bullets found', () => {
      const content = 'Just plain text without any bullets';

      const result = extractChecklistFromContent(content);

      expect(result.hasBullets).toBe(false);
      expect(result.items).toEqual([]);
      // Content without bullets goes entirely to preamble
      expect(result.preamble).toBe('Just plain text without any bullets');
      expect(result.postamble).toBeNull();
    });

    it('returns empty result for null content', () => {
      const result = extractChecklistFromContent(null);

      expect(result.hasBullets).toBe(false);
      expect(result.items).toEqual([]);
    });

    it('returns empty result for undefined content', () => {
      const result = extractChecklistFromContent(undefined);

      expect(result.hasBullets).toBe(false);
      expect(result.items).toEqual([]);
    });

    it('trims whitespace from preamble and postamble', () => {
      const content = `

  Some intro text  

- Item

  Some closing text  

`;

      const result = extractChecklistFromContent(content);

      expect(result.preamble).toBe('Some intro text');
      expect(result.postamble).toBe('Some closing text');
    });
  });

  describe('toChecklistItems', () => {
    it('converts string array to checklist items with unique IDs', () => {
      const items = ['First', 'Second', 'Third'];

      const result = toChecklistItems(items);

      expect(result).toHaveLength(3);
      expect(result[0].label).toBe('First');
      expect(result[0].completed).toBe(false);
      expect(result[1].label).toBe('Second');
      expect(result[2].label).toBe('Third');
    });

    it('generates unique IDs for each item', () => {
      const items = ['A', 'B', 'C'];

      const result = toChecklistItems(items);

      const ids = result.map((item) => item.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it('returns empty array for empty input', () => {
      const result = toChecklistItems([]);
      expect(result).toEqual([]);
    });

    it('all items start as not completed', () => {
      const items = ['Task 1', 'Task 2'];

      const result = toChecklistItems(items);

      expect(result.every((item) => item.completed === false)).toBe(true);
    });
  });

  describe('convertContentToChecklist', () => {
    it('returns full conversion object for content with bullets', () => {
      const content = `Intro text

- Item one
- Item two

Closing text`;

      const result = convertContentToChecklist(content);

      expect(result).not.toBeNull();
      expect(result!.is_checklist).toBe(true);
      expect(result!.checklist_items).toHaveLength(2);
      expect(result!.checklist_items[0].label).toBe('Item one');
      expect(result!.preamble).toBe('Intro text');
      expect(result!.postamble).toBe('Closing text');
    });

    it('returns null for content without bullets', () => {
      const content = 'Just plain text';

      const result = convertContentToChecklist(content);

      expect(result).toBeNull();
    });

    it('returns null for null content', () => {
      const result = convertContentToChecklist(null);
      expect(result).toBeNull();
    });

    it('returns undefined for preamble/postamble when not present', () => {
      const content = '- Just items\n- No intro or outro';

      const result = convertContentToChecklist(content);

      expect(result).not.toBeNull();
      expect(result!.preamble).toBeUndefined();
      expect(result!.postamble).toBeUndefined();
    });
  });
});
