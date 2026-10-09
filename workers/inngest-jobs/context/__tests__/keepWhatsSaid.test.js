/**
 * @jest-environment node
 *
 * Data fabric stage 4d, keep what's said: the reader reads the reminders a
 * person sets and the notes they keep on a habit, and a save that reaches the
 * server late (made offline) is read as new rather than missed. Made up
 * records only.
 */
import { habitRecord, noteRecord, reminderWords, todoRecord, changeRecord } from '../records';
import { lateReadable, loadRecords } from '../reader';
import { db } from '../db';
import { memoryDb } from './memoryDb';

jest.mock('../db', () => ({ ...jest.requireActual('../db'), db: jest.fn() }));
jest.mock('../llm', () => ({ jsonCall: jest.fn(), modelFor: jest.fn() }));

const U = 'u-1';

describe('reminders they set', () => {
  it('says when they asked to be reminded, on its day or how often', () => {
    expect(
      reminderWords([{ id: 'r1', date: '2026-11-13', time: '09:00', frequency: 'once' }]),
    ).toBe(' They set a reminder for it: Friday 2026-11-13 at 09:00.');
    expect(
      reminderWords([
        { id: 'r1', time: '07:30', frequency: 'weekdays' },
        { id: 'r2', date: '2026-11-14', time: '18:00', frequency: 'once' },
      ]),
    ).toBe(' They set reminders for it: weekdays at 07:30; Saturday 2026-11-14 at 18:00.');
    expect(reminderWords(null)).toBe('');
    expect(reminderWords([])).toBe('');
  });

  it('is part of a todo, a note and a habit as the reader sees them', () => {
    const r = [{ id: 'r1', date: '2026-11-13', time: '09:00', frequency: 'once' }];
    expect(
      todoRecord({ id: 't1', title: 'Call the venue', created_at: 'x', reminders_json: r }).text,
    ).toContain('They set a reminder for it: Friday 2026-11-13 at 09:00.');
    expect(
      noteRecord({
        id: 'n1',
        title: 'Gift ideas',
        body: 'A scarf',
        created_at: 'x',
        reminders_json: r,
      }).text,
    ).toContain('They set a reminder for it');
    expect(
      habitRecord({
        id: 'h1',
        name: 'Stretch',
        frequency: 'daily',
        created_at: 'x',
        reminders_json: r,
      }).text,
    ).toContain('They set a reminder for it');
  });

  it('is left off a todo that is done', () => {
    const rec = changeRecord(
      { table: 'todos', row_id: 't1', at: 'x', fields: ['completed_at', 'title'], dates: {} },
      {
        title: 'Call the venue',
        completed_at: '2026-11-12T10:00:00Z',
        reminders_json: [{ id: 'r1', date: '2026-11-13', time: '09:00', frequency: 'once' }],
      },
      'America/New_York',
    );
    expect(rec.text).not.toContain('reminder');
  });
});

describe('a habit', () => {
  it('is read with the notes they keep on it and when it runs', () => {
    const text = habitRecord({
      id: 'h1',
      name: 'Run',
      frequency: 'weekly',
      why_string: 'For the half marathon',
      notes: 'Knee feels better on grass.',
      start_date: '2026-11-01',
      end_date: '2027-03-01',
      created_at: 'x',
    }).text;
    expect(text).toContain('Their notes on it: Knee feels better on grass.');
    expect(text).toContain('It runs from 2026-11-01 until 2027-03-01.');
  });
});

describe('a save that reaches the server late', () => {
  it('is read as new under the same rules as anything made in the window', () => {
    expect(lateReadable('todos', { origin: null })).toBe(true);
    expect(lateReadable('notes', { origin: 'chat_save' })).toBe(false);
    expect(lateReadable('notes', { external_source: 'import' })).toBe(false);
    expect(lateReadable('synced_calendar_events', { archived: true })).toBe(false);
    expect(lateReadable('weekly_reviews', {})).toBe(false);
  });

  it('is in the records of the read that first sees it, and not as a change', async () => {
    const tables = {
      todos: [
        // made on the phone at 08:00, offline, and saved at 13:00
        {
          id: 't-late',
          owner_id: U,
          title: 'Book the plumber',
          origin: null,
          created_at: '2026-11-12T08:00:00Z',
        },
        // made in the window as usual
        {
          id: 't-now',
          owner_id: U,
          title: 'Pay the deposit',
          origin: null,
          created_at: '2026-11-12T12:30:00Z',
        },
      ],
      notes: [],
      habits: [],
      space_milestones: [],
      scope_chat_messages: [],
      synced_calendar_events: [],
      user_profile_overrides: [],
      gremly_questions: [],
      item_changes: [
        {
          owner_id: U,
          table_name: 'todos',
          row_id: 't-late',
          op: 'insert',
          fields: [],
          dates: null,
          by: 'person',
          at: '2026-11-12T13:00:00Z',
        },
        {
          owner_id: U,
          table_name: 'todos',
          row_id: 't-now',
          op: 'insert',
          fields: [],
          dates: null,
          by: 'person',
          at: '2026-11-12T12:30:00Z',
        },
      ],
      life_fact_sources: [],
    };
    const mem = memoryDb(tables);
    db.mockReturnValue({ select: mem.select });
    const rows = await loadRecords({}, U, '2026-11-12T12:00:00Z', '2026-11-12T14:00:00Z');
    expect(rows.created.map((t) => t.id)).toEqual(['t-late', 't-now']);
    expect(rows.changed).toEqual([]);
  });
});
