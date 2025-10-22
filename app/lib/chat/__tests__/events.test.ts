/**
 * Phase 10.6: Chat Events System Tests
 * Tests for event bus and emission/subscription functionality
 */

import { emitChatEvent, subscribeToChatEvents, type ChatEvent } from '../../../lib/chat/events';

describe('Chat Events System', () => {
  beforeEach(() => {
    // Clear any existing listeners
    jest.clearAllMocks();
  });

  describe('Event Emission', () => {
    it('should emit user_message_sent events', () => {
      const mockListener = jest.fn();
      subscribeToChatEvents(mockListener);

      const event: ChatEvent = {
        type: 'user_message_sent',
        payload: { text: 'Hello', spaceId: 'space-123' },
      };

      emitChatEvent(event);

      expect(mockListener).toHaveBeenCalledWith(event);
    });

    it('should emit request_started events', () => {
      const mockListener = jest.fn();
      subscribeToChatEvents(mockListener);

      const event: ChatEvent = {
        type: 'request_started',
        payload: { requestId: 'req-123', lane: 'space_chat' },
      };

      emitChatEvent(event);

      expect(mockListener).toHaveBeenCalledWith(event);
    });

    it('should emit response_final events with assistant kind', () => {
      const mockListener = jest.fn();
      subscribeToChatEvents(mockListener);

      const event: ChatEvent = {
        type: 'response_final',
        payload: {
          requestId: 'req-123',
          assistantKind: 'smalltalk',
          hasActions: false,
          hasSuggestions: true,
        },
      };

      emitChatEvent(event);

      expect(mockListener).toHaveBeenCalledWith(event);
    });

    it('should emit overlay events', () => {
      const mockListener = jest.fn();
      subscribeToChatEvents(mockListener);

      const successEvent: ChatEvent = {
        type: 'overlay_success',
        payload: { type: 'note', created: { id: 'note-123' } },
      };

      const cancelEvent: ChatEvent = {
        type: 'overlay_cancel',
        payload: { type: 'habit' },
      };

      emitChatEvent(successEvent);
      emitChatEvent(cancelEvent);

      expect(mockListener).toHaveBeenCalledWith(successEvent);
      expect(mockListener).toHaveBeenCalledWith(cancelEvent);
    });

    it('should emit error events', () => {
      const mockListener = jest.fn();
      subscribeToChatEvents(mockListener);

      const event: ChatEvent = {
        type: 'error',
        payload: { error: new Error('Test error'), context: 'test' },
      };

      emitChatEvent(event);

      expect(mockListener).toHaveBeenCalledWith(event);
    });
  });

  describe('Event Subscription', () => {
    it('should support multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      subscribeToChatEvents(listener1);
      subscribeToChatEvents(listener2);
      subscribeToChatEvents(listener3);

      const event: ChatEvent = {
        type: 'user_message_sent',
        payload: { text: 'Test message' },
      };

      emitChatEvent(event);

      expect(listener1).toHaveBeenCalledWith(event);
      expect(listener2).toHaveBeenCalledWith(event);
      expect(listener3).toHaveBeenCalledWith(event);
    });

    it('should return unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = subscribeToChatEvents(listener);

      const event: ChatEvent = {
        type: 'user_message_sent',
        payload: { text: 'Test message' },
      };

      // Should receive event
      emitChatEvent(event);
      expect(listener).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Should not receive further events
      emitChatEvent(event);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle listener errors gracefully', () => {
      const goodListener = jest.fn();
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });

      subscribeToChatEvents(goodListener);
      subscribeToChatEvents(errorListener);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const event: ChatEvent = {
        type: 'user_message_sent',
        payload: { text: 'Test message' },
      };

      // Should not throw, but should log error
      expect(() => emitChatEvent(event)).not.toThrow();

      expect(goodListener).toHaveBeenCalledWith(event);
      expect(errorListener).toHaveBeenCalledWith(event);

      consoleSpy.mockRestore();
    });
  });

  describe('Event Type Safety', () => {
    it('should properly type user_message_sent payload', () => {
      const listener = jest.fn((event: ChatEvent) => {
        if (event.type === 'user_message_sent') {
          // Should have proper typing
          expect(typeof event.payload.text).toBe('string');
          expect(typeof event.payload.spaceId).toBe('string');
        }
      });

      subscribeToChatEvents(listener);

      emitChatEvent({
        type: 'user_message_sent',
        payload: { text: 'Hello', spaceId: 'space-123' },
      });

      expect(listener).toHaveBeenCalled();
    });

    it('should properly type response_final payload', () => {
      const listener = jest.fn((event: ChatEvent) => {
        if (event.type === 'response_final') {
          // Should have proper typing
          expect(typeof event.payload.requestId).toBe('string');
          expect(typeof event.payload.assistantKind).toBe('string');
          expect(typeof event.payload.hasActions).toBe('boolean');
        }
      });

      subscribeToChatEvents(listener);

      emitChatEvent({
        type: 'response_final',
        payload: {
          requestId: 'req-123',
          assistantKind: 'smalltalk',
          hasActions: false,
          hasSuggestions: true,
        },
      });

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle full conversation flow', () => {
      const events: ChatEvent[] = [];
      const listener = jest.fn((event) => events.push(event));

      subscribeToChatEvents(listener);

      // User sends message
      emitChatEvent({
        type: 'user_message_sent',
        payload: { text: 'Hello', spaceId: 'space-123' },
      });

      // Request starts
      emitChatEvent({
        type: 'request_started',
        payload: { requestId: 'req-123', lane: 'space_chat' },
      });

      // Response streams
      emitChatEvent({
        type: 'response_stream_start',
        payload: { requestId: 'req-123' },
      });

      // Response completes
      emitChatEvent({
        type: 'response_final',
        payload: {
          requestId: 'req-123',
          assistantKind: 'assistant',
          hasActions: true,
          hasSuggestions: false,
        },
      });

      expect(events).toHaveLength(4);
      expect(events[0].type).toBe('user_message_sent');
      expect(events[1].type).toBe('request_started');
      expect(events[2].type).toBe('response_stream_start');
      expect(events[3].type).toBe('response_final');
    });

    it('should handle overlay interaction flow', () => {
      const events: ChatEvent[] = [];
      const listener = jest.fn((event) => events.push(event));

      subscribeToChatEvents(listener);

      // Overlay opens
      emitChatEvent({
        type: 'overlay_opened',
        payload: { type: 'note' },
      });

      // User successfully creates
      emitChatEvent({
        type: 'overlay_success',
        payload: { type: 'note', created: { id: 'note-123' } },
      });

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('overlay_opened');
      expect(events[1].type).toBe('overlay_success');
    });

    it('should handle error scenarios', () => {
      const events: ChatEvent[] = [];
      const listener = jest.fn((event) => events.push(event));

      subscribeToChatEvents(listener);

      // Request starts
      emitChatEvent({
        type: 'request_started',
        payload: { requestId: 'req-123', lane: 'space_chat' },
      });

      // Error occurs
      emitChatEvent({
        type: 'error',
        payload: { error: new Error('Network error'), context: 'request' },
      });

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('request_started');
      expect(events[1].type).toBe('error');
    });
  });
});
