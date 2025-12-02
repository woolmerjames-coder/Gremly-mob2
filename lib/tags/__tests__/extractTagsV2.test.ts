import { extractTagsV2, tagsToArray, _testExports } from '../extractTagsV2';

const { KEYWORD_BLOCKLIST, extractNames, extractKeywords, extractThemes } = _testExports;

describe('extractTagsV2', () => {
  describe('Stage 1: Name Detection', () => {
    it('extracts names after "with"', () => {
      const result = extractTagsV2('Dinner with Sarah on Friday');
      expect(result.mentions).toContain('sarah');
    });

    it('extracts full names', () => {
      const result = extractTagsV2('Meeting with Sarah Jones tomorrow');
      expect(result.mentions).toContain('sarah-jones');
    });

    it('extracts names after "from"', () => {
      const result = extractTagsV2('Email from Mike about the project');
      expect(result.mentions).toContain('mike');
    });

    it('does NOT extract days as names', () => {
      const result = extractTagsV2('Meet with Monday team');
      expect(result.mentions).not.toContain('monday');
    });

    it('does NOT extract months as names', () => {
      const result = extractTagsV2('Call with April department');
      expect(result.mentions).not.toContain('april');
    });

    it('extracts Dr. titles', () => {
      const result = extractTagsV2('Appointment with Dr. Smith');
      expect(result.mentions).toContain('dr-smith');
    });
  });

  describe('Stage 2: Keyword Extraction', () => {
    it('extracts meaningful nouns', () => {
      const result = extractTagsV2('Book dentist appointment for checkup');
      expect(result.keywords).toContain('dentist');
      expect(result.keywords).toContain('checkup');
      // 'appointment' and 'book' are generic action words, filtered
      expect(result.keywords).not.toContain('appointment');
      expect(result.keywords).not.toContain('book');
    });

    it('does NOT extract pronouns', () => {
      const result = extractTagsV2('I should call her about it');
      expect(result.keywords).not.toContain('i');
      expect(result.keywords).not.toContain('her');
      expect(result.keywords).not.toContain('it');
    });

    it('does NOT extract common verbs', () => {
      const result = extractTagsV2('She was thinking about going');
      expect(result.keywords).not.toContain('was');
      expect(result.keywords).not.toContain('thinking');
      expect(result.keywords).not.toContain('going');
    });

    it('does NOT extract hedging words', () => {
      const result = extractTagsV2('Maybe I should probably do something');
      expect(result.keywords).not.toContain('maybe');
      expect(result.keywords).not.toContain('probably');
      expect(result.keywords).not.toContain('should');
    });

    it('allows whitelisted short words', () => {
      const result = extractTagsV2('Pay tax and go to gym');
      expect(result.keywords).toContain('tax');
      expect(result.keywords).toContain('gym');
    });
  });

  describe('Stage 3: Theme Detection (Double Signal)', () => {
    it('applies health theme with 2+ triggers', () => {
      const result = extractTagsV2('Doctor appointment for checkup');
      expect(result.themes).toContain('health');
    });

    it('does NOT apply theme with only 1 trigger', () => {
      const result = extractTagsV2('Call the doctor');
      expect(result.themes).not.toContain('health');
    });

    it('applies exercise theme with 2+ triggers', () => {
      const result = extractTagsV2('Go to gym for workout');
      expect(result.themes).toContain('exercise');
    });

    it('applies work theme with 2+ triggers', () => {
      const result = extractTagsV2('Meeting with client about project');
      expect(result.themes).toContain('work');
    });
  });

  describe('Stage 4: Quality Gate', () => {
    it('filters out short words not in whitelist', () => {
      const result = extractTagsV2('Do it by 5pm ok');
      expect(result.keywords).not.toContain('it');
      expect(result.keywords).not.toContain('by');
      expect(result.keywords).not.toContain('ok');
    });

    it('filters contraction fragments', () => {
      const result = extractTagsV2("I've been thinking I'd call");
      expect(result.keywords).not.toContain('ve');
      expect(result.keywords).not.toContain('d');
    });
  });

  describe('Blocklist coverage', () => {
    it('blocks "she"', () => {
      expect(KEYWORD_BLOCKLIST.has('she')).toBe(true);
    });

    it('blocks "he"', () => {
      expect(KEYWORD_BLOCKLIST.has('he')).toBe(true);
    });

    it('blocks "was"', () => {
      expect(KEYWORD_BLOCKLIST.has('was')).toBe(true);
    });

    it('blocks "been"', () => {
      expect(KEYWORD_BLOCKLIST.has('been')).toBe(true);
    });

    it('blocks "has"', () => {
      expect(KEYWORD_BLOCKLIST.has('has')).toBe(true);
    });

    it('blocks "lately"', () => {
      expect(KEYWORD_BLOCKLIST.has('lately')).toBe(true);
    });
  });

  describe('tagsToArray', () => {
    it('formats mentions with @ prefix', () => {
      const extracted = {
        mentions: ['sarah'],
        keywords: ['dinner'],
        themes: [],
        subtype: undefined,
      };
      const arr = tagsToArray(extracted);
      expect(arr).toContain('@sarah');
    });

    it('includes subtype for logs', () => {
      const extracted = { mentions: [], keywords: ['gratitude'], themes: [], subtype: 'journal' };
      const arr = tagsToArray(extracted);
      expect(arr).toContain('journal');
    });

    it('deduplicates', () => {
      const extracted = {
        mentions: [],
        keywords: ['work', 'work'],
        themes: ['work'],
        subtype: undefined,
      };
      const arr = tagsToArray(extracted);
      expect(arr.filter((t) => t === 'work').length).toBe(1);
    });
  });

  describe('Real-world examples', () => {
    it('Dinner with Sarah on Friday', () => {
      // Note: "with Sarah Friday" would match as full name "sarah-friday"
      // Using "on Friday" separates the name from the day
      const result = extractTagsV2('Dinner with Sarah on Friday');
      expect(result.mentions).toContain('sarah');
      expect(result.keywords).toContain('dinner');
      expect(result.keywords).not.toContain('friday'); // time word
    });

    it('Should probably book dentist appointment', () => {
      const result = extractTagsV2('Should probably book dentist appointment');
      expect(result.keywords).not.toContain('should');
      expect(result.keywords).not.toContain('probably');
      expect(result.keywords).not.toContain('book'); // generic action verb
      expect(result.keywords).not.toContain('appointment'); // too generic
      expect(result.keywords).toContain('dentist'); // meaningful noun
    });

    it('Feeling overwhelmed lately', () => {
      const result = extractTagsV2('Feeling overwhelmed lately');
      expect(result.keywords).not.toContain('lately');
      expect(result.keywords).not.toContain('feeling');
      expect(result.keywords).toContain('overwhelmed');
    });

    it('She was at the gym yesterday', () => {
      const result = extractTagsV2('She was at the gym yesterday');
      expect(result.keywords).not.toContain('she');
      expect(result.keywords).not.toContain('was');
      expect(result.keywords).not.toContain('yesterday');
      expect(result.keywords).toContain('gym');
    });
  });
});
