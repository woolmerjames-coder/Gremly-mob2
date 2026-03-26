/**
 * gremlySpeech.pools.test.ts
 *
 * Structural tests for SPEECH_POOLS — ensures the keys that getGremlySpeech()
 * references actually exist in the pool object. These tests guard against
 * the key-rename bug where SPEECH_POOLS.SUCCESS_HIGH_CONFIDENCE was renamed
 * to SPEECH_POOLS.SUCCESS but code references weren't updated (or vice versa).
 *
 * These are the cheapest possible regression tests for the speech crash.
 */

import { getGremlySpeech, SpeechContext } from '../gremlySpeech';

const baseContext: SpeechContext = {
  moment: 'post_drop',
  dropsToday: 0,
  isFirstDrop: false,
  hasPhotos: false,
  isReturningUser: false,
  error: null,
  gaugeValue: 0,
  isFedToday: false,
  timeSinceLastDrop: null,
  briefHeadline: null,
  tone: null,
  overdueTodos: 0,
  habitStreakRisk: [],
  upcomingIn7d: [],
  daysSinceLastSweep: null,
  lastSpeechTime: null,
};

describe('SPEECH_POOLS structural integrity', () => {
  describe('SUCCESS pool — all kind variants return messages', () => {
    const kinds = ['todo', 'habit', 'journal', 'idea', 'event', 'log', 'general'];

    kinds.forEach((kind) => {
      it(`returns a non-null message for kind="${kind}"`, () => {
        const ctx: SpeechContext = { ...baseContext, kind };
        const result = getGremlySpeech(ctx);

        expect(result).not.toBeNull();
        expect(result?.message).toBeTruthy();
        expect(typeof result?.message).toBe('string');
        expect(result?.duration).toBeGreaterThan(0);
      });
    });

    it('returns a message for todo with dueDate', () => {
      const ctx: SpeechContext = {
        ...baseContext,
        kind: 'todo',
        dueDate: new Date('2026-03-15'),
      };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
      // Should have replaced {date} placeholder
      expect(result?.message).not.toContain('{date}');
    });

    it('returns a message for todo without dueDate', () => {
      const ctx: SpeechContext = {
        ...baseContext,
        kind: 'todo',
        dueDate: null,
      };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });
  });

  describe('MILESTONES pool — milestone counts return messages', () => {
    const milestoneCounts = [3, 5, 10];

    milestoneCounts.forEach((count) => {
      it(`returns a non-null message for dropsToday=${count}`, () => {
        const ctx: SpeechContext = { ...baseContext, dropsToday: count };
        const result = getGremlySpeech(ctx);

        expect(result).not.toBeNull();
        expect(result?.message).toBeTruthy();
      });
    });

    it('falls through to SUCCESS for non-milestone counts', () => {
      // dropsToday=4 is not a milestone, so should fall through to SUCCESS
      const ctx: SpeechContext = { ...baseContext, dropsToday: 4, kind: 'todo' };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });
  });

  describe('ERROR pool — all error types return messages', () => {
    const errorTypes: Array<'network' | 'ai_failed' | 'generic'> = [
      'network',
      'ai_failed',
      'generic',
    ];

    errorTypes.forEach((error) => {
      it(`returns a message for error="${error}"`, () => {
        const ctx: SpeechContext = { ...baseContext, error };
        const result = getGremlySpeech(ctx);

        expect(result).not.toBeNull();
        expect(result?.message).toBeTruthy();
      });
    });
  });

  describe('Special context pools', () => {
    it('FIRST_DROP returns a message', () => {
      const ctx: SpeechContext = { ...baseContext, isFirstDrop: true };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('RETURNING_USER returns a message', () => {
      const ctx: SpeechContext = { ...baseContext, isReturningUser: true };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('PHOTO returns a message', () => {
      const ctx: SpeechContext = { ...baseContext, hasPhotos: true };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });
  });

  describe('no pool access throws', () => {
    it('getGremlySpeech never throws for any valid context', () => {
      // This is the key regression test — the original bug was a TypeError
      // thrown by accessing undefined pool keys. Regardless of input,
      // getGremlySpeech should never throw.

      const contexts: SpeechContext[] = [
        { ...baseContext },
        { ...baseContext, kind: 'todo' },
        { ...baseContext, kind: 'habit' },
        { ...baseContext, kind: 'journal' },
        { ...baseContext, kind: 'idea' },
        { ...baseContext, kind: 'event' },
        { ...baseContext, kind: 'log', logSubtype: 'journal' },
        { ...baseContext, kind: 'log', logSubtype: 'idea' },
        { ...baseContext, kind: 'log', logSubtype: 'event' },
        { ...baseContext, kind: 'log', logSubtype: 'general' },
        { ...baseContext, dropsToday: 3 },
        { ...baseContext, dropsToday: 5 },
        { ...baseContext, dropsToday: 10 },
        { ...baseContext, dropsToday: 15 },
        { ...baseContext, error: 'network' },
        { ...baseContext, error: 'ai_failed' },
        { ...baseContext, error: 'generic' },
        { ...baseContext, isFirstDrop: true },
        { ...baseContext, isReturningUser: true },
        { ...baseContext, hasPhotos: true },
      ];

      for (const ctx of contexts) {
        expect(() => getGremlySpeech(ctx)).not.toThrow();
      }
    });
  });
});
