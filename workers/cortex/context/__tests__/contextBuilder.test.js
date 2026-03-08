/**
 * Tests for workers/cortex/context/contextBuilder.js
 *
 * Covers buildDcoContextHeader formatting and edge cases.
 */

import { buildDcoContextHeader } from '../contextBuilder.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────────────────────────────────────

const fullDcoData = {
  lifeMoment: 'hosting family',
  tone: 'focused',
  todayFocus: ['Write report', 'Call dentist'],
  namedAnchors: [
    { label: 'Sarah', type: 'person' },
    { label: 'Work Project', type: 'project' },
  ],
  activeToday: {
    overdue_todos: 2,
    habit_streak_risk: ['Meditate'],
    upcoming_in_7d: ['Dentist appointment'],
  },
  briefHeadline: 'Big day ahead',
  generatedAt: '2025-12-15T06:00:00Z',
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildDcoContextHeader', () => {
  it('returns empty string when dcoData is null', () => {
    expect(buildDcoContextHeader(null)).toBe('');
  });

  it('returns empty string when dcoData is undefined', () => {
    expect(buildDcoContextHeader(undefined)).toBe('');
  });

  it('returns empty string when lifeMoment is missing', () => {
    expect(buildDcoContextHeader({ tone: 'focused' })).toBe('');
  });

  it('includes CURRENT LIFE CONTEXT header', () => {
    const result = buildDcoContextHeader(fullDcoData);
    expect(result).toContain('=== CURRENT LIFE CONTEXT (generated daily) ===');
  });

  it('includes life moment', () => {
    const result = buildDcoContextHeader(fullDcoData);
    expect(result).toContain('Life moment: hosting family');
  });

  it('includes tone', () => {
    const result = buildDcoContextHeader(fullDcoData);
    expect(result).toContain('Tone: focused');
  });

  it('includes today focus when present', () => {
    const result = buildDcoContextHeader(fullDcoData);
    expect(result).toContain("Today's focus: Write report, Call dentist");
  });

  it('omits today focus when empty', () => {
    const data = { ...fullDcoData, todayFocus: [] };
    const result = buildDcoContextHeader(data);
    expect(result).not.toContain("Today's focus");
  });

  it('omits today focus when null', () => {
    const data = { ...fullDcoData, todayFocus: null };
    const result = buildDcoContextHeader(data);
    expect(result).not.toContain("Today's focus");
  });

  it('includes named people', () => {
    const result = buildDcoContextHeader(fullDcoData);
    expect(result).toContain('Named people: Sarah');
  });

  it('filters named anchors to only people', () => {
    const result = buildDcoContextHeader(fullDcoData);
    // Only Sarah is type 'person', not Work Project
    expect(result).toContain('Named people: Sarah');
    expect(result).not.toContain('Work Project');
  });

  it('omits named people when none are present', () => {
    const data = {
      ...fullDcoData,
      namedAnchors: [{ label: 'Trip', type: 'trip' }],
    };
    const result = buildDcoContextHeader(data);
    expect(result).not.toContain('Named people');
  });

  it('includes overdue count in active today', () => {
    const result = buildDcoContextHeader(fullDcoData);
    expect(result).toContain('2 overdue');
  });

  it('includes habit streak risk in active today', () => {
    const result = buildDcoContextHeader(fullDcoData);
    expect(result).toContain('streak risk: Meditate');
  });

  it('omits active today when no overdue or streak risk', () => {
    const data = {
      ...fullDcoData,
      activeToday: {
        overdue_todos: 0,
        habit_streak_risk: [],
        upcoming_in_7d: [],
      },
    };
    const result = buildDcoContextHeader(data);
    expect(result).not.toContain('Active today');
  });

  it('includes usage instructions', () => {
    const result = buildDcoContextHeader(fullDcoData);
    expect(result).toContain('Use this context to colour your responses naturally');
    expect(result).toContain('like a friend who knows their situation');
  });

  it('adds relaxed tone guidance when tone is relaxed', () => {
    const data = { ...fullDcoData, tone: 'relaxed' };
    const result = buildDcoContextHeader(data);
    expect(result).toContain('Tone is relaxed — avoid urgency framing');
  });

  it('does not add relaxed guidance for other tones', () => {
    const result = buildDcoContextHeader(fullDcoData);
    expect(result).not.toContain('avoid urgency framing');
  });

  it('returns multiline string', () => {
    const result = buildDcoContextHeader(fullDcoData);
    const lines = result.split('\n');
    expect(lines.length).toBeGreaterThan(3);
  });
});
