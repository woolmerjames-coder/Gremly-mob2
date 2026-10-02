/**
 * Notifications: when a reminder should next fire, in the person's own time zone.
 *
 * A reminder rule is what the app stores in an item's reminders_json:
 *   { id, time: 'HH:MM', frequency: 'once' | 'daily' | 'weekdays' | 'weekends' | 'weekly',
 *     date?: 'YYYY-MM-DD', days_of_week?: [0..6] (0 = Sunday) }
 * plus the kind added for anything with a start time:
 *   { id, kind: 'before', minutes: 10 | 60 | ... }  or  { id, kind: 'before', evening: true }
 *     (the evening before means 6:00pm local the day before, as the app does today)
 *
 * Everything here is pure and works on instants (Date) and IANA time zones, so
 * daylight saving changes land on the right wall clock time.
 */

const DAY_MS = 86400000;

/** Wall clock parts of an instant in a time zone. */
export function zonedParts(at, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const p = {};
  for (const part of f.formatToParts(at)) p[part.type] = part.value;
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: weekdays[p.weekday],
  };
}

/** The local date (YYYY-MM-DD) of an instant in a time zone. */
export function localDateOf(at, tz) {
  return zonedParts(at, tz).date;
}

/** Minutes since local midnight of an instant in a time zone. */
export function localMinutesOf(at, tz) {
  const p = zonedParts(at, tz);
  return p.hour * 60 + p.minute;
}

/** 'HH:MM' or 'HH:MM:SS' to minutes since midnight. */
export function minutesOf(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Adds days to a YYYY-MM-DD date (calendar arithmetic, no time zone involved). */
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Day of week (0 = Sunday) of a YYYY-MM-DD date. */
export function weekdayOf(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

/**
 * The instant at which the wall clock in `tz` reads `dateStr` `hhmm`.
 * A time that does not exist (skipped by a spring forward) moves forward by the
 * length of the gap (2:30am becomes 3:30am); a time that happens twice takes the
 * first one.
 */
export function zonedTimeToUtc(dateStr, hhmm, tz) {
  const target = minutesOf(hhmm);
  const [y, mo, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, Math.floor(target / 60), target % 60);
  // two passes of offset correction settle every real time zone
  let t = guess;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(t), tz);
    const shown = Date.UTC(
      ...p.date.split('-').map((v, k) => (k === 1 ? Number(v) - 1 : Number(v))),
      p.hour,
      p.minute,
    );
    const diff = shown - guess;
    if (diff === 0) return new Date(t);
    t -= diff;
  }
  // a skipped time: the wall clock never shows it, so move forward by the gap
  const p = zonedParts(new Date(t), tz);
  if (p.date === dateStr && p.hour * 60 + p.minute > target) return new Date(t);
  return new Date(t + 3600000);
}

function matchesDay(rule, dateStr) {
  const wd = weekdayOf(dateStr);
  switch (rule.frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return wd >= 1 && wd <= 5;
    case 'weekends':
      return wd === 0 || wd === 6;
    case 'weekly':
      return Array.isArray(rule.days_of_week) && rule.days_of_week.includes(wd);
    default:
      return false;
  }
}

/**
 * When a reminder should next fire, strictly after `now`, or null when it never will.
 * @param {object} rule  the stored reminder
 * @param {{tz: string, now: Date, eventStart?: {date: string, time: string|null}}} opts
 */
export function nextFireAt(rule, { tz, now, eventStart }) {
  if (!rule) return null;

  if (rule.kind === 'before') {
    if (!eventStart?.date) return null;
    let at;
    if (rule.evening) {
      at = zonedTimeToUtc(addDays(eventStart.date, -1), '18:00', tz);
    } else {
      if (!eventStart.time) return null; // all day events have no start to count back from
      const start = zonedTimeToUtc(eventStart.date, eventStart.time, tz);
      at = new Date(start.getTime() - Number(rule.minutes || 0) * 60000);
    }
    return at > now ? at : null;
  }

  if (minutesOf(rule.time) === null) return null;

  if (rule.frequency === 'once' || !rule.frequency) {
    if (!rule.date) return null;
    const at = zonedTimeToUtc(rule.date, rule.time, tz);
    return at > now ? at : null;
  }

  // repeating: today if the time is still ahead, otherwise the next matching day
  const today = localDateOf(now, tz);
  for (let i = 0; i <= 8; i++) {
    const day = addDays(today, i);
    if (!matchesDay(rule, day)) continue;
    const at = zonedTimeToUtc(day, rule.time, tz);
    if (at > now) return at;
  }
  return null;
}

/** True when the rule repeats, so it rolls on after firing. */
export function repeats(rule) {
  return !!rule && rule.kind !== 'before' && !!rule.frequency && rule.frequency !== 'once';
}

export const _internals = { DAY_MS };
