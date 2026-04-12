/**
 * overlaySave.test.ts
 *
 * Tests for the overlay save-payload helpers extracted to overlaySave.ts:
 * - coerceIsoTimestamp
 * - frequencyJsonToCadenceFields
 * - detectListFromText
 */

import {
  coerceIsoTimestamp,
  frequencyJsonToCadenceFields,
  detectListFromText,
} from '../../components/overlay/overlaySave';

// ── coerceIsoTimestamp ────────────────────────────────────────────────────

describe('coerceIsoTimestamp', () => {
  it('returns valid ISO string for valid timestamp', () => {
    const result = coerceIsoTimestamp('2026-04-11T10:00:00.000Z');
    expect(result).toBe('2026-04-11T10:00:00.000Z');
  });

  it('normalises non-standard but parseable date strings', () => {
    const result = coerceIsoTimestamp('April 11, 2026');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    // Verify it's a valid ISO string
    expect(new Date(result!).toISOString()).toBe(result);
  });

  it('returns null for null input', () => {
    expect(coerceIsoTimestamp(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(coerceIsoTimestamp(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(coerceIsoTimestamp('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(coerceIsoTimestamp('   ')).toBeNull();
  });

  it('returns null for unparseable string', () => {
    expect(coerceIsoTimestamp('not-a-date')).toBeNull();
  });

  it('returns null for non-string types', () => {
    expect(coerceIsoTimestamp(42 as any)).toBeNull();
  });
});

// ── frequencyJsonToCadenceFields ──────────────────────────────────────────

describe('frequencyJsonToCadenceFields', () => {
  it('returns daily for simple daily frequency_json', () => {
    const result = frequencyJsonToCadenceFields({ type: 'simple', value: 'daily' });
    expect(result.cadence).toBe('daily');
    expect(result.target_per_period).toBe(1);
  });

  it('returns weekly for simple weekly frequency_json', () => {
    const result = frequencyJsonToCadenceFields({ type: 'simple', value: 'weekly' });
    expect(result.cadence).toBe('weekly');
  });

  it('falls back to schedule string when no frequency_json', () => {
    expect(frequencyJsonToCadenceFields(null, 'weekly').cadence).toBe('weekly');
    expect(frequencyJsonToCadenceFields(null, 'monthly').cadence).toBe('monthly');
    expect(frequencyJsonToCadenceFields(null, 'daily').cadence).toBe('daily');
  });

  it('defaults to daily when no frequency_json and no schedule', () => {
    const result = frequencyJsonToCadenceFields(null, null);
    expect(result.cadence).toBe('daily');
    expect(result.target_per_period).toBe(1);
  });

  it('defaults to daily for undefined inputs', () => {
    const result = frequencyJsonToCadenceFields(undefined);
    expect(result.cadence).toBe('daily');
  });
});

// ── detectListFromText ────────────────────────────────────────────────────

describe('detectListFromText', () => {
  it('returns plain for empty string', () => {
    expect(detectListFromText('')).toEqual({ kind: 'plain' });
  });

  it('returns plain for null/undefined', () => {
    expect(detectListFromText(null as any)).toEqual({ kind: 'plain' });
  });

  it('returns plain for a single line', () => {
    expect(detectListFromText('just a note')).toEqual({ kind: 'plain' });
  });

  it('detects bullet list with dashes', () => {
    const text = '- milk\n- eggs\n- bread';
    const result = detectListFromText(text);
    expect(result.kind).toBe('list');
    if (result.kind === 'list') {
      expect(result.items).toHaveLength(3);
      expect(result.items[0].label).toBe('milk');
    }
  });

  it('detects bullet list with bullets', () => {
    const text = '• apples\n• bananas';
    const result = detectListFromText(text);
    expect(result.kind).toBe('list');
  });

  it('detects numbered list', () => {
    const text = '1. first\n2. second\n3. third';
    const result = detectListFromText(text);
    expect(result.kind).toBe('list');
    if (result.kind === 'list') {
      expect(result.items).toHaveLength(3);
    }
  });

  it('detects checkbox list with checked state', () => {
    const text = '[x] done item\n[ ] pending item';
    const result = detectListFromText(text);
    expect(result.kind).toBe('list');
    if (result.kind === 'list') {
      expect(result.items[0].checked).toBe(true);
      expect(result.items[1].checked).toBe(false);
    }
  });

  it('returns plain for non-list multi-line text', () => {
    const text = 'This is a paragraph\nwith regular sentences\nthat are not a list';
    expect(detectListFromText(text)).toEqual({ kind: 'plain' });
  });

  it('returns plain when fewer than 2 matching list items', () => {
    const text = '- solo bullet\nnot a bullet';
    expect(detectListFromText(text)).toEqual({ kind: 'plain' });
  });
});
