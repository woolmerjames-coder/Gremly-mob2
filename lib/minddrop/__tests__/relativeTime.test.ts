/**
 * relativeTime: how long ago, in words a person reads (final check item 19):
 * never "1d ago".
 */
jest.mock('../../date/DateService', () => {
  const now = new Date('2026-10-10T15:00:00Z');
  return {
    getDateService: () => ({
      now: () => now,
      today: () => '2026-10-10',
      dayOf: (iso: string) => iso.slice(0, 10),
      daysBetween: (a: string, b: string) =>
        Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5),
      toLocalDate: (d: Date) => d,
      formatForChip: () => 'Oct 1',
    }),
  };
});

import { relativeTime } from '../cardHelpers';

it('reads the same day in minutes and hours', () => {
  expect(relativeTime('2026-10-10T14:59:30Z')).toBe('just now');
  expect(relativeTime('2026-10-10T14:55:00Z')).toBe('5 min ago');
  expect(relativeTime('2026-10-10T12:00:00Z')).toBe('3 hrs ago');
});

it('reads a day before as yesterday, then days, then the date', () => {
  expect(relativeTime('2026-10-09T23:30:00Z')).toBe('yesterday');
  expect(relativeTime('2026-10-07T09:00:00Z')).toBe('3 days ago');
  expect(relativeTime('2026-10-01T09:00:00Z')).toBe('Oct 1');
});
