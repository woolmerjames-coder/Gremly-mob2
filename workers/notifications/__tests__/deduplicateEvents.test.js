/**
 * Tests for the deduplicateEvents helper in the notifications worker.
 *
 * Since the worker is a single index.js file, we replicate the regex / filter
 * logic here to test it in isolation. If the implementation changes, update
 * the copies below to match.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Extracted logic (mirrors workers/notifications/index.js)
// ─────────────────────────────────────────────────────────────────────────────

const OOO_PATTERN = /\b(out of office|ooo|pto|on leave|on vacation|holiday)\b/i;
const THIRD_PARTY_APPT_PATTERN =
  /^[A-Z][a-z]+ ?[A-Z]?\.?[-–]\s*(doctor|dentist|appt|appointment|checkup|check.up|physio|therapy|therapist|vet)\b/i;

function deduplicateEvents(events) {
  const seen = new Set();
  return events.filter((e) => {
    const title = (e.title || '').trim();
    if (title.toLowerCase().startsWith('canceled:')) return false;
    if (OOO_PATTERN.test(title) && !e.space_id && !e.spaceName) return false;
    if (THIRD_PARTY_APPT_PATTERN.test(title)) return false;
    const key = `${title.toLowerCase()}|${e.date || e.target_date || e.event_date || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('deduplicateEvents', () => {
  // ── Canceled events ────────────────────────────────────────────────────

  it('filters out events with titles starting with "Canceled:"', () => {
    const events = [
      { title: 'Canceled: Team Standup', date: '2025-12-16' },
      { title: 'Sprint Review', date: '2025-12-20' },
    ];
    const result = deduplicateEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Sprint Review');
  });

  it('handles case-insensitive "canceled:" prefix', () => {
    const events = [{ title: 'canceled: meeting', date: '2025-12-16' }];
    expect(deduplicateEvents(events)).toHaveLength(0);
  });

  // ── OOO filtering ─────────────────────────────────────────────────────

  it('filters OOO events without space association', () => {
    const events = [
      { title: 'Sarah - Out of Office', date: '2025-12-16' },
      { title: 'Mike PTO', date: '2025-12-17' },
    ];
    expect(deduplicateEvents(events)).toHaveLength(0);
  });

  it('keeps OOO events that belong to a space', () => {
    const events = [
      { title: 'Out of Office', date: '2025-12-16', space_id: 'space-1' },
    ];
    expect(deduplicateEvents(events)).toHaveLength(1);
  });

  it('keeps OOO events with a spaceName', () => {
    const events = [
      { title: 'On vacation', date: '2025-12-16', spaceName: 'Personal' },
    ];
    expect(deduplicateEvents(events)).toHaveLength(1);
  });

  // ── Third-party appointment filtering ─────────────────────────────────

  it('filters "Sarah - doctor" pattern', () => {
    const events = [{ title: 'Sarah - doctor', date: '2025-12-16' }];
    expect(deduplicateEvents(events)).toHaveLength(0);
  });

  it('filters "John – dentist" pattern (em dash)', () => {
    const events = [{ title: 'John – dentist', date: '2025-12-16' }];
    expect(deduplicateEvents(events)).toHaveLength(0);
  });

  it('filters "Emma - appointment" pattern', () => {
    const events = [{ title: 'Emma - appointment', date: '2025-12-16' }];
    expect(deduplicateEvents(events)).toHaveLength(0);
  });

  it('filters "Mike - physio" pattern', () => {
    const events = [{ title: 'Mike - physio', date: '2025-12-16' }];
    expect(deduplicateEvents(events)).toHaveLength(0);
  });

  it('filters "Sarah J.- therapy" pattern (no space before dash)', () => {
    const events = [{ title: 'Sarah J.- therapy', date: '2025-12-16' }];
    expect(deduplicateEvents(events)).toHaveLength(0);
  });

  it('does NOT filter "Sarah J. - therapy" (space before dash escapes pattern)', () => {
    // The regex requires dash immediately after the optional initial+dot
    const events = [{ title: 'Sarah J. - therapy', date: '2025-12-16' }];
    expect(deduplicateEvents(events)).toHaveLength(1);
  });

  it('filters "Sam - vet" pattern', () => {
    const events = [{ title: 'Sam - vet', date: '2025-12-16' }];
    expect(deduplicateEvents(events)).toHaveLength(0);
  });

  it('filters "Anna - checkup" pattern', () => {
    const events = [{ title: 'Anna - checkup', date: '2025-12-16' }];
    expect(deduplicateEvents(events)).toHaveLength(0);
  });

  it('filters "Tom - check-up" pattern (hyphenated)', () => {
    const events = [{ title: 'Tom - check-up', date: '2025-12-16' }];
    expect(deduplicateEvents(events)).toHaveLength(0);
  });

  it('keeps events that look like normal meetings', () => {
    const events = [
      { title: 'Sprint Planning', date: '2025-12-16' },
      { title: 'Doctor appointment', date: '2025-12-17' },
      { title: '1:1 with Sarah', date: '2025-12-18' },
    ];
    // "Doctor appointment" doesn't match the pattern (doesn't start with Name -)
    const result = deduplicateEvents(events);
    expect(result).toHaveLength(3);
  });

  it('keeps user\'s own "dentist" event without name-dash pattern', () => {
    const events = [{ title: 'Dentist at 3pm', date: '2025-12-16' }];
    expect(deduplicateEvents(events)).toHaveLength(1);
  });

  // ── Deduplication ─────────────────────────────────────────────────────

  it('removes duplicate events with same title and date', () => {
    const events = [
      { title: 'Team Standup', date: '2025-12-16' },
      { title: 'Team Standup', date: '2025-12-16' },
      { title: 'Team Standup', date: '2025-12-17' },
    ];
    const result = deduplicateEvents(events);
    expect(result).toHaveLength(2);
  });

  it('deduplicates case-insensitively', () => {
    const events = [
      { title: 'Sprint Review', date: '2025-12-20' },
      { title: 'sprint review', date: '2025-12-20' },
    ];
    expect(deduplicateEvents(events)).toHaveLength(1);
  });

  it('uses target_date fallback for dedup key', () => {
    const events = [
      { title: 'Retro', target_date: '2025-12-20' },
      { title: 'Retro', target_date: '2025-12-20' },
    ];
    expect(deduplicateEvents(events)).toHaveLength(1);
  });

  it('uses event_date fallback for dedup key', () => {
    const events = [
      { title: 'Lunch', event_date: '2025-12-20' },
      { title: 'Lunch', event_date: '2025-12-20' },
    ];
    expect(deduplicateEvents(events)).toHaveLength(1);
  });

  // ── Empty / edge cases ────────────────────────────────────────────────

  it('returns empty array for empty input', () => {
    expect(deduplicateEvents([])).toEqual([]);
  });

  it('handles events with missing title gracefully', () => {
    const events = [{ date: '2025-12-16' }, { title: '', date: '2025-12-16' }];
    // Both have empty title + same date → deduped to 1
    expect(deduplicateEvents(events)).toHaveLength(1);
  });
});
