/**
 * CalendarService — Single source of truth for event-aware queries.
 *
 * Merges four event sources into a unified CalendarItem model:
 * 1. Synced calendar events (calendarEvents in store, keyed by YYYY-MM-DD)
 * 2. Notes with subtype='event'
 * 3. User calendar events (calendar_events table)
 * 4. Todos with due_day (opt-in via includeTodos flag)
 *
 * Uses DateService for all date math and timezone handling.
 * Reads from Zustand store imperatively — no React hooks.
 */

import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date/DateService';
import type { CalendarEvent as SyncedCalendarEvent } from './CalendarClient';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface CalendarItem {
  id: string;
  source: 'synced' | 'gremly_event' | 'user_calendar' | 'todo';
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  isAllDay: boolean;
  provider?: string; // 'google' | 'outlook' | 'ics' | 'gremly'
  originalId: string; // Reference back to source record
  location?: string;
}

export interface TimeSlot {
  start: string; // HH:mm
  end: string; // HH:mm
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

const providerMap: Record<string, string> = {
  google_calendar: 'google',
  outlook: 'outlook',
  ics: 'ics',
};

/** Convert HH:mm to minutes since midnight */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Convert minutes since midnight to HH:mm */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Extract HH:mm from an ISO timestamp in user's timezone */
function isoToLocalTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: getDateService().getTimezone(),
  }).format(d);
}

/** Sort comparator for CalendarItems: all-day first, then startTime asc, then title */
function compareItems(a: CalendarItem, b: CalendarItem): number {
  // All-day events first
  if (a.isAllDay && !b.isAllDay) return -1;
  if (!a.isAllDay && b.isAllDay) return 1;

  // By startTime ascending
  if (a.startTime && b.startTime) {
    const diff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    if (diff !== 0) return diff;
  }
  if (a.startTime && !b.startTime) return -1;
  if (!a.startTime && b.startTime) return 1;

  // By title
  return (a.title || '').localeCompare(b.title || '');
}

// ═══════════════════════════════════════════════════════════════════
// CORE: Collect all items for a single date
// ═══════════════════════════════════════════════════════════════════

