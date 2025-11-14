import { filterAndNormalizeTags } from '../lib/tags/normalize';

describe('Overlay Phase 2 — Tag Quality', () => {
  describe('Tag junk-word filtering', () => {
    it('filters out junk words before offering tag suggestions', () => {
      const result = filterAndNormalizeTags(['#the', 'Awesome', 'Focus', 'Project']);
      expect(result).toEqual(['#focus', '#project']);
    });
  });

  describe('@Name vs #Tag classification', () => {
    it('prioritises @Name tagging when both mention and hashtag patterns exist', () => {
      const result = filterAndNormalizeTags(['#Alice', '@Alice', 'Alice']);
      expect(result).toEqual(['@Alice']);
    });
  });

  describe('Mixed quality tag sets', () => {
    it('drops stop words while keeping meaningful hashtags and mentions', () => {
      const result = filterAndNormalizeTags(['#find', '#Fitness', '@Dave', '#great']);
      expect(result).toEqual(['@Dave', '#fitness']);
    });
  });
});
