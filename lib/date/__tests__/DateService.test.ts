import { createDateService } from '../DateService';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. THE CLASSIC TIMEZONE BUG
//    The one that started this whole audit: toISOString().split('T')[0]
//    returns the UTC date, not the local date.
// ═══════════════════════════════════════════════════════════════════════════════

describe('The classic timezone bug', () => {
  it('today() returns correct date at 11pm PST', () => {
    // 2026-02-15T07:00:00Z = 11pm Feb 14 in LA (PST = UTC-8)
    const ds = createDateService({
      clock: () => new Date('2026-02-15T07:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    // The old toISOString().split('T')[0] bug would return "2026-02-15" (UTC).
    // Correct answer is Feb 14 because it's 11pm local time.
    expect(ds.today()).toBe('2026-02-14');
  });

  it('today() returns correct date at 1am PST', () => {
    // 2026-02-15T09:00:00Z = 1am Feb 15 in LA (PST = UTC-8)
    const ds = createDateService({
      clock: () => new Date('2026-02-15T09:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.today()).toBe('2026-02-15');
  });

  it('today() with timezone set to New York when UTC is same day', () => {
    // 2026-02-15T04:00:00Z = 11pm Feb 14 in NY (EST = UTC-5)
    const ds = createDateService({
      clock: () => new Date('2026-02-15T04:00:00Z'),
      timezone: 'America/New_York',
    });
    expect(ds.today()).toBe('2026-02-14');
  });

  it('today() with timezone set to Tokyo (positive UTC offset)', () => {
    // 2026-03-15T20:00:00Z = 5am March 16 in Tokyo (UTC+9)
    const ds = createDateService({
      clock: () => new Date('2026-03-15T20:00:00Z'),
      timezone: 'Asia/Tokyo',
    });
    expect(ds.today()).toBe('2026-03-16');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. RITUAL DAY (day boundary)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Ritual day (day boundary)', () => {
  it('ritualDay() at 2am with 4am boundary returns yesterday', () => {
    // 2026-03-15T10:00:00Z = 2am March 15 in LA (PDT, UTC-7)
    const ds = createDateService({
      clock: () => new Date('2026-03-15T10:00:00Z'),
      timezone: 'America/Los_Angeles',
      dayBoundaryHour: 4,
    });
    // Before the 4am boundary → still "yesterday"
    expect(ds.ritualDay()).toBe('2026-03-14');
  });

  it('ritualDay() at 5am with 4am boundary returns today', () => {
    // 2026-03-15T13:00:00Z = 6am March 15 in LA (PDT)
    const ds = createDateService({
      clock: () => new Date('2026-03-15T13:00:00Z'),
      timezone: 'America/Los_Angeles',
      dayBoundaryHour: 4,
    });
    // After the 4am boundary → today
    expect(ds.ritualDay()).toBe('2026-03-15');
  });

  it('ritualDay() at midnight with 0 boundary returns today', () => {
    // 2026-03-15T08:00:00Z = 1am March 15 in LA (PDT, UTC-7)
    // With boundary=0, midnight is the boundary so any hour on March 15 = March 15
    const ds = createDateService({
      clock: () => new Date('2026-03-15T08:00:00Z'),
      timezone: 'America/Los_Angeles',
      dayBoundaryHour: 0,
    });
    expect(ds.ritualDay()).toBe('2026-03-15');
  });

  it('ritualDay() at 2:59am with 3am boundary returns yesterday', () => {
    // 2026-03-15T10:59:00Z = 3:59am March 15 in LA (PDT, UTC-7)
    // But we need 2:59am local. PDT = UTC-7, so 2:59am = 09:59 UTC
    const ds = createDateService({
      clock: () => new Date('2026-03-15T09:59:00Z'),
      timezone: 'America/Los_Angeles',
      dayBoundaryHour: 3,
    });
    expect(ds.ritualDay()).toBe('2026-03-14');
  });

  it('ritualDay() at 3:00am with 3am boundary returns today', () => {
    // 3:00am PDT = 10:00 UTC (PDT = UTC-7)
    const ds = createDateService({
      clock: () => new Date('2026-03-15T10:00:00Z'),
      timezone: 'America/Los_Angeles',
      dayBoundaryHour: 3,
    });
    expect(ds.ritualDay()).toBe('2026-03-15');
  });

  it('isInLateNightPeriod() at 2am with 4am boundary returns true', () => {
    // 2am PDT = 09:00 UTC
    const ds = createDateService({
      clock: () => new Date('2026-03-15T09:00:00Z'),
      timezone: 'America/Los_Angeles',
      dayBoundaryHour: 4,
    });
    expect(ds.isInLateNightPeriod()).toBe(true);
  });

  it('isInLateNightPeriod() at 5am with 4am boundary returns false', () => {
    // 5am PDT = 12:00 UTC
    const ds = createDateService({
      clock: () => new Date('2026-03-15T12:00:00Z'),
      timezone: 'America/Los_Angeles',
      dayBoundaryHour: 4,
    });
    expect(ds.isInLateNightPeriod()).toBe(false);
  });

  it('isInLateNightPeriod() with 0 boundary always returns false', () => {
    // 2am PDT = 09:00 UTC
    const ds = createDateService({
      clock: () => new Date('2026-03-15T09:00:00Z'),
      timezone: 'America/Los_Angeles',
      dayBoundaryHour: 0,
    });
    expect(ds.isInLateNightPeriod()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. DST TRANSITIONS
//    US spring forward 2026: March 8, clocks jump 2am → 3am
//    US fall back 2026: November 1, clocks jump 2am → 1am
// ═══════════════════════════════════════════════════════════════════════════════

describe('DST transitions', () => {
  describe('Spring forward (March 8, 2026)', () => {
    it('addDays() across spring-forward gives correct date', () => {
      // Noon March 7 in LA = 20:00 UTC (PST = UTC-8)
      const ds = createDateService({
        clock: () => new Date('2026-03-07T20:00:00Z'),
        timezone: 'America/Los_Angeles',
      });
      expect(ds.addDays('2026-03-07', 1)).toBe('2026-03-08');
      expect(ds.addDays('2026-03-07', 2)).toBe('2026-03-09');
    });

    it('daysBetween() across spring-forward is correct', () => {
      const ds = createDateService({
        clock: () => new Date('2026-03-07T20:00:00Z'),
        timezone: 'America/Los_Angeles',
      });
      // 2 calendar days even though only 47 hours elapsed (23-hour day)
      expect(ds.daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    });

    it('today() on spring-forward day at 11pm is correct', () => {
      // After spring forward, LA is PDT (UTC-7)
      // 11pm March 8 PDT = 06:00 UTC March 9
      const ds = createDateService({
        clock: () => new Date('2026-03-09T06:00:00Z'),
        timezone: 'America/Los_Angeles',
      });
      expect(ds.today()).toBe('2026-03-08');
    });
  });

  describe('Fall back (November 1, 2026)', () => {
    it('addDays() across fall-back gives correct date', () => {
      // Noon Oct 31 in LA = 19:00 UTC (PDT = UTC-7)
      const ds = createDateService({
        clock: () => new Date('2026-10-31T19:00:00Z'),
        timezone: 'America/Los_Angeles',
      });
      expect(ds.addDays('2026-10-31', 1)).toBe('2026-11-01');
      expect(ds.addDays('2026-10-31', 2)).toBe('2026-11-02');
    });

    it('daysBetween() across fall-back is correct', () => {
      const ds = createDateService({
        clock: () => new Date('2026-10-31T19:00:00Z'),
        timezone: 'America/Los_Angeles',
      });
      // 2 calendar days even though 50 hours elapsed (25-hour day)
      expect(ds.daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. TIMESTAMP HANDLING (UTC ↔ local boundary)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Timestamp handling (UTC ↔ local)', () => {
  it('nowTimestamp() returns UTC ISO string', () => {
    const ds = createDateService({
      clock: () => new Date('2026-03-15T02:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.nowTimestamp()).toBe('2026-03-15T02:00:00.000Z');
  });

  it('extractLocalDate() treats UTC midnight as intended date (shortcut)', () => {
    // UTC midnight shortcut: "T00:00:00Z" is treated as the intended date,
    // not timezone-converted, because APIs often store dates as midnight UTC.
    const ds = createDateService({
      clock: () => new Date('2026-03-01T12:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.extractLocalDate('2026-03-15T00:00:00Z')).toBe('2026-03-15');
  });

  it('extractLocalDate() converts non-midnight UTC to local date', () => {
    // 2am UTC March 15 = 6pm March 14 in LA (PST = UTC-8)
    const ds = createDateService({
      clock: () => new Date('2026-02-01T12:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.extractLocalDate('2026-02-15T02:00:00Z')).toBe('2026-02-14');
  });

  it('extractLocalDate() passes through YYYY-MM-DD unchanged', () => {
    const ds = createDateService({
      clock: () => new Date('2026-03-15T12:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.extractLocalDate('2026-03-15')).toBe('2026-03-15');
  });

  it('isTimestampToday() correctly compares UTC timestamp to local today', () => {
    // Noon March 15 in LA = 20:00 UTC (PDT, UTC-7, after spring forward March 8)
    const ds = createDateService({
      clock: () => new Date('2026-03-15T20:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    // 20:30 UTC = 1:30pm March 15 in LA → same day
    expect(ds.isTimestampToday('2026-03-15T20:30:00Z')).toBe(true);
  });

  it('isTimestampToday() returns false when UTC date differs from local', () => {
    // 10pm March 14 in LA = 06:00 UTC March 15 (PDT = UTC-7, after DST)
    // Wait - March 14 is before spring forward (March 8)
    // Actually March 14 is AFTER spring forward (March 8), so LA is PDT (UTC-7)
    // 10pm March 14 PDT = 05:00 UTC March 15
    const ds = createDateService({
      clock: () => new Date('2026-03-15T05:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    // Clock says 10pm March 14 local.
    // Input "2026-03-15T05:30:00Z" = 10:30pm March 14 local → same day as clock
    expect(ds.isTimestampToday('2026-03-15T05:30:00Z')).toBe(true);
    // Input "2026-03-15T10:00:00Z" = 3am March 15 local → different day from clock
    expect(ds.isTimestampToday('2026-03-15T10:00:00Z')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. getHour() RESPECTS TIMEZONE
// ═══════════════════════════════════════════════════════════════════════════════

describe('getHour() respects timezone', () => {
  it('returns hour in configured timezone, not UTC', () => {
    // 20:00 UTC, PDT = UTC-7 → 1pm local
    const ds = createDateService({
      clock: () => new Date('2026-03-15T20:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.getHour()).toBe(13);
  });

  it('returns correct hour with different timezone', () => {
    // 20:00 UTC, Tokyo = UTC+9 → 5am March 16
    const ds = createDateService({
      clock: () => new Date('2026-03-15T20:00:00Z'),
      timezone: 'Asia/Tokyo',
    });
    expect(ds.getHour()).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. FORMATTING
// ═══════════════════════════════════════════════════════════════════════════════

describe('formatForChip()', () => {
  // March 15, 2026 is a Sunday
  const ds = createDateService({
    clock: () => new Date('2026-03-15T20:00:00Z'), // 1pm March 15 in LA (PDT)
    timezone: 'America/Los_Angeles',
  });

  it('shows "Today" for today\'s date', () => {
    expect(ds.formatForChip('2026-03-15')).toBe('Today');
  });

  it('shows "Tomorrow" for tomorrow\'s date', () => {
    expect(ds.formatForChip('2026-03-16')).toBe('Tomorrow');
  });

  it('shows weekday for dates within 7 days', () => {
    // March 17 = Tuesday, 2 days from Sunday March 15
    expect(ds.formatForChip('2026-03-17')).toBe('Tue');
    // March 21 = Saturday, 6 days from Sunday March 15
    expect(ds.formatForChip('2026-03-21')).toBe('Sat');
  });

  it('shows "Mon D" for dates beyond 7 days in same year', () => {
    expect(ds.formatForChip('2026-04-10')).toBe('Apr 10');
    expect(ds.formatForChip('2026-12-25')).toBe('Dec 25');
  });

  it('shows "Mon D, YYYY" for dates in a different year', () => {
    expect(ds.formatForChip('2027-01-15')).toBe('Jan 15, 2027');
    expect(ds.formatForChip('2025-06-01')).toBe('Jun 1, 2025');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  it('today() at exactly midnight returns the new date', () => {
    // Midnight March 15 in LA. PST = UTC-8, but March 15 is after DST (March 8),
    // so PDT = UTC-7. Midnight March 15 PDT = 07:00 UTC March 15.
    const ds = createDateService({
      clock: () => new Date('2026-03-15T07:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.today()).toBe('2026-03-15');
  });

  it('year boundary: today() on Dec 31 at 11:59pm', () => {
    // 11:59pm Dec 31 in LA. PST = UTC-8.
    // 11:59pm Dec 31 PST = 07:59 UTC Jan 1
    const ds = createDateService({
      clock: () => new Date('2027-01-01T07:59:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.today()).toBe('2026-12-31');
  });

  it('year boundary: today() on Jan 1 at 12:01am', () => {
    // 12:01am Jan 1 in LA. PST = UTC-8.
    // 12:01am Jan 1 PST = 08:01 UTC Jan 1
    const ds = createDateService({
      clock: () => new Date('2027-01-01T08:01:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.today()).toBe('2027-01-01');
  });

  it('toLocalDate() returns empty string for null', () => {
    const ds = createDateService({
      clock: () => new Date('2026-03-15T12:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.toLocalDate(null)).toBe('');
  });

  it('toLocalDate() returns empty string for invalid Date', () => {
    const ds = createDateService({
      clock: () => new Date('2026-03-15T12:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.toLocalDate(new Date('not-a-date'))).toBe('');
  });

  it('fromLocalDate() returns null for garbage string', () => {
    const ds = createDateService({
      clock: () => new Date('2026-03-15T12:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.fromLocalDate('not-a-date')).toBeNull();
  });

  it('fromLocalDate() returns null for empty string', () => {
    const ds = createDateService({
      clock: () => new Date('2026-03-15T12:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.fromLocalDate('')).toBeNull();
  });

  it('daysBetween() returns 0 for same date', () => {
    const ds = createDateService({
      clock: () => new Date('2026-03-15T12:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.daysBetween('2026-03-15', '2026-03-15')).toBe(0);
  });

  it('daysBetween() returns negative for past date', () => {
    const ds = createDateService({
      clock: () => new Date('2026-03-15T12:00:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(ds.daysBetween('2026-03-15', '2026-03-10')).toBe(-5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// startOfRitualDay
// ═══════════════════════════════════════════════════════════════════════════════

describe('startOfRitualDay', () => {
  it('returns midnight for default dayBoundaryHour=0', () => {
    const ds = createDateService({
      clock: () => new Date('2026-01-15T12:00:00Z'),
      timezone: 'America/New_York',
    });
    const result = ds.startOfRitualDay('2026-01-15');
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(15);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it('returns 4 AM when dayBoundaryHour=4', () => {
    const ds = createDateService({
      clock: () => new Date('2026-01-15T12:00:00Z'),
      timezone: 'America/New_York',
    });
    ds.setDayBoundaryHour(4);
    const result = ds.startOfRitualDay('2026-01-15');
    expect(result.getHours()).toBe(4);
    expect(result.getMinutes()).toBe(0);
    expect(result.getDate()).toBe(15);
  });

  it('defaults to today when no date argument', () => {
    const ds = createDateService({
      clock: () => new Date('2026-06-20T18:00:00Z'),
      timezone: 'America/New_York',
    });
    const result = ds.startOfRitualDay();
    // 18:00 UTC = 14:00 EDT, so today() = '2026-06-20'
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(5); // June
    expect(result.getDate()).toBe(20);
  });

  it('differs from fromLocalDate (noon vs boundary hour)', () => {
    const ds = createDateService({
      clock: () => new Date('2026-01-15T12:00:00Z'),
      timezone: 'America/New_York',
    });
    const ritual = ds.startOfRitualDay('2026-01-15');
    const local = ds.fromLocalDate('2026-01-15');
    // fromLocalDate anchors at noon, startOfRitualDay at boundary hour (0)
    expect(ritual.getHours()).toBe(0);
    expect(local!.getHours()).toBe(12);
  });
});
