/**
 * calendarSync.ts - Core sync reconciliation engine
 *
 * Performs a three-way diff between external calendar events and internal
 * Note entities (subtype='event') to produce creates, updates, and soft
 * deletes. This function is **pure** — it returns diff arrays without
 * touching Supabase or the Zustand store. The caller (store action) is
 * responsible for persisting the results.
 *
 * Algorithm:
 * 1. Build Maps keyed by providerEventId (external) and
 *    external_source.externalId (internal).
 * 2. Walk the external map:
 *    - externalId in internal → compare fields → update if changed
 *    - externalId not in internal → create
 * 3. Walk the internal map:
 *    - externalId not in external → soft delete (archive)
 *
 * @example
 * const diff = reconcileCalendarEvents(externalEvents, storeNotes, userId);
 * // diff.creates   → Partial<Note>[] ready for insert
 * // diff.updates   → { id, patch }[] ready for merge
 * // diff.softDeletes → string[] note IDs to archive
 * // diff.unchanged → count of untouched notes
 */

import type { CalendarEvent } from './CalendarClient';
import type { Note } from '../types';
import { transformCalendarEventToNote } from './transformCalendarEvent';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Result of a calendar sync reconciliation pass */
export interface CalendarReconcileResult {
  /** New notes to insert (external events not yet in Gremly) */
  creates: Partial<Note>[];
  /** Existing notes whose calendar-sourced fields changed */
  updates: { id: string; patch: Partial<Note> }[];
  /** Note IDs whose external event was removed from the calendar */
  softDeletes: string[];
  /** Count of notes that matched an external event with no field changes */
  unchanged: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Extract YYYY-MM-DD from an ISO timestamp */
function extractDate(iso: string): string {
  return iso.split('T')[0];
}

/** Extract HH:mm from an ISO timestamp */
function extractTime(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}

/**
 * Compares calendar-sourced fields between an existing Note and an incoming
 * CalendarEvent. Returns true if any field has changed and the note needs
 * updating.
 *
 * Checked fields:
 * - title
 * - target_date  (startAt date portion)
 * - end_date     (endAt date portion, null when same as target_date)
 * - event_time   (startAt time portion, null when all-day)
 * - is_all_day
 * - location
 *
 * @example
 * hasExternalEventChanged(existingNote, incomingEvent);
 * // => true if title, time, location, etc. differ
 */
export function hasExternalEventChanged(note: Note, event: CalendarEvent): boolean {
  const incomingDate = extractDate(event.startAt);
  const incomingEndDate = extractDate(event.endAt);
  const incomingTime = !event.isAllDay ? extractTime(event.startAt) : null;
  const expectedEndDate = incomingEndDate !== incomingDate ? incomingEndDate : null;

  if (note.title !== event.title) return true;
  if (note.target_date !== incomingDate) return true;
  if ((note.end_date ?? null) !== expectedEndDate) return true;
  if ((note.event_time ?? null) !== incomingTime) return true;
  const incomingEndTime = !event.isAllDay ? extractTime(event.endAt) : null;
  if ((note.end_time ?? null) !== incomingEndTime) return true;
  if ((note.is_all_day ?? false) !== event.isAllDay) return true;
  if ((note.location ?? null) !== (event.location ?? null)) return true;

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reconcile
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Reconciles external calendar events against existing internal Note entities.
 *
 * This function is **pure** — it performs no I/O. It returns arrays of creates,
 * updates (with patches that preserve Gremly-enriched fields), soft-delete IDs,
 * and an unchanged count. The calling store action is responsible for
 * persisting the results to Supabase and the Zustand store.
 *
 * @param externalEvents    - CalendarEvents fetched from the calendar provider
 * @param existingEventNotes - Current Note entities with subtype='event' and
 *                             a non-null external_source
 * @param ownerId           - Supabase user ID for new note creation
 * @returns A CalendarReconcileResult with creates, updates, softDeletes, unchanged
 */
export function reconcileCalendarEvents(
  externalEvents: CalendarEvent[],
  existingEventNotes: Note[],
  ownerId: string,
): CalendarReconcileResult {
  // ── 1. Build lookup Maps ──────────────────────────────────────────────────

  /** External events keyed by providerEventId */
  const externalMap = new Map<string, CalendarEvent>();
  for (const event of externalEvents) {
    externalMap.set(event.providerEventId, event);
  }

  /** Internal notes keyed by external_source.externalId */
  const internalMap = new Map<string, Note>();
  for (const note of existingEventNotes) {
    if (note.external_source?.externalId) {
      internalMap.set(note.external_source.externalId, note);
    }
  }

  // ── 2. Three-way diff ─────────────────────────────────────────────────────

  const creates: Partial<Note>[] = [];
  const updates: { id: string; patch: Partial<Note> }[] = [];
  const softDeletes: string[] = [];
  let unchanged = 0;

  // 2a. Walk external events → create or update
  for (const [externalId, event] of externalMap) {
    const existingNote = internalMap.get(externalId);

    if (existingNote) {
      // Event exists internally — check if anything changed
      if (hasExternalEventChanged(existingNote, event)) {
        const patch = transformCalendarEventToNote(event, ownerId, existingNote);
        updates.push({ id: existingNote.id, patch });
      } else {
        unchanged++;
      }
    } else {
      // New event — create
      creates.push(transformCalendarEventToNote(event, ownerId));
    }
  }

  // 2b. Walk internal notes → soft delete if external event removed
  for (const [externalId, note] of internalMap) {
    if (!externalMap.has(externalId)) {
      softDeletes.push(note.id);
    }
  }

  return { creates, updates, softDeletes, unchanged };
}
