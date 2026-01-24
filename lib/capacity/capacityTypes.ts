/**
 * Capacity Types for Calendar-Aware Planning
 *
 * Used by Morning Brief and Mini Sweep to show available time
 * based on calendar events.
 */

/** Time block identifiers - matches time_window field on todos/habits */
export type TimeBlock = 'morning' | 'day' | 'evening';

/** Configuration for a time block's boundaries */
export interface TimeBlockBoundary {
  block: TimeBlock;
  startHour: number; // 24-hour format (6 = 6am)
  endHour: number; // 24-hour format (12 = noon)
  icon: string; // Display emoji
  label: string; // Display name
}

/** Calculated availability for a single time block */
export interface TimeBlockCapacity {
  block: TimeBlock;
  label: string;
  icon: string;
  startHour: number;
  endHour: number;
  /** Adjusted start accounting for current time: max(startHour, currentHour) */
  effectiveStartHour: number;
  /** Total minutes in block from effective start to end */
  totalMinutes: number;
  /** Minutes consumed by calendar events */
  calendarMinutes: number;
  /** Minutes available for tasks: totalMinutes - calendarMinutes */
  availableMinutes: number;
  /** True if current time is past this block's end */
  isPast: boolean;
  /** Number of calendar events overlapping this block */
  eventCount: number;
}

/** Full day capacity breakdown */
export interface DayCapacity {
  blocks: {
    morning: TimeBlockCapacity;
    day: TimeBlockCapacity;
    evening: TimeBlockCapacity;
  };
  /** Sum of available minutes across non-past blocks */
  totalAvailableMinutes: number;
  /** Sum of calendar event minutes today */
  totalCalendarMinutes: number;
  /** Total calendar events today */
  totalEventCount: number;
}

/** Gremly's assessment of capacity vs task load */
export interface CapacitySummary {
  message: string;
  tone: 'positive' | 'cautious' | 'warning';
}
