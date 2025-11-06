import { analyzeIdeaShape } from '../ideaHeuristics';

import { analyzeListShape } from '../listHeuristics';

describe('list heuristics', () => {
  it('detects checkbox list', () => {
    const text = '- [ ] One\n- [x] Two\n- [ ] Three';
    const result = analyzeListShape(text);
    expect(result.looksLikeList).toBe(true);
    expect(result.matches).toBeGreaterThanOrEqual(2);
  });

  it('detects bullet/numbered list', () => {
    const text = '1) Do this\n2) Do that\n3) Done';
    const result = analyzeListShape(text);
    expect(result.looksLikeList).toBe(true);
  });
});

describe('idea heuristics', () => {
  it('detects "Idea:"', () => {
    const result = analyzeIdeaShape('Idea: offline-first packing list');
    expect(result.looksLikeIdea).toBe(true);
    expect(result.reasons).toContain('keywords');
  });

  it('ignores pure question', () => {
    const result = analyzeIdeaShape('What should we do in Puerto Escondido?');
    expect(result.looksLikeIdea).toBe(false);
    expect(result.reasons).toContain('question');
  });
});
