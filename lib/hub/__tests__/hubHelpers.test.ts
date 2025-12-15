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
  isJournal,
  groupJournalsByMonth,
  computeLast30DaysRange,
  type HubV1TimeRange as _HubV1TimeRange,
  type TagCount as _TagCount,
  type JournalEntry,
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
// computeLast30DaysRange tests
// =============================================================================

describe('computeLast30DaysRange', () => {
  // Fixed reference date: Dec 14, 2025 at noon UTC
  const NOW = new Date('2025-12-14T12:00:00.000Z');

  it('returns createdAfter 30 days before now', () => {
    const result = computeLast30DaysRange(NOW);

    expect(result.createdAfter).toBe('2025-11-14T12:00:00.000Z');
  });

  it('returns createdBefore as the reference date', () => {
    const result = computeLast30DaysRange(NOW);

    expect(result.createdBefore).toBe('2025-12-14T12:00:00.000Z');
  });

  it('always includes subtypes: [journal]', () => {
    const result = computeLast30DaysRange(NOW);

    expect(result.subtypes).toEqual(['journal']);
  });

  it('returns all required query options', () => {
    const result = computeLast30DaysRange(NOW);

    // Should have all three properties
    expect(result).toHaveProperty('createdAfter');
    expect(result).toHaveProperty('createdBefore');
    expect(result).toHaveProperty('subtypes');
  });

  it('uses current date when no reference date provided', () => {
    const result = computeLast30DaysRange();

    // Should have both dates defined
    expect(result.createdAfter).toBeDefined();
    expect(result.createdBefore).toBeDefined();

    // createdBefore should be close to now
    const createdBefore = new Date(result.createdBefore);
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - createdBefore.getTime());
    expect(diffMs).toBeLessThan(1000); // Within 1 second

    // createdAfter should be 30 days before createdBefore
    const createdAfter = new Date(result.createdAfter);
    const diffDays = Math.round(
      (createdBefore.getTime() - createdAfter.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(diffDays).toBe(30);
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

// =============================================================================
// isJournal tests
// =============================================================================

describe('isJournal', () => {
  it('returns true for a note with subtype journal', () => {
    expect(isJournal({ type: 'note', subtype: 'journal' })).toBe(true);
  });

  it('returns false for a note with subtype idea', () => {
    expect(isJournal({ type: 'note', subtype: 'idea' })).toBe(false);
  });

  it('returns false for a note with subtype list', () => {
    expect(isJournal({ type: 'note', subtype: 'list' })).toBe(false);
  });

  it('returns false for a note with subtype reference', () => {
    expect(isJournal({ type: 'note', subtype: 'reference' })).toBe(false);
  });

  it('returns false for a note with subtype catchall', () => {
    expect(isJournal({ type: 'note', subtype: 'catchall' })).toBe(false);
  });

  it('returns false for a note with null subtype', () => {
    expect(isJournal({ type: 'note', subtype: null })).toBe(false);
  });

  it('returns false for a note with undefined subtype', () => {
    expect(isJournal({ type: 'note', subtype: undefined })).toBe(false);
  });

  it('returns false for a todo', () => {
    expect(isJournal({ type: 'todo' })).toBe(false);
  });

  it('returns false for a habit', () => {
    expect(isJournal({ type: 'habit' })).toBe(false);
  });

  it('returns false for a space', () => {
    expect(isJournal({ type: 'space' })).toBe(false);
  });
});

// =============================================================================
// groupJournalsByMonth tests
// =============================================================================

describe('groupJournalsByMonth', () => {
  it('returns empty array for empty input', () => {
    const result = groupJournalsByMonth([]);
    expect(result).toEqual([]);
  });

  it('groups journals by month correctly', () => {
    const journals: JournalEntry[] = [
      { id: '1', date: '2025-12-14T10:00:00.000Z', created_at: '2025-12-14T10:00:00.000Z' },
      { id: '2', date: '2025-12-10T10:00:00.000Z', created_at: '2025-12-10T10:00:00.000Z' },
      { id: '3', date: '2025-11-20T10:00:00.000Z', created_at: '2025-11-20T10:00:00.000Z' },
    ];

    const result = groupJournalsByMonth(journals);

    expect(result).toHaveLength(2);
    expect(result[0].monthKey).toBe('2025-12');
    expect(result[0].label).toBe('December 2025');
    expect(result[0].journals).toHaveLength(2);
    expect(result[1].monthKey).toBe('2025-11');
    expect(result[1].label).toBe('November 2025');
    expect(result[1].journals).toHaveLength(1);
  });

  it('sorts groups by month descending (most recent first)', () => {
    const journals: JournalEntry[] = [
      { id: '1', date: '2025-09-01T10:00:00.000Z', created_at: '2025-09-01T10:00:00.000Z' },
      { id: '2', date: '2025-12-01T10:00:00.000Z', created_at: '2025-12-01T10:00:00.000Z' },
      { id: '3', date: '2025-11-01T10:00:00.000Z', created_at: '2025-11-01T10:00:00.000Z' },
    ];

    const result = groupJournalsByMonth(journals);

    expect(result[0].monthKey).toBe('2025-12');
    expect(result[1].monthKey).toBe('2025-11');
    expect(result[2].monthKey).toBe('2025-09');
  });

  it('sorts journals within each group by date descending', () => {
    const journals: JournalEntry[] = [
      { id: '1', date: '2025-12-05T10:00:00.000Z', created_at: '2025-12-05T10:00:00.000Z' },
      { id: '2', date: '2025-12-20T10:00:00.000Z', created_at: '2025-12-20T10:00:00.000Z' },
      { id: '3', date: '2025-12-10T10:00:00.000Z', created_at: '2025-12-10T10:00:00.000Z' },
    ];

    const result = groupJournalsByMonth(journals);

    expect(result).toHaveLength(1);
    expect(result[0].journals[0].id).toBe('2'); // Dec 20
    expect(result[0].journals[1].id).toBe('3'); // Dec 10
    expect(result[0].journals[2].id).toBe('1'); // Dec 5
  });

  it('uses created_at as fallback when date is missing', () => {
    const journals: JournalEntry[] = [
      { id: '1', date: '', created_at: '2025-12-14T10:00:00.000Z' },
      { id: '2', date: '', created_at: '2025-11-14T10:00:00.000Z' },
    ];

    const result = groupJournalsByMonth(journals);

    expect(result).toHaveLength(2);
    expect(result[0].monthKey).toBe('2025-12');
    expect(result[1].monthKey).toBe('2025-11');
  });

  it('handles journals spanning multiple years', () => {
    const journals: JournalEntry[] = [
      { id: '1', date: '2025-01-15T10:00:00.000Z', created_at: '2025-01-15T10:00:00.000Z' },
      { id: '2', date: '2024-12-15T10:00:00.000Z', created_at: '2024-12-15T10:00:00.000Z' },
    ];

    const result = groupJournalsByMonth(journals);

    expect(result).toHaveLength(2);
    expect(result[0].monthKey).toBe('2025-01');
    expect(result[0].label).toBe('January 2025');
    expect(result[1].monthKey).toBe('2024-12');
    expect(result[1].label).toBe('December 2024');
  });

  it('preserves mood and body fields in grouped journals', () => {
    const journals: JournalEntry[] = [
      {
        id: '1',
        date: '2025-12-14T10:00:00.000Z',
        created_at: '2025-12-14T10:00:00.000Z',
        body: 'Great day today!',
        mood: 'happy',
      },
    ];

    const result = groupJournalsByMonth(journals);

    expect(result[0].journals[0].body).toBe('Great day today!');
    expect(result[0].journals[0].mood).toBe('happy');
  });
});
