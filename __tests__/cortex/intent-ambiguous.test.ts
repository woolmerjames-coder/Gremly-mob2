/**
 * Intent Ambiguity Tests
 * Ensures detectIntent returns an 'ambiguous' intent with options when
 * todo and note confidences are both strong and close.
 */

import { detectIntent } from '../../lib/cortex/intents/detectIntent';

describe('Intent ambiguity between todo and note', () => {
  it('prefers todo for "Remember to ..." with action-like phrasing', () => {
    // Updated: Centralized system (commit 9d254c86) classifies "Remember to X" as todo
    // This aligns with intent-classification.test.ts expectations
    const result = detectIntent('Remember to check the documentation');
    expect(result.kind).toBe('todo');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
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
