/**
 * Tests for mightBeMulti and extractTemporal heuristics from dropPhases.ts.
 *
 * Covers: separator detection (comma, "and", newline, dash, etc.),
 * false negatives, and temporal extraction patterns.
 */

// Mock env and supabase to avoid import-time crashes
jest.mock('../../env', () => ({
  env: { cortexUrl: '' },
  getEnv: jest.fn(),
}));

jest.mock('../../cortex/getSessionToken', () => ({
  getSessionToken: jest.fn().mockResolvedValue(null),
  getSessionTokenSync: jest.fn().mockReturnValue(null),
}));

jest.mock('../../supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

import { mightBeMulti, extractTemporal } from '../dropPhases';

describe('mightBeMulti', () => {
  it.each([
    ['buy milk, clean house', 'comma'],
    ['buy milk and clean house', '"and"'],
    ['buy milk also clean house', '"also"'],
    ['buy milk then clean house', '"then"'],
    ['buy milk plus clean house', '"plus"'],
    ['buy milk as well as clean house', '"as well"'],
    ['buy milk but also clean house', '"but"'],
    ['buy milk + clean house', '+ sign'],
    ['buy milk & clean house', '& sign'],
    ['buy milk\nclean house', 'newline'],
    ['buy milk / clean house', 'slash'],
    ['buy milk — clean house', 'em dash'],
    ['buy milk – clean house', 'en dash'],
    ['buy milk - clean house', 'hyphen'],
    ['grocery. laundry. cooking.', 'period'],
    ['task1; task2', 'semicolon'],
  ])('returns true for "%s" (%s)', (text) => {
    expect(mightBeMulti(text)).toBe(true);
  });

  it.each([
    ['buy groceries'],
    ['remember to call mom'],
    ['feeling tired today'],
    ['work out at the gym'],
  ])('returns false for single-item: "%s"', (text) => {
    expect(mightBeMulti(text)).toBe(false);
  });
});

describe('extractTemporal', () => {
  it.each([
    ['call mom tomorrow', 'tomorrow'],
    ['meeting today', 'today'],
    ['finish tonight', 'tonight'],
    ['go to gym on Monday', 'Monday'],
    ['dentist on tuesday', 'tuesday'],
    ['meeting on 3/15', '3/15'],
    ['deadline next week', 'next week'],
    ['submit by January', 'January'],
    ['April 5th delivery', 'april'],
  ])('extracts "%s" → "%s"', (text, expected) => {
    const result = extractTemporal(text);
    expect(result).not.toBeNull();
    expect(result!.toLowerCase()).toContain(expected.toLowerCase());
  });

  it('returns null for text without temporal cues', () => {
    expect(extractTemporal('buy groceries')).toBeNull();
    expect(extractTemporal('feeling great')).toBeNull();
  });
});
