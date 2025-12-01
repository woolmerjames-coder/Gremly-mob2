/**
 * Phase 10.9: Celebration Event Bus
 *
 * Centralized bus for celebration-worthy events that trigger
 * dopamine feedback (confetti, micro toasts, haptics, mascot celebrations).
 */

import { subscribeToChatEvents, type ChatEvent } from '../../lib/chat/events';

export type CelebrationEvent =
  | { type: 'item_created'; payload: { itemType: 'todo' | 'note' | 'habit'; origin: string } }
  | { type: 'habit_checkin'; payload: { habitId: string; streakCount?: number } }
  | { type: 'todo_completed'; payload: { todoId: string; isFirstToday?: boolean } }
  | { type: 'summary_refreshed'; payload: { spaceId: string } }
  | { type: 'overlay_success'; payload: { type: string; created?: any } };

export type CelebrationEventListener = (event: CelebrationEvent) => void;

class CelebrationEventBus {
  private listeners: Set<CelebrationEventListener> = new Set();
  private chatUnsubscribe?: () => void;

  constructor() {
    // Subscribe to chat events and map relevant ones
    this.chatUnsubscribe = subscribeToChatEvents((chatEvent: ChatEvent) => {
      this.mapChatEvent(chatEvent);
    });
  }

  private mapChatEvent(chatEvent: ChatEvent): void {
    switch (chatEvent.type) {
      case 'item_created':
        this.emit({
          type: 'item_created',
          payload: {
            itemType: chatEvent.payload.type,
            origin: chatEvent.payload.origin,
          },
        });
        break;

      case 'habit_checkin':
        // Skip celebration if explicitly disabled (e.g., on Today screen)
        if (chatEvent.payload.skipCelebration) break;
        this.emit({
          type: 'habit_checkin',
          payload: {
            habitId: chatEvent.payload.habitId,
          },
        });
        break;

      case 'todo_completed':
        // Skip celebration if explicitly disabled (e.g., on Today screen)
        if (chatEvent.payload.skipCelebration) break;
        this.emit({
          type: 'todo_completed',
          payload: {
            todoId: chatEvent.payload.todoId,
          },
        });
        break;

      case 'summary_refreshed':
        this.emit({
          type: 'summary_refreshed',
          payload: {
            spaceId: chatEvent.payload.spaceId,
          },
        });
        break;

      case 'overlay_success':
        this.emit({
          type: 'overlay_success',
          payload: chatEvent.payload,
        });
        break;
    }
  }

  subscribe(listener: CelebrationEventListener): () => void {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  unsubscribe(listener: CelebrationEventListener): void {
    this.listeners.delete(listener);
  }

  emit(event: CelebrationEvent): void {
    // Emit to all listeners
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[CelebrationBus] Listener error:', error);
      }
    });
  }

  clear(): void {
    this.listeners.clear();
    if (this.chatUnsubscribe) {
      this.chatUnsubscribe();
    }
  }

  getListenerCount(): number {
    return this.listeners.size;
  }
}

// Global singleton
const celebrationBus = new CelebrationEventBus();

// Exports
export function emitCelebrationEvent(event: CelebrationEvent): void {
  celebrationBus.emit(event);
}

export function subscribeToCelebrationEvents(listener: CelebrationEventListener): () => void {
  return celebrationBus.subscribe(listener);
}

export function unsubscribeFromCelebrationEvents(listener: CelebrationEventListener): void {
  celebrationBus.unsubscribe(listener);
}

export function clearCelebrationEvents(): void {
  celebrationBus.clear();
}
