import type { UnifiedDrop } from '../../types/UnifiedDrop';
import { getDateService } from '../date/DateService';

/**
 * How long ago, in words a person reads: just now, 5 min ago, 3 hrs ago on the
 * day itself; yesterday; 3 days ago within the week; then the date (final
 * check item 19: never "1d ago"). Days are the person's own days.
 */
export function relativeTime(iso: string): string {
  const ds = getDateService();
  const d = new Date(iso);
  const days = ds.daysBetween(ds.dayOf(iso) ?? ds.today(), ds.today());
  if (days <= 0) {
    const s = Math.floor((ds.now().getTime() - d.getTime()) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    return `${h} hr${h > 1 ? 's' : ''} ago`;
  }
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return ds.formatForChip(ds.toLocalDate(d));
}

/**
 * Format time estimate for display in chip
 * Returns null if no estimate, otherwise returns formatted string like "~15m" or "~1h"
 */
export function formatTimeEstimate(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  if (minutes < 60) return `~${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (remainingMins === 0) return `~${hours}h`;
  return `~${hours}h ${remainingMins}m`;
}

/**
 * Format habit start date for display
 * Returns "Starts TBD" if null, or "Starts Mon" / "Starts Jan 1" format
 */
export function formatStartDate(startDate: string | null | undefined): string {
  if (!startDate) return 'Starts TBD';

  try {
    const ds = getDateService();
    const diffDays = ds.daysBetween(ds.today(), startDate);
    const date = ds.fromLocalDate(startDate) ?? new Date(startDate + 'T00:00:00');

    // If within next 7 days, show day name
    const tz = ds.getTimezone();
    if (diffDays >= 0 && diffDays < 7) {
      const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(
        date,
      );
      return `Starts ${dayName}`;
    }

    // Otherwise show "Jan 1" format
    const formatted = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: tz,
    }).format(date);
    return `Starts ${formatted}`;
  } catch {
    return 'Starts TBD';
  }
}

/**
 * Get display kind for category chip - shows specific subtype for notes
 */
export function getDisplayKindForChip(kind: 'note' | 'todo' | 'habit', item: UnifiedDrop): string {
  if (kind === 'todo') return 'Todo';
  if (kind === 'habit') return 'Habit';

  // For notes, show specific subtype in the badge
  const subtype = item.noteSubtype || item.canonical_type;
  if (subtype === 'journal') return 'Journal';
  if (subtype === 'idea') return 'Idea';
  if (subtype === 'event') return 'Event';
  return 'Note';
}

/**
 * Get display kind for Recent drops pill
 * Uses canonical_type first (from buildCanonicalFromMindDrop), then falls back to labels/subtype.
 * Ensures logs show "log" not "unsorted"
 */
export function getDisplayKindForDrop(item: UnifiedDrop, canonicalTypesOn: boolean): string {
  const effectiveKind = item.optimisticKind ?? item.kind;

  // If canonical types are off, use simple kind mapping
  if (!canonicalTypesOn) {
    return effectiveKind;
  }

  // Habits and todos display as-is
  if (effectiveKind === 'habit') return 'habit';
  if (effectiveKind === 'todo') return 'todo';

  // All notes in Mind Drop are logs - never "unsorted"
  return 'log';
}
