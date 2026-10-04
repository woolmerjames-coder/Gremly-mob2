/**
 * Minutes from local midnight, in the person's timezone (DateService), and
 * back to an ISO instant. Used by the day card, the plan and Lock it in.
 */

import { getDateService } from '../date/DateService';

function partsIn(tz: string, d: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  out.hour = (out.hour ?? 0) % 24;
  return out;
}

/** Minutes from local midnight for an instant (default: now). */
export function minutesOfDay(iso?: string | null): number {
  const ds = getDateService();
  const d = iso ? new Date(iso) : ds.now();
  const p = partsIn(ds.getTimezone(), d);
  return p.hour * 60 + p.minute;
}

/**
 * Minutes into the person's day, now. The same as minutesOfDay until
 * midnight; after it, until their day ends, it runs on past 24 hours, so the
 * small hours come after the evening and not before the morning.
 */
export function minutesOfTheirDay(): number {
  return getDateService().minutesIntoDay();
}

/** The local YYYY-MM-DD of an instant. */
export function localDateOf(iso: string): string | null {
  return getDateService().extractLocalDate(iso);
}

/** "HH:mm" to minutes. */
export function hhmmToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** The UTC ISO instant for a local day and minutes from midnight, in the person's timezone. */
export function localMinutesToIso(day: string, minutes: number): string {
  const tz = getDateService().getTimezone();
  const [y, mo, d] = day.split('-').map(Number);
  const h = Math.floor(minutes / 60);
  const mi = minutes % 60;
  // First guess: the wall-clock time as if it were UTC, then correct by the
  // zone's offset at that moment (twice, for days the clocks change).
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = partsIn(tz, new Date(guess));
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += Date.UTC(y, mo - 1, d, h, mi) - asUtc;
  }
  return new Date(guess).toISOString();
}
