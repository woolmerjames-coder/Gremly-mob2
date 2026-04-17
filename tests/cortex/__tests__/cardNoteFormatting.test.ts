/**
 * Card Note Formatting Tests
 *
 * Tests for the cortex worker's card_note post-processing:
 * - sentenceCase formatting (not titleCase)
 * - Length validation (3-60 chars)
 * - Em dash cleanup
 */

// Mirror of sentenceCase from workers/cortex/index.js
function sentenceCase(s: string): string {
  const t = String(s || '').trim();
  if (!t) return '';
  return t[0].toUpperCase() + t.slice(1);
}

// Mirror of card_note post-processing from workers/cortex/index.js
function processCardNote(raw: string | null): string | null {
  if (!raw) return null;
  let cardNote: string | null = String(raw).trim();

  // Strip em dashes
  cardNote = cardNote
    .replace(/\u2014/g, ', ')
    .replace(/\u2013/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (cardNote.length < 3 || cardNote.length > 60) {
    cardNote = null;
  }
  if (cardNote) {
    cardNote = sentenceCase(cardNote);
  }
  return cardNote;
}

describe('sentenceCase', () => {
  it('capitalizes first letter, leaves rest unchanged', () => {
    expect(sentenceCase('bella time is the best time')).toBe('Bella time is the best time');
  });

  it('keeps proper nouns as they are (only touches first char)', () => {
    expect(sentenceCase('walk with Bella at the Park')).toBe('Walk with Bella at the Park');
  });

  it('handles already-capitalized input', () => {
    expect(sentenceCase('Already Good')).toBe('Already Good');
  });

  it('handles single character', () => {
    expect(sentenceCase('a')).toBe('A');
  });

  it('returns empty for empty/null input', () => {
    expect(sentenceCase('')).toBe('');
    expect(sentenceCase(null as unknown as string)).toBe('');
  });
});

describe('processCardNote', () => {
  describe('length validation', () => {
    it('returns null for notes shorter than 3 chars', () => {
      expect(processCardNote('ab')).toBeNull();
    });

    it('accepts notes of exactly 3 chars', () => {
      expect(processCardNote('abc')).toBe('Abc');
    });

    it('accepts notes of exactly 60 chars', () => {
      const note = 'a'.repeat(60);
      expect(processCardNote(note)).not.toBeNull();
    });

    it('returns null for notes longer than 60 chars', () => {
      const note = 'a'.repeat(61);
      expect(processCardNote(note)).toBeNull();
    });

    it('returns null for null input', () => {
      expect(processCardNote(null)).toBeNull();
    });
  });

  describe('em dash cleanup', () => {
    it('replaces em dash (U+2014) with comma-space', () => {
      expect(processCardNote('good vibes\u2014great mood')).toBe('Good vibes, great mood');
    });

    it('replaces en dash (U+2013) with comma-space', () => {
      expect(processCardNote('work hard\u2013play hard')).toBe('Work hard, play hard');
    });

    it('collapses double spaces after dash replacement', () => {
      expect(processCardNote('one \u2014 two')).toBe('One , two');
    });
  });

  describe('sentence case formatting', () => {
    it('applies sentence case to valid notes', () => {
      expect(processCardNote('the classic grocery run')).toBe('The classic grocery run');
    });

    it('does not apply title case (only first word capitalized)', () => {
      const result = processCardNote('she is really into this');
      expect(result).toBe('She is really into this');
      // Verify it did NOT title case (which would capitalize every word)
      expect(result).not.toBe('She Is Really Into This');
    });

    it('preserves proper nouns in middle of string', () => {
      expect(processCardNote('walking Bella again')).toBe('Walking Bella again');
    });
  });
});
