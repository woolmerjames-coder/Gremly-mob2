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
});
