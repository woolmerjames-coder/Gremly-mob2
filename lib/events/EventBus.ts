/**
 * EventBus - Phase 9: Today v2
 * Lightweight pub/sub for syncing UI state across components
 * Step 5: Added analytics events
 */

import type { ClassificationResult } from '../cortex/CortexClient';

export type EventMap = {
  ItemSaved: { id: string };
  ItemCompleted: { id: string; type: 'habit' | 'todo' };
  ItemUpdated: { id: string };
  ItemDeleted: { id: string; type: 'habit' | 'todo' | 'note' };
  FocusCardChanged: {
    entry_id: string | null;
    entry_type: 'todo' | 'habit' | 'note' | null;
    source: 'auto' | 'user' | 'carry_forward';
  };
  FocusCardCleared: Record<string, never>;
  // Analytics events
  TodayViewOpened: { hourBlock: string };
  TodayCompleteHabit: { habitId: string; streakAfter: number };
  TodayCompleteTodo: { todoId: string; overdue: boolean };
  TodayUndoCompletion: { entityType: 'habit' | 'todo' };
  TodaySuggestionAccept: { suggestionId: string; type: string };
  TagFilterApplied: { tagCount: number };
  CommitmentsChanged: Record<string, never>;
  // Overlay funnel / UX telemetry
  OverlayOpened: { mode: 'create' | 'edit'; baseType: string | null };
  OverlayTypeChanged: { from: string; to: string };
  OverlayTypeConverted: {
    from: string;
    to: string;
    oldId: string;
    newId: string;
    dropId: string | null;
  };
  OverlayCommitmentToggled: { on: boolean };
  OverlaySaved: { id: string; type?: string };
  // Cortex classification events (Phase 10)
  'cortex:classified': { itemId: string; classification: ClassificationResult };
  'cortex:failed': { itemId: string; error: string };
};

type Handler<T> = (payload: T) => void;

class EventBus {
  private handlers = new Map<keyof EventMap, Set<Handler<EventMap[keyof EventMap]>>>();

  on<K extends keyof EventMap>(evt: K, cb: Handler<EventMap[K]>): () => void {
    if (!this.handlers.has(evt)) {
      this.handlers.set(evt, new Set());
    }
    const set = this.handlers.get(evt) as Set<Handler<EventMap[K]>>;
    set.add(cb);

    // Return unsubscribe function
    return () => this.off(evt, cb);
  }

  off<K extends keyof EventMap>(evt: K, cb: Handler<EventMap[K]>): void {
    const set = this.handlers.get(evt) as Set<Handler<EventMap[K]>> | undefined;
    set?.delete(cb);
  }

  emit<K extends keyof EventMap>(evt: K, payload: EventMap[K]): void {
    const set = this.handlers.get(evt) as Set<Handler<EventMap[K]>> | undefined;
    set?.forEach((handler) => handler(payload));
  }

  // Clear all handlers (useful for tests)
  clear(): void {
    this.handlers.clear();
  }
}

export const eventBus = new EventBus();
