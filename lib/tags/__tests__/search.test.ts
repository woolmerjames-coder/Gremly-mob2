/**
 * Tests for search token parsing and tag normalization utilities
 *
 * Covers:
 * - parseSearchTokens: parsing #tag tokens from free text
 * - normalizeSearchTagInput: trimming/normalizing single tags
 * - normalizeSearchTagArray: handling multiple tags with deduplication
 */

import { parseSearchTokens } from '../parseSearch';
import { normalizeSearchTagInput, normalizeSearchTagArray } from '../search';

// =============================================================================
// parseSearchTokens
// =============================================================================

describe('parseSearchTokens', () => {
  describe('parsing #tag tokens from free text', () => {
    it('extracts a single #tag from text', () => {
      const result = parseSearchTokens('hello #world');
      expect(result).toEqual({
        text: 'hello',
        tagNames: ['#world'],
      });
    });

    it('extracts #tag at the beginning', () => {
      const result = parseSearchTokens('#first some text');
      expect(result).toEqual({
        text: 'some text',
        tagNames: ['#first'],
      });
    });

    it('extracts #tag at the end', () => {
      const result = parseSearchTokens('some text #last');
      expect(result).toEqual({
        text: 'some text',
        tagNames: ['#last'],
      });
    });

    it('extracts *star tags', () => {
      const result = parseSearchTokens('note *journal');
      expect(result).toEqual({
        text: 'note',
        tagNames: ['*journal'],
      });
    });

    it('extracts @person tags', () => {
      const result = parseSearchTokens('meeting with @alice');
      expect(result).toEqual({
        text: 'meeting with',
        tagNames: ['@alice'],
      });
    });
  });

  describe('handling multiple tags', () => {
    it('extracts multiple #tags', () => {
      const result = parseSearchTokens('#one #two #three');
      expect(result).toEqual({
        text: null,
        tagNames: ['#one', '#two', '#three'],
      });
    });

    it('extracts mixed tag types', () => {
      const result = parseSearchTokens('#anxious workout *journal @coach');
      expect(result).toEqual({
        text: 'workout',
        tagNames: ['#anxious', '*journal', '@coach'],
      });
    });

    it('preserves tag order', () => {
      const result = parseSearchTokens('@z #a *m');
      expect(result.tagNames).toEqual(['@z', '#a', '*m']);
    });

    it('deduplicates identical tags while preserving first occurrence order', () => {
      const result = parseSearchTokens('#a #b #a #c #b');
      expect(result).toEqual({
        text: null,
        tagNames: ['#a', '#b', '#c'],
      });
    });
  });

  describe('trimming/normalizing case', () => {
    it('lowercases tag names', () => {
      const result = parseSearchTokens('#UPPERCASE #MixedCase');
      expect(result.tagNames).toEqual(['#uppercase', '#mixedcase']);
    });

    it('preserves case in free text', () => {
      const result = parseSearchTokens('Hello World #tag');
      expect(result.text).toBe('Hello World');
    });

    it('handles extra whitespace', () => {
      const result = parseSearchTokens('  hello   #tag   world  ');
      expect(result).toEqual({
        text: 'hello world',
        tagNames: ['#tag'],
      });
    });
  });

  describe('returning remaining query text', () => {
    it('returns null when only tags present', () => {
      const result = parseSearchTokens('#only #tags');
      expect(result.text).toBeNull();
    });

    it('returns full text when no tags present', () => {
      const result = parseSearchTokens('just plain text');
      expect(result).toEqual({
        text: 'just plain text',
        tagNames: [],
      });
    });

    it('joins multiple text parts with single space', () => {
      const result = parseSearchTokens('before #tag after');
      expect(result.text).toBe('before after');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = parseSearchTokens('');
      expect(result).toEqual({
        text: null,
        tagNames: [],
      });
    });

    it('handles whitespace only', () => {
      const result = parseSearchTokens('   ');
      expect(result).toEqual({
        text: null,
        tagNames: [],
      });
    });

    it('handles null-like input', () => {
      // @ts-expect-error testing runtime behavior
      const result = parseSearchTokens(null);
      expect(result).toEqual({
        text: null,
        tagNames: [],
      });
    });

    it('handles tag with no text after prefix', () => {
      const result = parseSearchTokens('# * @');
      // These become empty normalized tags
      expect(result.tagNames).toEqual(['#', '*', '@']);
    });
  });
});

// =============================================================================
// normalizeSearchTagInput
// =============================================================================

