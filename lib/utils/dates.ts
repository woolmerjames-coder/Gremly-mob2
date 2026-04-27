/**
 * Parse a YYYY-MM-DD string as a local-timezone Date.
 * `new Date('2026-05-13')` is UTC midnight which renders as May 12 in
 * Western timezones. Forcing noon dodges all DST and timezone edge cases.
 */
export function parseLocalYMD(ymd: string): Date {
  return new Date(ymd + 'T12:00:00');
}
