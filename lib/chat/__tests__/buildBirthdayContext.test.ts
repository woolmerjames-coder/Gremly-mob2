/**
 * buildBirthdayContext.test.ts
 *
 * Tests for Gremly birthday context builder.
 * Validates date calculations and context string generation.
 */

import { buildBirthdayContext } from '../buildBirthdayContext';

describe('buildBirthdayContext', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('handles missing accountCreatedAt gracefully', () => {
    it('returns date context without companion info when accountCreatedAt is null', () => {
      const result = buildBirthdayContext(null);
      expect(result).toContain('Today is');
      expect(result).not.toContain('companions');
    });

    it('returns date context when accountCreatedAt is empty string', () => {
      const result = buildBirthdayContext('');
      expect(result).toContain('Today is');
      // Empty string parsed as date may have undefined behavior
    });
  });

  describe('includes days together information', () => {
    it('includes days count for recent account', () => {
      const result = buildBirthdayContext('2025-01-10T10:00:00Z');
      expect(result).toBeDefined();
      // Should mention number of days
      expect(result).toMatch(/\d+ days?/i);
    });

    it('includes companions language', () => {
      const result = buildBirthdayContext('2025-01-10T10:00:00Z');
      expect(result).toBeDefined();
      expect(result).toContain('companions');
    });

    it('calculates correct days for 5-day-old account', () => {
      const result = buildBirthdayContext('2025-01-10T10:00:00Z');
      expect(result).toContain('5 days');
    });

    it('handles 1 day correctly (singular)', () => {
      const result = buildBirthdayContext('2025-01-14T10:00:00Z');
      expect(result).toContain('1 day');
      expect(result).not.toContain('1 days');
    });
  });

  describe('includes properly formatted dates', () => {
    it('includes birthday reference', () => {
      const result = buildBirthdayContext('2025-01-10T10:00:00Z');
      expect(result).toBeDefined();
      // Should contain birthday reference
      expect(result?.toLowerCase()).toContain('born');
    });

    it('includes today reference', () => {
      const result = buildBirthdayContext('2025-01-10T10:00:00Z');
      expect(result).toBeDefined();
      // Should contain today's date info
      expect(result?.toLowerCase()).toContain('today');
    });

    it('includes account creation date', () => {
      const result = buildBirthdayContext('2025-01-10T10:00:00Z');
      expect(result).toContain('January 10, 2025');
    });
  });

  describe('context string structure', () => {
    it('always returns a string', () => {
      const result = buildBirthdayContext('2025-01-10T10:00:00Z');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('contains date and relationship section header', () => {
      const result = buildBirthdayContext('2024-06-15T10:00:00Z');
      expect(result).toContain('DATE');
      expect(result).toContain('RELATIONSHIP');
    });
  });

  describe('edge cases', () => {
    it('handles ISO date string with milliseconds', () => {
      const result = buildBirthdayContext('2025-01-10T10:00:00.000Z');
      expect(result).toBeDefined();
      expect(result).toContain('5 days');
    });

    it('handles date-only string', () => {
      const result = buildBirthdayContext('2025-01-10');
      expect(result).toBeDefined();
      expect(result).toContain('companions');
    });

    it('handles future dates gracefully', () => {
      const result = buildBirthdayContext('2025-02-01T10:00:00Z');
      // Future dates result in negative days, but shouldn't crash
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
});
