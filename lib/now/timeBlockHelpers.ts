/**
 * Time Block Helpers
 *
 * Utility functions to group items and events by time block.
 * Used by the Now screen to organize Today's Focus by time of day.
 */

import type { CalendarEvent } from '../calendar/CalendarClient';
import { getDateService } from '../date/DateService';

export type TimeBlock = 'allday' | 'morning' | 'afternoon' | 'evening' | 'anytime';

// Time boundaries (using 24hr format)
// Morning: 5:00 - 11:59
// Afternoon: 12:00 - 16:59
// Evening: 17:00 - 20:59
// Outside these ranges: closest block

/**
 * Get time block for a given hour (0-23)
 */
export function getTimeBlockForHour(hour: number): TimeBlock {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  // Late night/early morning - default to evening or morning
  if (hour >= 21 || hour < 5) return 'evening';
  return 'anytime';
}

/**
 * Get current time block based on current time
 */
export function getCurrentTimeBlock(): TimeBlock {
  const now = getDateService().now();
  return getTimeBlockForHour(now.getHours());
}

/**
 * Get time block for a calendar event based on its start time
 */
export function getTimeBlockForEvent(event: CalendarEvent): TimeBlock {
  if (event.isAllDay) return 'morning'; // All-day events show in morning
  const startDate = new Date(event.startAt);
  return getTimeBlockForHour(startDate.getHours());
}

/**
 * Group calendar events by time block
 * Returns Record<TimeBlock, CalendarEvent[]>
 */
export function groupEventsByTimeBlock(
  events: CalendarEvent[],
): Record<TimeBlock, CalendarEvent[]> {
  const grouped: Record<TimeBlock, CalendarEvent[]> = {
    allday: [],
    morning: [],
    afternoon: [],
    evening: [],
    anytime: [],
  };

  for (const event of events) {
    const block = getTimeBlockForEvent(event);
    grouped[block].push(event);
  }

  return grouped;
}

/**
 * Format event time for display in hint (e.g., "9:30 AM")
 * For all-day events, returns "All day"
 */
export function formatEventTimeForHint(event: CalendarEvent): string {
  if (event.isAllDay) return 'All day';
  const date = new Date(event.startAt);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get sorted time blocks in display order
 */
export function getTimeBlockOrder(): TimeBlock[] {
  return ['morning', 'afternoon', 'evening', 'anytime'];
}

/**
 * Check if a time block is before the current time block
 */
export function isTimeBlockPast(block: TimeBlock): boolean {
  const current = getCurrentTimeBlock();
  const order = getTimeBlockOrder();
  const blockIndex = order.indexOf(block);
  const currentIndex = order.indexOf(current);
  return blockIndex < currentIndex;
}

/**
 * An item's time window from what it holds: its own time window, else the
 * hour of its due time, else 'any'. The words in its name are never read for
 * it: a name that says "dinner" or "morning" is the person's own words, not a
 * time they set.
 */
export function inferTimeWindow(item: {
  name: string;
  timeWindow?: string | null;
  dueTime?: string | null;
}): string {
  // 1. If explicit time_window is set and not 'any', use it
  if (item.timeWindow && item.timeWindow !== 'any') {
    return item.timeWindow;
  }

  // 2. If due_time is set, derive from hour
  if (item.dueTime) {
    const hour = parseInt(item.dueTime.split(':')[0], 10);
    if (!isNaN(hour)) {
      if (hour >= 5 && hour < 12) return 'morning';
      if (hour >= 12 && hour < 17) return 'afternoon';
      if (hour >= 17 && hour < 21) return 'evening';
    }
  }

  // 3. Nothing it holds says when: any time of day
  return 'any';
}

/**
 * Map inferred time window to a TimeBlock
 * Handles various time window strings to TimeBlock mapping
 */
export function timeWindowToBlock(timeWindow: string): TimeBlock {
  switch (timeWindow) {
    case 'morning':
      return 'morning';
    case 'midday':
    case 'afternoon':
      return 'afternoon';
    case 'evening':
    case 'night':
      return 'evening';
    case 'any':
    case 'anytime':
    default:
      return 'anytime';
  }
}
