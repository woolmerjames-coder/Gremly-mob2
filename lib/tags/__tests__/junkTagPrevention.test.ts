/**
 * Junk Tag Prevention Tests
 *
 * Enforces that our unified tag quality system prevents junk slice-of-sentence
 * tokens from appearing in the final tag set. These tests simulate the exact
 * flow used by Mind Drop creation pipeline.
 *
 * Critical: These tests ensure fragments like #don, #meant, #start, #sure, #not
 * never make it through our quality filters.
 */

import { extractMeaningfulTags } from '../extractTags';
import { filterAndNormalizeTags } from '../normalize';

/**
 * Simulate the Mind Drop tag generation pipeline:
 * 1. extractMeaningfulTags - deterministic extraction (CP-TAG-2 enhanced)
 * 2. filterAndNormalizeTags - quality filtering + normalization
 */
function simulateMindDropTagPipeline(text: string, subtype?: string): string[] {
  const raw = extractMeaningfulTags(text, subtype);
  const tags = filterAndNormalizeTags(raw);
  return tags;
}

describe('Junk Tag Prevention - Unified Quality System', () => {
  describe('CP-TAG-1: Contraction Fragments', () => {
    it('blocks #don from "I don\'t even know where to start"', () => {
      const tags = simulateMindDropTagPipeline("I don't even know where to start", 'journal');

      // Critical regression test: #don must NEVER appear
      expect(tags).not.toContain('#don');
      expect(tags).not.toContain('#dont');
      expect(tags).not.toContain('#start');
      expect(tags).not.toContain('#know');
      expect(tags).not.toContain('#where');

      // Reflective blurbs should produce minimal tags (0-2)
      expect(tags.length).toBeLessThanOrEqual(2);
    });

    it('blocks #meant from "Not sure what I meant by that"', () => {
      const tags = simulateMindDropTagPipeline('Not sure what I meant by that', 'journal');

      // All junk fragments must be blocked
      expect(tags).not.toContain('#not');
      expect(tags).not.toContain('#sure');
      expect(tags).not.toContain('#meant');
      expect(tags).not.toContain('#what');

      // Reflective blurbs should produce minimal tags (0-2)
      expect(tags.length).toBeLessThanOrEqual(2);
    });

    it('blocks multiple junk fragments from "Everything feels messy and I\'m not sure what to do"', () => {
      const tags = simulateMindDropTagPipeline(
        "Everything feels messy and I'm not sure what to do",
        'journal',
      );

      // Block all contraction fragments
      expect(tags).not.toContain('#im');
      expect(tags).not.toContain('#not');
      expect(tags).not.toContain('#sure');

      // Block vague descriptors
      expect(tags).not.toContain('#everything');
      expect(tags).not.toContain('#what');

      // Block generic verbs
      expect(tags).not.toContain('#feels');
      expect(tags).not.toContain('#do');

      // Reflective blurbs should produce minimal tags (0-2)
      expect(tags.length).toBeLessThanOrEqual(2);
    });
  });

  describe('CP-TAG-1: Vague Descriptors', () => {
    it('blocks #soon, #maybe, #later from fuzzy time references', () => {
      const tags = simulateMindDropTagPipeline(
        'Maybe I should do that soon, or maybe later',
        'journal',
      );

      expect(tags).not.toContain('#soon');
      expect(tags).not.toContain('#maybe');
      expect(tags).not.toContain('#later');
      expect(tags).not.toContain('#should');

      expect(tags.length).toBeLessThanOrEqual(2);
    });

    it('blocks #stuff, #things from generic filler words', () => {
      const tags = simulateMindDropTagPipeline('Got a lot of stuff and things to do', 'journal');

      expect(tags).not.toContain('#lot');
      expect(tags).not.toContain('#stuff');
      expect(tags).not.toContain('#things');
      expect(tags).not.toContain('#got');

      expect(tags.length).toBeLessThanOrEqual(2);
    });
  });

  describe('CP-TAG-1: Generic Action Verbs', () => {
    it('blocks #need, #want, #make from generic verbs', () => {
      const tags = simulateMindDropTagPipeline(
        'Need to make something, want to do better',
        'journal',
      );

      expect(tags).not.toContain('#need');
      expect(tags).not.toContain('#make');
      expect(tags).not.toContain('#want');
      expect(tags).not.toContain('#something');
      expect(tags).not.toContain('#better');

      expect(tags.length).toBeLessThanOrEqual(2);
    });

    it('blocks #start, #doing, #done from state verbs', () => {
      const tags = simulateMindDropTagPipeline('Started doing some work, almost done', 'journal');

      expect(tags).not.toContain('#start');
      expect(tags).not.toContain('#started');
      expect(tags).not.toContain('#doing');
      expect(tags).not.toContain('#done');
      expect(tags).not.toContain('#some');
      expect(tags).not.toContain('#almost');

      // Deterministic extractor is conservative, may or may not extract "work"
      // Main assertion: junk is blocked
      expect(tags.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Edge Cases: Low-Signal Input', () => {
    it('handles single-word junk gracefully', () => {
      const tags = simulateMindDropTagPipeline('Idk', 'journal');

      expect(tags).not.toContain('#idk');
      expect(tags.length).toBe(0); // Pure junk → empty result
    });

    it('handles pure filler sentence', () => {
      const tags = simulateMindDropTagPipeline('Just thinking about stuff', 'journal');

      expect(tags).not.toContain('#just');
      expect(tags).not.toContain('#thinking');
      expect(tags).not.toContain('#stuff');
      expect(tags).not.toContain('#about');

      expect(tags.length).toBeLessThanOrEqual(1);
    });

    it('handles fuzzy emotional state', () => {
      const tags = simulateMindDropTagPipeline('Feeling kinda weird lately', 'journal');

      expect(tags).not.toContain('#kinda');
      expect(tags).not.toContain('#lately');
      expect(tags).not.toContain('#weird'); // Vague emotional descriptor

      // "feeling" might be filtered or kept depending on context
      expect(tags.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Positive Cases: Keep Meaningful Tags', () => {
    it('keeps protected domain tags when they are clear nouns', () => {
      const tags = simulateMindDropTagPipeline(
        'Meeting about health and exercise program',
        'journal',
      );

      // Junk should be filtered
      expect(tags).not.toContain('#need');
      expect(tags).not.toContain('#about');

      // Should extract some meaningful tags (health, exercise, etc.)
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.every((tag) => !tag.match(/^#(need|want|should|got|get|make|done)$/))).toBe(true);
    });

    it('keeps specific concrete nouns', () => {
      const tags = simulateMindDropTagPipeline('Dentist appointment scheduled', 'journal');

      // Should extract "dentist" and/or "appointment" as meaningful tags
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.some((tag) => tag.includes('dentist') || tag.includes('appointment'))).toBe(true);
    });

    it('keeps @ mentions (CP-TAG-2/CP-TAG-3)', () => {
      const tags = simulateMindDropTagPipeline('Call Mom about dinner with Jeff', 'journal');

      // @ tags should be preserved (CP-TAG-2 extracts people)
      expect(tags.some((tag) => tag.startsWith('@'))).toBe(true);

      // Generic verb should be filtered
      expect(tags).not.toContain('#call');
      expect(tags).not.toContain('#about');
    });
  });

  describe('Regression Tests', () => {
    it('REGRESSION: never allow #don to appear again', () => {
      // This is the exact input that previously produced #don
      const tags = simulateMindDropTagPipeline("I don't even know where to start", 'journal');

      // Critical: This tag caused the regression, must never appear
      expect(tags).not.toContain('#don');

      // Also block other fragments from this input
      expect(tags).not.toContain('#dont');
      expect(tags).not.toContain('#start');
      expect(tags).not.toContain('#know');
      expect(tags).not.toContain('#even');
      expect(tags).not.toContain('#where');

      // Reflective input → minimal tags
      expect(tags.length).toBeLessThanOrEqual(2);
    });

    it('REGRESSION: never allow #meant to appear', () => {
      const tags = simulateMindDropTagPipeline('Not sure what I meant by that', 'journal');

      expect(tags).not.toContain('#meant');
      expect(tags).not.toContain('#not');
      expect(tags).not.toContain('#sure');

      expect(tags.length).toBeLessThanOrEqual(2);
    });

    it('REGRESSION: never allow #start from generic action', () => {
      const tags = simulateMindDropTagPipeline('Need to start working on this project', 'journal');

      expect(tags).not.toContain('#start');
      expect(tags).not.toContain('#need');
      expect(tags).not.toContain('#working');

      // Should extract "project" at minimum
      expect(tags).toContain('#project');
    });
  });

  describe('Pipeline Integration', () => {
    it('simulates exact Mind Drop flow for todos', () => {
      const text = 'Book dentist for Friday';
      const raw = extractMeaningfulTags(text);
      const tags = filterAndNormalizeTags(raw);

      // Junk filtered
      expect(tags).not.toContain('#dont');
      expect(tags).not.toContain('#know');
      expect(tags).not.toContain('#should');
      expect(tags).not.toContain('#soon');
      expect(tags).not.toContain('#book'); // Generic verb

      // Meaningful tag kept
      expect(tags).toContain('#dentist');
    });

    it('simulates exact Mind Drop flow for journal entries', () => {
      const text = "Not sure what I meant, but I'm feeling overwhelmed lately";
      const raw = extractMeaningfulTags(text, 'journal');
      const tags = filterAndNormalizeTags(raw);

      // Junk filtered
      expect(tags).not.toContain('#not');
      expect(tags).not.toContain('#sure');
      expect(tags).not.toContain('#meant');
      expect(tags).not.toContain('#im');
      expect(tags).not.toContain('#lately');

      // Emotion tag might be kept (it's in ALLOWED_EMOTIONS)
      // Don't enforce exact tags, just verify junk is blocked
      expect(tags.every((tag) => tag !== '#not' && tag !== '#sure' && tag !== '#meant')).toBe(true);
    });
  });
});
