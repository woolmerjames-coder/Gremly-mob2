/**
 * frequencyUtils.test.ts
 *
 * Tests for the single source of truth frequency parsing and display utilities.
 * These utilities are used across:
 * - MindDrop cards (CatchAllNotepad.tsx)
 * - Today page habit rows (useWeeklyHabitStats.ts)
 * - Sweep cards (habitHelpers.ts)
 * - Overlay (UnifiedOverlayV2.tsx)
 * - Phase 2 enrichment (phase2.ts)
 */

import {
  parseFrequencyString,
  getFrequencyDisplayLabel,
  getFrequencyDisplayLabelLong,
  canonicalToFrequencyJson,
  frequencyJsonToCanonical,
  normalizeCadence,
  getHabitFrequencyLabel,
  getHabitFrequencyLabelLong,
  type Cadence,
  type FrequencyJson,
} from '../frequencyUtils';

// ─────────────────────────────────────────────────────────────────────────────
// normalizeCadence
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeCadence', () => {
  it('normalizes daily variations', () => {
    expect(normalizeCadence('daily')).toBe('daily');
    expect(normalizeCadence('day')).toBe('daily');
    expect(normalizeCadence('DAILY')).toBe('daily');
  });

  it('normalizes weekly variations', () => {
    expect(normalizeCadence('weekly')).toBe('weekly');
    expect(normalizeCadence('week')).toBe('weekly');
    expect(normalizeCadence('WEEKLY')).toBe('weekly');
  });

  it('normalizes monthly variations', () => {
    expect(normalizeCadence('monthly')).toBe('monthly');
    expect(normalizeCadence('month')).toBe('monthly');
    expect(normalizeCadence('MONTHLY')).toBe('monthly');
  });

  it('defaults to daily for null/undefined', () => {
    expect(normalizeCadence(null)).toBe('daily');
    expect(normalizeCadence(undefined)).toBe('daily');
    expect(normalizeCadence('')).toBe('daily');
  });

  it('defaults to daily for unknown values', () => {
    expect(normalizeCadence('yearly')).toBe('daily');
    expect(normalizeCadence('random')).toBe('daily');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseFrequencyString
// ─────────────────────────────────────────────────────────────────────────────

describe('parseFrequencyString', () => {
  describe('daily patterns', () => {
    it.each([
      ['daily', 'daily', 1],
      ['day', 'daily', 1],
      ['every day', 'daily', 1],
      ['everyday', 'daily', 1],
      ['every night', 'daily', 1],
    ])('"%s" → { cadence: "%s", target_per_period: %d }', (input, cadence, target) => {
      const result = parseFrequencyString(input);
      expect(result.cadence).toBe(cadence);
      expect(result.target_per_period).toBe(target);
    });
  });

  describe('weekly patterns (1x)', () => {
    it.each([
      ['weekly', 'weekly', 1],
      ['week', 'weekly', 1],
      ['once a week', 'weekly', 1],
      ['1x/week', 'weekly', 1],
      ['1x per week', 'weekly', 1],
      ['1 time a week', 'weekly', 1],
    ])('"%s" → { cadence: "%s", target_per_period: %d }', (input, cadence, target) => {
      const result = parseFrequencyString(input);
      expect(result.cadence).toBe(cadence);
      expect(result.target_per_period).toBe(target);
    });
  });

  describe('monthly patterns (1x)', () => {
    it.each([
      ['monthly', 'monthly', 1],
      ['month', 'monthly', 1],
      ['once a month', 'monthly', 1],
      ['1x/month', 'monthly', 1],
      ['1x per month', 'monthly', 1],
      ['1 time a month', 'monthly', 1],
    ])('"%s" → { cadence: "%s", target_per_period: %d }', (input, cadence, target) => {
      const result = parseFrequencyString(input);
      expect(result.cadence).toBe(cadence);
      expect(result.target_per_period).toBe(target);
    });
  });

  describe('Nx/week patterns', () => {
    it.each([
      ['3x/week', 'weekly', 3],
      ['3x per week', 'weekly', 3],
      ['3 times a week', 'weekly', 3],
      ['3 times/week', 'weekly', 3],
      ['2x/week', 'weekly', 2],
      ['5x per week', 'weekly', 5],
      ['7x/week', 'weekly', 7],
    ])('"%s" → { cadence: "%s", target_per_period: %d }', (input, cadence, target) => {
      const result = parseFrequencyString(input);
      expect(result.cadence).toBe(cadence);
      expect(result.target_per_period).toBe(target);
    });
  });

  describe('Nx/month patterns', () => {
    it.each([
      ['2x/month', 'monthly', 2],
      ['2x per month', 'monthly', 2],
      ['2 times a month', 'monthly', 2],
      ['4x/month', 'monthly', 4],
    ])('"%s" → { cadence: "%s", target_per_period: %d }', (input, cadence, target) => {
      const result = parseFrequencyString(input);
      expect(result.cadence).toBe(cadence);
      expect(result.target_per_period).toBe(target);
    });
  });

  describe('Nx/day patterns', () => {
    it.each([
      ['2x/day', 'daily', 2],
      ['2 times a day', 'daily', 2],
      ['3x per day', 'daily', 3],
    ])('"%s" → { cadence: "%s", target_per_period: %d }', (input, cadence, target) => {
      const result = parseFrequencyString(input);
      expect(result.cadence).toBe(cadence);
      expect(result.target_per_period).toBe(target);
    });
  });

  describe('defaults', () => {
    it('returns daily/1 for null', () => {
      const result = parseFrequencyString(null);
      expect(result.cadence).toBe('daily');
      expect(result.target_per_period).toBe(1);
    });

    it('returns daily/1 for undefined', () => {
      const result = parseFrequencyString(undefined);
      expect(result.cadence).toBe('daily');
      expect(result.target_per_period).toBe(1);
    });

    it('returns daily/1 for empty string', () => {
      const result = parseFrequencyString('');
      expect(result.cadence).toBe('daily');
      expect(result.target_per_period).toBe(1);
    });

    it('returns daily/1 for unrecognized patterns', () => {
      const result = parseFrequencyString('whenever I feel like it');
      expect(result.cadence).toBe('daily');
      expect(result.target_per_period).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getFrequencyDisplayLabel
// ─────────────────────────────────────────────────────────────────────────────

describe('getFrequencyDisplayLabel', () => {
  describe('daily cadence', () => {
    it('returns "Daily" for 1x', () => {
      expect(getFrequencyDisplayLabel('daily', 1)).toBe('Daily');
    });

    it('returns "2x/day" for 2x', () => {
      expect(getFrequencyDisplayLabel('daily', 2)).toBe('2x/day');
    });
  });

  describe('weekly cadence', () => {
    it('returns "Weekly" for 1x', () => {
      expect(getFrequencyDisplayLabel('weekly', 1)).toBe('Weekly');
    });

    it('returns "3x/week" for 3x', () => {
      expect(getFrequencyDisplayLabel('weekly', 3)).toBe('3x/week');
    });

    it('returns "Daily" for 7x (effectively daily)', () => {
      expect(getFrequencyDisplayLabel('weekly', 7)).toBe('Daily');
    });
  });

  describe('monthly cadence', () => {
    it('returns "Monthly" for 1x', () => {
      expect(getFrequencyDisplayLabel('monthly', 1)).toBe('Monthly');
    });

    it('returns "2x/month" for 2x', () => {
      expect(getFrequencyDisplayLabel('monthly', 2)).toBe('2x/month');
    });
  });

  describe('edge cases', () => {
    it('handles null cadence with target (defaults to daily)', () => {
      // When we have a target but no cadence, we assume daily
      expect(getFrequencyDisplayLabel(null, 1, 'daily')).toBe('Daily');
    });

    it('handles null target (defaults to 1)', () => {
      expect(getFrequencyDisplayLabel('weekly', null)).toBe('Weekly');
    });

    it('returns null when both cadence and frequency are null', () => {
      // When we have no frequency data at all, return null to hide the chip
      expect(getFrequencyDisplayLabel(null, null)).toBeNull();
    });

    it('uses frequency string when cadence is null', () => {
      expect(getFrequencyDisplayLabel(null, null, '3x/week')).toBe('3x/week');
      expect(getFrequencyDisplayLabel(null, null, 'daily')).toBe('Daily');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getFrequencyDisplayLabelLong
// ─────────────────────────────────────────────────────────────────────────────

describe('getFrequencyDisplayLabelLong', () => {
  it('returns "Daily" for daily cadence', () => {
    expect(getFrequencyDisplayLabelLong('daily', 1)).toBe('Daily');
  });

  it('returns "Weekly" for weekly 1x', () => {
    expect(getFrequencyDisplayLabelLong('weekly', 1)).toBe('Weekly');
  });

  it('returns "3x per week" for weekly 3x', () => {
    expect(getFrequencyDisplayLabelLong('weekly', 3)).toBe('3x per week');
  });

  it('returns "Monthly" for monthly 1x', () => {
    expect(getFrequencyDisplayLabelLong('monthly', 1)).toBe('Monthly');
  });

  it('returns "2x per month" for monthly 2x', () => {
    expect(getFrequencyDisplayLabelLong('monthly', 2)).toBe('2x per month');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// canonicalToFrequencyJson
// ─────────────────────────────────────────────────────────────────────────────

describe('canonicalToFrequencyJson', () => {
  describe('simple frequencies (1x)', () => {
    it('converts daily/1 to simple daily', () => {
      const result = canonicalToFrequencyJson('daily', 1);
      expect(result).toEqual({ type: 'simple', value: 'daily' });
    });

    it('converts weekly/1 to simple weekly', () => {
      const result = canonicalToFrequencyJson('weekly', 1);
      expect(result).toEqual({ type: 'simple', value: 'weekly' });
    });

    it('converts monthly/1 to simple monthly', () => {
      const result = canonicalToFrequencyJson('monthly', 1);
      expect(result).toEqual({ type: 'simple', value: 'monthly' });
    });
  });

  describe('custom frequencies (Nx)', () => {
    it('converts weekly/3 to custom', () => {
      const result = canonicalToFrequencyJson('weekly', 3);
      expect(result).toEqual({ type: 'custom', count: 3, unit: 'week' });
    });

    it('converts monthly/2 to custom', () => {
      const result = canonicalToFrequencyJson('monthly', 2);
      expect(result).toEqual({ type: 'custom', count: 2, unit: 'month' });
    });

    it('converts daily/2 to custom', () => {
      const result = canonicalToFrequencyJson('daily', 2);
      expect(result).toEqual({ type: 'custom', count: 2, unit: 'day' });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// frequencyJsonToCanonical
// ─────────────────────────────────────────────────────────────────────────────

describe('frequencyJsonToCanonical', () => {
  describe('simple type', () => {
    it('converts simple daily', () => {
      const result = frequencyJsonToCanonical({ type: 'simple', value: 'daily' });
      expect(result).toEqual({ cadence: 'daily', target_per_period: 1 });
    });

    it('converts simple weekly', () => {
      const result = frequencyJsonToCanonical({ type: 'simple', value: 'weekly' });
      expect(result).toEqual({ cadence: 'weekly', target_per_period: 1 });
    });

    it('converts simple monthly', () => {
      const result = frequencyJsonToCanonical({ type: 'simple', value: 'monthly' });
      expect(result).toEqual({ cadence: 'monthly', target_per_period: 1 });
    });
  });

  describe('custom type', () => {
    it('converts custom week', () => {
      const result = frequencyJsonToCanonical({ type: 'custom', count: 3, unit: 'week' });
      expect(result).toEqual({ cadence: 'weekly', target_per_period: 3 });
    });

    it('converts custom month', () => {
      const result = frequencyJsonToCanonical({ type: 'custom', count: 2, unit: 'month' });
      expect(result).toEqual({ cadence: 'monthly', target_per_period: 2 });
    });

    it('converts custom day', () => {
      const result = frequencyJsonToCanonical({ type: 'custom', count: 2, unit: 'day' });
      expect(result).toEqual({ cadence: 'daily', target_per_period: 2 });
    });
  });

  describe('edge cases', () => {
    it('handles null', () => {
      const result = frequencyJsonToCanonical(null);
      expect(result).toEqual({ cadence: 'daily', target_per_period: 1 });
    });

    it('handles undefined', () => {
      const result = frequencyJsonToCanonical(undefined);
      expect(result).toEqual({ cadence: 'daily', target_per_period: 1 });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Round-trip tests (parse → display, canonical → json → canonical)
// ─────────────────────────────────────────────────────────────────────────────

describe('round-trip conversions', () => {
  describe('parse → display', () => {
    it.each([
      ['3x/week', '3x/week'],
      ['daily', 'Daily'],
      ['weekly', 'Weekly'],
      ['monthly', 'Monthly'],
      ['2x/month', '2x/month'],
    ])('"%s" → parse → display → "%s"', (input, expected) => {
      const parsed = parseFrequencyString(input);
      const display = getFrequencyDisplayLabel(parsed.cadence, parsed.target_per_period);
      expect(display).toBe(expected);
    });
  });

  describe('canonical → json → canonical', () => {
    it.each([
      ['daily', 1],
      ['weekly', 1],
      ['weekly', 3],
      ['monthly', 1],
      ['monthly', 2],
    ] as const)('{ cadence: "%s", target: %d } round-trips correctly', (cadence, target) => {
      const json = canonicalToFrequencyJson(cadence, target);
      const canonical = frequencyJsonToCanonical(json);
      expect(canonical.cadence).toBe(cadence);
      expect(canonical.target_per_period).toBe(target);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions for habit objects
// ─────────────────────────────────────────────────────────────────────────────

describe('getHabitFrequencyLabel', () => {
  it('extracts label from habit object', () => {
    const habit = { cadence: 'weekly', target_per_period: 3 };
    expect(getHabitFrequencyLabel(habit)).toBe('3x/week');
  });

  it('handles missing fields', () => {
    const habit = {};
    expect(getHabitFrequencyLabel(habit)).toBe('Daily');
  });
});

describe('getHabitFrequencyLabelLong', () => {
  it('extracts long label from habit object', () => {
    const habit = { cadence: 'weekly', target_per_period: 3 };
    expect(getHabitFrequencyLabelLong(habit)).toBe('3x per week');
  });
});
