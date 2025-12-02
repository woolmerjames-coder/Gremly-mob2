import { generateTitle, verifyBodyPreservation, _testExports } from '../generateTitle';

const { stripPrefixes, stripTimeExpressions, toSentenceCase, truncateToWords } = _testExports;

describe('generateTitle', () => {
  describe('Body Preservation (CRITICAL)', () => {
    it('preserves complete input with time expressions', () => {
      const input = 'Call mom tomorrow at 3pm about her birthday plans';
      const result = generateTitle(input);
      expect(result.originalInput).toBe(input);
    });

    it('preserves input with special characters', () => {
      const input = 'Email re: Q3 budget & projections @work';
      const result = generateTitle(input);
      expect(result.originalInput).toBe(input);
    });

    it('preserves multiline input', () => {
      const input = 'Shopping list:\n- Milk\n- Eggs\n- Bread';
      const result = generateTitle(input);
      expect(result.originalInput).toBe(input);
    });

    it('preserves long input verbatim', () => {
      const input =
        'This is a very long input that contains many words and should be preserved completely in the body without any truncation whatsoever';
      const result = generateTitle(input);
      expect(result.originalInput).toBe(input);
    });
  });

  describe('Title Generation', () => {
    it('generates short title from long input', () => {
      const input = 'Call mom tomorrow at 3pm about her birthday plans and party arrangements';
      const result = generateTitle(input);
      expect(result.title.split(' ').length).toBeLessThanOrEqual(7);
    });

    it('strips "Remind me to" prefix', () => {
      const input = 'Remind me to call the dentist';
      const result = generateTitle(input);
      expect(result.title.toLowerCase()).not.toContain('remind me to');
      expect(result.title.toLowerCase()).toContain('call');
    });

    it('strips "Todo:" prefix', () => {
      const input = 'Todo: buy groceries';
      const result = generateTitle(input);
      expect(result.title.toLowerCase()).not.toContain('todo');
    });

    it('strips time expressions from title', () => {
      const input = 'Meeting tomorrow at 3pm with client';
      const result = generateTitle(input);
      expect(result.title.toLowerCase()).not.toContain('tomorrow');
      expect(result.title.toLowerCase()).not.toContain('3pm');
    });

    it('applies sentence case', () => {
      const input = 'BUY GROCERIES';
      const result = generateTitle(input);
      expect(result.title).toBe('Buy groceries');
    });

    it('uses AI title if valid', () => {
      const input = 'Call mom tomorrow at 3pm about her birthday';
      const aiTitle = 'Call mom about birthday';
      const result = generateTitle(input, aiTitle);
      expect(result.title).toBe('Call mom about birthday');
    });

    it('rejects AI title if too short', () => {
      const input = 'Call mom tomorrow';
      const aiTitle = 'Call';
      const result = generateTitle(input, aiTitle);
      expect(result.title).not.toBe('Call');
    });

    it('rejects AI title if too long', () => {
      const input = 'Call mom';
      const aiTitle = 'This is a very long title that has way too many words in it';
      const result = generateTitle(input, aiTitle);
      expect(result.title).not.toBe(aiTitle);
    });

    it('returns "Untitled" for empty input', () => {
      const result = generateTitle('   ');
      expect(result.title).toBe('Untitled');
    });
  });

  describe('stripPrefixes', () => {
    it('strips "I need to"', () => {
      expect(stripPrefixes('I need to call mom')).toBe('call mom');
    });

    it('strips "Don\'t forget to"', () => {
      expect(stripPrefixes("Don't forget to buy milk")).toBe('buy milk');
    });

    it('strips "Remember to"', () => {
      expect(stripPrefixes('Remember to submit report')).toBe('submit report');
    });

    it('is case insensitive', () => {
      expect(stripPrefixes('REMIND ME TO call')).toBe('call');
    });
  });

  describe('stripTimeExpressions', () => {
    it('strips "tomorrow"', () => {
      expect(stripTimeExpressions('Call mom tomorrow')).toBe('Call mom');
    });

    it('strips "at 3pm"', () => {
      expect(stripTimeExpressions('Meeting at 3pm')).toBe('Meeting');
    });

    it('strips "next week"', () => {
      expect(stripTimeExpressions('Submit report next week')).toBe('Submit report');
    });

    it('strips day names', () => {
      expect(stripTimeExpressions('Meeting on Monday')).toBe('Meeting');
    });

    it('strips "by end of today"', () => {
      expect(stripTimeExpressions('Finish by end of today')).toBe('Finish');
    });
  });

  describe('verifyBodyPreservation', () => {
    it('returns true when body equals input', () => {
      const input = 'Test input with time at 3pm';
      expect(verifyBodyPreservation(input, input)).toBe(true);
    });

    it('returns false when body differs', () => {
      const input = 'Test input with time at 3pm';
      const modified = 'Test input with time';
      expect(verifyBodyPreservation(input, modified)).toBe(false);
    });
  });

  describe('Real-world examples', () => {
    it('Call mom tomorrow at 3pm about her birthday plans', () => {
      const input = 'Call mom tomorrow at 3pm about her birthday plans';
      const result = generateTitle(input);

      // Body preserved exactly
      expect(result.originalInput).toBe(input);

      // Title is summarized, time stripped
      expect(result.title.toLowerCase()).not.toContain('tomorrow');
      expect(result.title.toLowerCase()).not.toContain('3pm');
      expect(result.title.toLowerCase()).toContain('call');
      expect(result.title.toLowerCase()).toContain('mom');
    });

    it('Remind me to book dentist appointment by Friday', () => {
      const input = 'Remind me to book dentist appointment by Friday';
      const result = generateTitle(input);

      expect(result.originalInput).toBe(input);
      expect(result.title.toLowerCase()).not.toContain('remind me to');
      expect(result.title.toLowerCase()).not.toContain('friday');
      expect(result.title.toLowerCase()).toContain('dentist');
    });

    it('Todo: submit Q3 report to Sarah by end of day', () => {
      const input = 'Todo: submit Q3 report to Sarah by end of day';
      const result = generateTitle(input);

      expect(result.originalInput).toBe(input);
      expect(result.title.toLowerCase()).not.toContain('todo');
      expect(result.title.toLowerCase()).toContain('report');
    });
  });
});
