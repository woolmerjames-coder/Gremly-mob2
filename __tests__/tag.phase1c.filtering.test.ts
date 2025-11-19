/**
 * Phase 1C: Aggressive Tag Quality Filtering Tests
 *
 * Tests the strengthened filterAndNormalizeTags function with:
 * - Expanded TAG_STOP_WORDS (been, bit, doable, down, etc.)
 * - Min length: 3 characters
 * - Max length: 20 characters
 * - Pattern enforcement: [a-z][a-z0-9_]*
 * - Pre-validation symbol stripping
 */

import { filterAndNormalizeTags } from '../lib/tags/normalize';
import { TAG_STOP_WORDS } from '../lib/tags/constants';

describe('Phase 1C: Aggressive Tag Filtering', () => {
  describe('New stop words removal', () => {
    it('filters out "been"', () => {
      const result = filterAndNormalizeTags(['#been', 'project']);
      expect(result).toEqual(['#project']);
      expect(TAG_STOP_WORDS.has('been')).toBe(true);
    });

    it('filters out "bit"', () => {
      const result = filterAndNormalizeTags(['#bit', 'important']);
      expect(result).toEqual(['#important']);
      expect(TAG_STOP_WORDS.has('bit')).toBe(true);
    });

    it('filters out "doable"', () => {
      const result = filterAndNormalizeTags(['doable', 'project', 'deadline']);
      expect(result).toEqual(['#project', '#deadline']);
      expect(TAG_STOP_WORDS.has('doable')).toBe(true);
    });

    it('filters out "down", "going", "went"', () => {
      const result = filterAndNormalizeTags(['down', 'going', 'went', '#exercise']);
      expect(result).toEqual(['#exercise']);
      expect(TAG_STOP_WORDS.has('down')).toBe(true);
      expect(TAG_STOP_WORDS.has('going')).toBe(true);
      expect(TAG_STOP_WORDS.has('went')).toBe(true);
    });

    it('filters out "seems", "need", "want"', () => {
      const result = filterAndNormalizeTags(['seems', 'need', 'want', 'focus']);
      expect(result).toEqual(['#focus']);
      expect(TAG_STOP_WORDS.has('seems')).toBe(true);
      expect(TAG_STOP_WORDS.has('need')).toBe(true);
      expect(TAG_STOP_WORDS.has('want')).toBe(true);
    });

    it('filters out "getting", "doing", "done", "got"', () => {
      const result = filterAndNormalizeTags(['getting', 'doing', 'done', 'got', 'wellness']);
      expect(result).toEqual(['#wellness']);
      expect(TAG_STOP_WORDS.has('getting')).toBe(true);
      expect(TAG_STOP_WORDS.has('doing')).toBe(true);
      expect(TAG_STOP_WORDS.has('done')).toBe(true);
      expect(TAG_STOP_WORDS.has('got')).toBe(true);
    });

    it('filters out "build", "things", "needs", "wants"', () => {
      const result = filterAndNormalizeTags(['build', 'things', 'needs', 'wants', 'project']);
      expect(result).toEqual(['#project']);
      expect(TAG_STOP_WORDS.has('build')).toBe(true);
      expect(TAG_STOP_WORDS.has('things')).toBe(true);
      expect(TAG_STOP_WORDS.has('needs')).toBe(true);
      expect(TAG_STOP_WORDS.has('wants')).toBe(true);
    });
  });

  describe('Minimum length validation (3 chars)', () => {
    it('filters out tags shorter than 3 characters', () => {
      const result = filterAndNormalizeTags(['#ab', '#a', 'ok', 'tax', 'gym']);
      // tax and gym are in SHORT_TAG_WHITELIST, but ab, a, ok are too short
      expect(result).toEqual(['#tax', '#gym']);
    });

    it('filters out 1-2 character tags even with valid prefix', () => {
      const result = filterAndNormalizeTags(['#x', '#y', '#abc']);
      expect(result).toEqual(['#abc']);
    });

    it('keeps exactly 3-character tags if not stop words', () => {
      const result = filterAndNormalizeTags(['tax', 'gym', 'job', 'api', 'dev']);
      // tax, gym, job are whitelisted; api, dev should work if >=3 chars
      expect(result).toContain('#tax');
      expect(result).toContain('#gym');
      expect(result).toContain('#job');
      expect(result).toContain('#api');
      expect(result).toContain('#dev');
    });
  });

  describe('Maximum length validation (20 chars)', () => {
    it('filters out tags longer than 20 characters', () => {
      const result = filterAndNormalizeTags([
        'verylongtagname123456', // 21 chars
        'appropriatelength', // 17 chars
        'a'.repeat(25), // 25 chars
      ]);
      expect(result).toEqual(['#appropriatelength']);
    });

    it('keeps tags exactly at 20 character limit', () => {
      const twentyChars = 'a'.repeat(20);
      const result = filterAndNormalizeTags([twentyChars, 'short']);
      expect(result).toContain(`#${twentyChars}`);
      expect(result).toContain('#short');
    });
  });

  describe('Pattern validation [a-z][a-z0-9_]*', () => {
    it('filters out tags with spaces', () => {
      const result = filterAndNormalizeTags(['morning routine', 'exercise', 'yoga session']);
      expect(result).toEqual(['#exercise']);
    });

    it('filters out tags with punctuation', () => {
      const result = filterAndNormalizeTags([
        'doctor!',
        'meeting?',
        'work-item',
        'project.plan',
        'focus',
      ]);
      // work-item has hyphen (not allowed), but underscores are OK
      expect(result).toEqual(['#focus']);
    });

    it('allows underscores in tags', () => {
      const result = filterAndNormalizeTags(['morning_routine', 'work_project', 'api_call']);
      expect(result).toEqual(['#morning_routine', '#work_project', '#api_call']);
    });

    it('filters out tags starting with numbers', () => {
      const result = filterAndNormalizeTags(['2024goals', '1task', 'project', '3items']);
      expect(result).toEqual(['#project']);
    });

    it('allows numbers after first character', () => {
      const result = filterAndNormalizeTags(['project2024', 'task1', 'q4goals']);
      expect(result).toEqual(['#project2024', '#task1', '#q4goals']);
    });

    it('filters out tags with uppercase after normalization', () => {
      // Tags are lowercased before pattern check, so this tests the pattern works
      const result = filterAndNormalizeTags(['Project', 'TASK', 'meeting']);
      expect(result).toEqual(['#project', '#task', '#meeting']);
    });
  });

  describe('Symbol stripping before validation', () => {
    it('strips # prefix before validation', () => {
      const result = filterAndNormalizeTags(['#project', '#task', '#meeting']);
      expect(result).toEqual(['#project', '#task', '#meeting']);
    });

    it('strips * prefix before validation', () => {
      // * tags are system tags and follow different rules - they should pass if valid
      const result = filterAndNormalizeTags(['*meeting', '*journal']);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((t) => t.startsWith('*'))).toBe(true);
    });

    it('strips @ prefix before validation', () => {
      const result = filterAndNormalizeTags(['@Alice', '@Bob', '@Charlie']);
      expect(result).toEqual(['@Alice', '@Bob', '@Charlie']);
    });

    it('handles mixed prefix formats', () => {
      const result = filterAndNormalizeTags(['#project', '@Dave', '*journal', 'wellness']);
      expect(result).toContain('@Dave');
      expect(result).toContain('*journal');
      expect(result).toContain('#project');
      expect(result).toContain('#wellness');
      expect(result.length).toBe(4);
    });
  });

  describe('Combined filtering (real-world scenarios)', () => {
    it('filters AI tags from Mind Drop: ["#Been", "#bit", "#Overwhelmed", "*journal", "doable"]', () => {
      const result = filterAndNormalizeTags([
        '#Been',
        '#bit',
        '#Overwhelmed',
        '*journal',
        'doable',
      ]);
      // been, bit, doable are stop words; overwhelmed and *journal should survive
      expect(result).toContain('#overwhelmed');
      expect(result).toContain('*journal');
      expect(result).not.toContain('#been');
      expect(result).not.toContain('#bit');
      expect(result).not.toContain('#doable');
    });

    it('handles email/accountant/tax/deadline scenario', () => {
      const result = filterAndNormalizeTags([
        'email',
        'accountant',
        'tax',
        'deadline',
        'been',
        'bit',
      ]);
      // been, bit are stop words; email is too short (5 chars, should pass)
      expect(result).toEqual(['#email', '#accountant', '#tax', '#deadline']);
      expect(result).not.toContain('#been');
      expect(result).not.toContain('#bit');
    });

    it('filters junk from habit tags', () => {
      const result = filterAndNormalizeTags([
        '#meditate',
        '#every',
        '#minutes',
        '#morning',
        '#mindfulness',
      ]);
      // every, minutes, morning are stop words
      expect(result).toEqual(['#meditate', '#mindfulness']);
    });

    it('filters junk from todo tags', () => {
      const result = filterAndNormalizeTags([
        '#haircut',
        '#appointment',
        '#book',
        '#tomorrow',
        '#at',
      ]);
      // book, tomorrow, at are stop words
      expect(result).toEqual(['#haircut', '#appointment']);
    });

    it('filters junk from log tags', () => {
      const result = filterAndNormalizeTags(['#overwhelmed', '#calm', '#after', '#walk', '#been']);
      // after, been are stop words
      expect(result).toEqual(['#overwhelmed', '#calm', '#walk']);
    });
  });

  describe('Mixed format normalization', () => {
    it('normalizes *journal, #overwhelmed, overwhelmed to #overwhelmed + *journal', () => {
      const result = filterAndNormalizeTags(['*journal', '#overwhelmed', 'overwhelmed']);
      // *journal stays, overwhelmed deduplicated
      expect(result).toEqual(['*journal', '#overwhelmed']);
    });

    it('deduplicates across different prefix formats', () => {
      const result = filterAndNormalizeTags(['#project', 'project', '@project']);
      // @project takes priority (mentions dedupe hashtags with same base)
      expect(result).toContain('@project');
      expect(result.filter((t) => t.toLowerCase().includes('project')).length).toBe(1);
    });
  });

  describe('Mind Drop pipeline integration', () => {
    it('simulates full Mind Drop AI tag flow', () => {
      // Simulate AI returning junk + good tags
      const rawAiTags = [
        'email',
        'accountant',
        'tax',
        'deadline',
        'been',
        'bit',
        'getting',
        'done',
        'tomorrow',
      ];

      const filtered = filterAndNormalizeTags(rawAiTags);

      // Should keep: email, accountant, tax, deadline
      // Should filter: been, bit, getting, done, tomorrow (all in stop words)
      expect(filtered).toContain('#email');
      expect(filtered).toContain('#accountant');
      expect(filtered).toContain('#tax');
      expect(filtered).toContain('#deadline');
      expect(filtered).not.toContain('#been');
      expect(filtered).not.toContain('#bit');
      expect(filtered).not.toContain('#getting');
      expect(filtered).not.toContain('#done');
      expect(filtered).not.toContain('#tomorrow');
    });

    it('handles habit creation tags', () => {
      const rawAiTags = [
        'meditation',
        'mindfulness',
        'every',
        'daily',
        'morning',
        'minutes',
        'doing',
      ];

      const filtered = filterAndNormalizeTags(rawAiTags);

      // Should keep: meditation, mindfulness
      // Should filter: every, daily, morning, minutes, doing
      expect(filtered).toContain('#meditation');
      expect(filtered).toContain('#mindfulness');
      expect(filtered).not.toContain('#every');
      expect(filtered).not.toContain('#daily');
      expect(filtered).not.toContain('#morning');
      expect(filtered).not.toContain('#minutes');
      expect(filtered).not.toContain('#doing');
    });

    it('handles todo creation tags', () => {
      const rawAiTags = ['haircut', 'appointment', 'book', 'doctor', 'tomorrow', 'at', 'down'];

      const filtered = filterAndNormalizeTags(rawAiTags);

      // Should keep: haircut, appointment, doctor
      // Should filter: book, tomorrow, at, down
      expect(filtered).toContain('#haircut');
      expect(filtered).toContain('#appointment');
      expect(filtered).toContain('#doctor');
      expect(filtered).not.toContain('#book');
      expect(filtered).not.toContain('#tomorrow');
      expect(filtered).not.toContain('#at');
      expect(filtered).not.toContain('#down');
    });
  });

  describe('Edge cases', () => {
    it('handles empty array', () => {
      const result = filterAndNormalizeTags([]);
      expect(result).toEqual([]);
    });

    it('handles array of all junk words', () => {
      const result = filterAndNormalizeTags([
        'been',
        'bit',
        'doing',
        'done',
        'going',
        'went',
        'seems',
      ]);
      expect(result).toEqual([]);
    });

    it('handles array of all too-short tags', () => {
      const result = filterAndNormalizeTags(['a', 'b', 'c', 'ab', 'xy']);
      expect(result).toEqual([]);
    });

    it('handles array of all too-long tags', () => {
      const result = filterAndNormalizeTags(['a'.repeat(21), 'b'.repeat(25), 'c'.repeat(30)]);
      expect(result).toEqual([]);
    });

    it('handles array of all invalid patterns', () => {
      const result = filterAndNormalizeTags(['tag name', 'tag-name', 'tag.name', '123tag']);
      expect(result).toEqual([]);
    });

    it('preserves *journal even with other filters', () => {
      const result = filterAndNormalizeTags(['*journal', 'been', 'bit', 'going', 'overwhelmed']);
      expect(result).toEqual(['*journal', '#overwhelmed']);
    });

    it('handles null/undefined gracefully', () => {
      const result = filterAndNormalizeTags([null as any, undefined as any, '', 'valid']);
      expect(result).toEqual(['#valid']);
    });
  });
});
