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
    // midnight in New York (EST, UTC-5), whatever time zone the phone is in
    expect(result.toISOString()).toBe('2026-01-15T05:00:00.000Z');
  });

  it('returns 4 AM when dayBoundaryHour=4', () => {
    const ds = createDateService({
      clock: () => new Date('2026-01-15T12:00:00Z'),
      timezone: 'America/New_York',
    });
    ds.setDayBoundaryHour(4);
    const result = ds.startOfRitualDay('2026-01-15');
    // 4 AM in New York
    expect(result.toISOString()).toBe('2026-01-15T09:00:00.000Z');
  });

  it('defaults to today when no date argument', () => {
    const ds = createDateService({
      clock: () => new Date('2026-06-20T18:00:00Z'),
      timezone: 'America/New_York',
    });
    const result = ds.startOfRitualDay();
    // 18:00 UTC = 14:00 EDT, so today() = '2026-06-20', which starts at midnight EDT
    expect(result.toISOString()).toBe('2026-06-20T04:00:00.000Z');
  });

  it('differs from fromLocalDate (noon vs boundary hour)', () => {
    const ds = createDateService({
      clock: () => new Date('2026-01-15T12:00:00Z'),
      timezone: 'America/New_York',
    });
    const ritual = ds.startOfRitualDay('2026-01-15');
    const local = ds.fromLocalDate('2026-01-15');
    // fromLocalDate anchors at noon on the phone, startOfRitualDay at the day's start
    expect(ritual.toISOString()).toBe('2026-01-15T05:00:00.000Z');
    expect(local!.getHours()).toBe(12);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// One day end: today() is the person's day everywhere
// ═══════════════════════════════════════════════════════════════════════════════

describe('one day end for the whole app', () => {
  // 12:30 AM on Thursday 1 October 2026 in Los Angeles (PDT, UTC-7)
  const late = () =>
    createDateService({
      clock: () => new Date('2026-10-01T07:30:00Z'),
      timezone: 'America/Los_Angeles',
      dayBoundaryHour: 3,
    });

  it('after midnight today is still yesterday, until the day ends', () => {
    const ds = late();
    expect(ds.calendarDay()).toBe('2026-10-01');
    expect(ds.today()).toBe('2026-09-30');
    expect(ds.ritualDay()).toBe('2026-09-30');
    expect(ds.tomorrow()).toBe('2026-10-01');
    expect(ds.yesterday()).toBe('2026-09-29');
    expect(ds.getDayOfWeek()).toBe('Wednesday');
    expect(ds.isToday('2026-09-30')).toBe(true);
    expect(ds.isTomorrow('2026-10-01')).toBe(true);
    // Wednesday's todo is not past its day yet
    expect(ds.isOverdue('2026-09-30')).toBe(false);
    expect(ds.isOverdue('2026-09-29')).toBe(true);
    // the week it sits in starts on the Monday before Wednesday
    expect(ds.getStartOfWeek()).toBe('2026-09-28');
  });

  it('turns over at the day end, not before', () => {
    const at = (iso: string) =>
      createDateService({
        clock: () => new Date(iso),
        timezone: 'America/Los_Angeles',
        dayBoundaryHour: 3,
      }).today();
    expect(at('2026-10-01T06:59:00Z')).toBe('2026-09-30'); // 11:59 PM
    expect(at('2026-10-01T09:59:00Z')).toBe('2026-09-30'); // 2:59 AM
    expect(at('2026-10-01T10:00:00Z')).toBe('2026-10-01'); // 3:00 AM
  });

  it('is the date on the clock when the day ends at midnight', () => {
    const ds = createDateService({
      clock: () => new Date('2026-10-01T07:30:00Z'),
      timezone: 'America/Los_Angeles',
      dayBoundaryHour: 0,
    });
    expect(ds.today()).toBe('2026-10-01');
    expect(ds.dayOf('2026-10-01T07:30:00Z')).toBe('2026-10-01');
  });

  it('says which day a moment fell in', () => {
    const ds = late();
    // done at 12:10 AM on Thursday: that was Wednesday
    expect(ds.dayOf('2026-10-01T07:10:00Z')).toBe('2026-09-30');
    // done at 9 PM on Wednesday
    expect(ds.dayOf('2026-10-01T04:00:00Z')).toBe('2026-09-30');
    // done at 2:30 AM on Wednesday: that was Tuesday
    expect(ds.dayOf('2026-09-30T09:30:00Z')).toBe('2026-09-29');
    // done at 3:00 AM on Thursday: Thursday
    expect(ds.dayOf('2026-10-01T10:00:00Z')).toBe('2026-10-01');
    expect(ds.dayOf(new Date('2026-10-01T07:10:00Z'))).toBe('2026-09-30');
  });

  it('leaves a plain day, or a day kept as UTC midnight, as it is', () => {
    const ds = late();
    expect(ds.dayOf('2026-10-01')).toBe('2026-10-01');
    expect(ds.dayOf('2026-10-01T00:00:00Z')).toBe('2026-10-01');
    expect(ds.dayOf('2026-10-01 00:00:00+00')).toBe('2026-10-01');
    expect(ds.dayOf(null)).toBeNull();
    expect(ds.dayOf('not a date')).toBeNull();
  });

  it('counts what was done after midnight as done today', () => {
    const ds = late();
    expect(ds.isTimestampToday('2026-10-01T07:10:00Z')).toBe(true); // 12:10 AM Thursday
    expect(ds.isTimestampToday('2026-09-30T20:00:00Z')).toBe(true); // 1 PM Wednesday
    expect(ds.isTimestampToday('2026-09-30T09:00:00Z')).toBe(false); // 2 AM Wednesday: Tuesday
    expect(ds.isTimestampWithinDays('2026-09-30T09:00:00Z', 1)).toBe(true);
    expect(ds.isTimestampWithinDays('2026-09-29T09:00:00Z', 1)).toBe(false);
  });

  it('starts and ends a day at the day end, in their time zone', () => {
    const ds = late();
    // Wednesday runs from 3 AM Wednesday to just before 3 AM Thursday
    expect(ds.startOfDayUtc('2026-09-30')).toBe('2026-09-30T10:00:00.000Z');
    expect(ds.endOfDayUtc('2026-09-30')).toBe('2026-10-01T09:59:59.999Z');
    expect(ds.startOfRitualDay().toISOString()).toBe('2026-09-30T10:00:00.000Z');
    // a midnight day end keeps midnight to midnight
    const midnight = createDateService({
      clock: () => new Date('2026-10-01T07:30:00Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(midnight.startOfDayUtc('2026-01-15')).toBe('2026-01-15T08:00:00.000Z');
    expect(midnight.endOfDayUtc('2026-01-15')).toBe('2026-01-16T07:59:59.999Z');
  });

  it("counts date words from the person's day", () => {
    const ds = late();
    // typed at 12:30 AM on Thursday, while it is still Wednesday for them
    expect(ds.parseNaturalDate('call mum tomorrow')?.date).toBe('2026-10-01');
    expect(ds.parseNaturalDate('pay rent today')?.date).toBe('2026-09-30');
    expect(ds.parseNaturalDate('review on friday')?.date).toBe('2026-10-02');
    // the next Monday after Wednesday
    expect(ds.toLocalDate(ds.getNextWeekday(1))).toBe('2026-10-05');
    expect(ds.formatForChip('2026-09-30')).toBe('Today');
    expect(ds.formatForChip('2026-10-01')).toBe('Tomorrow');
  });

  it('holds over the night the clocks change', () => {
    // clocks go back on 1 November 2026 in Los Angeles
    const ds = createDateService({
      clock: () => new Date('2026-11-01T20:00:00Z'),
      timezone: 'America/Los_Angeles',
      dayBoundaryHour: 3,
    });
    expect(ds.startOfDayUtc('2026-10-31')).toBe('2026-10-31T10:00:00.000Z'); // 3 AM PDT
    expect(ds.startOfDayUtc('2026-11-01')).toBe('2026-11-01T11:00:00.000Z'); // 3 AM PST
    expect(ds.endOfDayUtc('2026-10-31')).toBe('2026-11-01T10:59:59.999Z');
  });
});
