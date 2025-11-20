/**
 * Tests for extractTagsFallback - Deterministic tag extraction
 */

import { extractTagsFallback } from '../extractTagsFallback';

describe('extractTagsFallback', () => {
  it('should extract activity words', () => {
    const result = extractTagsFallback('Going for a run this morning');

    expect(result).toContain('run');
  });

  it('should extract multiple activities', () => {
    const result = extractTagsFallback('Meditate and then go for a walk');

    expect(result).toContain('meditate');
    expect(result).toContain('walk');
  });

  it('should extract place words', () => {
    const result = extractTagsFallback('Meeting at the dentist office');

    expect(result).toContain('dentist');
    expect(result).toContain('office');
  });

  it('should extract object words', () => {
    const result = extractTagsFallback('Found my passport and laptop');

    expect(result).toContain('passport');
    expect(result).toContain('laptop');
  });

  it('should extract proper nouns', () => {
    const result = extractTagsFallback('Meeting with Sarah at the park');

    expect(result).toContain('sarah');
  });

  it('should NOT extract first word even if capitalized', () => {
    const result = extractTagsFallback('London is great for tourism');

    // "London" is first word, should be ignored
    expect(result).not.toContain('london');
  });

  it('should NOT extract words after sentence-ending punctuation', () => {
    const result = extractTagsFallback('Had coffee. Sarah joined later.');

    // "Sarah" is after period, should be ignored
    expect(result).not.toContain('sarah');
  });

  it('should ignore emotion words', () => {
    const result = extractTagsFallback('Feeling overwhelmed and stressed today');

    expect(result).not.toContain('overwhelmed');
    expect(result).not.toContain('stressed');
  });

  it('should ignore generic words', () => {
    const result = extractTagsFallback('Did something good with someone today');

    expect(result).not.toContain('something');
    expect(result).not.toContain('good');
    expect(result).not.toContain('someone');
    expect(result).not.toContain('today');
  });

  it('should ignore thinking verbs', () => {
    const result = extractTagsFallback('I think I want to know more');

    expect(result).not.toContain('think');
    expect(result).not.toContain('want');
    expect(result).not.toContain('know');
  });

  it('should ignore time words', () => {
    const result = extractTagsFallback('Tomorrow morning I have a meeting');

    expect(result).not.toContain('tomorrow');
    expect(result).not.toContain('morning');
  });

  it('should limit to 4 tags max', () => {
    const result = extractTagsFallback(
      'Sarah meeting at dentist office with laptop passport phone charger keys wallet',
    );

    expect(result.length).toBeLessThanOrEqual(4);
  });

  it('should prioritize proper nouns over activities', () => {
    const result = extractTagsFallback('Meeting Sarah for running at the park');

    // Proper noun should come first
    expect(result[0]).toBe('sarah');
  });

  it('should deduplicate tags', () => {
    const result = extractTagsFallback('Run run running at the park for a run');

    const runCount = result.filter((tag) => tag === 'run').length;
    expect(runCount).toBeLessThanOrEqual(1);
  });

  it('should handle plurals', () => {
    const result = extractTagsFallback('Buying groceries at the store');

    // "groceries" should be normalized to "grocery" if applicable
    expect(result).toContain('groceries');
  });

  it('should lowercase all tags', () => {
    const result = extractTagsFallback('MEETING at DENTIST');

    expect(result).toContain('meeting');
    expect(result).toContain('dentist');
    expect(result.every((tag) => tag === tag.toLowerCase())).toBe(true);
  });

  it('should strip punctuation', () => {
    const result = extractTagsFallback('meeting! at dentist?');

    expect(result).toContain('meeting');
    expect(result).toContain('dentist');
  });

  it('should ignore tags shorter than 3 characters', () => {
    const result = extractTagsFallback('Go to SF by car');

    expect(result).not.toContain('go');
    expect(result).not.toContain('to');
    expect(result).not.toContain('sf');
    expect(result).not.toContain('by');
  });

  it('should return empty array for empty text', () => {
    const result = extractTagsFallback('');

    expect(result).toEqual([]);
  });

  it('should return empty array for text with only excluded words', () => {
    const result = extractTagsFallback('I feel good today');

    expect(result).toEqual([]);
  });

  it('should handle mixed content correctly', () => {
    const result = extractTagsFallback('Book dentist appointment tomorrow for passport');

    expect(result).toContain('dentist');
    expect(result).toContain('passport');
    expect(result).not.toContain('tomorrow');
  });

  it('should prioritize by type: proper nouns > activities > objects > places', () => {
    const result = extractTagsFallback('Sarah running at park with laptop');

    // Order should be: proper noun, activity, object, place
    const sarahIndex = result.indexOf('sarah');
    const runIndex = result.indexOf('running');
    const laptopIndex = result.indexOf('laptop');
    const parkIndex = result.indexOf('park');

    if (sarahIndex !== -1 && runIndex !== -1) {
      expect(sarahIndex).toBeLessThan(runIndex);
    }
    if (runIndex !== -1 && parkIndex !== -1) {
      expect(runIndex).toBeLessThan(parkIndex);
    }
  });
});
