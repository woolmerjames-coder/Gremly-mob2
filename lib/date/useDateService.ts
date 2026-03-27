import { useEffect } from 'react';
import { DateService, dateService, LocalDateString, UtcTimestamp } from './DateService';
import { useGremlyStore } from '../store/useGremlyStore';

// Re-export branded types for consumers
export type { LocalDateString, UtcTimestamp };

/**
 * React hook for accessing DateService with Zustand store integration.
 *
 * This hook:
 * 1. Returns the DateService singleton
 * 2. Syncs with the Zustand store's userTimezone setting
 * 3. Automatically updates DateService when timezone changes
 *
 * @example
 * ```tsx
 * const dateService = useDateService();
 * const today = dateService.today();
 * const parsed = dateService.parseNaturalDate('tomorrow');
 * const chip = dateService.formatForChip('2025-12-25');
 * ```
 *
 * @example Destructure common methods
 * ```tsx
 * const { today, tomorrow, parseNaturalDate, formatForChip } = useDateService();
 * ```
 */
export function useDateService(): DateService {
  // Get timezone from store (may be undefined initially)
  const userTimezone = useGremlyStore((s) => s.userTimezone);
  const dayBoundaryHour = useGremlyStore((s) => s.dayBoundaryHour);

  // Sync timezone when store updates
  useEffect(() => {
    if (userTimezone) {
      dateService.setTimezone(userTimezone);
    }
  }, [userTimezone]);

  // Sync day boundary hour when store updates (covers launch hydration + settings changes)
  useEffect(() => {
    dateService.setDayBoundaryHour(dayBoundaryHour);
  }, [dayBoundaryHour]);

  return dateService;
}

/**
 * Get today's date as a LocalDateString (YYYY-MM-DD).
 * Convenience hook for components that only need the current date.
 *
 * ⚠️ This returns the date in the user's LOCAL timezone, not UTC.
 *
 * @returns LocalDateString - Today's date in "YYYY-MM-DD" format
 *
 * @example
 * ```tsx
 * const today = useToday(); // "2025-01-14"
 *
 * // Use for comparisons
 * if (todo.due_day === today) {
 *   // Due today
 * }
 * ```
 */
export function useToday(): string {
  const service = useDateService();
  return service.today();
}

/**
 * Get the current UTC timestamp.
 * Convenience hook for components that need a full ISO timestamp.
 *
 * @returns UtcTimestamp - Current time in ISO format "YYYY-MM-DDTHH:mm:ss.sssZ"
 *
 * @example
 * ```tsx
 * const timestamp = useNowTimestamp(); // "2025-01-14T18:30:00.000Z"
 *
 * // Use for database writes
 * updateTodo({ completed_at: timestamp });
 * ```
 */
export function useNowTimestamp(): string {
  const service = useDateService();
  return service.nowTimestamp();
}

/**
 * @deprecated Use useToday() instead
 *
 * Get the current date string (YYYY-MM-DD) using the DateService singleton.
 * Convenience hook for components that only need the current date.
 *
 * @example
 * ```tsx
 * const today = useCurrentDate(); // "2025-01-14"
 * ```
 */
export function useCurrentDate(): string {
  return useToday();
}

/**
 * Check if a date string is today.
 * Convenience hook for conditional rendering.
 *
 * @example
 * ```tsx
 * const isDueToday = useIsToday(todo.due_day);
 * if (isDueToday) {
 *   // Show "Due Today" badge
 * }
 * ```
 */
export function useIsToday(dateStr: string | null | undefined): boolean {
  const service = useDateService();
  return service.isToday(dateStr);
}

/**
 * Format a date for chip display.
 * Convenience hook for UI components.
 *
 * @returns Formatted string: "Today", "Tomorrow", "Mon", "Dec 25", etc.
 *
 * @example
 * ```tsx
 * const chipLabel = useDateChip(todo.due_day); // "Today", "Tomorrow", "Mon", "Dec 25"
 * return <Chip label={chipLabel} />;
 * ```
 */
export function useDateChip(dateStr: string | null | undefined): string {
  const service = useDateService();
  return service.formatForChip(dateStr);
}

/**
 * Format a date for overlay display.
 * Convenience hook for overlay components.
 *
 * @returns Formatted string: "Monday, December 25", "Today", "Tomorrow", etc.
 *
 * @example
 * ```tsx
 * const overlayLabel = useDateOverlay(todo.due_day); // "Monday, December 25"
 * return <Text>{overlayLabel}</Text>;
 * ```
 */
export function useDateOverlay(dateStr: string | null | undefined): string {
  const service = useDateService();
  return service.formatForOverlay(dateStr);
}

/**
 * Get the current ritual day (YYYY-MM-DD), respecting dayBoundaryHour.
 * If the current hour is before the boundary, returns yesterday's date.
 *
 * @example
 * ```tsx
 * const ritual = useRitualDay(); // "2026-03-25" if 2am with boundary=4
 * ```
 */
export function useRitualDay(): string {
  const service = useDateService();
  return service.ritualDay();
}

// Also export the singleton for non-React contexts
export { dateService };
