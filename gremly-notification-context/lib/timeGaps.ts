/**
 * Time Gap Calculator
 *
 * Computes free time gaps between calendar events within a time block.
 * Used by Morning Brief, Calendar, and Today's Focus to show available time
 * and allow users to slot tasks into gaps.
 */

import type { CalendarEvent } from './calendar/CalendarClient';
import type { Todo, Habit } from './types';

// ═════════════════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════════════════

export interface TimeGap {
  /** ISO string for gap start */
  startIso: string;
  /** ISO string for gap end */
  endIso: string;
  /** Gap duration in minutes */
  durationMinutes: number;
  /** Display label, e.g. "45 min free" or "1 hr 30 min free" */
  label: string;
}

export interface SlottedTask {
  id: string;
  type: 'todo' | 'habit';
  title: string;
  estimateMinutes: number;
  scheduledStartIso: string;
  /** Computed end time based on start + estimate */
  scheduledEndIso: string;
}

export interface TimelineEntry {
  kind: 'event' | 'gap' | 'slotted_task';
  startIso: string;
  endIso: string;
  durationMinutes: number;
  /** For events */
  event?: CalendarEvent;
  /** For gaps */
  gap?: TimeGap;
  /** For slotted tasks */
  slottedTask?: SlottedTask;
}

// ═════════════════════════════════════════════════════════════════════════════
// GAP CALCULATION
// ═════════════════════════════════════════════════════════════════════════════

const MIN_GAP_MINUTES = 10;

/**
 * Format a duration in minutes to a human-readable label.
 */
function formatGapDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min free`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs} hr free`;
  return `${hrs} hr ${mins} min free`;
}

/**
 * Compute time gaps between calendar events within a given time window.
 *
 * @param events - Calendar events (will be sorted by start time)
 * @param blockStartIso - ISO string for when the time window starts
 * @param blockEndIso - ISO string for when the time window ends
 * @returns Array of TimeGap objects for gaps ≥ MIN_GAP_MINUTES
 */
