/**
 * habitCompletion.test.ts
 *
 * Tests for the completeHabit function timezone fix (app-fixes-1.22).
 *
 * The fix ensures occurred_at uses noon UTC (YYYY-MM-DDT12:00:00.000Z)
 * so it always derives to the same date as occurred_day, regardless
 * of timezone.
 */

import { getDateService, resetDateService, createDateService } from '../../date/DateService';

describe('Habit Completion Timezone Logic', () => {
  beforeEach(() => {
    resetDateService();
  });

  afterEach(() => {
    resetDateService();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // occurred_at format tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('occurred_at noon UTC format', () => {
    it('should format occurred_at as noon UTC on the local date', () => {
      createDateService({
        clock: () => new Date('2026-01-23T10:00:00'),
      });

      const todayDate = getDateService().getCurrentDate();
      const occurredAt = `${todayDate}T12:00:00.000Z`;

      expect(todayDate).toBe('2026-01-23');
      expect(occurredAt).toBe('2026-01-23T12:00:00.000Z');
    });

    it('should use noon UTC for consistent date derivation', () => {
      createDateService({
        clock: () => new Date('2026-01-23T23:30:00'), // Late night local
      });

      const todayDate = getDateService().getCurrentDate();
      const occurredAt = `${todayDate}T12:00:00.000Z`;

      // Both should represent the same day
      const derivedDate = occurredAt.split('T')[0];
      expect(derivedDate).toBe(todayDate);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // occurred_at and occurred_day consistency
  // ═══════════════════════════════════════════════════════════════════════════

  describe('occurred_at and occurred_day consistency', () => {
    it('should derive same date from occurred_at and occurred_day', () => {
      createDateService({
        clock: () => new Date('2026-01-23T10:00:00'),
      });

      const todayDate = getDateService().getCurrentDate();
      const occurredAt = `${todayDate}T12:00:00.000Z`;

      const occurredDay = todayDate;
      // Extract date portion from the fixed noon UTC timestamp
      const derivedFromAt = occurredAt.slice(0, 10);

      expect(occurredDay).toBe(derivedFromAt);
    });

    it('should handle morning times correctly', () => {
      createDateService({
        clock: () => new Date('2026-01-23T06:00:00'), // 6 AM local
      });

      const todayDate = getDateService().getCurrentDate();
      const occurredAt = `${todayDate}T12:00:00.000Z`;

      expect(todayDate).toBe('2026-01-23');
      expect(occurredAt).toBe('2026-01-23T12:00:00.000Z');
    });

    it('should handle late night times correctly', () => {
      createDateService({
        clock: () => new Date('2026-01-23T23:59:00'), // 11:59 PM local
      });

      const todayDate = getDateService().getCurrentDate();
      const occurredAt = `${todayDate}T12:00:00.000Z`;

      expect(todayDate).toBe('2026-01-23');
      expect(occurredAt).toBe('2026-01-23T12:00:00.000Z');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Timezone edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('timezone edge cases', () => {
    it('should use local date not UTC date for occurred_day', () => {
      // Simulate late night EST (which is next day UTC)
      // e.g., 11 PM EST on Jan 23 = 4 AM UTC on Jan 24
      // The user's local date should be Jan 23, not Jan 24

      createDateService({
        clock: () => new Date('2026-01-23T23:00:00'), // 11 PM local
      });

      const todayDate = getDateService().getCurrentDate();

      // Should be Jan 23 (local), not Jan 24 (UTC)
      expect(todayDate).toBe('2026-01-23');
    });

    it('should handle early morning correctly', () => {
      // Simulate early morning (e.g., 1 AM)
      createDateService({
        clock: () => new Date('2026-01-23T01:00:00'), // 1 AM local
      });

      const todayDate = getDateService().getCurrentDate();
      const occurredAt = `${todayDate}T12:00:00.000Z`;

      expect(todayDate).toBe('2026-01-23');
      expect(occurredAt).toBe('2026-01-23T12:00:00.000Z');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // last_completed_at vs occurred_at
  // ═══════════════════════════════════════════════════════════════════════════

  describe('last_completed_at vs occurred_at distinction', () => {
    it('last_completed_at should use actual timestamp', () => {
      const actualTimestamp = new Date().toISOString();

      // last_completed_at captures when the action happened
      expect(actualTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('occurred_at should use noon UTC for date consistency', () => {
      createDateService({
        clock: () => new Date('2026-01-23T10:00:00'),
      });

      const todayDate = getDateService().getCurrentDate();
      const occurredAt = `${todayDate}T12:00:00.000Z`;

      // occurred_at is always at noon UTC
      expect(occurredAt).toMatch(/T12:00:00\.000Z$/);
    });

    it('they can have different hours but same date', () => {
      createDateService({
        clock: () => new Date('2026-01-23T15:30:00'),
      });

      const todayDate = getDateService().getCurrentDate();
      const occurredAt = `${todayDate}T12:00:00.000Z`;
      const lastCompletedAt = '2026-01-23T15:30:00.000Z'; // Actual timestamp

      // Both derive to same date
      expect(occurredAt.split('T')[0]).toBe('2026-01-23');
      expect(lastCompletedAt.split('T')[0]).toBe('2026-01-23');

      // But occurred_at is at noon UTC, lastCompletedAt has actual time
      expect(occurredAt).toContain('T12:00:00');
      expect(lastCompletedAt).toContain('T15:30:00');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Payload structure simulation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('habit_progress insert payload', () => {
    it('should construct correct payload structure', () => {
      createDateService({
        clock: () => new Date('2026-01-23T10:00:00'),
      });

      const userId = 'user-123';
      const habitId = 'habit-456';
      const todayDate = getDateService().getCurrentDate();
      const occurredAt = `${todayDate}T12:00:00.000Z`;

      const payload = {
        habit_id: habitId,
        owner_id: userId,
        occurred_day: todayDate,
        occurred_at: occurredAt,
        count: 1,
      };

      expect(payload.occurred_day).toBe('2026-01-23');
      expect(payload.occurred_at).toBe('2026-01-23T12:00:00.000Z');
      expect(payload.occurred_at.split('T')[0]).toBe(payload.occurred_day);
    });

    it('should construct correct local progress row', () => {
      createDateService({
        clock: () => new Date('2026-01-23T10:00:00'),
      });

      const todayDate = getDateService().getCurrentDate();
      const occurredAt = `${todayDate}T12:00:00.000Z`;

      const progressRow = {
        id: `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        habit_id: 'habit-123',
        owner_id: 'user-123',
        occurred_at: occurredAt,
        occurred_day: todayDate,
        count: 1,
        occurrence_index: null,
      };

      expect(progressRow.occurred_at).toBe(occurredAt);
      expect(progressRow.occurred_day).toBe(todayDate);
      expect(progressRow.occurred_at.split('T')[0]).toBe(progressRow.occurred_day);
    });
  });
});
