/**
 * @jest-environment node
 */
// The change model's checks (workers/shared/changes/check.js): every change
// is read against the item as it is, and anything that fails is dropped.

import {
  beforeValue,
  checkCard,
  checkChange,
  normDay,
  normMinutes,
  normSchedule,
  normTime,
  scheduleLabel,
  scheduleOf,
} from '../check';
import { GROUPS, OPS, TYPES } from '../fields';

const TODAY = '2026-10-02';
const todo = {
  id: 't1',
  name: 'Dentist',
  due_day: '2026-10-02',
  due_time: '10:00',
  body: 'Bring the form',
  tags: ['health'],
  is_pinned: false,
  world_ids: ['w1'],
};
const habit = {
  id: 'h1',
  name: 'Run',
  cadence: 'daily',
  target_per_period: 1,
  frequency: 'daily',
  logged_days: ['2026-10-01'],
};
const note = {
  id: 'n1',
  title: 'Packing',
  body: '',
  subtype: 'note',
  list_items: [
    { id: 'l1', text: 'Sunglasses', checked: false },
    { id: 'l2', text: 'Passport', checked: true },
  ],
};
const event = { id: 'e1', title: 'Mum birthday', subtype: 'event', target_date: '2026-10-10' };
const ctx = (item) => ({ today: TODAY, item, worlds: ['w1', 'w2'], chapters: ['ch1'] });
const change = (fields, item = todo, type = 'todo') =>
  checkChange({ op: 'change', type, id: item?.id, fields }, ctx(item));

describe('values', () => {
  it('reads real dates only', () => {
    expect(normDay('2026-02-28')).toBe('2026-02-28');
    expect(normDay('2026-02-30')).toBeUndefined();
    expect(normDay('2026-10-02T09:00:00Z')).toBe('2026-10-02');
    expect(normDay('tomorrow')).toBeUndefined();
  });

  it('reads clock times', () => {
    expect(normTime('9:05')).toBe('09:05');
    expect(normTime('14:00:00')).toBe('14:00');
    expect(normTime('24:00')).toBeUndefined();
    expect(normTime('2pm')).toBeUndefined();
  });

  it('reads lengths from a minute to a day', () => {
    expect(normMinutes(30)).toBe(30);
    expect(normMinutes('45')).toBe(45);
    expect(normMinutes(0)).toBeUndefined();
    expect(normMinutes(2000)).toBeUndefined();
  });
});

describe('habit schedules', () => {
  it('reads how often, and fixed days for a weekly habit', () => {
    expect(normSchedule({ per: 'week', times: 3 })).toEqual({ per: 'week', times: 3 });
    expect(normSchedule({ per: 'week', days: [5, 1, 3] })).toEqual({
      per: 'week',
      times: 3,
      days: [1, 3, 5],
    });
    expect(normSchedule({ per: 'day', days: [1] })).toBeUndefined();
    expect(normSchedule({ per: 'week', times: 9 })).toBeUndefined();
    expect(normSchedule({ per: 'year', times: 1 })).toBeUndefined();
  });

  it('reads the schedule a habit counts by, and labels it', () => {
    expect(scheduleOf({ cadence: 'weekly', target_per_period: 2 })).toEqual({
      per: 'week',
      times: 2,
    });
    expect(scheduleOf({ cadence: 'weekly', target_per_period: 1, days_active: [3, 1] })).toEqual({
      per: 'week',
      times: 2,
      days: [1, 3],
    });
    expect(scheduleLabel({ per: 'day', times: 1 })).toBe('daily');
    expect(scheduleLabel({ per: 'week', times: 3 })).toBe('3x/week');
    expect(scheduleLabel({ per: 'week', times: 1 })).toBe('weekly');
    expect(scheduleLabel({ per: 'month', times: 2 })).toBe('2x/month');
  });
});

describe('the field list', () => {
  it('gives every field a group, a kind, a column and a meaning', () => {
    for (const [type, spec] of Object.entries(TYPES)) {
      for (const [field, def] of Object.entries(spec.fields)) {
        expect([type, field, def.group in GROUPS]).toEqual([type, field, true]);
        expect(typeof def.kind).toBe('string');
        expect(typeof def.column).toBe('string');
        expect(def.about.length).toBeGreaterThan(3);
      }
      for (const op of spec.ops) expect(op in OPS).toBe(true);
    }
  });

  it('keeps the rarely used fields in the asked group', () => {
    for (const spec of Object.values(TYPES)) {
      for (const f of ['part_of_day', 'worlds', 'chapters', 'tags', 'pinned', 'favourite']) {
        if (spec.fields[f]) expect(spec.fields[f].group).toBe('asked');
      }
    }
  });
});

