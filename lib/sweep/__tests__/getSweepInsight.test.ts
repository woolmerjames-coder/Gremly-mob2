/**
 * getSweepInsight.test.ts
 *
 * Tests for the sweep insight generation function.
 * Returns contextual insights based on sweep session data.
 */

import { getSweepInsight } from '../getSweepInsight';

describe('getSweepInsight', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Priority 1: All lock-in completed
  // ─────────────────────────────────────────────────────────────────────────

  describe('lock-in completion insight', () => {
    it('returns lock-in insight when all lock-in items completed', () => {
      const result = getSweepInsight({
        lockInCompleted: 3,
        lockInTotal: 3,
        habitsChecked: 0,
        archivedCount: 0,
        totalSwept: 5,
      });
      expect(result).toBe('All locked-in items done. Nice work.');
    });

    it('returns lock-in insight for 1/1 completion', () => {
      const result = getSweepInsight({
        lockInCompleted: 1,
        lockInTotal: 1,
        habitsChecked: 0,
        archivedCount: 0,
        totalSwept: 2,
      });
      expect(result).toBe('All locked-in items done. Nice work.');
    });

    it('does not return lock-in insight when incomplete', () => {
      const result = getSweepInsight({
        lockInCompleted: 2,
        lockInTotal: 3,
        habitsChecked: 0,
        archivedCount: 0,
        totalSwept: 5,
      });
      expect(result).not.toBe('All locked-in items done. Nice work.');
    });

    it('does not return lock-in insight when lockInTotal is 0', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 0,
        archivedCount: 0,
        totalSwept: 5,
      });
      expect(result).not.toBe('All locked-in items done. Nice work.');
    });

    it('prioritizes lock-in over other insights', () => {
      const result = getSweepInsight({
        lockInCompleted: 2,
        lockInTotal: 2,
        habitsChecked: 5,
        archivedCount: 10,
        totalSwept: 15,
      });
      expect(result).toBe('All locked-in items done. Nice work.');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Priority 2: High archive count (>5)
  // ─────────────────────────────────────────────────────────────────────────

  describe('high archive insight', () => {
    it('returns archive insight when archivedCount > 5', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 0,
        archivedCount: 6,
        totalSwept: 10,
      });
      expect(result).toBe('Let go of 6 things tonight. Lighter already.');
    });

    it('includes actual count in archive insight', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 0,
        archivedCount: 12,
        totalSwept: 15,
      });
      expect(result).toBe('Let go of 12 things tonight. Lighter already.');
    });

    it('does not return archive insight when count is 5 or less', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 0,
        archivedCount: 5,
        totalSwept: 10,
      });
      // Result could be null or another insight type, just not the archive one
      expect(result === null || !result.includes('Let go of')).toBe(true);
    });

    it('prioritizes archive over volume insight', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 0,
        archivedCount: 8,
        totalSwept: 15, // Would trigger volume insight
      });
      expect(result).toContain('Let go of');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Priority 3: High volume (>10)
  // ─────────────────────────────────────────────────────────────────────────

  describe('high volume insight', () => {
    it('returns volume insight when totalSwept > 10', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 0,
        archivedCount: 0,
        totalSwept: 11,
      });
      expect(result).toBe("11 items cleared. That's a big sweep.");
    });

    it('includes actual count in volume insight', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 0,
        archivedCount: 0,
        totalSwept: 25,
      });
      expect(result).toBe("25 items cleared. That's a big sweep.");
    });

    it('does not return volume insight when count is 10 or less', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 0,
        archivedCount: 0,
        totalSwept: 10,
      });
      // Result could be null or another insight type, just not the volume one
      expect(result === null || !result.includes('items cleared')).toBe(true);
    });

    it('prioritizes volume over habits insight', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 5, // Would trigger habits insight
        archivedCount: 0,
        totalSwept: 15,
      });
      expect(result).toContain('items cleared');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Priority 4: Solid habits session (3+)
  // ─────────────────────────────────────────────────────────────────────────

  describe('habits insight', () => {
    it('returns habits insight when habitsChecked >= 3', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 3,
        archivedCount: 0,
        totalSwept: 5,
      });
      expect(result).toBe('3 habits checked off. Consistency builds.');
    });

    it('includes actual count in habits insight', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 7,
        archivedCount: 0,
        totalSwept: 5,
      });
      expect(result).toBe('7 habits checked off. Consistency builds.');
    });

    it('does not return habits insight when count is less than 3', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 2,
        archivedCount: 0,
        totalSwept: 5,
      });
      // Result could be null or another insight type, just not the habits one
      expect(result === null || !result.includes('habits checked')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // No insight (null)
  // ─────────────────────────────────────────────────────────────────────────

  describe('no insight', () => {
    it('returns null when no conditions met', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 0,
        archivedCount: 0,
        totalSwept: 0,
      });
      expect(result).toBeNull();
    });

    it('returns null for minimal activity sweep', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 1,
        archivedCount: 2,
        totalSwept: 5,
      });
      expect(result).toBeNull();
    });

    it('returns null when lock-in incomplete and other thresholds not met', () => {
      const result = getSweepInsight({
        lockInCompleted: 1,
        lockInTotal: 3,
        habitsChecked: 2,
        archivedCount: 4,
        totalSwept: 8,
      });
      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Priority Order
  // ─────────────────────────────────────────────────────────────────────────

  describe('priority order', () => {
    it('returns first matching priority (lock-in > archive > volume > habits)', () => {
      // All conditions met - should return lock-in insight
      const result = getSweepInsight({
        lockInCompleted: 2,
        lockInTotal: 2,
        habitsChecked: 5,
        archivedCount: 10,
        totalSwept: 20,
      });
      expect(result).toBe('All locked-in items done. Nice work.');
    });

    it('falls through to archive when lock-in incomplete', () => {
      const result = getSweepInsight({
        lockInCompleted: 1,
        lockInTotal: 2,
        habitsChecked: 5,
        archivedCount: 10,
        totalSwept: 20,
      });
      expect(result).toContain('Let go of');
    });

    it('falls through to volume when lock-in and archive conditions not met', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 5,
        archivedCount: 3,
        totalSwept: 15,
      });
      expect(result).toContain('items cleared');
    });

    it('falls through to habits when higher priorities not met', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 4,
        archivedCount: 2,
        totalSwept: 5,
      });
      expect(result).toContain('habits checked');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles zero values for all inputs', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 0,
        archivedCount: 0,
        totalSwept: 0,
      });
      expect(result).toBeNull();
    });

    it('handles very large numbers', () => {
      const result = getSweepInsight({
        lockInCompleted: 100,
        lockInTotal: 100,
        habitsChecked: 50,
        archivedCount: 200,
        totalSwept: 500,
      });
      expect(result).toBe('All locked-in items done. Nice work.');
    });

    it('handles boundary value for archive (exactly 6)', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 0,
        archivedCount: 6,
        totalSwept: 5,
      });
      expect(result).toContain('Let go of 6');
    });

    it('handles boundary value for volume (exactly 11)', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 0,
        archivedCount: 0,
        totalSwept: 11,
      });
      expect(result).toContain('11 items cleared');
    });

    it('handles boundary value for habits (exactly 3)', () => {
      const result = getSweepInsight({
        lockInCompleted: 0,
        lockInTotal: 0,
        habitsChecked: 3,
        archivedCount: 0,
        totalSwept: 5,
      });
      expect(result).toContain('3 habits checked');
    });
  });
});
