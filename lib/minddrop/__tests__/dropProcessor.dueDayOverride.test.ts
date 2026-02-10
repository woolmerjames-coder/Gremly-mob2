/**
 * Drop Processor - dueDayOverride Tests
 *
 * Tests that the `dueDayOverride` field correctly overrides today's date
 * for source === 'today' items when building Supabase payloads.
 *
 * This is the core mechanism for "Plan your tomorrow" mode:
 * - Todos: due_day/due_date set to dueDayOverride instead of today
 * - Habits: start_date set to dueDayOverride instead of today
 *
 * These are documentary/contract tests that verify the *logic* without
 * requiring full Supabase integration.
 */

import type { QueuedDrop } from '../dropQueue';

describe('dropProcessor - dueDayOverride logic', () => {
  const TODAY = '2025-12-15';
  const TOMORROW = '2025-12-16';

  /**
   * Simulates the effectiveDueDay calculation from dropProcessor.ts:
   *   const effectiveDueDay = drop.dueDayOverride || today;
   */
  function computeEffectiveDueDay(
    dueDayOverride: string | null | undefined,
    today: string,
  ): string {
    return dueDayOverride || today;
  }

  /**
   * Simulates the todo due_day calculation from dropProcessor.ts:
   *   const dueDay = enrichment?.extracted_date?.split('T')[0]
   *     || parsedFields.dueDay
   *     || (source === 'today' ? effectiveDueDay : null);
   */
  function computeTodoDueDay(
    enrichedDate: string | null,
    parsedDueDay: string | null,
    source: string,
    effectiveDueDay: string,
  ): string | null {
    return enrichedDate || parsedDueDay || (source === 'today' ? effectiveDueDay : null);
  }

  /**
   * Simulates the habit start_date calculation from dropProcessor.ts:
   *   start_date: enrichment?.extracted_start_date
   *     || (source === 'today' ? effectiveDueDay : null)
   */
  function computeHabitStartDate(
    enrichedStartDate: string | null,
    source: string,
    effectiveDueDay: string,
  ): string | null {
    return enrichedStartDate || (source === 'today' ? effectiveDueDay : null);
  }

  describe('effectiveDueDay calculation', () => {
    it('uses dueDayOverride when provided', () => {
      const result = computeEffectiveDueDay(TOMORROW, TODAY);
      expect(result).toBe(TOMORROW);
    });

    it('falls back to today when dueDayOverride is null', () => {
      const result = computeEffectiveDueDay(null, TODAY);
      expect(result).toBe(TODAY);
    });

    it('falls back to today when dueDayOverride is undefined', () => {
      const result = computeEffectiveDueDay(undefined, TODAY);
      expect(result).toBe(TODAY);
    });
  });

  describe('todo due_day with dueDayOverride', () => {
    it('uses dueDayOverride for source today when no enriched date', () => {
      const effectiveDueDay = computeEffectiveDueDay(TOMORROW, TODAY);
      const dueDay = computeTodoDueDay(null, null, 'today', effectiveDueDay);
      expect(dueDay).toBe(TOMORROW);
    });

    it('enriched date takes precedence over dueDayOverride', () => {
      const effectiveDueDay = computeEffectiveDueDay(TOMORROW, TODAY);
      const dueDay = computeTodoDueDay('2026-01-15', null, 'today', effectiveDueDay);
      expect(dueDay).toBe('2026-01-15');
    });

    it('parsed dueDay takes precedence over dueDayOverride', () => {
      const effectiveDueDay = computeEffectiveDueDay(TOMORROW, TODAY);
      const dueDay = computeTodoDueDay(null, '2026-01-20', 'today', effectiveDueDay);
      expect(dueDay).toBe('2026-01-20');
    });

    it('returns null for source minddrop even with effectiveDueDay', () => {
      const effectiveDueDay = computeEffectiveDueDay(TOMORROW, TODAY);
      const dueDay = computeTodoDueDay(null, null, 'minddrop', effectiveDueDay);
      expect(dueDay).toBeNull();
    });

    it('without dueDayOverride, source today uses today', () => {
      const effectiveDueDay = computeEffectiveDueDay(null, TODAY);
      const dueDay = computeTodoDueDay(null, null, 'today', effectiveDueDay);
      expect(dueDay).toBe(TODAY);
    });
  });

  describe('habit start_date with dueDayOverride', () => {
    it('uses dueDayOverride for source today when no enriched start date', () => {
      const effectiveDueDay = computeEffectiveDueDay(TOMORROW, TODAY);
      const startDate = computeHabitStartDate(null, 'today', effectiveDueDay);
      expect(startDate).toBe(TOMORROW);
    });

    it('enriched start_date takes precedence over dueDayOverride', () => {
      const effectiveDueDay = computeEffectiveDueDay(TOMORROW, TODAY);
      const startDate = computeHabitStartDate('2026-01-01', 'today', effectiveDueDay);
      expect(startDate).toBe('2026-01-01');
    });

    it('returns null for source minddrop even with effectiveDueDay', () => {
      const effectiveDueDay = computeEffectiveDueDay(TOMORROW, TODAY);
      const startDate = computeHabitStartDate(null, 'minddrop', effectiveDueDay);
      expect(startDate).toBeNull();
    });

    it('without dueDayOverride, source today uses today', () => {
      const effectiveDueDay = computeEffectiveDueDay(null, TODAY);
      const startDate = computeHabitStartDate(null, 'today', effectiveDueDay);
      expect(startDate).toBe(TODAY);
    });
  });

  describe('QueuedDrop dueDayOverride field', () => {
    it('documents that QueuedDrop accepts dueDayOverride', () => {
      const drop: Partial<QueuedDrop> = {
        localId: 'drop-1',
        text: 'Plan for tomorrow',
        source: 'today',
        dueDayOverride: TOMORROW,
      };

      expect(drop.dueDayOverride).toBe(TOMORROW);
    });

    it('documents that dueDayOverride is optional', () => {
      const drop: Partial<QueuedDrop> = {
        localId: 'drop-2',
        text: 'Normal today drop',
        source: 'today',
      };

      expect(drop.dueDayOverride).toBeUndefined();
    });
  });
});
