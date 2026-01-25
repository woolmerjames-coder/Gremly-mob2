/**
 * Capacity Calculation Helpers
 *
 * Pure functions for calculating available time based on calendar events.
 * No React/Zustand dependencies — can be unit tested independently.
 */

import type { CalendarEvent } from '../calendar/CalendarClient';
import type {
  TimeBlock,
  TimeBlockBoundary,
  TimeBlockCapacity,
  DayCapacity,
  CapacitySummary,
  TimeBlockPreferences,
} from './capacityTypes';
import { DEFAULT_TIME_BLOCK_PREFERENCES } from './capacityTypes';

/**
 * Get time block boundaries from user preferences
 * Falls back to defaults if not provided
 */
export function getTimeBlockBoundaries(
  preferences: TimeBlockPreferences = DEFAULT_TIME_BLOCK_PREFERENCES,
): Record<TimeBlock, TimeBlockBoundary> {
  return {
    morning: {
      block: 'morning',
      startHour: preferences.morning.startHour,
      endHour: preferences.morning.endHour,
      label: 'Morning',
    },
    day: {
      block: 'day',
      startHour: preferences.day.startHour,
      endHour: preferences.day.endHour,
      label: 'Afternoon',
    },
    evening: {
      block: 'evening',
      startHour: preferences.evening.startHour,
      endHour: preferences.evening.endHour,
      label: 'Evening',
    },
  };
}

/**
 * Time block boundaries - DEFAULT VALUES
 * Use getTimeBlockBoundaries(preferences) for user-customized values
 */
export const TIME_BLOCK_BOUNDARIES = getTimeBlockBoundaries();

/** Get boundary config for a time block */
export function getTimeBlockBoundary(block: TimeBlock): TimeBlockBoundary {
  return TIME_BLOCK_BOUNDARIES[block];
}

/**
 * Get unique event ID for override lookup
 */
export function getEventId(event: CalendarEvent): string {
  return `${event.provider}-${event.providerEventId}`;
}

/** Time override type: stores start and end times */
export type EventTimeOverride = { startAt: string; endAt: string };

/**
 * Get effective event times, using override if set
 * Returns { startAt, endAt, hasOverride }
 */
export function getEffectiveEventTimes(
  event: CalendarEvent,
  overrides: Record<string, EventTimeOverride> = {},
): { startAt: Date; endAt: Date; hasOverride: boolean } {
  const eventId = getEventId(event);
  const override = overrides[eventId];
  if (override) {
    return {
      startAt: new Date(override.startAt),
      endAt: new Date(override.endAt),
      hasOverride: true,
    };
  }
  return {
    startAt: new Date(event.startAt),
    endAt: new Date(event.endAt),
    hasOverride: false,
  };
}

/**
 * Get effective duration in minutes for an event, considering overrides
 */
export function getEffectiveEventDuration(
  event: CalendarEvent,
  overrides: Record<string, EventTimeOverride> = {},
): number {
  const { startAt, endAt } = getEffectiveEventTimes(event, overrides);
  return Math.round((endAt.getTime() - startAt.getTime()) / (1000 * 60));
}

/**
 * Calculate minutes an event occupies within a specific time block.
 *
 * Handles:
 * - All-day events (return 0 — don't block specific time)
 * - Events partially overlapping the block
 * - Events on different dates (return 0)
 * - Time overrides (uses override start/end if set)
 */
export function getEventMinutesInBlock(
  event: CalendarEvent,
  blockStartHour: number,
  blockEndHour: number,
  currentDate: string, // YYYY-MM-DD
  timeOverrides: Record<string, EventTimeOverride> = {},
): number {
  // All-day events don't block specific time slots
  if (event.isAllDay) {
    return 0;
  }

  const { startAt: eventStart, endAt: eventEnd } = getEffectiveEventTimes(event, timeOverrides);

  // Build block boundaries as Date objects for currentDate
  const [year, month, day] = currentDate.split('-').map(Number);
  const blockStart = new Date(year, month - 1, day, blockStartHour, 0, 0);
  const blockEnd = new Date(year, month - 1, day, blockEndHour, 0, 0);

  // Find overlap between event and block
  const overlapStart = Math.max(eventStart.getTime(), blockStart.getTime());
  const overlapEnd = Math.min(eventEnd.getTime(), blockEnd.getTime());

  // No overlap
  if (overlapStart >= overlapEnd) {
    return 0;
  }

  // Convert milliseconds to minutes
  return Math.round((overlapEnd - overlapStart) / (1000 * 60));
}

/**
 * Calculate availability for a single time block
 */
