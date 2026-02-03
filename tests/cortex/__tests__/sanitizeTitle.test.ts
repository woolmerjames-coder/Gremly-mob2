/**
 * Tests for sanitizeTitle logic in cortex worker
 *
 * The sanitizeTitle function strips frequency words and leading temporal info
 * from generated titles. This test file mirrors that logic for testability.
 */

// Mirror of sanitizeTitle from workers/cortex/index.js
function sanitizeTitle(title: string): string {
  let t = title || '';

  // Strip leading temporal tokens (these get stored as due_day/scheduled_date)
  t = t.replace(
    /^(tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|next\s+week|this\s+week)\s*[-:,]?\s*/i,
    '',
  );

  // Strip frequency words (these are tracked as metadata, not in titles)
  t = t
    .replace(
      /\b(daily|weekly|every\s+(day|morning|evening|night|week)|(\d+x?\s*(per|a|\/)\s*week))\b/gi,
      '',
    )
    .trim();

  // Clean up any double spaces left behind
  t = t.replace(/\s+/g, ' ').trim();

  return t;
}

describe('sanitizeTitle', () => {
  describe('leading temporal stripping', () => {
    it('strips "Tomorrow" from beginning', () => {
      expect(sanitizeTitle('Tomorrow pick up groceries')).toBe('pick up groceries');
    });

    it('strips "Today:" from beginning', () => {
      expect(sanitizeTitle('Today: finish report')).toBe('finish report');
    });

    it('strips "Monday -" from beginning', () => {
      expect(sanitizeTitle('Monday - dentist appointment')).toBe('dentist appointment');
    });

    it('strips "next week" from beginning', () => {
      expect(sanitizeTitle('next week call mom')).toBe('call mom');
    });

    it('preserves temporal words in middle of title', () => {
      expect(sanitizeTitle('Call mom on Monday')).toBe('Call mom on Monday');
    });

    it('is case insensitive', () => {
      expect(sanitizeTitle('TOMORROW Pick up laundry')).toBe('Pick up laundry');
    });
  });

  describe('frequency word stripping', () => {
    it('strips "daily" from title', () => {
      expect(sanitizeTitle('Take vitamins daily')).toBe('Take vitamins');
    });

    it('strips "weekly" from title', () => {
      expect(sanitizeTitle('Review goals weekly')).toBe('Review goals');
    });

    it('strips "every day" from title', () => {
      expect(sanitizeTitle('Meditate every day')).toBe('Meditate');
    });

    it('strips "every morning" from title', () => {
      expect(sanitizeTitle('Stretch every morning')).toBe('Stretch');
    });

    it('strips "every evening" from title', () => {
      expect(sanitizeTitle('Journal every evening')).toBe('Journal');
    });

    it('strips "every night" from title', () => {
      expect(sanitizeTitle('Read every night')).toBe('Read');
    });

    it('strips "every week" from title', () => {
      expect(sanitizeTitle('Clean house every week')).toBe('Clean house');
    });

    it('strips "3x per week" from title', () => {
      expect(sanitizeTitle('Go to gym 3x per week')).toBe('Go to gym');
    });

    it('strips "2x a week" from title', () => {
      expect(sanitizeTitle('Run 2x a week')).toBe('Run');
    });

    it('strips "3/week" pattern from title', () => {
      expect(sanitizeTitle('Exercise 3/week')).toBe('Exercise');
    });

    it('handles frequency at start of title', () => {
      expect(sanitizeTitle('Daily take vitamins')).toBe('take vitamins');
    });

    it('handles frequency in middle of title', () => {
      expect(sanitizeTitle('Take vitamins daily after breakfast')).toBe(
        'Take vitamins after breakfast',
      );
    });

    it('is case insensitive for frequency words', () => {
      expect(sanitizeTitle('Take vitamins DAILY')).toBe('Take vitamins');
    });
  });

  describe('combined stripping', () => {
    it('strips both leading temporal and frequency', () => {
      expect(sanitizeTitle('Tomorrow start daily meditation')).toBe('start meditation');
    });

    it('cleans up double spaces', () => {
      expect(sanitizeTitle('Take  vitamins  daily')).toBe('Take vitamins');
    });

    it('preserves normal titles without temporal/frequency', () => {
      expect(sanitizeTitle('Buy groceries')).toBe('Buy groceries');
    });

    it('handles empty input', () => {
      expect(sanitizeTitle('')).toBe('');
    });

    it('handles whitespace-only input', () => {
      expect(sanitizeTitle('   ')).toBe('');
    });
  });

  describe('edge cases', () => {
    it('does not strip "sundae" (partial match of sunday)', () => {
      expect(sanitizeTitle('Buy ice cream sundae')).toBe('Buy ice cream sundae');
    });

    it('does not strip "Monday" when not at start', () => {
      expect(sanitizeTitle('Plan for Monday meeting')).toBe('Plan for Monday meeting');
    });

    it('handles multiple frequency mentions', () => {
      expect(sanitizeTitle('Exercise daily and weekly review')).toBe('Exercise and review');
    });

    it('preserves title content after stripping', () => {
      const result = sanitizeTitle('Tomorrow: Start exercising daily in the morning');
      expect(result).toBe('Start exercising in the morning');
    });
  });
});
