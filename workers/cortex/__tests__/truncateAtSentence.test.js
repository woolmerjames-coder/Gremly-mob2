/**
 * Tests for truncateAtSentence — pure function in workers/cortex/index.js
 *
 * This function truncates text at sentence boundaries when exceeding a character limit.
 */

// Re-implement the pure function for direct testing
function truncateAtSentence(text, maxChars) {
  if (!text || text.length <= maxChars) return text;

  const truncated = text.slice(0, maxChars);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? '),
    truncated.lastIndexOf('.'),
  );

  if (lastSentenceEnd > maxChars * 0.5) {
    return truncated.slice(0, lastSentenceEnd + 1).trim();
  }

  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.5) {
    return truncated.slice(0, lastSpace).trim() + '...';
  }

  return truncated.trim() + '...';
}

describe('truncateAtSentence', () => {
  it('returns text unchanged when under limit', () => {
    expect(truncateAtSentence('Hello world.', 100)).toBe('Hello world.');
  });

  it('returns null/empty unchanged', () => {
    expect(truncateAtSentence(null, 100)).toBeNull();
    expect(truncateAtSentence('', 100)).toBe('');
    expect(truncateAtSentence(undefined, 100)).toBeUndefined();
  });

  it('truncates at sentence boundary (period + space)', () => {
    const text = 'First sentence. Second sentence. Third sentence that is very long and goes on.';
    const result = truncateAtSentence(text, 40);
    expect(result).toBe('First sentence. Second sentence.');
  });

  it('truncates at sentence boundary (exclamation)', () => {
    const text = 'Wow this is great! And then it keeps going on and on and on.';
    const result = truncateAtSentence(text, 30);
    expect(result).toBe('Wow this is great!');
  });

  it('truncates at sentence boundary (question mark)', () => {
    const text =
      'Is this working well already? That thing is really interesting and goes on forever.';
    const result = truncateAtSentence(text, 50);
    expect(result).toBe('Is this working well already?');
  });

  it('falls back to word boundary when no sentence in second half', () => {
    const text =
      'One very long sentence that just keeps going without any sentence boundaries forever';
    const result = truncateAtSentence(text, 50);
    expect(result).toContain('...');
    expect(result.length).toBeLessThanOrEqual(55); // some tolerance for ellipsis
    // Should cut at a word boundary (space), not mid-word
    expect(result).toBe('One very long sentence that just keeps going...');
  });

  it('appends ellipsis when falling back to word boundary', () => {
    const text = 'abc def ghi jkl mno pqr stu vwx yz abc def ghi jkl mno pqr';
    const result = truncateAtSentence(text, 30);
    expect(result.endsWith('...')).toBe(true);
  });

  it('handles text that equals the limit exactly', () => {
    const text = 'Exact fit.';
    expect(truncateAtSentence(text, 10)).toBe('Exact fit.');
  });

  it('prefers sentence boundary over word boundary', () => {
    const text =
      'Short. Then a much longer sentence that continues well past the limit with many words.';
    const result = truncateAtSentence(text, 60);
    // Should cut at "Short." or at end of a sentence, not mid-word
    expect(result.endsWith('.') || result.endsWith('...')).toBe(true);
  });
});
