/**
 * Mascot State Machine (Phase 10.6)
 *
 * Finite state machine for mascot emotional states with auto-timeouts
 * and transitions based on chat events.
 */

import type { ChatEvent } from '../../lib/chat/events';

// Mascot states
export type MascotState = 'idle' | 'thinking' | 'replying' | 'playful' | 'celebrate' | 'error';

// Internal machine state
interface MascotMachineState {
  current: MascotState;
  lastTransition: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

// State transition action
export interface MascotAction {
  type: 'CHAT_EVENT' | 'TIMEOUT';
  event?: ChatEvent;
}

// State machine configuration
const STATE_TIMEOUTS: Record<MascotState, number | null> = {
  idle: null, // No timeout - stable state
  thinking: null, // No timeout - wait for response
  replying: 1200, // 1.2s auto-timeout to idle
  playful: 2500, // 2.5s auto-timeout to idle
  celebrate: 1800, // 1.8s auto-timeout to idle
  error: 3000, // 3s auto-timeout to idle
};

// State transition logic
function getNextState(current: MascotState, action: MascotAction): MascotState {
  if (action.type === 'TIMEOUT') {
    // All timeouts go back to idle
    return 'idle';
  }

  if (action.type === 'CHAT_EVENT' && action.event) {
    const { event } = action;

    switch (event.type) {
      case 'request_started':
        return 'thinking';

      case 'response_stream_start':
        return current === 'thinking' ? 'replying' : current;

      case 'response_final':
        // Determine final state based on response characteristics
        if (current === 'thinking') {
          // Check if this is small-talk (playful) or has actions/suggestions
          if (event.payload.assistantKind === 'smalltalk') {
            return 'playful';
          }
          return 'replying';
        }
        return current;

      case 'overlay_success':
        return 'celebrate';

      case 'error':
        return 'error';

      case 'user_message_sent':
      case 'suggestions_shown':
      case 'overlay_opened':
      case 'overlay_cancel':
        // These events don't directly change mascot state
        return current;

      default:
        return current;
    }
  }

  return current;
}

// Mascot machine controller
export class MascotMachine {
  private state: MascotMachineState;
  private listeners: Set<(state: MascotState) => void> = new Set();

  constructor(initialState: MascotState = 'idle') {
    this.state = {
      current: initialState,
      lastTransition: Date.now(),
    };
  }

  getState(): MascotState {
    return this.state.current;
  }

  dispatch(action: MascotAction): void {
    const nextState = getNextState(this.state.current, action);

    if (nextState !== this.state.current) {
      this.transition(nextState);
    }
  }

  private transition(newState: MascotState): void {
    const previousState = this.state.current;

    // Clear any existing timeout
    if (this.state.timeoutId) {
      clearTimeout(this.state.timeoutId);
    }

    // Update state
    this.state = {
      current: newState,
      lastTransition: Date.now(),
    };

    // Set auto-timeout if needed
    const timeout = STATE_TIMEOUTS[newState];
    if (timeout !== null) {
      this.state.timeoutId = setTimeout(() => {
        this.dispatch({ type: 'TIMEOUT' });
      }, timeout);
    }

    // Notify listeners
    this.listeners.forEach((listener) => {
      try {
        listener(newState);
      } catch (error) {
        console.error('[MascotMachine] Listener error:', error);
      }
    });

    // Debug logging if enabled
    if (__DEV__) {
      console.log(`[MascotMachine] ${previousState} → ${newState}`);
    }
  }

  subscribe(listener: (state: MascotState) => void): () => void {
    this.listeners.add(listener);

    // Immediately call with current state
    listener(this.state.current);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  unsubscribe(listener: (state: MascotState) => void): void {
    this.listeners.delete(listener);
  }

  // Cleanup method
  destroy(): void {
    if (this.state.timeoutId) {
      clearTimeout(this.state.timeoutId);
    }
    this.listeners.clear();
  }

  // Development utilities
  getStateInfo() {
    return {
      current: this.state.current,
      lastTransition: this.state.lastTransition,
      hasTimeout: this.state.timeoutId !== undefined,
      listenerCount: this.listeners.size,
    };
  }
}

// Factory function for creating mascot controller
export function createMascotController(initialState?: MascotState): MascotMachine {
  return new MascotMachine(initialState);
}

// Helper to determine if mascot should be visible for given lane
export function shouldShowMascot(lane?: string): boolean {
  return lane === 'space_chat';
}

// Export state timeout configuration for testing
export { STATE_TIMEOUTS };
