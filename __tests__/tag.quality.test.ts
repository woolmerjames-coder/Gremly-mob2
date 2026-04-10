import { filterAndNormalizeTags } from '../lib/tags/normalize';
import {
  sanitizeSuggestedTags,
} from '../components/overlay/overlayV2.mapping';

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
      // CP-TAG-3: @tags are normalized to lowercase
      expect(result).toEqual(['@alice']);
    });
  });

  describe('Mixed quality tag sets', () => {
    it('drops stop words while keeping meaningful hashtags and mentions', () => {
      const result = filterAndNormalizeTags(['#find', '#Fitness', '@Dave', '#great']);
      // CP-TAG-3: @tags are normalized to lowercase, hashtags too
      expect(result).toEqual(['@dave', '#fitness']);
    });
  });

  describe('People vs Topic enforcement', () => {
    it('promotes people mentions and dedupes case-insensitively across flows', () => {
      const text = 'Follow up with Dave about the travel itinerary';
      const aiTags = ['Dave', '#Dave', '#travel'];
      const sanitized = sanitizeSuggestedTags(text, aiTags);
      expect(sanitized).toContain('@dave');
      expect(sanitized).not.toContain('#dave');

      const normalized = filterAndNormalizeTags(['@Dave', '#Travel', ...sanitized]);
      // CP-TAG-3: @tags are normalized to lowercase
      expect(normalized).toContain('@dave');
      expect(normalized).toContain('#travel');
      expect(normalized.filter((tag) => tag.toLowerCase() === '@dave').length).toBe(1);
    });
  });
});
