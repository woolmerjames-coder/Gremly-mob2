import { parseSearchTokens } from '../lib/tags/parseSearch';

describe('parseSearchTokens', () => {
  test('extracts tag tokens and free text', () => {
    const result = parseSearchTokens('#anxious workout *journal');

    expect(result).toEqual({
      text: 'workout',
      tagNames: ['#anxious', '*journal'],
    });
  });

  test('keeps non-tag tokens in text', () => {
    const result = parseSearchTokens('Idea #focus');

    expect(result).toEqual({
      text: 'Idea',
      tagNames: ['#focus'],
    });
  });

  test('deduplicates tag tokens while preserving order', () => {
    const result = parseSearchTokens('#a #a #b');

    expect(result).toEqual({
      text: null,
      tagNames: ['#a', '#b'],
    });
  });
});
