import { transformCalendarEventToNote } from '../transformCalendarEvent';
import type { CalendarEvent } from '../CalendarClient';
import type { Note } from '../../types';

// ═══════════════════════════════════════════════════════════════════════════════
// Factories
// ═══════════════════════════════════════════════════════════════════════════════

function mkEvent(overrides?: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'ext-1',
    provider: 'google',
    providerEventId: 'google-evt-1',
    title: 'Dentist',
    startAt: '2026-03-05T14:00:00.000Z',
    endAt: '2026-03-05T15:00:00.000Z',
    isAllDay: false,
    location: '123 Main St',
    ...overrides,
  };
}

function mkNote(overrides?: Partial<Note>): Note {
  return {
    id: 'note-1',
    type: 'note',
    subtype: 'event',
    owner_id: 'user-1',
    title: 'Dentist',
    target_date: '2026-03-05',
    end_date: null,
    event_time: '14:00',
    end_time: '15:00',
    is_all_day: false,
    location: '123 Main St',
    body: 'Remember to bring insurance card',
    tags: ['health'],
    tags_meta: null,
    views: null,
    labels: null,
    ai_placed: false,
    space_id: 'space-health',
    is_pinned: true,
    is_favorite: false,
    linked_event_id: 'linked-todo-1',
    reminder_preferences: { minutesBefore: 30 },
    notification_ids: ['notif-1'],
    user_edited_fields: null,
    external_source: {
      provider: 'google_calendar',
      externalId: 'google-evt-1',
      calendarId: 'google',
      lastSyncedAt: '2026-03-04T00:00:00.000Z',
      etag: null,
    },
    ...overrides,
  } as Note;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Create path (no existingNote)
// ═══════════════════════════════════════════════════════════════════════════════

describe('transformCalendarEventToNote — create', () => {
  it('returns correct note shape for a timed event', () => {
    const result = transformCalendarEventToNote(mkEvent(), 'user-1');

    expect(result.type).toBe('note');
    expect(result.subtype).toBe('event');
    expect(result.owner_id).toBe('user-1');
    expect(result.ai_placed).toBe(false);
    expect(result.title).toBe('Dentist');
    expect(result.target_date).toBe('2026-03-05');
    expect(result.location).toBe('123 Main St');
    expect(result.is_all_day).toBe(false);
    // event_time derived from startAt
    expect(result.event_time).toMatch(/^\d{2}:\d{2}$/);
    expect(result.end_time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('sets event_time to null for all-day events', () => {
    const result = transformCalendarEventToNote(
      mkEvent({
        isAllDay: true,
        startAt: '2026-03-05T00:00:00.000Z',
        endAt: '2026-03-06T00:00:00.000Z',
      }),
      'user-1',
    );

    expect(result.event_time).toBeNull();
    expect(result.end_time).toBeNull();
    expect(result.is_all_day).toBe(true);
  });

  it('sets end_date for multi-day events', () => {
    const result = transformCalendarEventToNote(
      mkEvent({
        startAt: '2026-03-05T14:00:00.000Z',
        endAt: '2026-03-07T10:00:00.000Z', // different day
      }),
      'user-1',
    );

    expect(result.target_date).toBe('2026-03-05');
    expect(result.end_date).toBe('2026-03-07');
  });

  it('sets end_date to null for same-day events', () => {
    const result = transformCalendarEventToNote(mkEvent(), 'user-1');
    expect(result.end_date).toBeNull();
  });

  it('maps provider "google" → "google_calendar"', () => {
    const result = transformCalendarEventToNote(mkEvent({ provider: 'google' }), 'user-1');
    expect(result.external_source?.provider).toBe('google_calendar');
  });

  it('maps provider "outlook" → "outlook"', () => {
    const result = transformCalendarEventToNote(mkEvent({ provider: 'outlook' }), 'user-1');
    expect(result.external_source?.provider).toBe('outlook');
  });

  it('maps provider "ics" → "ics"', () => {
    const result = transformCalendarEventToNote(mkEvent({ provider: 'ics' }), 'user-1');
    expect(result.external_source?.provider).toBe('ics');
  });

  it('includes external_source with correct externalId and lastSyncedAt', () => {
    const result = transformCalendarEventToNote(mkEvent(), 'user-1');

    expect(result.external_source?.externalId).toBe('google-evt-1');
    expect(result.external_source?.calendarId).toBe('google');
    // lastSyncedAt should be a valid ISO timestamp (close to now)
    expect(typeof result.external_source?.lastSyncedAt).toBe('string');
    expect(new Date(result.external_source!.lastSyncedAt!).getTime()).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Update path (existingNote provided)
// ═══════════════════════════════════════════════════════════════════════════════

describe('transformCalendarEventToNote — update', () => {
  it('preserves Gremly-enriched fields on update', () => {
    const existing = mkNote();
    const event = mkEvent({ title: 'Dentist (Rescheduled)' });
    const result = transformCalendarEventToNote(event, 'user-1', existing);

    // Calendar field updated
    expect(result.title).toBe('Dentist (Rescheduled)');

    // Enriched fields preserved
    expect(result.space_id).toBe('space-health');
    expect(result.tags).toEqual(['health']);
    expect(result.body).toBe('Remember to bring insurance card');
    expect(result.is_pinned).toBe(true);
    expect(result.linked_event_id).toBe('linked-todo-1');
    expect(result.reminder_preferences).toEqual({ minutesBefore: 30 });
    expect(result.notification_ids).toEqual(['notif-1']);
  });

  it('overwrites calendar-sourced fields from external event', () => {
    const existing = mkNote();
    const event = mkEvent({
      title: 'Eye Doctor',
      startAt: '2026-04-01T09:00:00.000Z',
      endAt: '2026-04-01T10:00:00.000Z',
      location: '456 Oak Ave',
    });
    const result = transformCalendarEventToNote(event, 'user-1', existing);

    expect(result.title).toBe('Eye Doctor');
    expect(result.target_date).toBe('2026-04-01');
    expect(result.location).toBe('456 Oak Ave');
  });

  it('respects user_edited_fields for event_time', () => {
    const existing = mkNote({
      event_time: '14:30', // user manually adjusted
      end_time: '15:30',
      user_edited_fields: ['event_time'],
    });
    const event = mkEvent({
      startAt: '2026-03-05T16:00:00.000Z', // external changed to 16:00
      endAt: '2026-03-05T17:00:00.000Z',
    });

    const result = transformCalendarEventToNote(event, 'user-1', existing);

    // User-edited time preserved
    expect(result.event_time).toBe('14:30');
    expect(result.end_time).toBe('15:30');
    // Other calendar fields still updated
    expect(result.title).toBe('Dentist');
  });
});
