/**
 * The days the providers are asked for, for the days the app asks about.
 *
 * The app asks by its own days (YYYY-MM-DD, in the person's time zone), which
 * this worker does not know. A local day can begin up to 14 hours before or
 * 12 hours after the same date in UTC, so each provider is asked for a day
 * either side, read in UTC, and the app keeps what falls on the days it asked
 * for. Without that, the evening of the last day was cut off west of UTC.
 */

/** YYYY-MM-DD, n days on. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The UTC span that covers every local time on the days asked for. */
export function fetchWindow(startDate: string, endDate: string): { from: string; to: string } {
  return {
    from: `${addDays(startDate, -1)}T00:00:00Z`,
    to: `${addDays(endDate, 1)}T23:59:59Z`,
  };
}
