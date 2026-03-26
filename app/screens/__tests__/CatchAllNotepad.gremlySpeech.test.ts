/**
 * CatchAllNotepad.gremlySpeech.test.ts
 *
 * Tests verifying that getGremlySpeech produces correct contextual messages
 * for the post-drop speech path used by CatchAllNotepad onSubmit handler.
 *
 * These tests use the REAL getGremlySpeech from lib/speech/gremlySpeech,
 * exercising the same priority waterfall the component uses:
 * error > milestone > photo > first > returning > rapid-fire > gauge > brand > success
 */

import { getGremlySpeech, type SpeechContext } from '../../../lib/speech/gremlySpeech';

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

describe('getGremlySpeech (post-drop path)', () => {
  describe('success by kind', () => {
    it('returns message for todo with due date', () => {
      const ctx: SpeechContext = {
        ...baseContext,
        kind: 'todo',
        dueDate: new Date('2026-06-15'),
      };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('returns message for todo without due date', () => {
      const ctx: SpeechContext = { ...baseContext, kind: 'todo', dueDate: null };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('returns message for habit', () => {
      const ctx: SpeechContext = { ...baseContext, kind: 'habit' };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
    });

    it('returns message for journal', () => {
      const ctx: SpeechContext = { ...baseContext, kind: 'journal' };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
    });

    it('returns message for idea', () => {
      const ctx: SpeechContext = { ...baseContext, kind: 'idea' };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
    });

    it('returns message for event', () => {
      const ctx: SpeechContext = { ...baseContext, kind: 'event' };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
    });

    it('returns message for log with journal subtype', () => {
      const ctx: SpeechContext = { ...baseContext, kind: 'log', logSubtype: 'journal' };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
    });

    it('returns message for log with idea subtype', () => {
      const ctx: SpeechContext = { ...baseContext, kind: 'log', logSubtype: 'idea' };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
    });

    it('returns message for log with event subtype', () => {
      const ctx: SpeechContext = { ...baseContext, kind: 'log', logSubtype: 'event' };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
    });

    it('returns a general message for unknown kind', () => {
      const ctx: SpeechContext = { ...baseContext, kind: 'something_else' };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
    });
  });

  describe('milestone overrides', () => {
    it('returns milestone at 3 drops', () => {
      const ctx: SpeechContext = { ...baseContext, dropsToday: 3 };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('returns milestone at 5 drops', () => {
      const ctx: SpeechContext = { ...baseContext, dropsToday: 5 };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
    });

    it('returns milestone at 10 drops', () => {
      const ctx: SpeechContext = { ...baseContext, dropsToday: 10 };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
    });

    it('returns milestone for every5after with count', () => {
      const ctx: SpeechContext = { ...baseContext, dropsToday: 15 };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
      expect(result?.message).toContain('15');
    });
  });

  describe('error overrides', () => {
    it('returns error message for network error', () => {
      const ctx: SpeechContext = { ...baseContext, error: 'network' };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('returns error message for generic error', () => {
      const ctx: SpeechContext = { ...baseContext, error: 'generic' };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });
  });

  describe('special context pools', () => {
    it('returns photo message when hasPhotos', () => {
      const ctx: SpeechContext = { ...baseContext, hasPhotos: true };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
    });

    it('returns first-drop celebration for isFirstDrop', () => {
      const ctx: SpeechContext = { ...baseContext, isFirstDrop: true };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
    });

    it('returns returning message for isReturningUser', () => {
      const ctx: SpeechContext = { ...baseContext, isReturningUser: true };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
    });
  });

  describe('duration', () => {
    it('returns a positive duration', () => {
      const result = getGremlySpeech(baseContext);
      expect(result?.duration).toBeGreaterThan(0);
    });
  });

  describe('never throws', () => {
    it('handles any valid context without throwing', () => {
      const contexts: SpeechContext[] = [
        baseContext,
        { ...baseContext, kind: 'todo' },
        { ...baseContext, kind: 'habit' },
        { ...baseContext, kind: 'log', logSubtype: 'journal' },
        { ...baseContext, error: 'generic' },
        { ...baseContext, dropsToday: 25 },
        { ...baseContext, hasPhotos: true },
        { ...baseContext, isFirstDrop: true },
        { ...baseContext, isReturningUser: true },
        { ...baseContext, gaugeValue: 0.95, tone: 'celebratory' },
        { ...baseContext, tone: 'stretched' },
      ];

      for (const ctx of contexts) {
        expect(() => getGremlySpeech(ctx)).not.toThrow();
      }
    });
  });
});
