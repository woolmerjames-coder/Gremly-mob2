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
      const result = filterAndNormalizeTags(['#find', '#Fitness', '@Theo', '#great']);
      // CP-TAG-3: @tags are normalized to lowercase, hashtags too
      expect(result).toEqual(['@theo', '#fitness']);
    });
  });

  describe('People vs Topic enforcement', () => {
    it('promotes people mentions and dedupes case-insensitively across flows', () => {
      const text = 'Follow up with Theo about the travel itinerary';
      const aiTags = ['Theo', '#Theo', '#travel'];
      const sanitized = sanitizeSuggestedTags(text, aiTags);
      expect(sanitized).toContain('@theo');
      expect(sanitized).not.toContain('#theo');

      const normalized = filterAndNormalizeTags(['@Theo', '#Travel', ...sanitized]);
      // CP-TAG-3: @tags are normalized to lowercase
      expect(normalized).toContain('@theo');
      expect(normalized).toContain('#travel');
      expect(normalized.filter((tag) => tag.toLowerCase() === '@theo').length).toBe(1);
    });
  });
});
