import {
  type FrequencyConfig,
  type DayOfWeek,
  frequencyToJson,
  jsonToFrequency,
  getFrequencyLabel,
  DAY_LABELS,
} from '../../components/overlay/frequencyHelpers';

describe('Frequency Helpers', () => {
  describe('frequencyToJson', () => {
    it('should convert simple daily frequency', () => {
      const config: FrequencyConfig = { mode: 'simple', value: 'daily' };
      const json = frequencyToJson(config);
      expect(json).toEqual({ type: 'simple', value: 'daily' });
    });

    it('should convert simple weekly frequency', () => {
      const config: FrequencyConfig = { mode: 'simple', value: 'weekly' };
      const json = frequencyToJson(config);
      expect(json).toEqual({ type: 'simple', value: 'weekly' });
    });

    it('should convert days frequency', () => {
      const config: FrequencyConfig = { mode: 'days', days: [1, 3, 5] as DayOfWeek[] };
      const json = frequencyToJson(config);
      expect(json).toEqual({ type: 'days', days: [1, 3, 5] });
    });

    it('should convert custom frequency', () => {
      const config: FrequencyConfig = { mode: 'custom', value: { count: 3, unit: 'week' } };
      const json = frequencyToJson(config);
      expect(json).toEqual({ type: 'custom', count: 3, unit: 'week' });
    });
  });

  describe('jsonToFrequency', () => {
    it('should convert simple frequency from JSON', () => {
      const json = { type: 'simple', value: 'daily' };
      const config = jsonToFrequency(json);
      expect(config).toEqual({ mode: 'simple', value: 'daily' });
    });

    it('should convert days frequency from JSON', () => {
      const json = { type: 'days', days: [0, 6] };
      const config = jsonToFrequency(json);
      expect(config).toEqual({ mode: 'days', days: [0, 6] });
    });

    it('should convert custom frequency from JSON', () => {
      const json = { type: 'custom', count: 2, unit: 'month' };
      const config = jsonToFrequency(json);
      expect(config).toEqual({ mode: 'custom', value: { count: 2, unit: 'month' } });
    });

    it('should default to daily for invalid JSON', () => {
      const config = jsonToFrequency(null);
      expect(config).toEqual({ mode: 'simple', value: 'daily' });
    });

    it('should default to daily for missing type', () => {
      const config = jsonToFrequency({ something: 'else' });
      expect(config).toEqual({ mode: 'simple', value: 'daily' });
    });
  });

  describe('getFrequencyLabel', () => {
    it('should label simple daily frequency', () => {
      const config: FrequencyConfig = { mode: 'simple', value: 'daily' };
      expect(getFrequencyLabel(config)).toBe('Daily');
    });

    it('should label simple weekly frequency', () => {
      const config: FrequencyConfig = { mode: 'simple', value: 'weekly' };
      expect(getFrequencyLabel(config)).toBe('Weekly');
    });

    it('should label simple monthly frequency', () => {
      const config: FrequencyConfig = { mode: 'simple', value: 'monthly' };
      expect(getFrequencyLabel(config)).toBe('Monthly');
    });

    it('should detect all 7 days as Daily', () => {
      const config: FrequencyConfig = { mode: 'days', days: [0, 1, 2, 3, 4, 5, 6] as DayOfWeek[] };
      expect(getFrequencyLabel(config)).toBe('Daily');
    });

    it('should detect weekdays (Mon-Fri)', () => {
      const config: FrequencyConfig = { mode: 'days', days: [1, 2, 3, 4, 5] as DayOfWeek[] };
      expect(getFrequencyLabel(config)).toBe('Weekdays');
    });

    it('should detect weekends (Sat-Sun)', () => {
      const config: FrequencyConfig = { mode: 'days', days: [0, 6] as DayOfWeek[] };
      expect(getFrequencyLabel(config)).toBe('Weekends');
    });

    it('should show day abbreviations for custom days', () => {
      const config: FrequencyConfig = { mode: 'days', days: [1, 3, 5] as DayOfWeek[] };
      expect(getFrequencyLabel(config)).toBe('Mon, Wed, Fri');
    });

    it('should label custom frequency with count and unit', () => {
      const config: FrequencyConfig = { mode: 'custom', value: { count: 3, unit: 'week' } };
      expect(getFrequencyLabel(config)).toBe('3x/week');
    });

    it('should handle custom frequency with different units', () => {
      expect(getFrequencyLabel({ mode: 'custom', value: { count: 1, unit: 'day' } })).toBe(
        '1x/day',
      );
      expect(getFrequencyLabel({ mode: 'custom', value: { count: 2, unit: 'month' } })).toBe(
        '2x/month',
      );
    });
  });

  describe('DAY_LABELS', () => {
    it('should have 7 days starting with Monday', () => {
      expect(DAY_LABELS).toHaveLength(7);
      expect(DAY_LABELS[0].short).toBe('M');
      expect(DAY_LABELS[0].long).toBe('Monday');
      expect(DAY_LABELS[0].day).toBe(1);
    });

    it('should end with Sunday', () => {
      expect(DAY_LABELS[6].short).toBe('S');
      expect(DAY_LABELS[6].long).toBe('Sunday');
      expect(DAY_LABELS[6].day).toBe(0);
    });
  });

  describe('Round-trip conversion', () => {
    it('should round-trip simple frequency', () => {
      const original: FrequencyConfig = { mode: 'simple', value: 'weekly' };
      const json = frequencyToJson(original);
      const restored = jsonToFrequency(json);
      expect(restored).toEqual(original);
    });

    it('should round-trip days frequency', () => {
      const original: FrequencyConfig = { mode: 'days', days: [1, 2, 3, 4, 5] as DayOfWeek[] };
      const json = frequencyToJson(original);
      const restored = jsonToFrequency(json);
      expect(restored).toEqual(original);
    });

    it('should round-trip custom frequency', () => {
      const original: FrequencyConfig = { mode: 'custom', value: { count: 3, unit: 'week' } };
      const json = frequencyToJson(original);
      const restored = jsonToFrequency(json);
      expect(restored).toEqual(original);
    });
  });
});
