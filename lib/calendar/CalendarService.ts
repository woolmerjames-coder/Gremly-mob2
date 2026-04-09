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
import type { Habit } from '../types';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface CalendarItem {
  id: string;
  source: 'synced' | 'gremly_event' | 'user_calendar' | 'todo' | 'habit';
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  isAllDay: boolean;
  provider?: string; // 'google' | 'outlook' | 'ics' | 'gremly'
  originalId: string; // Reference back to source record
  location?: string;
  // Full-timestamp fields (additive — existing fields preserved)
  startAt?: string; // Full ISO timestamp (UTC)
  endAt?: string; // Full ISO timestamp (UTC)
  durationMinutes?: number; // Computed or stored
  color?: string; // For visual differentiation
  sourceData?: {
    type: 'note' | 'synced_event' | 'user_calendar_event' | 'todo' | 'habit';
    record: any;
  };
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

/**
 * Convert a local date string (YYYY-MM-DD) + time string (HH:mm) to a UTC ISO timestamp.
 * Uses Intl.DateTimeFormat to resolve the correct UTC offset for the user's timezone.
 */
function localToIso(dateStr: string, timeStr: string): string {
  const tz = getDateService().getTimezone();
  // Parse components explicitly to avoid browser Date parsing quirks
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);

  // Build a Date in the device's default timezone first
  // NOTE: This creates a Date in the device's local timezone. If the device timezone
  // differs from the DateService timezone, the offset calculation could be slightly off.
  // In practice these are always the same on mobile.
  const local = new Date(y, mo - 1, d, h, mi, 0, 0);

  // Use Intl to find the actual UTC offset at this local wall-clock time in `tz`.
  // We format the date parts in the target timezone and compare to get the offset.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(local)
    .reduce(
      (acc, p) => {
        acc[p.type] = p.value;
        return acc;
      },
      {} as Record<string, string>,
    );

  // Reconstruct what the formatter thinks local is in the target timezone
  const tzLocal = new Date(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`,
  );

  // The difference between the device Date and the tz-interpreted Date gives us the offset
  const offsetMs = local.getTime() - tzLocal.getTime();
  // Apply the offset: we want the UTC instant that corresponds to dateStr+timeStr in `tz`
  const utcMs = local.getTime() + offsetMs;
  return new Date(utcMs).toISOString();
}

/** Compute duration in minutes between two ISO timestamps */
function computeDuration(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

/** Time-window → soft start-time map for habits without scheduled_start_iso */
const TIME_WINDOW_START: Record<string, string> = {
  morning: '08:00',
  afternoon: '13:00',
  evening: '18:00',
};

/**
 * Check whether a habit should appear on the given date.
 * Inlined from calendarSelectors to avoid cross-module coupling.
 */
function habitOccursOnDate(habit: Habit, dateStr: string): boolean {
  if (habit.archived) return false;
  if (habit.start_date && habit.start_date > dateStr) return false;
  if (habit.end_date && habit.end_date < dateStr) return false;

  const ds = getDateService();
  const targetDate = ds.fromLocalDate(dateStr);
  if (!targetDate) return false;

  const dayOfWeek = targetDate.getDay(); // 0=Sun … 6=Sat

  // Explicit days_active takes priority
  if (habit.days_active && habit.days_active.length > 0) {
    return habit.days_active.includes(dayOfWeek);
  }

  const cadence = habit.cadence || 'daily';
  switch (cadence) {
    case 'daily':
      return true;
    case 'weekly': {
      if (habit.start_date) {
        const startDate = ds.fromLocalDate(habit.start_date);
        if (startDate) return startDate.getDay() === dayOfWeek;
      }
      return dayOfWeek === 1; // Monday
    }
    case 'monthly': {
      if (habit.start_date) {
        const startDate = ds.fromLocalDate(habit.start_date);
        if (startDate) return startDate.getDate() === targetDate.getDate();
      }
      return targetDate.getDate() === 1;
    }
    default:
      return true;
  }
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
  options?: { includeTodos?: boolean; includeHabits?: boolean },
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

    // Compute full timestamps for event notes
    const noteStartAt =
      note.event_time && note.target_date
        ? localToIso(note.target_date, note.event_time)
        : undefined;
    const noteEndAt =
      note.end_time && note.target_date ? localToIso(note.target_date, note.end_time) : undefined;
    const noteDuration =
      noteStartAt && noteEndAt ? computeDuration(noteStartAt, noteEndAt) : undefined;

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
      startAt: noteStartAt,
      endAt: noteEndAt,
      durationMinutes: noteDuration,
      sourceData: { type: 'note', record: note },
    });
  }

  // ── 2. Synced calendar events (skip if covered by a Note) ──
  const syncedEvents: SyncedCalendarEvent[] = state.calendarEvents[dateStr] || [];
  for (const event of syncedEvents) {
    if (coveredExternalIds.has(event.providerEventId)) continue;

    const syncedDuration = !event.isAllDay
      ? computeDuration(event.startAt, event.endAt)
      : undefined;

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
      startAt: event.isAllDay ? undefined : event.startAt,
      endAt: event.isAllDay ? undefined : event.endAt,
      durationMinutes: syncedDuration,
      sourceData: { type: 'synced_event', record: event },
    });
  }

  // ── 3. User calendar events ──
  for (const uce of state.userCalendarEvents) {
    if (uce.event_date !== dateStr) continue;

    const endTime =
      uce.event_time && uce.duration_minutes
        ? minutesToTime(timeToMinutes(uce.event_time) + uce.duration_minutes)
        : undefined;

    // Compute full timestamps
    const uceStartAt = uce.event_time ? localToIso(uce.event_date, uce.event_time) : undefined;
    const uceEndAt =
      uceStartAt && uce.duration_minutes
        ? new Date(new Date(uceStartAt).getTime() + uce.duration_minutes * 60000).toISOString()
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
      startAt: uceStartAt,
      endAt: uceEndAt,
      durationMinutes: uce.duration_minutes ?? undefined,
      sourceData: { type: 'user_calendar_event', record: uce },
    });
  }

  // ── 4. Todos with due_day (opt-in) ──
  if (options?.includeTodos) {
    for (const todo of state.todos) {
      if (todo.archived || todo.completed_at) continue;
      if (todo.due_day !== dateStr) continue;

      const todoDurationMin = todo.duration_minutes ?? todo.time_estimate_minutes ?? 30;

      // Determine start time: prefer scheduled_start_iso (from Morning Brief time-blocking),
      // fall back to due_time
      const todoStartTime = todo.scheduled_start_iso
        ? isoToLocalTime(todo.scheduled_start_iso)
        : todo.due_time || undefined;

      const todoStartAt = todo.scheduled_start_iso
        ? todo.scheduled_start_iso
        : todo.due_time && todo.due_day
          ? localToIso(todo.due_day, todo.due_time)
          : undefined;

      const todoEndAt = todoStartAt
        ? new Date(new Date(todoStartAt).getTime() + todoDurationMin * 60000).toISOString()
        : undefined;

      items.push({
        id: todo.id,
        source: 'todo',
        title: todo.name || todo.title || 'Untitled Todo',
        date: dateStr,
        startTime: todoStartTime,
        endTime: todoStartAt && todoEndAt ? isoToLocalTime(todoEndAt) : undefined,
        isAllDay: !todoStartTime,
        provider: 'gremly',
        originalId: todo.id,
        startAt: todoStartAt,
        endAt: todoEndAt,
        durationMinutes: todoDurationMin,
        sourceData: { type: 'todo', record: todo },
      });
    }
  }

  // ── 5. Habits (opt-in) ──
  if (options?.includeHabits) {
    for (const habit of state.habits) {
      if (!habitOccursOnDate(habit, dateStr)) continue;

      // Skip habits that have no calendar placement
      const tw = habit.time_window;
      if ((!tw || tw === 'any') && !habit.scheduled_start_iso) continue;

      const durationMin = habit.time_estimate_minutes ?? 30;
      let habitStartAt: string | undefined;
      let habitEndAt: string | undefined;
      let habitStartTime: string | undefined;
      let habitEndTime: string | undefined;

      if (habit.scheduled_start_iso) {
        // Precise slot — use the ISO directly
        habitStartAt = habit.scheduled_start_iso;
        habitEndAt = new Date(new Date(habitStartAt).getTime() + durationMin * 60000).toISOString();
        habitStartTime = isoToLocalTime(habitStartAt);
        habitEndTime = isoToLocalTime(habitEndAt);
      } else if (tw && tw !== 'any') {
        // Soft position from time_window
        habitStartTime = TIME_WINDOW_START[tw] ?? '08:00';
        habitStartAt = localToIso(dateStr, habitStartTime);
        habitEndAt = new Date(new Date(habitStartAt).getTime() + durationMin * 60000).toISOString();
        habitEndTime = minutesToTime(timeToMinutes(habitStartTime) + durationMin);
      }

      items.push({
        id: habit.id,
        source: 'habit',
        title: habit.name || 'Untitled Habit',
        date: dateStr,
        startTime: habitStartTime,
        endTime: habitEndTime,
        isAllDay: false,
        provider: 'gremly',
        originalId: habit.id,
        startAt: habitStartAt,
        endAt: habitEndAt,
        durationMinutes: durationMin,
        sourceData: { type: 'habit', record: habit },
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
  options?: { includeTodos?: boolean; includeHabits?: boolean },
): CalendarItem[] {
  return collectItemsForDate(date, options).sort(compareItems);
}

/**
 * Get all events for a date range (inclusive), merged and deduplicated.
 */
export function getEventsForRange(
  start: string,
  end: string,
  options?: { includeTodos?: boolean; includeHabits?: boolean },
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
export function getUpcomingEvents(
  days: number,
  options?: { includeTodos?: boolean; includeHabits?: boolean },
): CalendarItem[] {
  const ds = getDateService();
  const start = ds.today();
  const end = ds.addDays(start, days - 1);
  return getEventsForRange(start, end, options);
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

// ═══════════════════════════════════════════════════════════════════
// WRITE OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a new user calendar event and return its ID.
 */
export async function createCalendarEvent(params: {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  isAllDay?: boolean;
  location?: string;
  spaceId?: string;
  notes?: string;
}): Promise<string> {
  const store = useGremlyStore.getState();

  // Compute duration from start/end if not explicitly provided
  let duration = params.durationMinutes;
  if (!duration && params.startTime && params.endTime) {
    duration = timeToMinutes(params.endTime) - timeToMinutes(params.startTime);
  }

  const created = await store.createUserCalendarEvent({
    title: params.title,
    event_date: params.date,
    event_time: params.startTime ?? null,
    duration_minutes: duration ?? null,
    space_id: params.spaceId ?? null,
    notes: params.notes ?? null,
    source: 'user',
  });

  return created.id;
}

/**
 * Reschedule any calendar item to a new date/time.
 * Synced events are read-only and will throw.
 */
export async function rescheduleCalendarItem(params: {
  id: string;
  source: CalendarItem['source'];
  newDate: string;
  newStartTime?: string;
  newEndTime?: string;
}): Promise<void> {
  const store = useGremlyStore.getState();

  switch (params.source) {
    case 'todo':
      await store.updateTodo(params.id, {
        due_day: params.newDate,
        due_time: params.newStartTime ?? null,
      });
      break;

    case 'gremly_event':
      await store.updateNote(params.id, {
        target_date: params.newDate,
        event_time: params.newStartTime ?? null,
        end_time: params.newEndTime ?? null,
      });
      break;

    case 'user_calendar':
      await store.updateUserCalendarEvent(params.id, {
        event_date: params.newDate,
        event_time: params.newStartTime ?? null,
      });
      break;

    case 'habit':
      await store.updateHabit(params.id, {
        scheduled_start_iso: params.newStartTime
          ? localToIso(params.newDate, params.newStartTime)
          : null,
      });
      break;

    case 'synced':
      throw new Error('Synced calendar events are read-only and cannot be rescheduled in Gremly');
  }
}

/**
 * Remove / archive a calendar item.
 * Habits and synced events are no-ops (managed elsewhere).
 */
export async function removeCalendarItem(params: {
  id: string;
  source: CalendarItem['source'];
}): Promise<void> {
  const store = useGremlyStore.getState();

  switch (params.source) {
    case 'todo':
      await store.archiveTodo(params.id);
      break;

    case 'gremly_event':
      await store.archiveNote(params.id);
      break;

    case 'user_calendar':
      await store.deleteUserCalendarEvent(params.id);
      break;

    case 'habit':
    case 'synced':
      // No-op: habits are managed in habits settings, synced events are read-only
      break;
  }
}
