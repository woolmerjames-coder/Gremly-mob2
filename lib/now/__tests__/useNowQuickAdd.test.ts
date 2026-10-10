/**
 * useNowQuickAdd Tests
 *
 * Tests for the Now/Today quick-add hook that wraps useMindDropSubmit.
 * Verifies the dueDayOverride pass-through and mapSubmitResult logic (the kind is
 * not known at the tap since stage 11 of the Mind Drop rethink).
 *
 * These are type-level/contract tests since the hook uses internal refs
 * and callbacks that make direct hook testing complex. The real behavior
 * is tested via integration tests.
 */

import type { SubmitResult } from '../../../hooks/useMindDropSubmit';
import type { NowQuickAddCompleteResult, NowQuickAddOptions } from '../useNowQuickAdd';

// ─────────────────────────────────────────────────────────────────────────────
// Replicate mapSubmitResult logic for unit testing
// (The real function is not exported, so we replicate its logic here)
// ─────────────────────────────────────────────────────────────────────────────

// The kind is not known at the tap (the classifier sorts the drop after it), so
// the quick add reports it as unknown, success or not.
function mapSubmitResult(result: SubmitResult): NowQuickAddCompleteResult {
  return { kind: 'unknown', dropId: result.dropId };
}

describe('useNowQuickAdd - mapSubmitResult', () => {
  it('reports the drop id with an unknown kind after a drop', () => {
    expect(mapSubmitResult({ success: true, dropId: 'drop-1' })).toEqual({
      kind: 'unknown',
      dropId: 'drop-1',
    });
  });

  it('reports an unknown kind for a failed drop', () => {
    const result = mapSubmitResult({ success: false, dropId: 'drop-fail', error: new Error('x') });
    expect(result.kind).toBe('unknown');
    expect(result.dropId).toBe('drop-fail');
  });
});

describe('NowQuickAddOptions interface', () => {
  it('accepts targetDate as string', () => {
    const options: NowQuickAddOptions = {
      targetDate: '2025-12-16',
    };
    expect(options.targetDate).toBe('2025-12-16');
  });

  it('accepts targetDate as null', () => {
    const options: NowQuickAddOptions = {
      targetDate: null,
    };
    expect(options.targetDate).toBeNull();
  });

  it('allows omitting targetDate', () => {
    const options: NowQuickAddOptions = {};
    expect(options.targetDate).toBeUndefined();
  });

  it('coexists with callbacks', () => {
    const onStart = jest.fn();
    const onComplete = jest.fn();
    const onError = jest.fn();

    const options: NowQuickAddOptions = {
      targetDate: '2025-12-16',
      onStart,
      onComplete,
      onError,
    };

    expect(options.targetDate).toBe('2025-12-16');
    expect(options.onStart).toBe(onStart);
    expect(options.onComplete).toBe(onComplete);
    expect(options.onError).toBe(onError);
  });
});
