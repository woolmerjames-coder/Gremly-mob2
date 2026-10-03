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

/** The selects meetingsFrom reads, for one person's day. */
export function calendarSelects(d, userId, tz, today) {
  const dayStart = localStartIso(tz, today);
  const dayEnd = localStartIso(tz, addDays(today, 1));
  return [
    d.select(
      `synced_calendar_events?owner_id=eq.${userId}&archived=eq.false&start_at=gte.${encodeURIComponent(dayStart)}&start_at=lt.${encodeURIComponent(dayEnd)}&select=id,title,start_at,end_at,is_all_day&order=start_at.asc&limit=100`,
    ),
    d.select(
      `notes?owner_id=eq.${userId}&subtype=eq.event&archived=eq.false&external_source=is.null&target_date=eq.${today}&select=id,title,event_time,end_date&limit=50`,
    ),
    d.select(
      `calendar_events?owner_id=eq.${userId}&event_date=eq.${today}&select=id,title,event_time,duration_minutes&limit=50`,
    ),
  ];
}
