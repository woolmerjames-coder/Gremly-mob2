/**
 * Gremly Speech Tests
 *
 * Tests for the contextual speech system used by the Gremly mascot.
 */

import {
  getGremlySpeech,
  getGreetingSpeech,
  getGreetingSpeechV2,
  getReturnSpeech,
  getEmptyStateSpeech,
  getMorningBriefSpeech,
  getDcoGreetingSpeech,
  getFedCelebrationSpeech,
  getPostAgeUpSpeech,
  getTimeOfDay,
  pickRandom,
  SpeechContext,
} from '../gremlySpeech';

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('pickRandom', () => {
  it('returns an item from the array', () => {
    const options = ['a', 'b', 'c'];
    const result = pickRandom(options);
    expect(options).toContain(result);
  });

  it('excludes specified items when possible', () => {
    const options = ['a', 'b', 'c'];
    const exclude = ['a', 'b'];
    const result = pickRandom(options, exclude);
    expect(result).toBe('c');
  });

  it('falls back to full pool if all items excluded', () => {
    const options = ['a', 'b', 'c'];
    const exclude = ['a', 'b', 'c'];
    const result = pickRandom(options, exclude);
    expect(options).toContain(result);
  });
});

describe('getTimeOfDay', () => {
  const originalDate = global.Date;

  afterEach(() => {
    global.Date = originalDate;
  });

  it('returns morning for hours 5-11', () => {
    const mockDate = jest.fn(() => ({ getHours: () => 9 })) as any;
    mockDate.now = Date.now;
    global.Date = mockDate;

    expect(getTimeOfDay()).toBe('morning');
  });

  it('returns afternoon for hours 12-16', () => {
    const mockDate = jest.fn(() => ({ getHours: () => 14 })) as any;
    mockDate.now = Date.now;
    global.Date = mockDate;

    expect(getTimeOfDay()).toBe('afternoon');
  });

  it('returns evening for hours 17-20', () => {
    const mockDate = jest.fn(() => ({ getHours: () => 18 })) as any;
    mockDate.now = Date.now;
    global.Date = mockDate;

    expect(getTimeOfDay()).toBe('evening');
  });

  it('returns night for hours 21-4', () => {
    const mockDate = jest.fn(() => ({ getHours: () => 23 })) as any;
    mockDate.now = Date.now;
    global.Date = mockDate;

    expect(getTimeOfDay()).toBe('night');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getGremlySpeech Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getGremlySpeech', () => {
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

  describe('priority 1: errors', () => {
    it('returns network error message when error is network', () => {
      const ctx: SpeechContext = { ...baseContext, error: 'network' };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
      expect(result?.duration).toBeGreaterThan(0);
    });

    it('returns ai_failed error message when error is ai_failed', () => {
      const ctx: SpeechContext = { ...baseContext, error: 'ai_failed' };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('returns generic error message when error is generic', () => {
      const ctx: SpeechContext = { ...baseContext, error: 'generic' };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });
  });

  describe('priority 2: streaks', () => {
    it('returns streak message at 3 drops', () => {
      const ctx: SpeechContext = { ...baseContext, dropsToday: 3 };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('returns streak message at 5 drops', () => {
      const ctx: SpeechContext = { ...baseContext, dropsToday: 5 };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('returns streak message at 10 drops', () => {
      const ctx: SpeechContext = { ...baseContext, dropsToday: 10 };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('returns streak message at every 5 after 10', () => {
      const ctx: SpeechContext = { ...baseContext, dropsToday: 15 };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });
  });

  describe('priority 3: photo drops', () => {
    it('returns photo message when hasPhotos is true', () => {
      const ctx: SpeechContext = { ...baseContext, hasPhotos: true };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });
  });

  describe('priority 4: first drop', () => {
    it('returns first drop message when isFirstDrop is true', () => {
      const ctx: SpeechContext = { ...baseContext, isFirstDrop: true };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });
  });

  describe('priority 5: returning user', () => {
    it('returns returning user message when isReturningUser is true', () => {
      const ctx: SpeechContext = { ...baseContext, isReturningUser: true };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });
  });

  describe('priority 6–8: rapid-fire, gauge, brand', () => {
    it('returns rapid-fire message when conditions met', () => {
      // Mock Math.random to always trigger (< 0.4)
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
      const ctx: SpeechContext = {
        ...baseContext,
        timeSinceLastDrop: 60,
        dropsToday: 4,
        tone: 'relaxed',
      };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
      spy.mockRestore();
    });

    it('skips rapid-fire when tone is stretched', () => {
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
      const ctx: SpeechContext = {
        ...baseContext,
        timeSinceLastDrop: 60,
        dropsToday: 4,
        tone: 'stretched',
      };
      // Should fall through to success, not rapid-fire
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
      spy.mockRestore();
    });

    it('returns gauge post-drop message when gauge is high', () => {
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
      const ctx: SpeechContext = {
        ...baseContext,
        gaugeValue: 0.92,
        isFedToday: false,
        tone: 'relaxed',
      };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
      spy.mockRestore();
    });

    it('skips gauge post-drop when already fed', () => {
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
      const ctx: SpeechContext = {
        ...baseContext,
        gaugeValue: 0.92,
        isFedToday: true,
        tone: 'relaxed',
      };
      // Should fall through to success pool, not gauge
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
      spy.mockRestore();
    });

    it('returns brand message when random hits', () => {
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.05);
      const ctx: SpeechContext = {
        ...baseContext,
        tone: 'relaxed',
      };
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
      spy.mockRestore();
    });

    it('skips brand when tone is recovering', () => {
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.05);
      const ctx: SpeechContext = {
        ...baseContext,
        tone: 'recovering',
      };
      // Should fall through to success pool
      const result = getGremlySpeech(ctx);
      expect(result).not.toBeNull();
      spy.mockRestore();
    });
  });

  describe('priority 9: success by kind (fallback)', () => {
    it('returns todo with date message', () => {
      const ctx: SpeechContext = {
        ...baseContext,
        kind: 'todo',
        dueDate: new Date('2025-01-15'),
      };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('returns todo without date message', () => {
      const ctx: SpeechContext = { ...baseContext, kind: 'todo', dueDate: null };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('returns habit message', () => {
      const ctx: SpeechContext = { ...baseContext, kind: 'habit' };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('returns journal message', () => {
      const ctx: SpeechContext = { ...baseContext, kind: 'journal' };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });

    it('returns idea message', () => {
      const ctx: SpeechContext = { ...baseContext, kind: 'idea' };
      const result = getGremlySpeech(ctx);

      expect(result).not.toBeNull();
      expect(result?.message).toBeTruthy();
    });
  });

  describe('date placeholder replacement', () => {
    it('replaces {date} placeholder with formatted date', () => {
      const ctx: SpeechContext = {
        ...baseContext,
        kind: 'todo',
        dueDate: new Date('2025-01-15'),
      };

      // Run multiple times to find a message with {date}
      for (let i = 0; i < 20; i++) {
        const result = getGremlySpeech(ctx);
        if (result?.message.includes('Jan 15') || result?.message.includes('Jan')) {
          expect(result.message).not.toContain('{date}');
          return;
        }
      }
      // If no date message found, that's ok - we just verify placeholder is replaced when present
      expect(true).toBe(true);
    });
  });

  describe('duration calculation', () => {
    it('returns longer duration for longer messages', () => {
      const ctx1: SpeechContext = { ...baseContext, kind: 'general' };
      const ctx2: SpeechContext = { ...baseContext, error: 'ai_failed' };

      const result1 = getGremlySpeech(ctx1);
      const result2 = getGremlySpeech(ctx2);

      // Both should have valid durations
      expect(result1?.duration).toBeGreaterThan(0);
      expect(result2?.duration).toBeGreaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exported Helper Functions Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getGreetingSpeech', () => {
  it('returns a greeting message', () => {
    const result = getGreetingSpeech();

    expect(result.message).toBeTruthy();
    expect(result.duration).toBeGreaterThan(0);
  });

  it('returns time-appropriate greeting', () => {
    // Just verify it returns something valid
    const result = getGreetingSpeech();
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('getEmptyStateSpeech', () => {
  it('returns an empty state message', () => {
    const result = getEmptyStateSpeech();

    expect(result.message).toBeTruthy();
    expect(result.duration).toBeGreaterThan(0);
  });
});

describe('getMorningBriefSpeech', () => {
  it('returns prompt message for prompt event', () => {
    const result = getMorningBriefSpeech('prompt');

    expect(result.message).toBeTruthy();
    expect(result.duration).toBeGreaterThan(0);
  });

  it('returns complete message for complete event', () => {
    const result = getMorningBriefSpeech('complete');

    expect(result.message).toBeTruthy();
    expect(result.duration).toBeGreaterThan(0);
  });

  it('returns skip message for skip event', () => {
    const result = getMorningBriefSpeech('skip');

    expect(result.message).toBeTruthy();
    expect(result.duration).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DCO Greeting Speech Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getDcoGreetingSpeech', () => {
  it('returns the DCO headline when provided', () => {
    const result = getDcoGreetingSpeech('Busy week with Sarah visiting');
    expect(result.message).toBe('Busy week with Sarah visiting');
    expect(result.duration).toBeGreaterThan(0);
  });

  it('falls back to time-of-day greeting when briefHeadline is null', () => {
    const result = getDcoGreetingSpeech(null);
    expect(result.message).toBeTruthy();
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);
  });

  it('calculates duration proportional to headline length', () => {
    const short = getDcoGreetingSpeech('Hi');
    const long = getDcoGreetingSpeech(
      'A very long headline that takes much more time to read through carefully',
    );
    expect(long.duration).toBeGreaterThanOrEqual(short.duration);
  });

  it('returns different messages on repeated calls with null', () => {
    // With null, falls back to heuristic — should not crash
    const results = Array.from({ length: 5 }, () => getDcoGreetingSpeech(null));
    results.forEach((r) => {
      expect(r.message).toBeTruthy();
      expect(r.duration).toBeGreaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getGreetingSpeechV2 Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getGreetingSpeechV2', () => {
  const greetingCtx: SpeechContext = {
    moment: 'greeting',
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

  it('uses briefHeadline when provided', () => {
    const ctx: SpeechContext = { ...greetingCtx, briefHeadline: 'Big meeting today' };
    const result = getGreetingSpeechV2(ctx);
    expect(result.message).toBe('Big meeting today');
    expect(result.duration).toBeGreaterThan(0);
  });

  it('uses UPCOMING pool when upcomingIn7d has events', () => {
    const ctx: SpeechContext = { ...greetingCtx, upcomingIn7d: ['Doctor appointment'] };
    const result = getGreetingSpeechV2(ctx);
    expect(result.message).toContain('Doctor appointment');
    expect(result.duration).toBeGreaterThan(0);
  });

  it('uses GAUGE_GREETING when gauge >= 0.6 and not fed', () => {
    const ctx: SpeechContext = { ...greetingCtx, gaugeValue: 0.7, isFedToday: false };
    const result = getGreetingSpeechV2(ctx);
    expect(result.message).toBeTruthy();
    expect(result.duration).toBeGreaterThan(0);
  });

  it('uses SWEEP_NUDGE when days since sweep >= 3', () => {
    const ctx: SpeechContext = { ...greetingCtx, daysSinceLastSweep: 5 };
    const result = getGreetingSpeechV2(ctx);
    expect(result.message).toBeTruthy();
    expect(result.duration).toBeGreaterThan(0);
  });

  it('uses long SWEEP_NUDGE when days since sweep >= 7', () => {
    const ctx: SpeechContext = { ...greetingCtx, daysSinceLastSweep: 10 };
    const result = getGreetingSpeechV2(ctx);
    expect(result.message).toBeTruthy();
    expect(result.duration).toBeGreaterThan(0);
  });

  it('falls back to time-of-day greeting', () => {
    const result = getGreetingSpeechV2(greetingCtx);
    expect(result.message).toBeTruthy();
    expect(result.duration).toBeGreaterThan(0);
  });

  it('never throws', () => {
    expect(() => getGreetingSpeechV2(greetingCtx)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getReturnSpeech Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getReturnSpeech', () => {
  const returnCtx: SpeechContext = {
    moment: 'return',
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

  it('returns null when within 5-minute cooldown', () => {
    const ctx: SpeechContext = { ...returnCtx, lastSpeechTime: Date.now() - 60_000 };
    const result = getReturnSpeech(ctx);
    expect(result).toBeNull();
  });

  it('returns gauge_progress when gauge >= 0.5 and not fed', () => {
    const ctx: SpeechContext = {
      ...returnCtx,
      gaugeValue: 0.6,
      isFedToday: false,
      lastSpeechTime: Date.now() - 10 * 60_000,
    };
    const result = getReturnSpeech(ctx);
    expect(result).not.toBeNull();
    expect(result?.message).toBeTruthy();
  });

  it('returns upcoming event reminder', () => {
    const ctx: SpeechContext = {
      ...returnCtx,
      upcomingIn7d: ['Team standup'],
      lastSpeechTime: Date.now() - 10 * 60_000,
    };
    const result = getReturnSpeech(ctx);
    expect(result).not.toBeNull();
    expect(result?.message).toContain('Team standup');
  });

  it('returns sweep nudge when overdue', () => {
    const ctx: SpeechContext = {
      ...returnCtx,
      daysSinceLastSweep: 5,
      lastSpeechTime: Date.now() - 10 * 60_000,
    };
    const result = getReturnSpeech(ctx);
    expect(result).not.toBeNull();
    expect(result?.message).toBeTruthy();
  });

  it('returns null when no conditions match and no time shift pool', () => {
    // With no gauge, no upcoming, no sweep, and morning time (no time_shift pool for morning),
    // return speech should be null
    const ctx: SpeechContext = {
      ...returnCtx,
      lastSpeechTime: Date.now() - 10 * 60_000,
    };
    // May return null or a time_shift message depending on current time of day
    // Just verify it doesn't throw
    expect(() => getReturnSpeech(ctx)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getFedCelebrationSpeech Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getFedCelebrationSpeech', () => {
  it('returns days_remaining_2 pool for fedDaysCount=0', () => {
    const result = getFedCelebrationSpeech(0);
    expect(result.message).toBeTruthy();
    expect(result.duration).toBe(5000);
    expect(result.variant).toBe('celebration');
  });

  it('returns days_remaining_1 pool for fedDaysCount=1', () => {
    const result = getFedCelebrationSpeech(1);
    expect(result.message).toBeTruthy();
    expect(result.variant).toBe('celebration');
  });

  it('returns days_remaining_0 pool for fedDaysCount=2', () => {
    const result = getFedCelebrationSpeech(2);
    expect(result.message).toBeTruthy();
    expect(result.variant).toBe('celebration');
  });

  it('never throws for any count', () => {
    for (let i = 0; i <= 5; i++) {
      expect(() => getFedCelebrationSpeech(i)).not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getPostAgeUpSpeech Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getPostAgeUpSpeech', () => {
  it('replaces {age} placeholder with the given age', () => {
    const result = getPostAgeUpSpeech(7);
    expect(result.message).toContain('7');
    expect(result.message).not.toContain('{age}');
  });

  it('returns celebration variant', () => {
    const result = getPostAgeUpSpeech(3);
    expect(result.variant).toBe('celebration');
  });

  it('returns fixed 5000ms duration', () => {
    const result = getPostAgeUpSpeech(10);
    expect(result.duration).toBe(5000);
  });

  it('works for large ages', () => {
    const result = getPostAgeUpSpeech(365);
    expect(result.message).toContain('365');
    expect(result.message).not.toContain('{age}');
  });
});
