import { analyzeListShape, looksLikeList } from '../listHeuristics';

describe('looksLikeList', () => {
  it('returns true for markdown checkboxes', () => {
    const text = '- [ ] Pack passport\n- [x] Charge camera\n- [ ] Print tickets';
    expect(looksLikeList(text)).toBe(true);
  });

  it('requires majority of lines to be checklist or bullets', () => {
    const text = '- [ ] Pack passport\nRemember to call airline';
    expect(looksLikeList(text)).toBe(false);
  });

  it('handles numbered lists', () => {
    const text = '1. Outline agenda\n2. Send invites\n3. Book room';
    expect(looksLikeList(text)).toBe(true);
  });

  it('handles bullet characters beyond hyphen', () => {
    const text = '* First step\n* Second step\n* Third step';
    expect(looksLikeList(text)).toBe(true);
  });

  it('ignores short single-line inputs', () => {
    expect(looksLikeList('Buy milk')).toBe(false);
  });
});

describe('analyzeListShape', () => {
  it('detects checkbox list', () => {
    const text = '- [ ] One\n- [x] Two\n- [ ] Three';
    const result = analyzeListShape(text);
    expect(result.looksLikeList).toBe(true);
    expect(result.matches).toBeGreaterThanOrEqual(2);
    expect(result.reasons).toContain('list-markers');
  });

  it('detects bullet/numbered list', () => {
    const text = '1) Do this\n2) Do that\n3) Done';
    const result = analyzeListShape(text);
    expect(result.looksLikeList).toBe(true);
    expect(result.lines).toBe(3);
  });

  it('falls back to short lines', () => {
    const text = 'Apples\nBananas\nOranges';
    const result = analyzeListShape(text);
    expect(result.looksLikeList).toBe(true);
    expect(result.reasons).toContain('short-lines-list');
  });

  it('returns false for single line', () => {
    const result = analyzeListShape('Just a quick thought');
    expect(result.looksLikeList).toBe(false);
    expect(result.lines).toBe(1);
    expect(result.score).toBe(0);
  });
});
