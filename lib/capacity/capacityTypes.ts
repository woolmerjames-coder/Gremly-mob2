/**
 * Capacity Types for Calendar-Aware Planning
 *
 * Used by Morning Brief and Mini Sweep to show available time
 * based on calendar events.
 */

/** Time block identifiers - matches time_window field on todos/habits */
export type TimeBlock = 'morning' | 'day' | 'evening';

/**
 * User-customizable time block boundaries
 * Hours are in 24h format (0-23)
 */
export interface TimeBlockPreferences {
  morning: { startHour: number; endHour: number };
  day: { startHour: number; endHour: number };
  evening: { startHour: number; endHour: number };
}

/**
 * Default time block boundaries
 * Used when user hasn't customized
 */
export const DEFAULT_TIME_BLOCK_PREFERENCES: TimeBlockPreferences = {
  morning: { startHour: 6, endHour: 12 },
  day: { startHour: 12, endHour: 17 },
  evening: { startHour: 17, endHour: 22 },
};

/** Configuration for a time block's boundaries */
export interface TimeBlockBoundary {
  block: TimeBlock;
  startHour: number; // 24-hour format (6 = 6am)
  endHour: number; // 24-hour format (12 = noon)
  label: string; // Display name
}

/** Calculated availability for a single time block */
export interface TimeBlockCapacity {
  block: TimeBlock;
  label: string;
  startHour: number;
  endHour: number;
  /** Adjusted start accounting for current time: max(startHour, currentHour) */
  effectiveStartHour: number;
  /** Total minutes in block from effective start to end */
  totalMinutes: number;
  /** Minutes consumed by calendar events */
  calendarMinutes: number;
  /** Minutes consumed by assigned tasks */
  taskMinutes: number;
  /** Minutes available: totalMinutes - calendarMinutes - taskMinutes */
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
  /** Sum of assigned task minutes today */
  totalTaskMinutes: number;
  /** Total calendar events today */
  totalEventCount: number;
}

/** Gremly's assessment of capacity vs task load */
export interface CapacitySummary {
  message: string;
  tone: 'positive' | 'cautious' | 'warning';
}
