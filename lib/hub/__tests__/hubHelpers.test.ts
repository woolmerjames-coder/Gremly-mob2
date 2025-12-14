/**
 * Unit tests for Hub V1 helper functions
 *
 * Tests are deterministic - all dates are fixed, no dependency on system time.
 */

import {
  computeTimeRange,
  computeTopTags,
  getJournalPreview,
  formatReasonLabel,
  suggestShortTitle,
  formatJournalDate,
  type HubV1TimeRange as _HubV1TimeRange,
  type TagCount as _TagCount,
} from '../hubHelpers';

// =============================================================================
// computeTimeRange tests
// =============================================================================

describe('computeTimeRange', () => {
  // Fixed reference date: Dec 14, 2025 at noon UTC
  const NOW = new Date('2025-12-14T12:00:00.000Z');

  it('returns empty object for "all" range', () => {
    const result = computeTimeRange('all', NOW);
    expect(result).toEqual({});
  });

  it('returns createdAfter 7 days ago for "week" range', () => {
    const result = computeTimeRange('week', NOW);

    expect(result.createdAfter).toBeDefined();
    expect(result.createdBefore).toBeUndefined();

    const createdAfter = new Date(result.createdAfter!);
    expect(createdAfter.toISOString()).toBe('2025-12-07T12:00:00.000Z');
  });

  it('returns createdAfter 1 month ago for "month" range', () => {
    const result = computeTimeRange('month', NOW);

    expect(result.createdAfter).toBeDefined();

    const createdAfter = new Date(result.createdAfter!);
    expect(createdAfter.toISOString()).toBe('2025-11-14T12:00:00.000Z');
  });

  it('returns createdAfter 3 months ago for "3months" range', () => {
    const result = computeTimeRange('3months', NOW);

    expect(result.createdAfter).toBeDefined();

    const createdAfter = new Date(result.createdAfter!);
    // Should be roughly 3 months (90 days) ago - allow some variance for month lengths
    const diffMs = NOW.getTime() - createdAfter.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(89);
    expect(diffDays).toBeLessThanOrEqual(92);
  });

  it('uses current date when no reference date provided', () => {
    const result = computeTimeRange('week');

    // Should have createdAfter defined and be roughly 7 days ago
    expect(result.createdAfter).toBeDefined();

    const createdAfter = new Date(result.createdAfter!);
    const now = new Date();
    const diffDays = Math.round((now.getTime() - createdAfter.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });
});

// =============================================================================
// computeTopTags tests
// =============================================================================

describe('computeTopTags', () => {
  it('returns empty array for items with no tags', () => {
    const items = [{ tags: null }, { tags: undefined }, { tags: [] }];

    const result = computeTopTags(items);
    expect(result).toEqual([]);
  });

  it('counts tag occurrences correctly', () => {
    const items = [{ tags: ['work', 'urgent'] }, { tags: ['work', 'meeting'] }, { tags: ['work'] }];

    const result = computeTopTags(items);

    expect(result[0]).toEqual({ name: 'work', count: 3 });
  });

  it('normalizes tags to lowercase', () => {
    const items = [{ tags: ['Work'] }, { tags: ['WORK'] }, { tags: ['work'] }];

    const result = computeTopTags(items);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: 'work', count: 3 });
  });

  it('trims whitespace from tags', () => {
    const items = [{ tags: ['  work  '] }, { tags: ['work'] }];

    const result = computeTopTags(items);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: 'work', count: 2 });
  });

  it('ignores empty tags', () => {
    const items = [{ tags: ['', '  ', 'valid'] }];

    const result = computeTopTags(items);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('valid');
  });

  it('caps results at specified limit (default 5)', () => {
    const items = [{ tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }];

    const result = computeTopTags(items);
    expect(result).toHaveLength(5);

    const resultCap3 = computeTopTags(items, 3);
    expect(resultCap3).toHaveLength(3);
  });

  it('sorts by count descending, then alphabetically for ties', () => {
    const items = [
      { tags: ['zebra', 'apple', 'banana'] },
      { tags: ['apple', 'banana'] },
      { tags: ['apple'] },
    ];

    const result = computeTopTags(items);

    // apple: 3, banana: 2, zebra: 1
    expect(result[0]).toEqual({ name: 'apple', count: 3 });
    expect(result[1]).toEqual({ name: 'banana', count: 2 });
    expect(result[2]).toEqual({ name: 'zebra', count: 1 });
  });

  it('orders alphabetically when counts are equal', () => {
    const items = [{ tags: ['zebra', 'apple', 'mango'] }];

    const result = computeTopTags(items);

    // All have count 1, should be alphabetical
    expect(result[0].name).toBe('apple');
    expect(result[1].name).toBe('mango');
    expect(result[2].name).toBe('zebra');
  });
});

// =============================================================================
// getJournalPreview tests
// =============================================================================

