import { useEffect } from 'react';
import { DateService, dateService } from './DateService';
import { useGremlyStore } from '../store/useGremlyStore';

/**
 * React hook for accessing DateService with Zustand store integration.
 *
 * This hook:
 * 1. Returns the DateService singleton
 * 2. Syncs with the Zustand store's userTimezone setting
 * 3. Automatically updates DateService when timezone changes
 *
 * Usage:
 *   const dateService = useDateService();
 *   const today = dateService.getCurrentDate();
 *   const parsed = dateService.parseNaturalDate('tomorrow');
 *   const chip = dateService.formatForChip('2025-12-25');
 *
 * Or destructure common methods:
 *   const { getCurrentDate, parseNaturalDate, formatForChip } = useDateService();
 */
export function useDateService(): DateService {
  // Get timezone from store (may be undefined initially)
  const userTimezone = useGremlyStore((s) => s.userTimezone);

  // Sync timezone when store updates
  useEffect(() => {
    if (userTimezone) {
      dateService.setTimezone(userTimezone);
    }
  }, [userTimezone]);

  return dateService;
}

/**
 * Get the current date string (YYYY-MM-DD) using the DateService singleton.
 * Convenience hook for components that only need the current date.
 *
 * Usage:
 *   const today = useCurrentDate(); // "2025-12-22"
 */
export function useCurrentDate(): string {
  const service = useDateService();
  return service.getCurrentDate();
}

/**
 * Check if a date string is today.
 * Convenience hook for conditional rendering.
 *
 * Usage:
 *   const isDueToday = useIsToday(todo.due_day);
 */
export function useIsToday(dateStr: string | null | undefined): boolean {
  const service = useDateService();
  return service.isToday(dateStr);
}

/**
 * Format a date for chip display.
 * Convenience hook for UI components.
 *
 * Usage:
 *   const chipLabel = useDateChip(todo.due_day); // "Today", "Tomorrow", "Mon", "Dec 25"
 */
export function useDateChip(dateStr: string | null | undefined): string {
  const service = useDateService();
  return service.formatForChip(dateStr);
}

/**
 * Format a date for overlay display.
 * Convenience hook for overlay components.
 *
 * Usage:
 *   const overlayLabel = useDateOverlay(todo.due_day); // "Monday, December 25"
 */
export function useDateOverlay(dateStr: string | null | undefined): string {
  const service = useDateService();
  return service.formatForOverlay(dateStr);
}

// Also export the singleton for non-React contexts
export { dateService };
