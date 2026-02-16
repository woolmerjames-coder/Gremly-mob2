import { reconcileCalendarEvents, hasExternalEventChanged } from '../calendarSync';
import type { CalendarEvent } from '../CalendarClient';
import type { Note } from '../../types';

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers — timezone-aware fixtures
// ═══════════════════════════════════════════════════════════════════════════════

/** Convert an ISO string to local HH:mm (matches extractTime in calendarSync) */
function localHHmm(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}

const START_ISO = '2026-03-10T10:00:00.000Z';
const END_ISO = '2026-03-10T10:30:00.000Z';
const LOCAL_START_TIME = localHHmm(START_ISO);
const LOCAL_END_TIME = localHHmm(END_ISO);

function mkExternalEvent(overrides?: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'ext-1',
    provider: 'google',
    providerEventId: 'google-evt-1',
    title: 'Team Standup',
    startAt: START_ISO,
    endAt: END_ISO,
    isAllDay: false,
    location: null,
    ...overrides,
  };
}

function mkNote(externalId: string, overrides?: Partial<Note>): Note {
  return {
    id: `note-${externalId}`,
    type: 'note',
    subtype: 'event',
    owner_id: 'user-1',
    title: 'Team Standup',
    target_date: '2026-03-10',
    end_date: null,
    event_time: LOCAL_START_TIME,
    end_time: LOCAL_END_TIME,
    is_all_day: false,
    location: null,
    body: '',
    tags: [],
    tags_meta: null,
    views: null,
    labels: null,
    ai_placed: false,
    space_id: null,
    is_pinned: false,
    is_favorite: false,
    linked_event_id: null,
    reminder_preferences: null,
    notification_ids: null,
    user_edited_fields: null,
    external_source: {
      provider: 'google_calendar',
      externalId,
      calendarId: 'google',
      lastSyncedAt: '2026-03-09T00:00:00.000Z',
      etag: null,
    },
    ...overrides,
  } as Note;
}

// ═══════════════════════════════════════════════════════════════════════════════
// hasExternalEventChanged
// ═══════════════════════════════════════════════════════════════════════════════

describe('hasExternalEventChanged', () => {
  const baseNote = mkNote('google-evt-1');
  const baseEvent = mkExternalEvent();

  it('returns false when nothing changed', () => {
    expect(hasExternalEventChanged(baseNote, baseEvent)).toBe(false);
  });

  it('returns true when title changed', () => {
    const event = mkExternalEvent({ title: 'Sprint Planning' });
    expect(hasExternalEventChanged(baseNote, event)).toBe(true);
  });

  it('returns true when date changed', () => {
    const event = mkExternalEvent({ startAt: '2026-03-11T10:00:00.000Z' });
    expect(hasExternalEventChanged(baseNote, event)).toBe(true);
  });

  it('returns true when time changed', () => {
    const event = mkExternalEvent({ startAt: '2026-03-10T11:00:00.000Z' });
    expect(hasExternalEventChanged(baseNote, event)).toBe(true);
  });

  it('returns true when end_time changed', () => {
    const event = mkExternalEvent({ endAt: '2026-03-10T12:00:00.000Z' });
    expect(hasExternalEventChanged(baseNote, event)).toBe(true);
  });

  it('returns true when location changed', () => {
    const event = mkExternalEvent({ location: 'Room 42' });
    expect(hasExternalEventChanged(baseNote, event)).toBe(true);
  });

  it('returns true when is_all_day changed', () => {
    const event = mkExternalEvent({
      isAllDay: true,
      startAt: '2026-03-10T00:00:00.000Z',
      endAt: '2026-03-11T00:00:00.000Z',
    });
    expect(hasExternalEventChanged(baseNote, event)).toBe(true);
  });

  it('detects end_date change for multi-day events', () => {
    const note = mkNote('google-evt-1', { end_date: null });
    const event = mkExternalEvent({
      startAt: '2026-03-10T10:00:00.000Z',
      endAt: '2026-03-12T10:30:00.000Z', // different day
    });
    expect(hasExternalEventChanged(note, event)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// reconcileCalendarEvents
// ═══════════════════════════════════════════════════════════════════════════════

describe('reconcileCalendarEvents', () => {
  it('creates new notes for external events not yet in Gremly', () => {
    const events = [mkExternalEvent()];
    const result = reconcileCalendarEvents(events, [], 'user-1');

    expect(result.creates).toHaveLength(1);
    expect(result.creates[0].title).toBe('Team Standup');
    expect(result.creates[0].type).toBe('note');
    expect(result.creates[0].subtype).toBe('event');
    expect(result.updates).toHaveLength(0);
    expect(result.softDeletes).toHaveLength(0);
    expect(result.unchanged).toBe(0);
  });

  it('marks unchanged when existing note matches external event', () => {
    const events = [mkExternalEvent()];
    const notes = [mkNote('google-evt-1')];
    const result = reconcileCalendarEvents(events, notes, 'user-1');

    expect(result.creates).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
    expect(result.softDeletes).toHaveLength(0);
    expect(result.unchanged).toBe(1);
  });

  it('updates when external event title has changed', () => {
    const events = [mkExternalEvent({ title: 'Sprint Planning' })];
    const notes = [mkNote('google-evt-1')];
    const result = reconcileCalendarEvents(events, notes, 'user-1');

    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].id).toBe('note-google-evt-1');
    expect(result.updates[0].patch.title).toBe('Sprint Planning');
    expect(result.creates).toHaveLength(0);
    expect(result.softDeletes).toHaveLength(0);
  });

  it('soft deletes notes whose external event was removed', () => {
    const events: CalendarEvent[] = []; // event removed from calendar
    const notes = [mkNote('google-evt-1')];
    const result = reconcileCalendarEvents(events, notes, 'user-1');

    expect(result.softDeletes).toEqual(['note-google-evt-1']);
    expect(result.creates).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
  });

  it('skips dismissed events to prevent re-creation', () => {
    const events = [mkExternalEvent()];
    const dismissed = new Set(['google-evt-1']);
    const result = reconcileCalendarEvents(events, [], 'user-1', dismissed);

    expect(result.creates).toHaveLength(0);
    expect(result.unchanged).toBe(1);
  });

  it('handles complex multi-event scenario', () => {
    const events = [
      mkExternalEvent({ providerEventId: 'evt-A', title: 'A' }),
      mkExternalEvent({ providerEventId: 'evt-B', title: 'B (updated)' }),
      mkExternalEvent({ providerEventId: 'evt-C', title: 'C (new)' }),
    ];
    const notes = [
      mkNote('evt-A', { title: 'A', event_time: LOCAL_START_TIME, end_time: LOCAL_END_TIME }),
      mkNote('evt-B', { title: 'B', event_time: LOCAL_START_TIME, end_time: LOCAL_END_TIME }),
      mkNote('evt-D'), // evt-D removed from calendar
    ];

    const result = reconcileCalendarEvents(events, notes, 'user-1');

    expect(result.unchanged).toBe(1); // evt-A
    expect(result.updates).toHaveLength(1); // evt-B title changed
    expect(result.updates[0].id).toBe('note-evt-B');
    expect(result.creates).toHaveLength(1); // evt-C is new
    expect(result.softDeletes).toEqual(['note-evt-D']); // evt-D removed
  });

  it('ignores notes without external_source.externalId', () => {
    const events = [mkExternalEvent()];
    const notes = [
      mkNote('google-evt-1', {
        external_source: undefined,
      } as any),
    ];
    const result = reconcileCalendarEvents(events, notes, 'user-1');
    expect(result.creates).toHaveLength(1); // treated as new
  });
});