function collectItemsForDate(
  dateStr: string,
  options?: { includeTodos?: boolean },
): CalendarItem[] {
  const state = useGremlyStore.getState();
  const items: CalendarItem[] = [];
  const coveredExternalIds = new Set<string>();

  // ── 1. Notes with subtype='event' (highest priority for dedup) ──
  for (const note of state.notes) {
    if (note.archived) continue;
    if ((note.subtype as string) !== 'event') continue;

    // Support multi-day events
    const matchesDate =
      note.target_date === dateStr ||
      (note.target_date != null &&
        note.end_date != null &&
        dateStr >= note.target_date &&
        dateStr <= note.end_date);
    if (!matchesDate) continue;

    if (note.external_source?.externalId) {
      coveredExternalIds.add(note.external_source.externalId);
    }

    items.push({
      id: note.id,
      source: 'gremly_event',
      title: note.title || 'Untitled Event',
      date: dateStr,
      startTime: note.event_time || undefined,
      endTime: note.end_time || undefined,
      isAllDay: !note.event_time,
      provider: note.external_source?.provider
        ? providerMap[note.external_source.provider] || 'gremly'
        : 'gremly',
      originalId: note.id,
      location: note.location || undefined,
    });
  }

  // ── 2. Synced calendar events (skip if covered by a Note) ──
  const syncedEvents: SyncedCalendarEvent[] = state.calendarEvents[dateStr] || [];
  for (const event of syncedEvents) {
    if (coveredExternalIds.has(event.providerEventId)) continue;

    items.push({
      id: `cal-${event.provider}-${event.providerEventId}`,
      source: 'synced',
      title: event.title,
      date: dateStr,
      startTime: event.isAllDay ? undefined : isoToLocalTime(event.startAt),
      endTime: event.isAllDay ? undefined : isoToLocalTime(event.endAt),
      isAllDay: event.isAllDay,
      provider: event.provider,
      originalId: event.providerEventId,
      location: event.location || undefined,
    });
  }

  // ── 3. User calendar events ──
  for (const uce of state.userCalendarEvents) {
    if (uce.event_date !== dateStr) continue;

    const endTime =
      uce.event_time && uce.duration_minutes
        ? minutesToTime(timeToMinutes(uce.event_time) + uce.duration_minutes)
        : undefined;

    items.push({
      id: uce.id,
      source: 'user_calendar',
      title: uce.title,
      date: dateStr,
      startTime: uce.event_time || undefined,
      endTime,
      isAllDay: !uce.event_time,
      provider: 'gremly',
      originalId: uce.id,
    });
  }

  // ── 4. Todos with due_day (opt-in) ──
  if (options?.includeTodos) {
    for (const todo of state.todos) {
      if (todo.archived || todo.completed_at) continue;
      if (todo.due_day !== dateStr) continue;

      items.push({
        id: todo.id,
        source: 'todo',
        title: todo.name || todo.title || 'Untitled Todo',
        date: dateStr,
        startTime: todo.due_time || undefined,
        isAllDay: !todo.due_time,
        provider: 'gremly',
        originalId: todo.id,
      });
    }
  }

  return items;
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════

/**
 * Get all events for a single date, merged and deduplicated.
 * Sorted: all-day first, then by startTime ascending, then by title.
 */
export function getEventsForDate(
  date: string,
  options?: { includeTodos?: boolean },
): CalendarItem[] {
  return collectItemsForDate(date, options).sort(compareItems);
}

/**
 * Get all events for a date range (inclusive), merged and deduplicated.
 */
export function getEventsForRange(
  start: string,
  end: string,
  options?: { includeTodos?: boolean },
): CalendarItem[] {
  const ds = getDateService();
  const items: CalendarItem[] = [];
  let cursor = start;

  while (cursor <= end) {
    items.push(...collectItemsForDate(cursor, options));
    cursor = ds.addDays(cursor, 1);
  }

  return items.sort(compareItems);
}

/**
 * Get all events for the next N days (starting today).
 */
export function getUpcomingEvents(days: number): CalendarItem[] {
  const ds = getDateService();
  const start = ds.today();
  const end = ds.addDays(start, days - 1);
  return getEventsForRange(start, end);
}

/**
 * Check if any timed event on the given date overlaps the specified time range.
 */
export function hasConflict(date: string, startTime: string, endTime: string): boolean {
  const items = collectItemsForDate(date);
  const reqStart = timeToMinutes(startTime);
  const reqEnd = timeToMinutes(endTime);

  for (const item of items) {
    if (item.isAllDay || !item.startTime || !item.endTime) continue;
    const evStart = timeToMinutes(item.startTime);
    const evEnd = timeToMinutes(item.endTime);
    // Overlap: starts before the other ends AND ends after the other starts
    if (reqStart < evEnd && reqEnd > evStart) return true;
  }

  return false;
}

/**
 * Find free time slots on a given date that are at least minMinutes long.
 * Assumes a working day of 8:00-22:00 unless events exist outside that range.
 */
export function findGaps(date: string, minMinutes: number): TimeSlot[] {
  const items = collectItemsForDate(date);

  // Collect timed event intervals
  const intervals: { start: number; end: number }[] = [];
  let dayStart = timeToMinutes('08:00');
  let dayEnd = timeToMinutes('22:00');

  for (const item of items) {
    if (item.isAllDay || !item.startTime || !item.endTime) continue;
    const s = timeToMinutes(item.startTime);
    const e = timeToMinutes(item.endTime);
    intervals.push({ start: s, end: e });
    // Extend working day if events fall outside default range
    if (s < dayStart) dayStart = s;
    if (e > dayEnd) dayEnd = e;
  }

  // Sort intervals by start time
  intervals.sort((a, b) => a.start - b.start);

  // Merge overlapping intervals
  const merged: { start: number; end: number }[] = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ start: iv.start, end: iv.end });
    }
  }

  // Find gaps between merged intervals within the working day
  const gaps: TimeSlot[] = [];
  let cursor = dayStart;

  for (const iv of merged) {
    if (iv.start > cursor) {
      const gapLength = iv.start - cursor;
      if (gapLength >= minMinutes) {
        gaps.push({ start: minutesToTime(cursor), end: minutesToTime(iv.start) });
      }
    }
    cursor = Math.max(cursor, iv.end);
  }

  // Trailing gap after last event
  if (dayEnd > cursor) {
    const gapLength = dayEnd - cursor;
    if (gapLength >= minMinutes) {
      gaps.push({ start: minutesToTime(cursor), end: minutesToTime(dayEnd) });
    }
  }

  return gaps;
}
