/**
 * EventBus - Phase 9: Today v2
 * Lightweight pub/sub for syncing UI state across components
 * Step 5: Added analytics events
 */

import type { ClassificationResult } from '../cortex/CortexClient';

export type EventMap = {
  ItemSaved: { id: string; source?: string };
  ItemCompleted: { id: string; type: 'habit' | 'todo'; source?: string };
  ItemUpdated: { id: string; source?: string };
  /** @deprecated Use 'entity:deleted' instead */
  ItemDeleted: { id: string; type: 'habit' | 'todo' | 'note'; source?: string };
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
  OverlayOpened: { mode: 'create' | 'edit' | 'view'; baseType: string | null };
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
  // Entity lifecycle events (Space Chat) - source identifies origin to prevent self-handling
  'entity:created': { entity: any; type: string; spaceId?: string | null; source?: string };
  'entity:updated': { entity: any; type: string; spaceId?: string | null; source?: string };
  'entity:deleted': { id: string; type?: string; spaceId?: string | null; source?: string };
  // Phase 2 enrichment completion event
  'entity:enriched': {
    entityId: string;
    smartTitle: string;
    tags: string[];
    timeEstimate?: number | null;
    dueDate?: string | null;
    confirmationMessage?: string | null;
    frequency?: string | null;
    // Canonical frequency fields (SINGLE SOURCE OF TRUTH)
    cadence?: 'daily' | 'weekly' | 'monthly' | null;
    target_per_period?: number | null;
    hasPhotos?: boolean;
    startDate?: string | null;
    time_window?: 'morning' | 'day' | 'evening' | null;
    space_id?: string | null;
    people?: string[];
    extracted_days?: number[] | null; // Day numbers (0=Sunday, 1=Monday, ... 6=Saturday)
    mood?: string[] | null; // Multi-select moods for journal entries
    // Date Intelligence fields
    targetDate?: string | null; // When something IS or is DUE (deadline/event date)
    scheduledDate?: string | null; // When user will DO the work
    dateTypeAmbiguous?: boolean; // True if unclear which type of date
  };
  // Phase 2 streaming field update event
  'entity:field_updated': {
    entityId: string;
    field:
      | 'smart_title'
      | 'confirmation_message'
      | 'tags'
      | 'time_estimate_minutes'
      | 'extracted_date'
      | 'minddrop_stage';
    value: any;
  };
  // Daily Brief events
  DailyBriefSaved: { date: string };
  DailyBriefCleared: { date: string };
  // Notification response events
  'notification:open_flow': { type: 'morning' | 'evening' };
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
