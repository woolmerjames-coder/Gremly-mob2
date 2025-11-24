/**
 * Tests for person tag normalization
 * Ensures possessive forms like "Sarah's" map to @sarah, not @sarahs
 */

import { extractMeaningfulTags } from '../extractTags';

describe('Person Tag Normalization', () => {
  it('should normalize possessive forms correctly', () => {
    const text = "Sarah's coffee order: oat latte, extra hot";
    const tags = extractMeaningfulTags(text);

    // Should extract @sarah (NOT @sarahs)
    expect(tags).toContain('@sarah');
    expect(tags).not.toContain('@sarahs');
  });

  it('should handle multiple possessives', () => {
    const text =
      "I can't stop thinking about what Sarah said. Really stressed about Mark's comment too.";
    const tags = extractMeaningfulTags(text);

    expect(tags).toContain('@sarah');
    expect(tags).toContain('@mark');
    expect(tags).not.toContain('@sarahs');
    expect(tags).not.toContain('@marks');
  });

  it('should extract person tags before topics', () => {
    const text = 'Talk to Sarah about the presentation tomorrow';
    const tags = extractMeaningfulTags(text);

    // Should extract @sarah as person, presentation as topic
    expect(tags).toContain('@sarah');
    expect(tags.some((t) => t.includes('presentation'))).toBe(true);
  });

  it('should handle family role names', () => {
    const text = "Mom's birthday party on Saturday";
    const tags = extractMeaningfulTags(text);

    expect(tags).toContain('@mom');
    expect(tags).not.toContain('@moms');
  });

  it('should normalize Dr. titles correctly', () => {
    const text = "Dr. Smith's office at 3pm";
    const tags = extractMeaningfulTags(text);

    expect(tags).toContain('@dr-smith');
    expect(tags).not.toContain('@smiths');
  });
});
