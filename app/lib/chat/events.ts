/**
 * Chat Event Bus System (Phase 10.6)
 *
 * Provides a centralized event system for chat-related actions
 * that drive mascot state changes and other UI responses.
 */

// Chat event types for mascot state machine
export type ChatEvent =
  | { type: 'user_message_sent'; payload: { text: string; spaceId?: string } }
  | { type: 'request_started'; payload: { requestId: string; lane: string } }
  | { type: 'response_stream_start'; payload: { requestId: string } }
  | {
      type: 'response_final';
      payload: {
        requestId: string;
        assistantKind?: string;
        hasActions?: boolean;
        hasSuggestions?: boolean;
        intentDetected?: boolean; // Phase 10.7: Intent detection flag
      };
    }
  | { type: 'suggestions_shown'; payload: { count: number } }
  | { type: 'overlay_opened'; payload: { type: string } }
  | { type: 'overlay_success'; payload: { type: string; created?: any } }
  | { type: 'overlay_cancel'; payload: { type: string } }
  | { type: 'error'; payload: { error: Error; context?: string } };

// Event listener type
export type ChatEventListener = (event: ChatEvent) => void;

// Simple event registry
class ChatEventBus {
  private listeners: Set<ChatEventListener> = new Set();

  subscribe(listener: ChatEventListener): () => void {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  unsubscribe(listener: ChatEventListener): void {
    this.listeners.delete(listener);
  }

  emit(event: ChatEvent): void {
    // Emit to all listeners
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[ChatEventBus] Listener error:', error);
      }
    });
  }

  // Clear all listeners (useful for tests)
  clear(): void {
    this.listeners.clear();
  }

  // Get listener count (useful for debugging)
  getListenerCount(): number {
    return this.listeners.size;
  }
}

// Global event bus instance
const chatEventBus = new ChatEventBus();

// Main export - emit function
export function emitChatEvent(event: ChatEvent): void {
  chatEventBus.emit(event);
}

// Subscribe/unsubscribe functions
export function subscribeToChatEvents(listener: ChatEventListener): () => void {
  return chatEventBus.subscribe(listener);
}

export function unsubscribeFromChatEvents(listener: ChatEventListener): void {
  chatEventBus.unsubscribe(listener);
}

// Development/testing utilities
export const chatEventBusUtils = {
  clear: () => chatEventBus.clear(),
  getListenerCount: () => chatEventBus.getListenerCount(),

  // Direct access for testing
  _bus: chatEventBus,
};
