/**
 * Hub V1 Pure Helper Functions
 *
 * These are extracted from HubScreen for testability and reuse.
 */

import { getDateService } from '../date';

// =============================================================================
// Time Range Computation
// =============================================================================

export type HubV1TimeRange = 'week' | 'month' | '3months' | 'all';

export interface TimeRangeResult {
  createdAfter?: string;
  createdBefore?: string;
}

/**
 * Compute ISO date range based on time filter selection.
 * Returns createdAfter/createdBefore for filtering.
 *
 * @param range - Time range selection
 * @param now - Optional date to use as "now" (for testing determinism)
 */
export function computeTimeRange(range: HubV1TimeRange, now: Date = getDateService().now()): TimeRangeResult {
  if (range === 'all') return {};

  let start: Date;

  switch (range) {
    case 'week':
      start = new Date(now);
      start.setDate(now.getDate() - 7);
      break;
    case 'month':
      start = new Date(now);
      start.setMonth(now.getMonth() - 1);
      break;
    case '3months':
      start = new Date(now);
      start.setMonth(now.getMonth() - 3);
      break;
    default:
      return {};
  }

  return {
    createdAfter: start.toISOString(),
  };
}

// =============================================================================
// Last 30 Days Range for Journal Analysis
// =============================================================================

export interface Last30DaysQueryOptions {
  createdAfter: string;
  createdBefore: string;
  subtypes: ['journal'];
}

/**
 * Compute query options for fetching journals from the last 30 days.
 * Returns createdAfter (30 days ago) and createdBefore (now) with journal subtype.
 *
 * @param now - Optional date to use as "now" (for testing determinism)
 */
export function computeLast30DaysRange(now: Date = getDateService().now()): Last30DaysQueryOptions {
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  return {
    createdAfter: thirtyDaysAgo.toISOString(),
    createdBefore: now.toISOString(),
    subtypes: ['journal'],
  };
}

// =============================================================================
// Archived Items Query Options
// =============================================================================

export type ArchivedTimeRange = 'week' | 'month' | '3months' | 'all';

/**
 * Status filter behavior for archived items:
 * - 'archived': Show only archived items (default) - uses archivedOnly: true
 * - 'all': Show all items regardless of archive status - includes both archived and non-archived
 *
 * Note: For archived items, "active" vs "completed" distinction is less meaningful
 * since archived items are typically "done" with. We provide 'archived' and 'all'
 * to allow users to optionally see non-archived items too.
 */
export type ArchivedStatusFilter = 'archived' | 'all';

export interface ArchivedQueryOptions {
  archivedOnly?: boolean;
  createdAfter?: string;
  createdBefore?: string;
}

/**
 * Compute query options for fetching archived items.
 *
 * @param timeRange - Time range filter (week, month, 3months, all)
 * @param statusFilter - Status filter (archived, all)
 * @param now - Optional date to use as "now" (for testing determinism)
 */
export function computeArchivedQueryOptions(
  timeRange: ArchivedTimeRange,
  statusFilter: ArchivedStatusFilter,
  now: Date = getDateService().now(),
): ArchivedQueryOptions {
  const options: ArchivedQueryOptions = {};

  // Status filter
  // 'archived' => archivedOnly: true (only archived items)
  // 'all' => archivedOnly: false (show both archived and non-archived)
  if (statusFilter === 'archived') {
    options.archivedOnly = true;
  }
  // For 'all', we don't set archivedOnly (defaults to false in repo)

  // Time range filter
  if (timeRange !== 'all') {
    const timeResult = computeTimeRange(timeRange, now);
    if (timeResult.createdAfter) {
      options.createdAfter = timeResult.createdAfter;
    }
    if (timeResult.createdBefore) {
      options.createdBefore = timeResult.createdBefore;
    }
  }

  return options;
}

// =============================================================================
// Top Tags Computation
// =============================================================================

export interface TagCount {
  name: string;
  count: number;
}

/**
 * Compute top tags from items with deterministic ordering.
 * - Tags are normalized (lowercase, trimmed)
 * - Sorted by count descending, then alphabetically for ties
 * - Capped at the specified limit
 *
 * @param items - Array of items with optional `tags` property
 * @param cap - Maximum number of tags to return (default 5)
 */
export function computeTopTags(
  items: Array<{ tags?: string[] | null }>,
  cap: number = 5,
): TagCount[] {
  const tagUsageMap = new Map<string, number>();

  for (const item of items) {
    if (Array.isArray(item.tags)) {
      for (const tagName of item.tags) {
        const normalized = tagName.toLowerCase().trim();
        if (normalized) {
          tagUsageMap.set(normalized, (tagUsageMap.get(normalized) || 0) + 1);
        }
      }
    }
  }

  // Sort by count descending, then alphabetically for determinism
  const sorted = Array.from(tagUsageMap.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]; // Count descending
      return a[0].localeCompare(b[0]); // Alphabetical for ties
    })
    .map(([name, count]) => ({ name, count }));

  return sorted.slice(0, cap);
}