describe('normalizeSearchTagInput', () => {
  describe('basic normalization', () => {
    it('adds # prefix when no prefix present', () => {
      expect(normalizeSearchTagInput('tag')).toBe('#tag');
    });

    it('preserves # prefix', () => {
      expect(normalizeSearchTagInput('#tag')).toBe('#tag');
    });

    it('preserves * prefix', () => {
      expect(normalizeSearchTagInput('*journal')).toBe('*journal');
    });

    it('preserves @ prefix', () => {
      expect(normalizeSearchTagInput('@alice')).toBe('@alice');
    });
  });

  describe('case normalization', () => {
    it('lowercases the tag name', () => {
      expect(normalizeSearchTagInput('TAG')).toBe('#tag');
    });

    it('lowercases with # prefix', () => {
      expect(normalizeSearchTagInput('#TAG')).toBe('#tag');
    });

    it('lowercases with * prefix', () => {
      expect(normalizeSearchTagInput('*JOURNAL')).toBe('*journal');
    });

    it('lowercases with @ prefix', () => {
      expect(normalizeSearchTagInput('@ALICE')).toBe('@alice');
    });

    it('handles mixed case', () => {
      expect(normalizeSearchTagInput('#MixedCase')).toBe('#mixedcase');
    });
  });

  describe('whitespace trimming', () => {
    it('trims leading whitespace', () => {
      expect(normalizeSearchTagInput('  tag')).toBe('#tag');
    });

    it('trims trailing whitespace', () => {
      expect(normalizeSearchTagInput('tag  ')).toBe('#tag');
    });

    it('trims whitespace with prefix', () => {
      expect(normalizeSearchTagInput('  #tag  ')).toBe('#tag');
    });

    it('trims whitespace after prefix', () => {
      expect(normalizeSearchTagInput('#  tag')).toBe('#tag');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(normalizeSearchTagInput('')).toBe('');
    });

    it('returns empty string for whitespace only', () => {
      expect(normalizeSearchTagInput('   ')).toBe('');
    });

    it('handles null-like input', () => {
      // @ts-expect-error testing runtime behavior
      expect(normalizeSearchTagInput(null)).toBe('');
      // @ts-expect-error testing runtime behavior
      expect(normalizeSearchTagInput(undefined)).toBe('');
    });

    it('handles prefix only', () => {
      expect(normalizeSearchTagInput('#')).toBe('#');
      expect(normalizeSearchTagInput('*')).toBe('*');
      expect(normalizeSearchTagInput('@')).toBe('@');
    });
  });
});

// =============================================================================
// normalizeSearchTagArray
// =============================================================================

describe('normalizeSearchTagArray', () => {
  describe('basic array normalization', () => {
    it('normalizes an array of tags', () => {
      expect(normalizeSearchTagArray(['tag1', 'tag2'])).toEqual(['#tag1', '#tag2']);
    });

    it('preserves prefixes in array', () => {
      expect(normalizeSearchTagArray(['#tag', '*journal', '@alice'])).toEqual([
        '#tag',
        '*journal',
        '@alice',
      ]);
    });

    it('lowercases all tags in array', () => {
      expect(normalizeSearchTagArray(['TAG', '#HASH', '*STAR', '@AT'])).toEqual([
        '#tag',
        '#hash',
        '*star',
        '@at',
      ]);
    });
  });

  describe('deduplication', () => {
    it('removes exact duplicates', () => {
      expect(normalizeSearchTagArray(['tag', 'tag', 'tag'])).toEqual(['#tag']);
    });

    it('removes duplicates after normalization', () => {
      expect(normalizeSearchTagArray(['TAG', 'tag', 'Tag'])).toEqual(['#tag']);
    });

    it('removes duplicates with same prefix', () => {
      expect(normalizeSearchTagArray(['#tag', '#tag'])).toEqual(['#tag']);
    });

    it('preserves first occurrence order when deduplicating', () => {
      expect(normalizeSearchTagArray(['#c', '#a', '#b', '#a', '#c'])).toEqual(['#c', '#a', '#b']);
    });

    it('treats different prefixes as different tags', () => {
      expect(normalizeSearchTagArray(['#tag', '*tag', '@tag'])).toEqual(['#tag', '*tag', '@tag']);
    });
  });

  describe('edge cases', () => {
    it('handles empty array', () => {
      expect(normalizeSearchTagArray([])).toEqual([]);
    });

    it('handles null-like input', () => {
      // @ts-expect-error testing runtime behavior
      expect(normalizeSearchTagArray(null)).toEqual([]);
      // @ts-expect-error testing runtime behavior
      expect(normalizeSearchTagArray(undefined)).toEqual([]);
    });

    it('filters out empty strings after normalization', () => {
      expect(normalizeSearchTagArray(['tag', '', '  ', 'other'])).toEqual(['#tag', '#other']);
    });

    it('handles array with null/undefined elements', () => {
      // @ts-expect-error testing runtime behavior
      expect(normalizeSearchTagArray(['tag', null, undefined, 'other'])).toEqual([
        '#tag',
        '#other',
      ]);
    });

    it('trims whitespace from all elements', () => {
      expect(normalizeSearchTagArray(['  tag1  ', '  #tag2  '])).toEqual(['#tag1', '#tag2']);
    });
  });
});