export function calculateBlockCapacity(
  block: TimeBlock,
  events: CalendarEvent[],
  currentHour: number,
  currentDate: string,
  timeOverrides: Record<string, EventTimeOverride> = {},
  taskMinutesInBlock: number = 0,
  timeBlockPreferences: TimeBlockPreferences = DEFAULT_TIME_BLOCK_PREFERENCES,
): TimeBlockCapacity {
  const boundaries = getTimeBlockBoundaries(timeBlockPreferences);
  const boundary = boundaries[block];
  const { startHour, endHour, label } = boundary;

  // Is this block already past?
  const isPast = currentHour >= endHour;

  // Effective start: if we're partway through the block, start from current hour
  const effectiveStartHour = isPast
    ? endHour // Block is past, no time left
    : Math.max(startHour, currentHour);

  // Total minutes available in this block (full block, not adjusted for current time)
  const totalMinutes = isPast ? 0 : (endHour - startHour) * 60;

  // Calculate calendar minutes consumed
  let calendarMinutes = 0;
  let eventCount = 0;

  for (const event of events) {
    const minutes = getEventMinutesInBlock(event, startHour, endHour, currentDate, timeOverrides);
    if (minutes > 0) {
      calendarMinutes += minutes;
      eventCount += 1;
    }
  }

  // Available = total - calendar - tasks (floor at 0)
  const availableMinutes = Math.max(0, totalMinutes - calendarMinutes - taskMinutesInBlock);

  // Debug logging
  console.log('[Capacity Debug]', {
    block,
    startHour,
    endHour,
    effectiveStartHour,
    totalMinutes,
    calendarMinutes,
    taskMinutes: taskMinutesInBlock,
    availableMinutes,
    eventCount,
    currentHour,
    isPast,
  });

  return {
    block,
    label,
    startHour,
    endHour,
    effectiveStartHour,
    totalMinutes,
    calendarMinutes,
    taskMinutes: taskMinutesInBlock,
    availableMinutes,
    isPast,
    eventCount,
  };
}

/**
 * Calculate full day capacity across all blocks
 */
export function calculateDayCapacity(
  events: CalendarEvent[],
  currentHour: number,
  currentDate: string,
  timeOverrides: Record<string, EventTimeOverride> = {},
  taskMinutesByBlock: { morning: number; day: number; evening: number } = {
    morning: 0,
    day: 0,
    evening: 0,
  },
  timeBlockPreferences: TimeBlockPreferences = DEFAULT_TIME_BLOCK_PREFERENCES,
): DayCapacity {
  const morning = calculateBlockCapacity(
    'morning',
    events,
    currentHour,
    currentDate,
    timeOverrides,
    taskMinutesByBlock.morning,
    timeBlockPreferences,
  );
  const day = calculateBlockCapacity(
    'day',
    events,
    currentHour,
    currentDate,
    timeOverrides,
    taskMinutesByBlock.day,
    timeBlockPreferences,
  );
  const evening = calculateBlockCapacity(
    'evening',
    events,
    currentHour,
    currentDate,
    timeOverrides,
    taskMinutesByBlock.evening,
    timeBlockPreferences,
  );

  return {
    blocks: { morning, day, evening },
    totalAvailableMinutes:
      morning.availableMinutes + day.availableMinutes + evening.availableMinutes,
    totalCalendarMinutes: morning.calendarMinutes + day.calendarMinutes + evening.calendarMinutes,
    totalTaskMinutes: morning.taskMinutes + day.taskMinutes + evening.taskMinutes,
    totalEventCount: morning.eventCount + day.eventCount + evening.eventCount,
  };
}

/**
 * Get Gremly's capacity summary based on task load vs available time
 */
export function getCapacitySummary(taskMinutes: number, availableMinutes: number): CapacitySummary {
  if (availableMinutes === 0) {
    return {
      message: 'Fully booked today. Focus on your calendar commitments.',
      tone: 'warning',
    };
  }

  const ratio = taskMinutes / availableMinutes;

  if (ratio <= 0.5) {
    return {
      message: 'Plenty of room! You could add more if you want.',
      tone: 'positive',
    };
  }

  if (ratio <= 0.8) {
    return {
      message: 'Looks doable!',
      tone: 'positive',
    };
  }

  if (ratio <= 1.0) {
    return {
      message: "Snug fit — but you've got this.",
      tone: 'cautious',
    };
  }

  if (ratio <= 1.3) {
    return {
      message: "That's ambitious. Do what you can!",
      tone: 'cautious',
    };
  }

  return {
    message: "That's a lot for today. Be kind to yourself.",
    tone: 'warning',
  };
}

/**
 * Get Mini Sweep Gremly message based on calendar load
 */
export function getMiniSweepGremlyMessage(
  calendarBlockedHours: number,
  eventCount: number,
): string {
  if (eventCount === 0) {
    return 'Clear day ahead. Good time to make progress on these.';
  }
  if (calendarBlockedHours <= 2) {
    return 'Light day — room to tackle a few of these.';
  }
  if (calendarBlockedHours <= 4) {
    return 'A few meetings today. Pick what matters most.';
  }
  if (calendarBlockedHours <= 6) {
    return 'Busy day ahead — might be worth deferring a few.';
  }
  return "Back-to-back day. I'd keep today's list light.";
}

/**
 * Format minutes to human-readable duration
 * Examples: 30 → "30m", 60 → "1h", 90 → "1h 30m"
 */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Format block remaining time for display
 * Examples: 90 → "1h 30m remaining", isPast → "Passed"
 */
export function formatBlockRemaining(minutes: number, isPast: boolean): string {
  if (isPast) return 'Passed';
  if (minutes <= 0) return 'No time left';
  return `${formatDuration(minutes)} remaining`;
}