// =============================================================================
// Journal Preview Extraction
// =============================================================================

/**
 * Extract first line preview from journal body.
 * - Takes first non-empty line
 * - Truncates to maxLength with ellipsis if needed
 *
 * @param body - Journal body text
 * @param maxLength - Maximum preview length (default 50)
 */
export function getJournalPreview(body: string | null | undefined, maxLength: number = 50): string {
  if (!body) return '';

  const firstLine = body.split('\n')[0].trim();

  if (firstLine.length <= maxLength) {
    return firstLine;
  }

  return firstLine.slice(0, maxLength - 3) + '...';
}

// =============================================================================
// Needs Attention Reason Formatting
// =============================================================================

export type NeedsAttentionReason =
  | 'todo_missing_due_date_stale'
  | 'idea_stale'
  | 'no_space_assigned';

/**
 * Format the reason label for needs-attention items.
 * Used in "So you don't forget..." section.
 *
 * @param reason - The attention reason type
 * @param ageInDays - Age of the item in days
 */
export function formatReasonLabel(reason: NeedsAttentionReason, ageInDays: number): string {
  switch (reason) {
    case 'todo_missing_due_date_stale':
      return `No due date · ${ageInDays} days ago`;
    case 'idea_stale':
      return `Idea · ${ageInDays} days ago`;
    case 'no_space_assigned':
      return `No space · ${ageInDays} days ago`;
    default:
      return `${ageInDays} days ago`;
  }
}

// =============================================================================
// Short Title Helper
// =============================================================================

/**
 * Condense long text into a short title.
 *
 * @param text - Input text to shorten
 * @param maxWords - Maximum words to include (default 5)
 */
export function suggestShortTitle(text: string, maxWords = 5): string {
  if (!text) return 'Untitled';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ');
  return words.slice(0, maxWords).join(' ');
}

// =============================================================================
// Journal Date Formatting
// =============================================================================

/**
 * Format a date for journal card display.
 * Returns relative labels for recent dates.
 *
 * @param dateStr - ISO date string
 * @param now - Optional reference date (for testing)
 */
export function formatJournalDate(dateStr: string, now: Date = getDateService().now()): string {
  // Use DateService for timezone-safe parsing of YYYY-MM-DD strings
  const ds = getDateService();
  const dateDay = dateStr.match(/^\d{4}-\d{2}-\d{2}$/) ? dateStr : ds.toLocalDate(new Date(dateStr));
  const diffDays = ds.daysBetween(dateDay, ds.toLocalDate(now));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return ds.formatForChip(dateDay);
}

// =============================================================================
// Journal Detection
// =============================================================================

/**
 * Type-safe check if a record is a journal entry.
 * Journals are Notes with subtype === 'journal'.
 *
 * @param record - Any AppRecord-like object
 */
export function isJournal(record: { type: string; subtype?: string | null }): boolean {
  return record.type === 'note' && record.subtype === 'journal';
}

// =============================================================================
// Journal Month Grouping
// =============================================================================

export interface JournalEntry {
  id: string;
  date: string; // ISO string or date field
  created_at: string;
  body?: string | null;
  mood?: string[] | null; // Multi-select mood array
}

export interface JournalMonthGroup {
  /** Month key in format "YYYY-MM" for sorting */
  monthKey: string;
  /** Display label like "December 2025" */
  label: string;
  /** Journals in this month, sorted by date descending */
  journals: JournalEntry[];
}

/**
 * Group journals by month for timeline display.
 * - Groups by year-month from the journal's date (or created_at fallback)
 * - Returns groups sorted by month descending (most recent first)
 * - Journals within each group sorted by date descending
 *
 * @param journals - Array of journal entries
 * @param now - Optional reference date for determining month labels (for testing)
 */
export function groupJournalsByMonth(
  journals: JournalEntry[],
  _now: Date = getDateService().now(),
): JournalMonthGroup[] {
  const groups = new Map<string, JournalEntry[]>();

  for (const journal of journals) {
    const dateStr = journal.date || journal.created_at;
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

    if (!groups.has(monthKey)) {
      groups.set(monthKey, []);
    }
    groups.get(monthKey)!.push(journal);
  }

  // Sort entries within each group by date descending
  for (const entries of groups.values()) {
    entries.sort((a, b) => {
      const dateA = a.date || a.created_at;
      const dateB = b.date || b.created_at;
      return dateB.localeCompare(dateA);
    });
  }

  // Convert to array and sort groups by monthKey descending
  const result: JournalMonthGroup[] = [];
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));

  for (const key of sortedKeys) {
    const entries = groups.get(key)!;
    const [yearStr, monthStr] = key.split('-');
    const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    const label = getDateService().formatDateForDisplay(key + '-01');

    result.push({
      monthKey: key,
      label,
      journals: entries,
    });
  }

  return result;
}