describe('a change to a field', () => {
  it('moves a day and a time in one change, with what they were', () => {
    expect(change({ day: '2026-10-03', time: '15:00' })).toEqual({
      ok: true,
      change: {
        cid: null,
        op: 'change',
        type: 'todo',
        id: 't1',
        title: 'Dentist',
        fields: { day: '2026-10-03', time: '15:00' },
        before: { day: '2026-10-02', time: '10:00' },
      },
    });
  });

  it('leaves out a field that would not change, and drops a change with nothing left', () => {
    const r = change({ day: '2026-10-02', time: '11:00' });
    expect(r.ok && r.change.fields).toEqual({ time: '11:00' });
    expect(change({ day: '2026-10-02' })).toEqual({ ok: false, reason: 'no_change' });
  });

  it('drops the whole change when one field is unknown or wrong', () => {
    expect(change({ colour: 'red' }).ok).toBe(false);
    expect(change({ day: '2026-10-03', time: 'later' })).toEqual({
      ok: false,
      reason: 'bad_value:time',
    });
    expect(change({ day: '2026-10-03' }, habit, 'habit').ok).toBe(false);
  });

  it('clears only the fields that can be cleared', () => {
    const r = change({ time: null });
    expect(r.ok && r.change.fields).toEqual({ time: null });
    expect(change({ name: null })).toEqual({ ok: false, reason: 'cannot_clear:name' });
  });

  it('adds to text as well as replacing it', () => {
    const r = change({ text: { add: 'Ask about the bill' } });
    expect(r.ok && r.change.fields).toEqual({ text: { add: 'Ask about the bill' } });
    expect(r.ok && r.change.before).toEqual({ text: 'Bring the form' });
  });

  it('changes a habit schedule, and not to the one it already has', () => {
    const r = change({ schedule: { per: 'week', times: 3 } }, habit, 'habit');
    expect(r.ok && r.change.fields.schedule).toEqual({ per: 'week', times: 3 });
    expect(r.ok && r.change.before.schedule).toEqual({ per: 'day', times: 1, label: 'daily' });
    expect(change({ schedule: { per: 'day', times: 1 } }, habit, 'habit').ok).toBe(false);
  });

  it('writes a label out of step with its tracking even when the tracking already agrees', () => {
    const drifted = { ...habit, frequency: 'weekly' };
    const r = change({ schedule: { per: 'day', times: 1 } }, drifted, 'habit');
    expect(r.ok && r.change.fields.schedule).toEqual({ per: 'day', times: 1 });
  });

  it('keeps event fields for events, or for a note given its date in the same change', () => {
    expect(change({ time: '19:00' }, event, 'note').ok).toBe(true);
    expect(change({ day: '2026-10-09', time: '19:00' }, note, 'note').ok).toBe(true);
    expect(change({ time: '19:00' }, note, 'note')).toEqual({
      ok: false,
      reason: 'not_an_event:time',
    });
  });

  it('adds tags and links it does not have, and only to Worlds that exist', () => {
    const r = change({
      tags: { add: ['health', 'admin'] },
      worlds: { add: ['w2'], remove: ['w1'] },
    });
    expect(r.ok && r.change.fields).toEqual({
      tags: { add: ['admin'], remove: [] },
      worlds: { add: ['w2'], remove: ['w1'] },
    });
    expect(change({ worlds: { add: ['w9'] } })).toEqual({
      ok: false,
      reason: 'unknown_link:worlds',
    });
  });

  it('keeps the rarely used fields out when only main fields are allowed', () => {
    expect(
      checkChange(
        { op: 'change', type: 'todo', id: 't1', fields: { pinned: true } },
        { ...ctx(todo), groups: ['main'] },
      ),
    ).toEqual({ ok: false, reason: 'not_asked:pinned' });
  });

  it('ticks, unticks, adds and removes list items that exist', () => {
    const r = change(
      { list: { add: ['Charger'], tick: ['l1', 'l2'], untick: ['l2'] } },
      note,
      'note',
    );
    expect(r.ok && r.change.fields.list).toEqual({
      add: ['Charger'],
      tick: ['l1'],
      untick: ['l2'],
      remove: [],
    });
    expect(change({ list: { tick: ['zz'] } }, note, 'note').ok).toBe(false);
  });

  it('adds a reminder with a time, and a day when it fires once', () => {
    const r = change({ reminder: { add: [{ time: '9:00', day: '2026-10-03' }] } });
    expect(r.ok && r.change.fields.reminder).toEqual({
      add: [{ time: '09:00', repeat: 'once', day: '2026-10-03' }],
      remove: [],
    });
    expect(change({ reminder: { add: [{ time: '09:00' }] } }).ok).toBe(false);
  });

  it('never touches calendar entries or archived items', () => {
    const cal = { ...event, external_source: { provider: 'google_calendar' } };
    expect(change({ time: '19:00' }, cal, 'note')).toEqual({ ok: false, reason: 'calendar_item' });
    expect(change({ time: '11:00' }, { ...todo, archived: true })).toEqual({
      ok: false,
      reason: 'archived',
    });
    expect(
      checkChange({ op: 'change', type: 'todo', id: 't1', fields: { time: '11:00' } }, ctx(null)),
    ).toEqual({ ok: false, reason: 'no_item' });
  });
});