export function computeTimeGaps(
  events: CalendarEvent[],
  blockStartIso: string,
  blockEndIso: string,
): TimeGap[] {
  const blockStart = new Date(blockStartIso).getTime();
  const blockEnd = new Date(blockEndIso).getTime();

  if (blockEnd <= blockStart) return [];

  // Filter to non-all-day events that overlap with the block, sort by start
  const relevant = events
    .filter((e) => {
      if (e.isAllDay) return false;
      const eStart = new Date(e.startAt).getTime();
      const eEnd = new Date(e.endAt).getTime();
      return eStart < blockEnd && eEnd > blockStart;
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const gaps: TimeGap[] = [];
  let cursor = blockStart;

  for (const event of relevant) {
    const eStart = new Date(event.startAt).getTime();
    const eEnd = new Date(event.endAt).getTime();

    // Clamp event to block boundaries
    const effectiveStart = Math.max(eStart, blockStart);
    const effectiveEnd = Math.min(eEnd, blockEnd);

    // Gap between cursor and this event's start
    if (effectiveStart > cursor) {
      const gapMinutes = Math.round((effectiveStart - cursor) / (1000 * 60));
      if (gapMinutes >= MIN_GAP_MINUTES) {
        gaps.push({
          startIso: new Date(cursor).toISOString(),
          endIso: new Date(effectiveStart).toISOString(),
          durationMinutes: gapMinutes,
          label: formatGapDuration(gapMinutes),
        });
      }
    }

    // Move cursor past this event
    cursor = Math.max(cursor, effectiveEnd);
  }

  // Gap after last event to block end
  if (cursor < blockEnd) {
    const gapMinutes = Math.round((blockEnd - cursor) / (1000 * 60));
    if (gapMinutes >= MIN_GAP_MINUTES) {
      gaps.push({
        startIso: new Date(cursor).toISOString(),
        endIso: new Date(blockEnd).toISOString(),
        durationMinutes: gapMinutes,
        label: formatGapDuration(gapMinutes),
      });
    }
  }

  return gaps;
}

// ═════════════════════════════════════════════════════════════════════════════
// TIMELINE BUILDER (events + gaps + slotted tasks merged)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Build a unified timeline of events, slotted tasks, and remaining gaps.
 *
 * @param events - Calendar events for the block
 * @param slottedItems - Todos/habits with scheduled_start_iso in this block
 * @param blockStartIso - Block start time
 * @param blockEndIso - Block end time
 * @returns Sorted array of TimelineEntry objects
 */
export function buildTimeline(
  events: CalendarEvent[],
  slottedItems: Array<(Todo | Habit) & { scheduled_start_iso: string }>,
  blockStartIso: string,
  blockEndIso: string,
): TimelineEntry[] {
  const blockStart = new Date(blockStartIso).getTime();
  const blockEnd = new Date(blockEndIso).getTime();

  if (blockEnd <= blockStart) return [];

  // Build a list of all "occupied" intervals
  interface Interval {
    start: number;
    end: number;
    entry: TimelineEntry;
  }

  const intervals: Interval[] = [];

  // Add events
  for (const event of events) {
    if (event.isAllDay) continue;
    const eStart = new Date(event.startAt).getTime();
    const eEnd = new Date(event.endAt).getTime();
    if (eStart >= blockEnd || eEnd <= blockStart) continue;

    intervals.push({
      start: Math.max(eStart, blockStart),
      end: Math.min(eEnd, blockEnd),
      entry: {
        kind: 'event',
        startIso: event.startAt,
        endIso: event.endAt,
        durationMinutes: Math.round((eEnd - eStart) / (1000 * 60)),
        event,
      },
    });
  }

  // Add slotted tasks
  for (const item of slottedItems) {
    const sStart = new Date(item.scheduled_start_iso).getTime();
    const estimate = item.time_estimate_minutes ?? 15;
    const sEnd = sStart + estimate * 60 * 1000;

    if (sStart >= blockEnd || sEnd <= blockStart) continue;

    intervals.push({
      start: Math.max(sStart, blockStart),
      end: Math.min(sEnd, blockEnd),
      entry: {
        kind: 'slotted_task',
        startIso: item.scheduled_start_iso,
        endIso: new Date(sEnd).toISOString(),
        durationMinutes: estimate,
        slottedTask: {
          id: item.id,
          type: item.type,
          title: item.name,
          estimateMinutes: estimate,
          scheduledStartIso: item.scheduled_start_iso,
          scheduledEndIso: new Date(sEnd).toISOString(),
        },
      },
    });
  }

  // Sort all intervals by start time
  intervals.sort((a, b) => a.start - b.start);

  // Build timeline: interleave with gaps
  const timeline: TimelineEntry[] = [];
  let cursor = blockStart;

  for (const interval of intervals) {
    // Gap before this interval
    if (interval.start > cursor) {
      const gapMinutes = Math.round((interval.start - cursor) / (1000 * 60));
      if (gapMinutes >= MIN_GAP_MINUTES) {
        timeline.push({
          kind: 'gap',
          startIso: new Date(cursor).toISOString(),
          endIso: new Date(interval.start).toISOString(),
          durationMinutes: gapMinutes,
          gap: {
            startIso: new Date(cursor).toISOString(),
            endIso: new Date(interval.start).toISOString(),
            durationMinutes: gapMinutes,
            label: formatGapDuration(gapMinutes),
          },
        });
      }
    }

    timeline.push(interval.entry);
    cursor = Math.max(cursor, interval.end);
  }

  // Trailing gap
  if (cursor < blockEnd) {
    const gapMinutes = Math.round((blockEnd - cursor) / (1000 * 60));
    if (gapMinutes >= MIN_GAP_MINUTES) {
      timeline.push({
        kind: 'gap',
        startIso: new Date(cursor).toISOString(),
        endIso: new Date(blockEnd).toISOString(),
        durationMinutes: gapMinutes,
        gap: {
          startIso: new Date(cursor).toISOString(),
          endIso: new Date(blockEnd).toISOString(),
          durationMinutes: gapMinutes,
          label: formatGapDuration(gapMinutes),
        },
      });
    }
  }

  return timeline;
}

/**
 * Get ISO strings for block boundaries on a given date.
 * Uses the capacity block hours to determine start/end.
 */
export function getBlockBoundaryIso(
  date: string, // YYYY-MM-DD
  blockStartHour: number,
  blockEndHour: number,
): { startIso: string; endIso: string } {
  // Create dates at noon to avoid DST issues, then set hours
  const start = new Date(`${date}T12:00:00`);
  start.setHours(blockStartHour, 0, 0, 0);

  const end = new Date(`${date}T12:00:00`);
  end.setHours(blockEndHour, 0, 0, 0);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}
