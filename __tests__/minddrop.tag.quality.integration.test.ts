/**
 * Integration Tests: Tag Quality in Mind Drop Pipeline
 *
 * Tests the complete flow from text input → initial tags → AI enrichment → final tags
 * Ensures junk tags (#has, #lately, #been) are filtered at both stages
 */

import { buildFallbackTags } from '../cortex/openAiEngine';
import { mergeLogSubtypeTag } from '../lib/minddrop/logSubtypeTags';

describe('Tag Quality Integration - Mind Drop Pipeline', () => {
  describe('Initial tag generation (buildFallbackTags)', () => {
    it('filters junk tags from "Work stuff has been a lot lately"', () => {
      const text = 'Work stuff has been a lot lately';
      const tags = buildFallbackTags(text, 'note', 'journal');

      // Should include *journal category tag
      expect(tags).toContain('*journal');

      // buildFallbackTags may or may not include #work depending on frequency
      // The key test is that junk tags are NOT included
      // Should NOT include junk tags
      expect(tags).not.toContain('#has');
      expect(tags).not.toContain('#lately');
      expect(tags).not.toContain('#been');
      expect(tags).not.toContain('#stuff');
      expect(tags).not.toContain('#lot');
    });

    it('keeps high-quality tags from "Email my accountant about the tax letter before Friday"', () => {
      const text = 'Email my accountant about the tax letter before Friday';
      const tags = buildFallbackTags(text, 'todo');

      // Should include good quality tags (at least some of them)
      expect(tags).toContain('#email');
      expect(tags).toContain('#accountant');
      expect(tags).toContain('#friday');

      // Note: #tax and #letter may or may not be included depending on frequency ranking
      // The key is that junk tags should NOT be included

      // Should NOT include conjunctions/prepositions
      expect(tags).not.toContain('#before');
      expect(tags).not.toContain('#about');
    });

    it('handles "Call Dr. Smith about appointment" correctly', () => {
      const text = 'Call Dr. Smith about appointment';
      const tags = buildFallbackTags(text, 'todo');

      // Should include person mention
      expect(tags.some((t: string) => t.startsWith('@') && t.includes('Smith'))).toBe(true);

      // Should include high-quality tags
      expect(tags).toContain('#appointment');
      expect(tags).toContain('#call');

      // Should NOT include preposition
      expect(tags).not.toContain('#about');
    });

    it('filters junk tags for journal entries', () => {
      const text = 'Today was really hard. I have been feeling very overwhelmed lately.';
      const tags = buildFallbackTags(text, 'note', 'journal');

      expect(tags).toContain('*journal');
      expect(tags).toContain('#overwhelmed');
      expect(tags).toContain('#hard');
      expect(tags).toContain('#feeling');

      // Junk tokens should be filtered
      expect(tags).not.toContain('#really');
      expect(tags).not.toContain('#very');
      expect(tags).not.toContain('#lately');
      expect(tags).not.toContain('#have');
      expect(tags).not.toContain('#been');
    });
  });

  describe('BackgroundPrefill tag merging (mergeLogSubtypeTag)', () => {
    it('filters junk existing tags when AI returns no tags', () => {
      const aiTags: string[] = [];
      const existingTags = ['#work', '#has', '#lately', '#been', '#stuff'];
      const subtype = 'journal';
      const labels = ['log'];

      const result = mergeLogSubtypeTag(aiTags, existingTags, subtype, labels, null);

      // Should keep #work (good quality)
      expect(result.tags).toContain('#work');

      // Should add #journal sticky tag
      expect(result.tags).toContain('#journal');
      expect(result.tags_meta.sticky).toContain('#journal');

      // Should filter out junk tags
      expect(result.tags).not.toContain('#has');
      expect(result.tags).not.toContain('#lately');
      expect(result.tags).not.toContain('#been');
      expect(result.tags).not.toContain('#stuff');
    });

    it('merges AI tags with quality-filtered existing tags', () => {
      const aiTags = ['stress', 'pressure'];
      const existingTags = ['#work', '#has', '#lately', '#overwhelmed'];
      const subtype = 'journal';
      const labels = ['log'];

      const result = mergeLogSubtypeTag(aiTags, existingTags, subtype, labels, null);

      // Should include AI tags (normalized with #)
      expect(result.tags).toContain('#stress');
      expect(result.tags).toContain('#pressure');

      // Should include good existing tags
      expect(result.tags).toContain('#work');
      expect(result.tags).toContain('#overwhelmed');

      // Should include journal sticky tag
      expect(result.tags).toContain('#journal');

      // Should filter out junk existing tags
      expect(result.tags).not.toContain('#has');
      expect(result.tags).not.toContain('#lately');
    });

    it('handles AI returning empty array (different from null)', () => {
      const aiTags: string[] = [];
      const existingTags = ['#email', '#accountant', '#has', '#been'];
      const subtype = 'idea';
      const labels = ['log'];

      const result = mergeLogSubtypeTag(aiTags, existingTags, subtype, labels, null);

      // Should keep good existing tags
      expect(result.tags).toContain('#email');
      expect(result.tags).toContain('#accountant');

      // Should add #idea sticky tag
      expect(result.tags).toContain('#idea');

      // Should filter junk
      expect(result.tags).not.toContain('#has');
      expect(result.tags).not.toContain('#been');
    });

    it('removes internal markers (*idea, *journal) from existing tags', () => {
      const aiTags = ['work', 'stress'];
      const existingTags = ['*idea', '*journal', '#project', '#has'];
      const subtype = 'journal';
      const labels = ['log'];

      const result = mergeLogSubtypeTag(aiTags, existingTags, subtype, labels, null);

      // Internal markers should be stripped
      expect(result.tags).not.toContain('*idea');
      expect(result.tags).not.toContain('*journal');

      // But #journal should be added as sticky tag
      expect(result.tags).toContain('#journal');
      expect(result.tags_meta.sticky).toContain('#journal');

      // Good tags should be kept
      expect(result.tags).toContain('#project');
      expect(result.tags).toContain('#work');
      expect(result.tags).toContain('#stress');

      // Junk should be filtered
      expect(result.tags).not.toContain('#has');
    });

    it('preserves sticky tags metadata', () => {
      const aiTags = ['deadline'];
      const existingTags = ['#urgent', '#has'];
      const subtype = 'idea';
      const labels = ['log'];
      const existingMeta = {
        sticky: ['#urgent'],
        tombstones: [],
      };

      const result = mergeLogSubtypeTag(aiTags, existingTags, subtype, labels, existingMeta);

      // Should preserve existing sticky tag
      expect(result.tags_meta.sticky).toContain('#urgent');

      // Should add #idea as sticky
      expect(result.tags_meta.sticky).toContain('#idea');

      // Should include both tags
      expect(result.tags).toContain('#urgent');
      expect(result.tags).toContain('#idea');
      expect(result.tags).toContain('#deadline');

      // Should filter junk
      expect(result.tags).not.toContain('#has');
    });
  });

  describe('End-to-end: Unsorted Note → BackgroundPrefill → Final Log', () => {
    it('cleans up junk tags through complete pipeline', () => {
      // Step 1: Initial unsorted note creation (buildFallbackTags)
      const userInput = 'Work stuff has been a lot lately';
      const initialTags = buildFallbackTags(userInput, 'note', 'journal');

      // Initial tags should NOT contain junk
      expect(initialTags).toContain('*journal');
      expect(initialTags).not.toContain('#has');
      expect(initialTags).not.toContain('#lately');
      expect(initialTags).not.toContain('#been');
      expect(initialTags).not.toContain('#stuff');
      expect(initialTags).not.toContain('#lot');

      // Step 2: AI returns empty tags (backgroundPrefill scenario)
      const aiTags: string[] = [];

      // Step 3: Merge with quality filter (mergeLogSubtypeTag)
      const finalResult = mergeLogSubtypeTag(aiTags, initialTags, 'journal', ['log'], null);

      // Final tags should be clean
      expect(finalResult.tags).toContain('#journal');
      expect(finalResult.tags).not.toContain('#has');
      expect(finalResult.tags).not.toContain('#lately');
      expect(finalResult.tags).not.toContain('#been');
      expect(finalResult.tags).not.toContain('#stuff');
      expect(finalResult.tags).not.toContain('#lot');

      // Should have sticky tag
      expect(finalResult.tags_meta.sticky).toContain('#journal');
    });

    it('preserves high-quality tags through complete pipeline', () => {
      // Step 1: Initial todo creation
      const userInput = 'Email my accountant about the tax letter before Friday';
      const initialTags = buildFallbackTags(userInput, 'todo');

      // Should have high-quality tags (at least some of them)
      expect(initialTags).toContain('#email');
      expect(initialTags).toContain('#accountant');
      expect(initialTags).toContain('#friday');

      // Should NOT have junk tags
      expect(initialTags).not.toContain('#before');
      expect(initialTags).not.toContain('#about');

      // Step 2: AI enriches with additional tag
      const aiTags = ['deadline'];

      // Step 3: Merge (simulating todo/habit tag fallback in backgroundPrefill)
      // For todos, we'd use filterAndNormalizeTags + applyTagQualityFilter
      // This simulates the pattern used in backgroundPrefill.ts
      const { applyTagQualityFilter } = require('../lib/tags/quality');
      const { filterAndNormalizeTags } = require('../lib/tags/normalize');

      const cleanedExisting = applyTagQualityFilter(initialTags);
      const cleanedAi = filterAndNormalizeTags(aiTags);
      const finalTags = [...cleanedAi, ...cleanedExisting];

      // High-quality tags should be present
      expect(finalTags).toContain('#deadline');
      expect(finalTags).toContain('#email');
      expect(finalTags).toContain('#accountant');
      expect(finalTags).toContain('#friday');
      expect(finalTags).toContain('#friday');

      // Junk should be filtered
      expect(finalTags).not.toContain('#before');
      expect(finalTags).not.toContain('#about');
    });
  });
});