describe('other changes', () => {
  it('adds an item with a name', () => {
    const r = checkChange(
      { op: 'add', type: 'todo', fields: { name: 'Pack', day: '2026-10-02', length: 20 } },
      ctx(null),
    );
    expect(r).toEqual({
      ok: true,
      change: {
        cid: null,
        op: 'add',
        type: 'todo',
        id: null,
        title: 'Pack',
        fields: { name: 'Pack', day: '2026-10-02', length: 20 },
        before: {},
      },
    });
    expect(
      checkChange({ op: 'add', type: 'todo', fields: { day: '2026-10-02' } }, ctx(null)),
    ).toEqual({
      ok: false,
      reason: 'add_needs_name',
    });
  });

  it('marks a todo done only when it is open, and reopens only when done', () => {
    expect(checkChange({ op: 'done', type: 'todo', id: 't1' }, ctx(todo)).ok).toBe(true);
    expect(
      checkChange({ op: 'done', type: 'todo', id: 't1' }, ctx({ ...todo, completed_at: 'x' })).ok,
    ).toBe(false);
    expect(checkChange({ op: 'reopen', type: 'todo', id: 't1' }, ctx(todo)).ok).toBe(false);
    expect(checkChange({ op: 'done', type: 'habit', id: 'h1' }, ctx(habit))).toEqual({
      ok: false,
      reason: 'op_not_for_type',
    });
  });

  it('logs only days not logged yet and never a day to come', () => {
    const log = (days, op = 'log') =>
      checkChange({ op, type: 'habit', id: 'h1', days }, ctx(habit));
    const r = log(['2026-10-02', '2026-10-01']);
    expect(r.ok && r.change.days).toEqual(['2026-10-02']);
    expect(log(['2026-10-01']).ok).toBe(false);
    expect(log(['2026-10-05'])).toEqual({ ok: false, reason: 'future_day' });
    expect(log(['2026-10-01'], 'unlog').ok).toBe(true);
  });

  it('turns an item into another kind, with fields for the new one', () => {
    const r = checkChange(
      { op: 'convert', type: 'note', id: 'n1', to: 'todo', fields: { day: '2026-10-04' } },
      ctx(note),
    );
    expect(r.ok && r.change).toMatchObject({
      op: 'convert',
      to: 'todo',
      fields: { day: '2026-10-04' },
      title: 'Packing',
    });
    expect(checkChange({ op: 'convert', type: 'note', id: 'n1', to: 'note' }, ctx(note)).ok).toBe(
      false,
    );
  });

  it("reads a change to today's plan", () => {
    const plan = (p) => checkChange({ op: 'plan', plan: p }, ctx(null)).ok;
    expect(plan({ kind: 'add_block', title: 'Pick up Bella', start: 900 })).toBe(true);
    expect(plan({ kind: 'add_block', title: '', start: 900 })).toBe(false);
    expect(plan({ kind: 'plan_move', id: 't1', start: 2000 })).toBe(false);
  });
});

describe('a card', () => {
  it('merges changes to one item, drops a conflict, and numbers the rows', () => {
    const items = { t1: todo, h1: habit };
    const { changes, dropped } = checkCard(
      [
        { op: 'change', type: 'todo', id: 't1', fields: { day: '2026-10-03' } },
        { op: 'change', type: 'todo', id: 't1', fields: { time: '15:00' } },
        { op: 'done', type: 'todo', id: 't1' },
        { op: 'log', type: 'habit', id: 'h1', days: ['2026-10-02'] },
        { op: 'change', type: 'todo', id: 'gone', fields: { time: '15:00' } },
      ],
      (raw) => ctx(items[raw.id] || null),
    );
    expect(changes.map((c) => [c.cid, c.op, c.fields])).toEqual([
      ['c1', 'change', { day: '2026-10-03', time: '15:00' }],
      ['c4', 'log', undefined],
    ]);
    expect(changes[0].before).toEqual({ day: '2026-10-02', time: '10:00' });
    expect(dropped).toEqual([
      { cid: 'c3', reason: 'conflict' },
      { cid: 'c5', reason: 'no_item' },
    ]);
  });
});

describe('beforeValue', () => {
  it('reads each kind the way a change states it', () => {
    expect(beforeValue('todo', todo, 'day')).toBe('2026-10-02');
    expect(beforeValue('todo', { due_time: '10:00:00' }, 'time')).toBe('10:00');
    expect(beforeValue('todo', todo, 'pinned')).toBe(false);
    expect(beforeValue('todo', todo, 'worlds')).toEqual(['w1']);
    expect(beforeValue('habit', habit, 'schedule')).toEqual({
      per: 'day',
      times: 1,
      label: 'daily',
    });
  });
});
