/**
 * useMascotStore.test.ts
 *
 * Unit tests for the mascot Zustand state machine.
 * Tests the store directly (no React rendering required).
 */

import { act } from '@testing-library/react-native';
import { useMascotStore } from '../../../lib/store/useMascotStore';

/** Convenience getter */
const getState = () => useMascotStore.getState();

beforeEach(() => {
  jest.useFakeTimers();
  act(() => {
    useMascotStore.getState().reset();
  });
});

afterEach(() => {
  jest.useRealTimers();
});

// ── requestMode ────────────────────────────────────────────────────────────

describe('requestMode', () => {
  it('initialises to idle', () => {
    expect(getState().current).toBe('idle');
  });

  it('transitions from a looping mode to a one-shot', () => {
    act(() => {
      getState().requestMode('drop');
    });
    expect(getState().current).toBe('drop');
  });

  it('is a no-op when requesting the already-active mode', () => {
    const tokenBefore = getState().finishToken;
    act(() => {
      getState().requestMode('idle');
    });
    expect(getState().finishToken).toBe(tokenBefore);
    expect(getState().current).toBe('idle');
  });

  it('queues when current one-shot cannot be preempted', () => {
    act(() => {
      getState().requestMode('drop');
    });
    act(() => {
      getState().requestMode('waving');
    });

    expect(getState().current).toBe('drop');
    expect(getState().queued).toBe('waving');
  });

  it('only keeps the last queued request (last-request-wins)', () => {
    act(() => {
      getState().requestMode('drop');
    });
    act(() => {
      getState().requestMode('waving');
    });
    act(() => {
      getState().requestMode('fed');
    });

    expect(getState().queued).toBe('fed');
  });

  it('force:true bypasses the preempt matrix', () => {
    act(() => {
      getState().requestMode('wakingUp');
    }); // from idle (allowed)
    act(() => {
      getState().requestMode('drop');
    }); // wakingUp blocks everything...
    expect(getState().current).toBe('wakingUp');

    act(() => {
      getState().requestMode('idle', { force: true });
    });
    expect(getState().current).toBe('idle');
  });

  it('allows fallingAsleep to be preempted by wakingUp', () => {
    act(() => {
      getState().requestMode('fallingAsleep');
    });
    act(() => {
      getState().requestMode('wakingUp');
    });
    expect(getState().current).toBe('wakingUp');
  });

  it('clears pending sequence when preempting', () => {
    // Build a sequence then preempt it
    act(() => {
      getState().requestSequence([
        { type: 'mode', mode: 'waving' },
        { type: 'mode', mode: 'drop' },
      ]);
    });
    expect(getState().pendingSequence).toHaveLength(1);

    act(() => {
      getState().requestMode('idle', { force: true });
    });
    expect(getState().pendingSequence).toHaveLength(0);
  });

  it('schedules a safety timer for one-shot modes', () => {
    act(() => {
      getState().requestMode('drop');
    });

    // Safety timer is MAX_DURATION_MS.drop = 1500ms
    expect(getState().current).toBe('drop');
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(getState().current).toBe('idle');
  });

  it('does not schedule a safety timer for looping modes', () => {
    act(() => {
      getState().requestMode('sleeping', { force: true });
    });
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    // Still sleeping — no safety timer fired
    expect(getState().current).toBe('sleeping');
  });
});

// ── signalAnimationFinish ──────────────────────────────────────────────────

describe('signalAnimationFinish', () => {
  it('auto-returns to idle for most one-shots', () => {
    act(() => {
      getState().requestMode('drop');
    });
    act(() => {
      getState().signalAnimationFinish('drop');
    });
    expect(getState().current).toBe('idle');
  });

  it('fallingAsleep auto-returns to sleeping', () => {
    act(() => {
      getState().requestMode('fallingAsleep');
    });
    act(() => {
      getState().signalAnimationFinish('fallingAsleep');
    });
    expect(getState().current).toBe('sleeping');
  });

  it('is a no-op when mode does not match current', () => {
    act(() => {
      getState().requestMode('drop');
    });
    const tokenBefore = getState().finishToken;
    act(() => {
      getState().signalAnimationFinish('waving');
    }); // stale
    expect(getState().finishToken).toBe(tokenBefore);
    expect(getState().current).toBe('drop');
  });

  it('plays queued mode after finish instead of returning to idle', () => {
    act(() => {
      getState().requestMode('drop');
    });
    act(() => {
      getState().requestMode('waving');
    }); // queued
    act(() => {
      getState().signalAnimationFinish('drop');
    });

    expect(getState().current).toBe('waving');
    expect(getState().queued).toBeNull();
  });

  it('queued mode itself gets a safety timer', () => {
    act(() => {
      getState().requestMode('drop');
    });
    act(() => {
      getState().requestMode('waving');
    }); // queued
    act(() => {
      getState().signalAnimationFinish('drop');
    });

    // waving's safety timer = 5500ms
    expect(getState().current).toBe('waving');
    act(() => {
      jest.advanceTimersByTime(5500);
    });
    expect(getState().current).toBe('idle');
  });
});

// ── requestSequence ────────────────────────────────────────────────────────

describe('requestSequence', () => {
  it('plays the first step immediately and stores remaining steps', () => {
    act(() => {
      getState().requestSequence([
        { type: 'mode', mode: 'drop' },
        { type: 'mode', mode: 'waving' },
      ]);
    });

    expect(getState().current).toBe('drop');
    expect(getState().pendingSequence).toHaveLength(1);
  });

  it('advances to next step after signalAnimationFinish', () => {
    act(() => {
      getState().requestSequence([
        { type: 'mode', mode: 'drop' },
        { type: 'mode', mode: 'fed' },
      ]);
    });

    act(() => {
      getState().signalAnimationFinish('drop');
    });
    expect(getState().current).toBe('fed');
  });

  it('returns to idle after last sequence step finishes', () => {
    act(() => {
      getState().requestSequence([{ type: 'mode', mode: 'drop' }]);
    });

    act(() => {
      getState().signalAnimationFinish('drop');
    });
    expect(getState().current).toBe('idle');
    expect(getState().pendingSequence).toHaveLength(0);
  });

  it('honours a pause step between modes', () => {
    act(() => {
      getState().requestSequence([
        { type: 'mode', mode: 'drop' },
        { type: 'pause', ms: 500 },
        { type: 'mode', mode: 'waving' },
      ]);
    });

    act(() => {
      getState().signalAnimationFinish('drop');
    });
    // After drop finishes, a 500ms pause should be scheduled — still idle or drop
    expect(getState().current).not.toBe('waving');

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(getState().current).toBe('waving');
  });

  it('is a no-op for an empty steps array', () => {
    const tokenBefore = getState().finishToken;
    act(() => {
      getState().requestSequence([]);
    });
    expect(getState().finishToken).toBe(tokenBefore);
    expect(getState().current).toBe('idle');
  });
});

// ── reset ──────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('returns store to initial state', () => {
    act(() => {
      getState().requestMode('drop');
      getState().requestMode('waving'); // queued
    });

    act(() => {
      getState().reset();
    });

    const s = getState();
    expect(s.current).toBe('idle');
    expect(s.queued).toBeNull();
    expect(s.pendingSequence).toHaveLength(0);
    expect(s.finishToken).toBe(0);
  });

  it('cancels outstanding safety timers on reset', () => {
    act(() => {
      getState().requestMode('drop');
    });
    act(() => {
      getState().reset();
    });

    // Advance past where the safety timer would have fired
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    // State should still be idle — timer should have been cancelled
    expect(getState().current).toBe('idle');
    expect(getState().finishToken).toBe(0);
  });
});
