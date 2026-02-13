/**
 * transformCalendarEvent.ts - Bridge external calendar events to Note entities
 *
 * Transforms a CalendarEvent (from CalendarClient) into a Partial<Note> with
 * subtype='event'. On update (existingNote provided), preserves Gremly-enriched
 * fields (space, tags, reminders, etc.) and only overwrites calendar-sourced
 * fields (title, dates, times, location).
 *
 * @example
 * // Create a new note from a calendar event
 * const note = transformCalendarEventToNote(event, userId);
 * // => { type: 'note', subtype: 'event', title: 'Dentist', target_date: '2026-03-05', ... }
 *
 * @example
 * // Update an existing note (preserves space_id, tags, etc.)
 * const updated = transformCalendarEventToNote(event, userId, existingNote);
 * // => { ...existingNote enrichments, ...updated calendar fields }
 */

import type { CalendarEvent, CalendarProvider } from './CalendarClient';
import type { Note } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Extract YYYY-MM-DD from an ISO timestamp string */
function extractDate(iso: string): string {
  return iso.split('T')[0];
}

/** Extract HH:mm from an ISO timestamp string */
function extractTime(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}

/** Map CalendarProvider to the external_source provider format */
function mapProvider(provider: CalendarProvider): 'google_calendar' | 'outlook' | 'ics' {
  switch (provider) {
    case 'google':
      return 'google_calendar';
    case 'outlook':
      return 'outlook';
    case 'ics':
      return 'ics';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Transform
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transforms a CalendarEvent into a Partial<Note> with subtype='event'.
 *
 * - On **create** (no existingNote): returns all calendar-sourced fields plus
 *   sensible defaults (ai_placed: false, type: 'note', subtype: 'event').
 * - On **update** (existingNote provided): preserves Gremly-enriched fields
 *   (space_id, tags, reminder_preferences, etc.) and only overwrites the
 *   fields that come from the external calendar source.
 *
 * @param event       - The external CalendarEvent from CalendarClient
 * @param ownerId     - The Supabase user ID who owns this note
 * @param existingNote - If updating, the current Note to preserve enrichments from
 * @returns A Partial<Note> ready for upsert into the store / database
 */
export function transformCalendarEventToNote(
  event: CalendarEvent,
  ownerId: string,
  existingNote?: Note | null,
): Partial<Note> {
  const targetDate = extractDate(event.startAt);
  const endDate = extractDate(event.endAt);

  // Calendar-sourced fields (always overwritten from external source)
  const calendarFields: Partial<Note> = {
    title: event.title,
    target_date: targetDate,
    end_date: endDate !== targetDate ? endDate : null,
    event_time: !event.isAllDay ? extractTime(event.startAt) : null,
    is_all_day: event.isAllDay,
    location: event.location,
    external_source: {
      provider: mapProvider(event.provider),
      externalId: event.providerEventId,
      calendarId: event.provider,
      lastSyncedAt: new Date().toISOString(),
      etag: null,
    },
  };

  // ── Update path: preserve Gremly-enriched fields ──────────────────────────
  if (existingNote) {
    return {
      // Preserve user/AI-enriched fields
      space_id: existingNote.space_id,
      tags: existingNote.tags,
      tags_meta: existingNote.tags_meta,
      body: existingNote.body,
      linked_event_id: existingNote.linked_event_id,
      reminder_preferences: existingNote.reminder_preferences,
      notification_ids: existingNote.notification_ids,
      views: existingNote.views,
      labels: existingNote.labels,
      is_pinned: existingNote.is_pinned,
      is_favorite: existingNote.is_favorite,
      // Overwrite calendar-sourced fields
      ...calendarFields,
    };
  }

  // ── Create path: full new note shape ──────────────────────────────────────
  return {
    type: 'note',
    subtype: 'event',
    owner_id: ownerId,
    ai_placed: false,
    ...calendarFields,
  };
}
