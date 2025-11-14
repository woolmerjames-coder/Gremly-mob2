import { compactTitle } from '../lib/text/compactTitle';

describe('compactTitle', () => {
  it('returns empty string for non-string input', () => {
    expect(compactTitle(undefined)).toBe('');
    expect(compactTitle(null)).toBe('');
  });

  it('trims whitespace and picks the first non-empty line', () => {
    const text = '   \n   Full project brief here  \n second line';
    expect(compactTitle(text)).toBe('Full project brief here');
  });

  it('collapses internal whitespace and truncates with ellipsis', () => {
    const long = 'A '.repeat(80); // 160 characters with spaces
    const result = compactTitle(long);
    expect(result.length).toBeLessThanOrEqual(120);
    expect(result.endsWith('...')).toBe(true);
  });
});