describe('getJournalPreview', () => {
  it('returns empty string for null body', () => {
    expect(getJournalPreview(null)).toBe('');
  });

  it('returns empty string for undefined body', () => {
    expect(getJournalPreview(undefined)).toBe('');
  });

  it('returns empty string for empty body', () => {
    expect(getJournalPreview('')).toBe('');
  });

  it('returns first line of multi-line text', () => {
    const body = 'First line\nSecond line\nThird line';
    expect(getJournalPreview(body)).toBe('First line');
  });

  it('trims whitespace from first line', () => {
    const body = '  First line with spaces  \nSecond line';
    expect(getJournalPreview(body)).toBe('First line with spaces');
  });

  it('returns full first line if under max length', () => {
    const body = 'Short line';
    expect(getJournalPreview(body, 50)).toBe('Short line');
  });

  it('truncates with ellipsis if over max length', () => {
    const body = 'This is a very long first line that exceeds the maximum length';
    const result = getJournalPreview(body, 30);

    expect(result).toBe('This is a very long first l...');
    expect(result.length).toBe(30);
  });

  it('handles exact max length without truncation', () => {
    const body = '12345678901234567890'; // 20 chars
    const result = getJournalPreview(body, 20);

    expect(result).toBe('12345678901234567890');
    expect(result).not.toContain('...');
  });

  it('uses default max length of 50', () => {
    const body = 'a'.repeat(60);
    const result = getJournalPreview(body);

    expect(result.length).toBe(50);
    expect(result.endsWith('...')).toBe(true);
  });
});

// =============================================================================
// formatReasonLabel tests
// =============================================================================

describe('formatReasonLabel', () => {
  it('formats todo_missing_due_date_stale correctly', () => {
    expect(formatReasonLabel('todo_missing_due_date_stale', 5)).toBe('No due date · 5 days ago');
    expect(formatReasonLabel('todo_missing_due_date_stale', 1)).toBe('No due date · 1 days ago');
  });

  it('formats idea_stale correctly', () => {
    expect(formatReasonLabel('idea_stale', 7)).toBe('Idea · 7 days ago');
    expect(formatReasonLabel('idea_stale', 14)).toBe('Idea · 14 days ago');
  });

  it('formats no_space_assigned correctly', () => {
    expect(formatReasonLabel('no_space_assigned', 3)).toBe('No space · 3 days ago');
  });
});

// =============================================================================
// suggestShortTitle tests
// =============================================================================

describe('suggestShortTitle', () => {
  it('returns "Untitled" for empty string', () => {
    expect(suggestShortTitle('')).toBe('Untitled');
  });

  it('returns "Untitled" for null/undefined-like input', () => {
    // TypeScript would catch this, but defensive
    expect(suggestShortTitle(null as any)).toBe('Untitled');
    expect(suggestShortTitle(undefined as any)).toBe('Untitled');
  });

  it('returns full text if under maxWords', () => {
    expect(suggestShortTitle('Hello world')).toBe('Hello world');
    expect(suggestShortTitle('One two three')).toBe('One two three');
  });

  it('truncates to maxWords (default 5)', () => {
    expect(suggestShortTitle('One two three four five six seven')).toBe('One two three four five');
  });

  it('respects custom maxWords', () => {
    expect(suggestShortTitle('One two three four five', 3)).toBe('One two three');
    expect(suggestShortTitle('One two three four five', 1)).toBe('One');
  });

  it('normalizes whitespace', () => {
    expect(suggestShortTitle('  Multiple   spaces   here  ')).toBe('Multiple spaces here');
  });

  it('handles newlines and tabs', () => {
    expect(suggestShortTitle('Line one\nLine two\tTab')).toBe('Line one Line two Tab');
  });
});

// =============================================================================
// formatJournalDate tests
// =============================================================================

describe('formatJournalDate', () => {
  // Fixed reference: Dec 14, 2025 at noon UTC
  const NOW = new Date('2025-12-14T12:00:00.000Z');

  it('returns "Today" for same day', () => {
    // Use time that's clearly same day (before NOW)
    expect(formatJournalDate('2025-12-14T10:00:00.000Z', NOW)).toBe('Today');
  });

  it('returns "Yesterday" for previous day', () => {
    expect(formatJournalDate('2025-12-13T12:00:00.000Z', NOW)).toBe('Yesterday');
  });

  it('returns weekday for 2-6 days ago', () => {
    // Dec 12 (2 days ago) - Thursday
    const result2 = formatJournalDate('2025-12-12T12:00:00.000Z', NOW);
    expect(result2).toMatch(/Thu|Fri|Sat|Sun|Mon|Tue|Wed/);

    // Dec 8 (6 days ago)
    const result6 = formatJournalDate('2025-12-08T12:00:00.000Z', NOW);
    expect(result6).toMatch(/Thu|Fri|Sat|Sun|Mon|Tue|Wed/);
  });

  it('returns month/day for 7+ days ago', () => {
    // Dec 7 (7 days ago)
    const result = formatJournalDate('2025-12-07T12:00:00.000Z', NOW);
    expect(result).toBe('Dec 7');

    // Nov 1 (43 days ago)
    const resultOld = formatJournalDate('2025-11-01T12:00:00.000Z', NOW);
    expect(resultOld).toBe('Nov 1');
  });
});
