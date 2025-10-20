/**
 * EventBus - Phase 9: Today v2
 * Lightweight pub/sub for syncing UI state across components
 */

export type EventMap = {
  ItemSaved: { id: string };
  ItemCompleted: { id: string; type: 'habit' | 'todo' };
  ItemUpdated: { id: string };
};

type Handler<T> = (payload: T) => void;

class EventBus {
  private handlers = new Map<keyof EventMap, Set<Handler<any>>>();

  on<K extends keyof EventMap>(evt: K, cb: Handler<EventMap[K]>): () => void {
    if (!this.handlers.has(evt)) {
      this.handlers.set(evt, new Set());
    }
    this.handlers.get(evt)!.add(cb as any);

    // Return unsubscribe function
    return () => this.off(evt, cb);
  }

  off<K extends keyof EventMap>(evt: K, cb: Handler<EventMap[K]>): void {
    this.handlers.get(evt)?.delete(cb as any);
  }

  emit<K extends keyof EventMap>(evt: K, payload: EventMap[K]): void {
    this.handlers.get(evt)?.forEach((h) => h(payload));
  }

  // Clear all handlers (useful for tests)
  clear(): void {
    this.handlers.clear();
  }
}

export const eventBus = new EventBus();
