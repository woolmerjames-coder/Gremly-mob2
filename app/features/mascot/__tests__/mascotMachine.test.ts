/**
 * Phase 10.6: Mascot State Machine Tests
 * Tests for finite state machine transitions and timeout behaviors
 */

import { MascotMachine, STATE_TIMEOUTS, MascotAction } from '../mascotMachine';
import type { ChatEvent } from '../../../lib/chat/events';

describe('MascotMachine', () => {
  let machine: MascotMachine;

  beforeEach(() => {
    jest.useFakeTimers();
    machine = new MascotMachine();
  });

  afterEach(() => {
    jest.useRealTimers();
    machine.destroy();
  });

  describe('Initial State', () => {
    it('should start in idle state', () => {
      expect(machine.getState()).toBe('idle');
    });

    it('should emit initial state to subscribers', () => {
      const mockCallback = jest.fn();
      machine.subscribe(mockCallback);
      expect(mockCallback).toHaveBeenCalledWith('idle');
    });
  });

  describe('State Transitions', () => {
    it('should transition from idle to thinking on request_started', () => {
      const event: ChatEvent = {
        type: 'request_started',
        payload: { requestId: 'test-123', lane: 'space_chat' },
      };

      machine.dispatch({ type: 'CHAT_EVENT', event });
      expect(machine.getState()).toBe('thinking');
    });

    it('should transition from thinking to replying on response_stream_start', () => {
      // Setup: Start with thinking state
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'request_started',
          payload: { requestId: 'test-123', lane: 'space_chat' },
        },
      });

      // Action: Stream starts
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'response_stream_start',
          payload: { requestId: 'test-123' },
        },
      });

      expect(machine.getState()).toBe('replying');
    });

    it('should transition to playful on smalltalk response_final', () => {
      // Setup: Start with thinking state
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'request_started',
          payload: { requestId: 'test-123', lane: 'space_chat' },
        },
      });

      // Action: Smalltalk response
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'response_final',
          payload: {
            requestId: 'test-123',
            assistantKind: 'smalltalk',
            hasActions: false,
            hasSuggestions: false,
          },
        },
      });

      expect(machine.getState()).toBe('playful');
    });

    it('should transition to replying on normal response_final', () => {
      // Setup: Start with thinking state
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'request_started',
          payload: { requestId: 'test-123', lane: 'space_chat' },
        },
      });

      // Action: Normal response
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'response_final',
          payload: {
            requestId: 'test-123',
            assistantKind: 'assistant',
            hasActions: true,
            hasSuggestions: false,
          },
        },
      });

      expect(machine.getState()).toBe('replying');
    });

    it('should transition to celebrate on overlay_success', () => {
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'overlay_success',
          payload: { type: 'note' },
        },
      });

      expect(machine.getState()).toBe('celebrate');
    });

    it('should transition to error on error event', () => {
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'error',
          payload: { error: new Error('Test error') },
        },
      });

      expect(machine.getState()).toBe('error');
    });
  });

  describe('State Timeouts', () => {
    it('should auto-timeout from replying to idle', () => {
      const mockCallback = jest.fn();
      machine.subscribe(mockCallback);

      // Setup: Get to replying state
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'request_started',
          payload: { requestId: 'test-123', lane: 'space_chat' },
        },
      });
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'response_stream_start',
          payload: { requestId: 'test-123' },
        },
      });

      expect(machine.getState()).toBe('replying');

      // Fast-forward time
      const replyingTimeout = STATE_TIMEOUTS.replying;
      if (replyingTimeout !== null) {
        jest.advanceTimersByTime(replyingTimeout + 100);
      }

      expect(machine.getState()).toBe('idle');
      expect(mockCallback).toHaveBeenLastCalledWith('idle');
    });

    it('should auto-timeout from playful to idle', () => {
      // Setup: Get to playful state
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'request_started',
          payload: { requestId: 'test-123', lane: 'space_chat' },
        },
      });
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'response_final',
          payload: {
            requestId: 'test-123',
            assistantKind: 'smalltalk',
            hasActions: false,
            hasSuggestions: false,
          },
        },
      });

      expect(machine.getState()).toBe('playful');

      // Fast-forward time
      const playfulTimeout = STATE_TIMEOUTS.playful;
      if (playfulTimeout !== null) {
        jest.advanceTimersByTime(playfulTimeout + 100);
      }

      expect(machine.getState()).toBe('idle');
    });

    it('should clear existing timeout when state changes', () => {
      const mockCallback = jest.fn();
      machine.subscribe(mockCallback);

      // Start thinking
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'request_started',
          payload: { requestId: 'test-123', lane: 'space_chat' },
        },
      });

      // Change state manually (should clear timeout)
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'error',
          payload: { error: new Error('Test error') },
        },
      });

      expect(machine.getState()).toBe('error');

      // Advance time to verify thinking timeout was cleared
      const errorTimeout = STATE_TIMEOUTS.error;
      if (errorTimeout !== null) {
        jest.advanceTimersByTime(errorTimeout + 100);
      }

      expect(machine.getState()).toBe('idle');
    });
  });

  describe('Event Handling Edge Cases', () => {
    it('should ignore invalid state transitions', () => {
      // Try to transition from idle to replying (invalid)
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'response_stream_start',
          payload: { requestId: 'test-123' },
        },
      });

      expect(machine.getState()).toBe('idle');
    });

    it('should handle multiple subscribers', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      machine.subscribe(callback1);
      machine.subscribe(callback2);

      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'request_started',
          payload: { requestId: 'test-123', lane: 'space_chat' },
        },
      });

      expect(callback1).toHaveBeenCalledWith('thinking');
      expect(callback2).toHaveBeenCalledWith('thinking');
    });

    it('should handle unsubscribe', () => {
      const callback = jest.fn();
      const unsubscribe = machine.subscribe(callback);

      unsubscribe();

      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'request_started',
          payload: { requestId: 'test-123', lane: 'space_chat' },
        },
      });

      // Should only be called once for initial state
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Memory Management', () => {
    it('should clean up timers on destroy', () => {
      // Start a timeout
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'overlay_success',
          payload: { type: 'note' },
        },
      });

      expect(machine.getState()).toBe('celebrate');

      // Destroy machine
      machine.destroy();

      // Timer should be cleared, advance time to verify
      const celebrateTimeout = STATE_TIMEOUTS.celebrate;
      if (celebrateTimeout !== null) {
        jest.advanceTimersByTime(celebrateTimeout + 100);
      }

      // State should remain celebrate since destroy cleared the timeout
      expect(machine.getState()).toBe('celebrate');
    });

    it('should clear all subscribers on destroy', () => {
      const callback = jest.fn();
      machine.subscribe(callback);

      machine.destroy();

      // Should not crash or call callback after destroy
      machine.dispatch({
        type: 'CHAT_EVENT',
        event: {
          type: 'request_started',
          payload: { requestId: 'test-123', lane: 'space_chat' },
        },
      });

      // Should only have been called once for initial state
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
