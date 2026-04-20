/**
 * Tests for withTimeout helper from dropPhases.ts.
 *
 * Covers: fast promise wins over timer, slow promise returns fallback,
 * and edge cases like zero timeout.
 */

import { withTimeout } from '../dropPhases';

describe('withTimeout', () => {
  it('returns the promise result when it resolves before timeout', async () => {
    const fast = Promise.resolve('fast-result');
    const result = await withTimeout(fast, 5000, 'fallback');
    expect(result).toBe('fast-result');
  });

  it('returns the fallback when promise is slower than timeout', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('slow'), 5000));
    const result = await withTimeout(slow, 10, 'fallback');
    expect(result).toBe('fallback');
  });

  it('returns the fallback for a zero ms timeout', async () => {
    // 0ms timeout effectively means the timer fires on the next tick
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('done'), 100));
    const result = await withTimeout(slow, 0, 'default');
    expect(result).toBe('default');
  });

  it('works with non-string fallback types', async () => {
    const slow = new Promise<{ ok: boolean }>(() => {});
    const result = await withTimeout(slow, 10, { ok: false });
    expect(result).toEqual({ ok: false });
  });

  it('does not throw when the promise rejects after timeout', async () => {
    const failing = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('late failure')), 100),
    );
    // withTimeout should return fallback before the rejection happens
    const result = await withTimeout(failing, 10, 'safe');
    expect(result).toBe('safe');
  });

  it('propagates rejection if it happens before timeout', async () => {
    const instant = Promise.reject(new Error('immediate failure'));
    await expect(withTimeout(instant, 5000, 'fallback')).rejects.toThrow('immediate failure');
  });
});
