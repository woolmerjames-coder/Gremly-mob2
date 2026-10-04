/**
 * A person's calendar for one day, as the brief and the agent's tools read it:
 * synced entries, events Gremly holds and quick events, timed ones in local
 * minutes, cancelled ones left out. Moved here from inngest-jobs/brief/data.js
 * so both Workers read the day the same way.
 */
import { addDays } from './db.js';

/**
 * Google and Outlook keep a cancelled meeting with "Canceled: " at the start of
 * its title. Only that exact form counts here; anything else is left to the
 * DCO's calendar reader.
 */
export const CANCELLED_TITLE = /^\s*(canceled|cancelled)\s*:/i;

/** Cancelled entries stay on some calendars; they are not part of the day. */
export function isCancelledEntry(e, cancelledIds) {
  return Boolean(cancelledIds?.has(e.id) || CANCELLED_TITLE.test(e.title || ''));
}

function partsIn(tz, at) {
  const out = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  out.hour = (out.hour || 0) % 24;
  return out;
}

export function minutesIn(tz, at) {
  const p = partsIn(tz, at instanceof Date ? at : new Date(at));
  return p.hour * 60 + p.minute;
}

/** The UTC instant of local midnight on dateStr. */
export function localStartIso(tz, dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  let guess = Date.UTC(y, mo - 1, d, 0, 0);
  for (let i = 0; i < 2; i++) {
    const p = partsIn(tz, new Date(guess));
    guess +=
      Date.UTC(y, mo - 1, d, 0, 0) -
      Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  return new Date(guess).toISOString();
}

/**
 * Today's calendar as the brief reads it: synced entries, events Gremly holds
 * and quick events, timed ones in local minutes, cancelled ones left out.
 */
export function meetingsFrom({ synced, noteEvents, quickEvents, tz, cancelledIds }) {
  const meetings = [];
  const allDay = [];
  for (const e of synced || []) {
    if (isCancelledEntry(e, cancelledIds)) continue;
    if (e.is_all_day) {
      allDay.push({ id: e.id, title: e.title });
      continue;
    }
    const start = minutesIn(tz, e.start_at);
    const end = e.end_at ? minutesIn(tz, e.end_at) : start + 30;
    meetings.push({ id: e.id, title: e.title, start, end: end > start ? end : start + 30 });
  }
  for (const n of noteEvents || []) {
    if (!n.event_time) {
      allDay.push({ id: n.id, title: n.title });
      continue;
    }
    const [h, m] = n.event_time.split(':').map(Number);
    meetings.push({ id: n.id, title: n.title, start: h * 60 + m, end: h * 60 + m + 60 });
  }
  for (const c of quickEvents || []) {
    if (!c.event_time) {
      allDay.push({ id: c.id, title: c.title });
      continue;
    }
    const [h, m] = c.event_time.split(':').map(Number);
    meetings.push({
      id: c.id,
      title: c.title,
      start: h * 60 + m,
      end: h * 60 + m + (c.duration_minutes || 30),
    });
  }
  meetings.sort((a, b) => a.start - b.start);
  return { meetings, allDay };
}

/**
 * Whether an all day entry covers a date. Calendars store an all day entry
 * from midnight UTC on its first day, with its end at midnight after its last
 * day or a second before it, so the dates are the same wherever the person is.
 */
export function allDayCovers(e, date) {
  if (!e?.is_all_day || !e.start_at) return false;
  const from = Date.parse(`${date}T00:00:00Z`);
  const start = Date.parse(e.start_at);
  if (!(start < from + 864e5)) return false;
  if (e.end_at) return Date.parse(e.end_at) > from;
  return start >= from;
}

// An all day entry that began up to this many days before the first day read
// still shows on the days it lasts into.
const ALL_DAY_LOOKBACK = 62;

// A timed entry this long fills a day, as an all day entry does when another
// time zone's calendar holds one (midnight to midnight there).
const FILLS_A_DAY_MS = 20 * 3600e3;

const SYNCED_FIELDS = 'select=id,title,start_at,end_at,is_all_day&order=start_at.asc';

/** The date an instant falls on where the person is. */
export function localDateOf(tz, at) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
    at instanceof Date ? at : new Date(at),
  );
}

function fillsADay(e) {
  return (
    !e.is_all_day &&
    Boolean(e.end_at) &&
    Date.parse(e.end_at) - Date.parse(e.start_at) >= FILLS_A_DAY_MS
  );
}

/** Whether a timed entry long enough to fill a day covers a date: it spans that day's noon where the person is. */
export function fillsDate(e, date, tz) {
  const noon = Date.parse(localStartIso(tz, date)) + 12 * 3600e3;
  return Date.parse(e.start_at) <= noon && Date.parse(e.end_at) > noon;
}

/**
 * Synced entries for the days first to last: { timed, allDay, long }. A timed
 * entry belongs to the day its start falls on where the person is; an all day
 * entry to every date it covers (allDayCovers); a timed entry long enough to
 * fill a day to the dates whose noon it spans (fillsDate), as an all day entry.
 * The all day read is separate because a local day west of UTC holds the UTC
 * midnight that starts the next day's all day entry, and the timed read starts
 * a day early so an entry that fills a day is found from the evening before.
 */
export function syncedRange(d, userId, tz, first, last = first) {
  const timed = d.select(
    `synced_calendar_events?owner_id=eq.${userId}&archived=eq.false&start_at=gte.${encodeURIComponent(localStartIso(tz, addDays(first, -1)))}&start_at=lt.${encodeURIComponent(localStartIso(tz, addDays(last, 1)))}&${SYNCED_FIELDS}&limit=300`,
  );
  const allDay = d.select(
    `synced_calendar_events?owner_id=eq.${userId}&archived=eq.false&is_all_day=eq.true&start_at=gte.${addDays(first, -ALL_DAY_LOOKBACK)}T00:00:00Z&start_at=lt.${addDays(last, 1)}T00:00:00Z&${SYNCED_FIELDS}&limit=100`,
  );
  return Promise.all([timed, allDay]).then(([t, a]) => {
    const rows = (t || []).filter((e) => !e.is_all_day);
    return {
      timed: rows.filter((e) => {
        if (fillsADay(e)) return false;
        const day = localDateOf(tz, e.start_at);
        return day >= first && day <= last;
      }),
      long: rows.filter(fillsADay),
      allDay: (a || []).filter((e) => e.is_all_day),
    };
  });
}

/** The synced entries of one date from a syncedRange read, ready for meetingsFrom. */
export function syncedOn(range, date, tz) {
  return [
    ...(range?.timed || []).filter((e) => localDateOf(tz, e.start_at) === date),
    ...(range?.allDay || []).filter((e) => allDayCovers(e, date)),
    ...(range?.long || [])
      .filter((e) => fillsDate(e, date, tz))
      .map((e) => ({ ...e, is_all_day: true })),
  ];
}

/** The selects meetingsFrom reads, for one person's day. */
export function calendarSelects(d, userId, tz, today) {
  return [
    syncedRange(d, userId, tz, today).then((range) => syncedOn(range, today, tz)),
    d.select(
      `notes?owner_id=eq.${userId}&subtype=eq.event&archived=eq.false&external_source=is.null&target_date=eq.${today}&select=id,title,event_time,end_date&limit=50`,
    ),
    d.select(
      `calendar_events?owner_id=eq.${userId}&event_date=eq.${today}&select=id,title,event_time,duration_minutes&limit=50`,
    ),
  ];
}
