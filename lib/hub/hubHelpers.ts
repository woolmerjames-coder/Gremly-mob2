/**
 * Hub V1 Pure Helper Functions
 *
 * These are extracted from HubScreen for testability and reuse.
 */

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
export function computeTimeRange(range: HubV1TimeRange, now: Date = new Date()): TimeRangeResult {
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
export function formatJournalDate(dateStr: string, now: Date = new Date()): string {
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
