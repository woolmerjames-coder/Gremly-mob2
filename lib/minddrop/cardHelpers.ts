import type { UnifiedDrop } from '../../types/UnifiedDrop';
import { getDateService } from '../date/DateService';
import { formatDue } from '../date/formatDue';
import { getFrequencyDisplayLabel } from '../habits/frequencyUtils';
import { filterAndNormalizeTags } from '../tags/normalize';

export function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.substring(0, maxLength - 3).trim() + '...';
}

export function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = getDateService().now().getTime() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return getDateService().formatForChip(getDateService().toLocalDate(d));
}

/** Format "14:00" → "2PM", "09:30" → "9:30AM" */
export function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
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
 * Format a date string for display in a chip
 * Shows relative dates (Today, Tomorrow) or formatted dates (Mon, Jan 30)
 */
export function formatDateForChip(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  try {
    // Parse the date string (YYYY-MM-DD format)
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    // Get today and tomorrow in local timezone
    const today = getDateService().now();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Compare dates
    const dateTime = date.getTime();
    const todayTime = today.getTime();
    const tomorrowTime = tomorrow.getTime();

    if (dateTime === todayTime) return 'Today';
    if (dateTime === tomorrowTime) return 'Tomorrow';

    // Check if within this week (next 7 days)
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    if (dateTime > todayTime && dateTime < nextWeek.getTime()) {
      // Show day name (Mon, Tue, etc.)
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return days[date.getDay()];
    }

    // Show month + day (Jan 30)
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  } catch {
    return dateStr; // Fallback to raw string if parsing fails
  }
}

/**
 * Get contextual metadata string for Mind Drop card meta row
 * Updated for Date Intelligence: shows target_date vs scheduled_date appropriately
 */
export function getContextualMeta(
  kind: 'note' | 'todo' | 'habit',
  item: UnifiedDrop,
): string | null {
  if (kind === 'todo') {
    // Date Intelligence: target_date is shown as separate calendar chip on right
    // If target_date exists, skip legacy fields and let calendar chip handle it
    if (item.target_date) {
      // If we also have scheduled_date, show it as the primary chip
      if (item.scheduled_date) {
        return formatDateForChip(item.scheduled_date);
      }
      return null; // Will be shown as calendar chip on right
    }
    // Scheduled date = when user will DO the work (primary chip)
    if (item.scheduled_date) {
      return formatDateForChip(item.scheduled_date);
    }
    // Fallback to legacy due_date for backwards compatibility (only if no target_date)
    if (item.due_date || item.due_day) {
      return formatDue({ dueDay: item.due_day, dueIso: item.due_date, dueTime: item.due_time });
    }
    return 'no deadline yet';
  }

  if (kind === 'habit') {
    // Show specific days if days_active is set (e.g., "Mon · Fri")
    if (item.days_active && item.days_active.length > 0) {
      const DAY_ABBREVS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return item.days_active.map((d) => DAY_ABBREVS[d]).join(' · ');
    }
    // Fall back to frequency display label (e.g., "2x/week")
    return getFrequencyDisplayLabel(item.cadence, item.target_per_period, item.frequency);
  }

  // Notes/Logs - subtype is now shown in the badge pill,
  // so only return date-based context here
  if (item.target_date) {
    return formatDateForChip(item.target_date);
  }

  return null;
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
 * Get display tags for Recent drops list
 * Filters out junk tags (*journal, stop words, etc.) and normalizes formatting
 * Returns tags ready to display in the UI (e.g., ["running", "morning", "@alice"])
 */
export function getDisplayTagsForRecentDrop(item: UnifiedDrop): string[] {
  if (!Array.isArray(item.tags) || item.tags.length === 0) {
    return [];
  }

  // Use the same tag filtering/normalization as Mind Drop overlay
  // This strips *journal, removes stop words, dedupes, etc.
  const cleaned = filterAndNormalizeTags(item.tags);

  // Remove the # prefix for display (we'll add it back in the UI)
  // Also filter out *journal and other internal markers
  return cleaned
    .filter((tag) => !tag.startsWith('*')) // Remove internal markers like *journal
    .map((tag) => {
      if (tag.startsWith('#')) return tag.slice(1);
      if (tag.startsWith('@')) return tag; // Keep @ prefix for mentions
      return tag;
    });
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
