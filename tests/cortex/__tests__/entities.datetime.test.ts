import { parseDue } from '../../../lib/cortex/entities/datetime';

const FIXED = new Date('2025-10-28T10:00:00.000Z'); // Tue

function localIsoYmd(iso?: string) {
  return iso ? iso.slice(0, 10) : undefined;
}

describe('parseDue', () => {
  test('ISO explicit date', () => {
    const r = parseDue('Finish by 2025-11-03', { now: FIXED, defaultHour: 9 });
    expect(localIsoYmd(r.iso)).toBe('2025-11-03');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test('US M/D/Y date', () => {
    const r = parseDue('appt 11/03/2025 at 3pm', { now: FIXED });
    expect(localIsoYmd(r.iso)).toBe('2025-11-03');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test('Textual month/day', () => {
    const r = parseDue('demo on Nov 3', { now: FIXED });
    expect(localIsoYmd(r.iso)).toBe('2025-11-03');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test('relative: tomorrow', () => {
    const r = parseDue('buy flowers tomorrow', { now: FIXED });
    expect(r.confidence).toBeCloseTo(0.85);
  });

  test('relative: next week', () => {
    const r = parseDue('kickoff next week', { now: FIXED });
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test('day-of-week', () => {
    const r = parseDue('send on Friday', { now: FIXED, defaultHour: 9 });
    expect(r.confidence).toBeCloseTo(0.85);
  });

  test('no signals', () => {
    const r = parseDue('thinking out loud', { now: FIXED });
    expect(r.confidence).toBe(0);
  });
});
