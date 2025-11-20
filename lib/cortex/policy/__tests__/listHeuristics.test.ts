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

  it('detects inline dash-separated lists', () => {
    expect(looksLikeList('- eggs - milk - cereal')).toBe(true);
  });

  it('detects longer inline lists', () => {
    expect(looksLikeList('- apples - oranges - bananas - grapes')).toBe(true);
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

  it('detects inline dash-separated grocery lists', () => {
    const result = analyzeListShape('- eggs - milk - cereal');
    expect(result.looksLikeList).toBe(true);
    expect(result.matches).toBe(3);
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.reasons).toContain('inline-list-pattern');
  });

  it('detects longer inline lists with high confidence', () => {
    const result = analyzeListShape('- apples - oranges - bananas - grapes - strawberries');
    expect(result.looksLikeList).toBe(true);
    expect(result.matches).toBe(5);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
    expect(result.reasons).toContain('inline-list-pattern');
  });

  it('requires at least 2 items for inline lists', () => {
    const result = analyzeListShape('- eggs');
    expect(result.looksLikeList).toBe(false);
  });

  // Regression tests for issue: lists not auto-creating as logs
  it('should detect grocery list with high confidence', () => {
    const result = analyzeListShape('- eggs - milk - cereal');
    expect(result.looksLikeList).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.7); // Should trigger auto-create
    expect(result.matches).toBe(3);
  });

  it('should work with extra whitespace', () => {
    const result = analyzeListShape('-  eggs  -  milk  -  cereal');
    expect(result.looksLikeList).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it('should handle mixed case items', () => {
    const result = analyzeListShape('- Eggs - MILK - Cereal');
    expect(result.looksLikeList).toBe(true);
  });
});
