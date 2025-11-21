import { filterAndNormalizeTags } from '../lib/tags/normalize';
import {
  toCreateOrUpdateInput,
  sanitizeSuggestedTags,
} from '../components/overlay/overlayV2.mapping';
import { initialV2State } from '../components/overlay/overlayV2.state';

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

  describe('Tag permanence across provisional → conversion', () => {
    it('retains sticky tags, preserves tombstones, and never resurrects junk tags', () => {
      const state = {
        ...initialV2State,
        baseType: 'log' as const,
        log: {
          ...initialV2State.log,
          body: 'Travel recap with Dave after long run',
          title: 'Travel recap with Dave',
        },
        tags: ['#fitness', '#find'],
        stickyTags: ['#travel'],
        tagTombstones: ['#fitness'],
      };

      const payload = toCreateOrUpdateInput('log', state, null);

      expect(payload.tags).not.toContain('#find');
      expect(payload.tags).not.toContain('#fitness');
      expect(payload.tags_meta?.tombstones).toContain('#fitness');
      expect(payload.tags_meta?.sticky).toContain('#travel');
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
      expect(normalized).toContain('@Dave');
      expect(normalized).toContain('#travel');
      expect(normalized.filter((tag) => tag.toLowerCase() === '@dave').length).toBe(1);
    });
  });
});
