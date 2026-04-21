import { create } from 'zustand';
import type { AnimationMode } from '../types';
import { canPreempt, AFTER_FINISH, MAX_DURATION_MS, isOneShot } from '../mascot/mascotMatrix';

/** A single step in a sequence: play a mode, or pause for ms before the next step. */
export type SequenceStep = { type: 'mode'; mode: AnimationMode } | { type: 'pause'; ms: number };

interface MascotState {
  /** The currently-playing animation. */
  current: AnimationMode;
  /** A mode queued to play after `current` finishes. Null if none. */
  queued: AnimationMode | null;
  /** Remaining steps of an active sequence. Empty if no sequence active. */
  pendingSequence: SequenceStep[];
  /**
   * Monotonic token incremented on every mode change. Used to guard against
   * stale safety-timer callbacks firing after a transition.
   */
  finishToken: number;

  // Actions
  requestMode: (next: AnimationMode, options?: { force?: boolean }) => void;
  requestSequence: (steps: SequenceStep[]) => void;
  signalAnimationFinish: (mode: AnimationMode) => void;
  reset: () => void;
}

// Safety timer management lives outside the store (imperative side effect).
let safetyTimerId: ReturnType<typeof setTimeout> | null = null;
let pauseTimerId: ReturnType<typeof setTimeout> | null = null;

function clearSafetyTimer() {
  if (safetyTimerId) {
    clearTimeout(safetyTimerId);
    safetyTimerId = null;
  }
}

function clearPauseTimer() {
  if (pauseTimerId) {
    clearTimeout(pauseTimerId);
    pauseTimerId = null;
  }
}

function scheduleSafetyTimer(
  mode: AnimationMode,
  token: number,
  signalFinish: (m: AnimationMode) => void,
) {
  clearSafetyTimer();
  const duration = MAX_DURATION_MS[mode];
  if (!duration) return; // Looping mode, no safety timer needed
  safetyTimerId = setTimeout(() => {
    // Only fire if still on the same token (guards against stale timers)
    const state = useMascotStore.getState();
    if (state.finishToken === token && state.current === mode) {
      signalFinish(mode);
    }
    safetyTimerId = null;
  }, duration);
}

export const useMascotStore = create<MascotState>((set, get) => ({
  current: 'idle',
  queued: null,
  pendingSequence: [],
  finishToken: 0,

  requestMode: (next, options) => {
    const state = get();

    // No-op if already on the requested mode.
    if (state.current === next && !options?.force) return;

    const force = options?.force === true;
    const allowed = force || canPreempt(state.current, next);

    if (!allowed) {
      // Current is non-interruptible and next can't preempt → queue it.
      // Overwrite any existing queued value; last request wins.
      set({ queued: next });
      return;
    }

    // Transition immediately.
    const nextToken = state.finishToken + 1;
    clearSafetyTimer();
    set({
      current: next,
      queued: null,
      finishToken: nextToken,
      // Preempting mid-sequence cancels remaining steps.
      pendingSequence: [],
    });
    clearPauseTimer();

    if (isOneShot(next)) {
      scheduleSafetyTimer(next, nextToken, get().signalAnimationFinish);
    }
  },

  requestSequence: (steps) => {
    if (steps.length === 0) return;

    // Cancel any active sequence and start fresh.
    clearPauseTimer();

    const [first, ...rest] = steps;

    if (first.type === 'pause') {
      // Starting with a pause is unusual but valid — schedule it and queue the rest.
      set({ pendingSequence: rest });
      pauseTimerId = setTimeout(() => {
        pauseTimerId = null;
        advanceSequence(get, set);
      }, first.ms);
      return;
    }

    // Play the first step, then restore the remaining steps.
    // requestMode unconditionally clears pendingSequence (to cancel sequences
    // on external preemption), so we must set it AFTER the requestMode call.
    get().requestMode(first.mode);
    set({ pendingSequence: rest });
  },

  signalAnimationFinish: (mode) => {
    const state = get();

    // Guard: only act if the finish corresponds to the currently-playing mode.
    // Stale finish callbacks (e.g. from a Lottie that was unmounted mid-play)
    // must not advance the state machine.
    if (state.current !== mode) return;

    clearSafetyTimer();

    // Priority: pending sequence > queued > auto-return.
    if (state.pendingSequence.length > 0) {
      advanceSequence(get, set);
      return;
    }

    if (state.queued) {
      const nextMode = state.queued;
      const nextToken = state.finishToken + 1;
      set({
        current: nextMode,
        queued: null,
        finishToken: nextToken,
      });
      if (isOneShot(nextMode)) {
        scheduleSafetyTimer(nextMode, nextToken, get().signalAnimationFinish);
      }
      return;
    }

    // Default auto-return.
    const returnMode = AFTER_FINISH[mode] ?? 'idle';
    const nextToken = state.finishToken + 1;
    set({
      current: returnMode,
      finishToken: nextToken,
    });
    if (isOneShot(returnMode)) {
      scheduleSafetyTimer(returnMode, nextToken, get().signalAnimationFinish);
    }
  },

  reset: () => {
    clearSafetyTimer();
    clearPauseTimer();
    set({
      current: 'idle',
      queued: null,
      pendingSequence: [],
      finishToken: 0,
    });
  },
}));

/** Internal helper: advance to the next step in pendingSequence. */
function advanceSequence(get: () => MascotState, set: (partial: Partial<MascotState>) => void) {
  const state = get();
  const [next, ...rest] = state.pendingSequence;

  if (!next) {
    // Sequence complete, auto-return to idle.
    const returnMode: AnimationMode = 'idle';
    const nextToken = state.finishToken + 1;
    set({
      current: returnMode,
      pendingSequence: [],
      finishToken: nextToken,
    });
    return;
  }

  if (next.type === 'pause') {
    set({ pendingSequence: rest });
    pauseTimerId = setTimeout(() => {
      pauseTimerId = null;
      advanceSequence(get, set);
    }, next.ms);
    return;
  }

  // Mode step: set pendingSequence to `rest` first, then advance current.
  // We bypass requestMode's matrix check here because sequences are trusted —
  // they were authored as a valid flow and the earlier preempt check already
  // cleared the old current.
  const nextToken = state.finishToken + 1;
  clearSafetyTimer();
  set({
    current: next.mode,
    queued: null,
    pendingSequence: rest,
    finishToken: nextToken,
  });
  if (isOneShot(next.mode)) {
    scheduleSafetyTimer(next.mode, nextToken, get().signalAnimationFinish);
  }
}
