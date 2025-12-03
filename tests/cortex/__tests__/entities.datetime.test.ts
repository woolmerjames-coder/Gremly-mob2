import { parseDue } from '../../../lib/nlp/datetime/parseDue';

const FIXED = new Date('2025-10-28T10:00:00.000Z'); // Tue

function expectIsoDateStartsWith(iso: string | undefined, prefix: string) {
  expect(iso).toBeDefined();
  expect(iso!.startsWith(prefix)).toBe(true);
}

function expectDateTimeConsistency(parsed: ReturnType<typeof parseDue>) {
  if (!parsed) {
    throw new Error('Parsed result required for expectation');
  }
  expect(parsed.date).toBe(parsed.iso.slice(0, 10));
  if (parsed.granularity === 'time') {
    expect(parsed.time).toBe(parsed.iso.slice(11, 16));
  } else {
    expect(parsed.time).toBeNull();
  }
}

describe('parseDue', () => {
  test('ISO explicit date captures match and cleanup', () => {
    const parsed = parseDue('Finish by 2025-11-03', FIXED);
    expect(parsed).not.toBeNull();
    expectIsoDateStartsWith(parsed?.iso, '2025-11-03');
    expectDateTimeConsistency(parsed);
    expect(parsed?.confidence).toBeGreaterThanOrEqual(0.95);
    expect(parsed?.granularity).toBe('date');
    expect(parsed?.matched).toBe('2025-11-03');
    expect(parsed?.textWithoutWhen).toBe('Finish by');
  });

  test('US M/D/Y with time prefers time granularity', () => {
    const parsed = parseDue('appt 11/03/2025 at 3pm', FIXED);
    expect(parsed).not.toBeNull();
    expectIsoDateStartsWith(parsed?.iso, '2025-11-03');
    expectDateTimeConsistency(parsed);
    expect(parsed?.granularity).toBe('time');
    expect(parsed?.matched?.toLowerCase()).toContain('3pm');
  });

  test('relative: tomorrow strips phrase', () => {
    const parsed = parseDue('buy flowers tomorrow', FIXED);
    expect(parsed).not.toBeNull();
    expect(parsed?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(parsed?.matched?.toLowerCase()).toBe('tomorrow');
    expect(parsed?.textWithoutWhen).toBe('buy flowers');
    expectDateTimeConsistency(parsed);
  });

  test('relative hours adds offset', () => {
    const parsed = parseDue('follow up in 2h', FIXED);
    expect(parsed).not.toBeNull();
    const iso = parsed!.iso;
    const delta = Date.parse(iso) - FIXED.getTime();
    expect(Math.round(delta / (60 * 60 * 1000))).toBe(2);
    expect(parsed?.granularity).toBe('time');
    expectDateTimeConsistency(parsed);
  });

  test('today with explicit time collapses full phrase', () => {
    const parsed = parseDue('finish today at 3pm', FIXED);
    expect(parsed).not.toBeNull();
    expect(parsed?.iso.includes('T15:00:00')).toBe(true);
    expect(parsed?.granularity).toBe('time');
    expect(parsed?.matched?.toLowerCase()).toBe('today at 3pm');
    expect(parsed?.textWithoutWhen).toBe('finish');
    expectDateTimeConsistency(parsed);
  });

  test('next weekday defaults to morning', () => {
    const parsed = parseDue('kickoff next wed', FIXED);
    expect(parsed).not.toBeNull();
    expect(parsed?.granularity).toBe('date');
    expect(parsed?.matched?.toLowerCase()).toBe('next wed');
    expectDateTimeConsistency(parsed);
  });

  test('tonight returns time granularity', () => {
    const parsed = parseDue('send notes tonight', FIXED);
    expect(parsed).not.toBeNull();
    expect(parsed?.granularity).toBe('time');
    expect(parsed?.matched?.toLowerCase()).toBe('tonight');
    expectDateTimeConsistency(parsed);
  });

  test('no signals -> null', () => {
    const parsed = parseDue('thinking out loud', FIXED);
    expect(parsed).toBeNull();
  });

  describe('explicitTime field', () => {
    test('date-only phrases have explicitTime false', () => {
      // "today" without time
      const today = parseDue('finish today', FIXED);
      expect(today?.explicitTime).toBe(false);
      expect(today?.granularity).toBe('date');

      // "tomorrow" without time
      const tomorrow = parseDue('buy flowers tomorrow', FIXED);
      expect(tomorrow?.explicitTime).toBe(false);
      expect(tomorrow?.granularity).toBe('date');

      // ISO date without time
      const isoDate = parseDue('Finish by 2025-11-03', FIXED);
      expect(isoDate?.explicitTime).toBe(false);
      expect(isoDate?.granularity).toBe('date');

      // US date without time
      const usDate = parseDue('due 11/03', FIXED);
      expect(usDate?.explicitTime).toBe(false);
      expect(usDate?.granularity).toBe('date');

      // next weekday
      const nextWed = parseDue('kickoff next wed', FIXED);
      expect(nextWed?.explicitTime).toBe(false);
      expect(nextWed?.granularity).toBe('date');

      // end of month (just a date)
      const eom = parseDue('quarterly report eom', FIXED);
      expect(eom?.explicitTime).toBe(false);
      expect(eom?.granularity).toBe('date');
    });

    test('explicit time phrases have explicitTime true', () => {
      // "today at 3pm"
      const todayAt3 = parseDue('finish today at 3pm', FIXED);
      expect(todayAt3?.explicitTime).toBe(true);
      expect(todayAt3?.granularity).toBe('time');

      // "tomorrow at 9am"
      const tomorrowAt9 = parseDue('buy flowers tomorrow at 9am', FIXED);
      expect(tomorrowAt9?.explicitTime).toBe(true);
      expect(tomorrowAt9?.granularity).toBe('time');

      // ISO datetime with time
      const isoDateTime = parseDue('meeting 2025-11-03T15:00', FIXED);
      expect(isoDateTime?.explicitTime).toBe(true);
      expect(isoDateTime?.granularity).toBe('time');

      // US date with trailing time
      const usDateTime = parseDue('appt 11/03 at 3pm', FIXED);
      expect(usDateTime?.explicitTime).toBe(true);
      expect(usDateTime?.granularity).toBe('time');

      // relative time "in 2h"
      const in2h = parseDue('follow up in 2h', FIXED);
      expect(in2h?.explicitTime).toBe(true);
      expect(in2h?.granularity).toBe('time');

      // standalone time "3pm"
      const just3pm = parseDue('call at 3pm', FIXED);
      expect(just3pm?.explicitTime).toBe(true);
      expect(just3pm?.granularity).toBe('time');

      // "tonight"
      const tonight = parseDue('send notes tonight', FIXED);
      expect(tonight?.explicitTime).toBe(true);
      expect(tonight?.granularity).toBe('time');

      // "this afternoon"
      const afternoon = parseDue('meeting this afternoon', FIXED);
      expect(afternoon?.explicitTime).toBe(true);
      expect(afternoon?.granularity).toBe('time');

      // "this morning"
      const morning = parseDue('call this morning', FIXED);
      expect(morning?.explicitTime).toBe(true);
      expect(morning?.granularity).toBe('time');

      // "eod" / "end of day"
      const eod = parseDue('finish report eod', FIXED);
      expect(eod?.explicitTime).toBe(true);
      expect(eod?.granularity).toBe('time');
    });
  });
});
