/**
 * Intent Ambiguity Tests
 * Ensures detectIntent returns an 'ambiguous' intent with options when
 * todo and note confidences are both strong and close.
 */

import { detectIntent } from '../../lib/cortex/intents/detectIntent';

describe('Intent ambiguity between todo and note', () => {
  it('returns ambiguous for "Remember to ..." phrasing', () => {
    const result = detectIntent('Remember to check the documentation');
    expect(result.kind).toBe('ambiguous');
    expect(result.options).toEqual(expect.arrayContaining(['todo', 'note']));
    expect(result.confidences?.todo).toBeGreaterThanOrEqual(0.7);
    expect(result.confidences?.note).toBeGreaterThanOrEqual(0.7);
    expect(
      Math.abs((result.confidences?.todo || 0) - (result.confidences?.note || 0)),
    ).toBeLessThan(0.2);
    expect(result.showDisambiguationToast).toBe(true);
  });

  it('still prefers explicit todo for "Set a reminder ..."', () => {
    const result = detectIntent('Set a reminder to pay rent');
    expect(result.kind).toBe('todo');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('still prefers explicit note for "Make a note ..."', () => {
    const result = detectIntent('Make a note about Q4 planning');
    expect(result.kind).toBe('note');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });
});
