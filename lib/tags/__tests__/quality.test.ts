/**
 * Tests for Tag Quality Filtering
 *
 * Ensures junk tokens (#has, #lately, #been, #stuff) are filtered out
 * while keeping high-quality tags (#email, #accountant, #tax, #friday)
 */

import { isGoodTokenTag, applyTagQualityFilter } from '../quality';

describe('Tag Quality Filtering', () => {
  describe('isGoodTokenTag', () => {
    it('rejects low-quality auxiliary verbs', () => {
      expect(isGoodTokenTag('#has')).toBe(false);
      expect(isGoodTokenTag('#have')).toBe(false);
      expect(isGoodTokenTag('#had')).toBe(false);
      expect(isGoodTokenTag('#been')).toBe(false);
      expect(isGoodTokenTag('#being')).toBe(false);
    });

    it('rejects vague descriptors', () => {
      expect(isGoodTokenTag('#lot')).toBe(false);
      expect(isGoodTokenTag('#stuff')).toBe(false);
      expect(isGoodTokenTag('#lately')).toBe(false);
      expect(isGoodTokenTag('#really')).toBe(false);
      expect(isGoodTokenTag('#very')).toBe(false);
      expect(isGoodTokenTag('#just')).toBe(false);
      expect(isGoodTokenTag('#thing')).toBe(false);
      expect(isGoodTokenTag('#things')).toBe(false);
    });

    it('rejects modal verbs', () => {
      expect(isGoodTokenTag('#could')).toBe(false);
      expect(isGoodTokenTag('#would')).toBe(false);
      expect(isGoodTokenTag('#should')).toBe(false);
      expect(isGoodTokenTag('#might')).toBe(false);
      expect(isGoodTokenTag('#will')).toBe(false);
      expect(isGoodTokenTag('#can')).toBe(false);
    });

    it('rejects conjunctions and prepositions', () => {
      expect(isGoodTokenTag('#because')).toBe(false);
      expect(isGoodTokenTag('#although')).toBe(false);
      expect(isGoodTokenTag('#unless')).toBe(false);
      expect(isGoodTokenTag('#until')).toBe(false);
      expect(isGoodTokenTag('#after')).toBe(false);
      expect(isGoodTokenTag('#before')).toBe(false);
      expect(isGoodTokenTag('#when')).toBe(false);
      expect(isGoodTokenTag('#where')).toBe(false);
    });

    it('rejects very short tokens (< 3 chars) unless whitelisted', () => {
      expect(isGoodTokenTag('#ab')).toBe(false);
      expect(isGoodTokenTag('#x')).toBe(false);
      expect(isGoodTokenTag('#it')).toBe(false);
    });

    it('accepts whitelisted short tokens', () => {
      expect(isGoodTokenTag('#tax')).toBe(true);
      expect(isGoodTokenTag('#gym')).toBe(true);
      expect(isGoodTokenTag('#job')).toBe(true);
      expect(isGoodTokenTag('#car')).toBe(true);
      expect(isGoodTokenTag('#dr')).toBe(true);
      expect(isGoodTokenTag('#apt')).toBe(true);
    });

    it('accepts good quality tags', () => {
      expect(isGoodTokenTag('#email')).toBe(true);
      expect(isGoodTokenTag('#accountant')).toBe(true);
      expect(isGoodTokenTag('#friday')).toBe(true);
      expect(isGoodTokenTag('#work')).toBe(true);
      expect(isGoodTokenTag('#dentist')).toBe(true);
      expect(isGoodTokenTag('#appointment')).toBe(true);
      expect(isGoodTokenTag('#running')).toBe(true);
      expect(isGoodTokenTag('#deadline')).toBe(true);
    });

    it('always accepts star tags (system categories)', () => {
      expect(isGoodTokenTag('*journal')).toBe(true);
      expect(isGoodTokenTag('*idea')).toBe(true);
      expect(isGoodTokenTag('*list')).toBe(true);
      expect(isGoodTokenTag('*meeting')).toBe(true);
    });

    it('always accepts mention tags', () => {
      expect(isGoodTokenTag('@John')).toBe(true);
      expect(isGoodTokenTag('@DrSmith')).toBe(true);
      expect(isGoodTokenTag('@TeamLead')).toBe(true);
    });

    it('handles tags without # prefix', () => {
      expect(isGoodTokenTag('email')).toBe(true);
      expect(isGoodTokenTag('has')).toBe(false);
      expect(isGoodTokenTag('lately')).toBe(false);
    });

    it('handles empty/null tags', () => {
      expect(isGoodTokenTag('')).toBe(false);
      expect(isGoodTokenTag('#')).toBe(false);
      expect(isGoodTokenTag('  ')).toBe(false);
    });
  });

  describe('applyTagQualityFilter', () => {
    it('filters out junk tags from "Work stuff has been a lot lately"', () => {
      const input = ['#work', '#stuff', '#has', '#been', '#lot', '#lately'];
      const output = applyTagQualityFilter(input);

      expect(output).toEqual(['#work']);
      expect(output).not.toContain('#has');
      expect(output).not.toContain('#lately');
      expect(output).not.toContain('#been');
      expect(output).not.toContain('#stuff');
      expect(output).not.toContain('#lot');
    });

    it('keeps high-quality tags from "Email my accountant about the tax letter before Friday"', () => {
      const input = ['#email', '#accountant', '#tax', '#letter', '#before', '#friday'];
      const output = applyTagQualityFilter(input);

      expect(output).toContain('#email');
      expect(output).toContain('#accountant');
      expect(output).toContain('#tax');
      expect(output).toContain('#letter');
      expect(output).toContain('#friday');
      expect(output).not.toContain('#before'); // Conjunction
    });

    it('removes duplicates', () => {
      const input = ['#work', '#Work', '#email', '#Email'];
      const output = applyTagQualityFilter(input);

      // All should be preserved (Set deduplication by exact match)
      expect(output.length).toBeGreaterThan(0);
      expect(output).toContain('#work');
      expect(output).toContain('#email');
    });

    it('preserves star tags and mentions', () => {
      const input = ['*journal', '#has', '@DrSmith', '#work', '#lately'];
      const output = applyTagQualityFilter(input);

      expect(output).toContain('*journal');
      expect(output).toContain('@DrSmith');
      expect(output).toContain('#work');
      expect(output).not.toContain('#has');
      expect(output).not.toContain('#lately');
    });

    it('handles null/undefined input', () => {
      expect(applyTagQualityFilter(null)).toEqual([]);
      expect(applyTagQualityFilter(undefined)).toEqual([]);
      expect(applyTagQualityFilter([])).toEqual([]);
    });

    it('handles empty array', () => {
      expect(applyTagQualityFilter([])).toEqual([]);
    });

    it('filters complex real-world example', () => {
      const input = [
        '*journal',
        '#overwhelmed',
        '#work',
        '#has',
        '#been',
        '#lot',
        '#lately',
        '#stress',
        '#should',
        '#maybe',
        '@Manager',
      ];
      const output = applyTagQualityFilter(input);

      expect(output).toContain('*journal');
      expect(output).toContain('#overwhelmed');
      expect(output).toContain('#work');
      expect(output).toContain('#stress');
      expect(output).toContain('@Manager');

      expect(output).not.toContain('#has');
      expect(output).not.toContain('#been');
      expect(output).not.toContain('#lot');
      expect(output).not.toContain('#lately');
      expect(output).not.toContain('#should');
      expect(output).not.toContain('#maybe');
    });

    // Phase 4A: Additional test cases for upgraded tag quality
    describe('Phase 4A: Upgraded Tag Quality', () => {
      it('rejects common action verbs (start, stop, make, take, give, keep, need, want)', () => {
        expect(isGoodTokenTag('#start')).toBe(false);
        expect(isGoodTokenTag('#started')).toBe(false);
        expect(isGoodTokenTag('#starting')).toBe(false);
        expect(isGoodTokenTag('#stop')).toBe(false);
        expect(isGoodTokenTag('#make')).toBe(false);
        expect(isGoodTokenTag('#take')).toBe(false);
        expect(isGoodTokenTag('#give')).toBe(false);
        expect(isGoodTokenTag('#keep')).toBe(false);
        expect(isGoodTokenTag('#need')).toBe(false);
        expect(isGoodTokenTag('#want')).toBe(false);
        expect(isGoodTokenTag('#doing')).toBe(false);
      });

      it('rejects generic time words (every, always, morning, afternoon, evening, today, tomorrow)', () => {
        expect(isGoodTokenTag('#every')).toBe(false);
        expect(isGoodTokenTag('#always')).toBe(false);
        expect(isGoodTokenTag('#never')).toBe(false);
        expect(isGoodTokenTag('#morning')).toBe(false);
        expect(isGoodTokenTag('#afternoon')).toBe(false);
        expect(isGoodTokenTag('#evening')).toBe(false);
        expect(isGoodTokenTag('#tonight')).toBe(false);
        expect(isGoodTokenTag('#today')).toBe(false);
        expect(isGoodTokenTag('#yesterday')).toBe(false);
        expect(isGoodTokenTag('#tomorrow')).toBe(false);
      });

      it('filters "Work stuff has been a lot lately" to only #work', () => {
        const input = ['#work', '#stuff', '#has', '#been', '#lot', '#lately'];
        const output = applyTagQualityFilter(input);

        expect(output).toEqual(['#work']);
        expect(output.length).toBe(1);
      });

      it('keeps quality tags from "Email accountant about tax letter"', () => {
        const input = ['#email', '#accountant', '#about', '#tax', '#letter'];
        const output = applyTagQualityFilter(input);

        expect(output).toContain('#email');
        expect(output).toContain('#accountant');
        expect(output).toContain('#tax');
        expect(output).toContain('#letter');
        expect(output).not.toContain('#about'); // Preposition
        expect(output.length).toBe(4);
      });

      it('filters "Start running every morning" to only #running', () => {
        const input = ['#start', '#running', '#every', '#morning'];
        const output = applyTagQualityFilter(input);

        expect(output).toEqual(['#running']);
        expect(output).not.toContain('#start');
        expect(output).not.toContain('#every');
        expect(output).not.toContain('#morning');
      });

      it('returns empty array when all tags are junk', () => {
        const input = ['#has', '#been', '#lot', '#stuff', '#lately', '#really', '#very'];
        const output = applyTagQualityFilter(input);

        expect(output).toEqual([]);
      });

      it('preserves theme tags and AI tags while filtering junk', () => {
        const input = ['#work', '#exercise', '#start', '#every', '#morning', '#running'];
        const output = applyTagQualityFilter(input);

        expect(output).toContain('#work'); // Theme tag
        expect(output).toContain('#exercise'); // Theme tag
        expect(output).toContain('#running'); // Good quality tag
        expect(output).not.toContain('#start');
        expect(output).not.toContain('#every');
        expect(output).not.toContain('#morning');
      });
    });

    // Low-signal emotional/state words filtering
    describe('Low-signal emotional/state words', () => {
      it('rejects vague emotional words (feeling, feels, felt, feel)', () => {
        expect(isGoodTokenTag('#feeling')).toBe(false);
        expect(isGoodTokenTag('#feels')).toBe(false);
        expect(isGoodTokenTag('#felt')).toBe(false);
        expect(isGoodTokenTag('#feel')).toBe(false);
      });

      it('rejects vague state descriptors (off, good, bad, okay, fine)', () => {
        expect(isGoodTokenTag('#off')).toBe(false);
        expect(isGoodTokenTag('#good')).toBe(false);
        expect(isGoodTokenTag('#bad')).toBe(false);
        expect(isGoodTokenTag('#okay')).toBe(false);
        expect(isGoodTokenTag('#fine')).toBe(false);
        expect(isGoodTokenTag('#better')).toBe(false);
        expect(isGoodTokenTag('#worse')).toBe(false);
      });

      it('rejects generic qualitative words (nice, great, terrible, weird, strange)', () => {
        expect(isGoodTokenTag('#nice')).toBe(false);
        expect(isGoodTokenTag('#great')).toBe(false);
        expect(isGoodTokenTag('#terrible')).toBe(false);
        expect(isGoodTokenTag('#weird')).toBe(false);
        expect(isGoodTokenTag('#strange')).toBe(false);
      });

      it('filters "Feeling off" to no content tags', () => {
        const input = ['#feeling', '#off'];
        const output = applyTagQualityFilter(input);

        expect(output).toEqual([]);
        expect(output).not.toContain('#feeling');
        expect(output).not.toContain('#off');
      });

      it('filters "Feeling off" with *journal marker to only keep marker', () => {
        const input = ['*journal', '#feeling', '#off'];
        const output = applyTagQualityFilter(input);

        expect(output).toEqual(['*journal']);
        expect(output).not.toContain('#feeling');
        expect(output).not.toContain('#off');
      });
    });

    // Protected meaningful tags
    describe('Protected meaningful tags', () => {
      it('always preserves core life domain tags', () => {
        expect(isGoodTokenTag('#work')).toBe(true);
        expect(isGoodTokenTag('#health')).toBe(true);
        expect(isGoodTokenTag('#money')).toBe(true);
        expect(isGoodTokenTag('#exercise')).toBe(true);
        expect(isGoodTokenTag('#sleep')).toBe(true);
        expect(isGoodTokenTag('#relationships')).toBe(true);
      });

      it('always preserves log subtype tags', () => {
        expect(isGoodTokenTag('#journal')).toBe(true);
        expect(isGoodTokenTag('#idea')).toBe(true);
        expect(isGoodTokenTag('#list')).toBe(true);
        expect(isGoodTokenTag('#reflection')).toBe(true);
        expect(isGoodTokenTag('#insight')).toBe(true);
      });

      it('always preserves action tags', () => {
        expect(isGoodTokenTag('#email')).toBe(true);
        expect(isGoodTokenTag('#call')).toBe(true);
        expect(isGoodTokenTag('#meeting')).toBe(true);
        expect(isGoodTokenTag('#deadline')).toBe(true);
        expect(isGoodTokenTag('#appointment')).toBe(true);
      });

      it('always preserves exercise type tags', () => {
        expect(isGoodTokenTag('#running')).toBe(true);
        expect(isGoodTokenTag('#walking')).toBe(true);
        expect(isGoodTokenTag('#cycling')).toBe(true);
        expect(isGoodTokenTag('#swimming')).toBe(true);
        expect(isGoodTokenTag('#yoga')).toBe(true);
      });

      it('preserves protected tags even with mixed case', () => {
        expect(isGoodTokenTag('#Work')).toBe(true);
        expect(isGoodTokenTag('#HEALTH')).toBe(true);
        expect(isGoodTokenTag('#Running')).toBe(true);
      });
    });
  });
});
