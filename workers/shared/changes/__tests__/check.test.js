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
import { GROUPS, OPS, TYPES, WEEK_OPS } from '../fields';

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
  });

  it('reads times the way Gremly reads them, with am or pm', () => {
    expect(normTime('2pm')).toBe('14:00');
    expect(normTime('2:45pm')).toBe('14:45');
    expect(normTime('2:45 PM')).toBe('14:45');
    expect(normTime('12am')).toBe('00:00');
    expect(normTime('12:30pm')).toBe('12:30');
    expect(normTime('9 a.m.')).toBe('09:00');
    expect(normTime('13pm')).toBeUndefined();
    expect(normTime('2')).toBeUndefined();
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

// ── The week's own changes (the weekly review) ──────────────────────────────

// Friday 2 October: the rest of this week, Friday to Sunday, in the week that started on Monday
const week = {
  first: '2026-10-02',
  last: '2026-10-04',
  week_start: '2026-09-28',
  hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
  busy_days: ['2026-10-03'],
  has_review: true,
  intention: { id: 'n9', text: 'Protect my mornings' },
  weekly_day: 0,
};
const weekCtx = (item = null, w = week) => ({ ...ctx(item), week: w });
const weekChange = (raw, item = null, w = week) => checkChange(raw, weekCtx(item, w));

describe("the week's own changes", () => {
  it('are dropped when the week is not known', () => {
    expect(
      checkChange({ op: 'later', type: 'todo', id: 't1', back_on: '2026-10-12' }, ctx(todo)),
    ).toEqual({
      ok: false,
      reason: 'no_week',
    });
    expect(checkChange({ op: 'weekly_day', weekday: 3 }, ctx(null))).toEqual({
      ok: false,
      reason: 'no_week',
    });
  });

  it('are not operations on the general list, so no other surface is offered them', () => {
    for (const op of Object.keys(WEEK_OPS)) expect(op in OPS).toBe(false);
    for (const spec of Object.values(TYPES)) {
      for (const op of Object.keys(WEEK_OPS)) expect(spec.ops).not.toContain(op);
    }
  });

  describe('later', () => {
    const later = (back_on, item = todo) =>
      weekChange({ op: 'later', type: 'todo', id: item?.id, back_on }, item);

    it('puts a todo off with the day it comes back, and says what it was', () => {
      expect(later('2026-10-12')).toEqual({
        ok: true,
        change: {
          cid: null,
          op: 'later',
          type: 'todo',
          id: 't1',
          title: 'Dentist',
          fields: { back_on: '2026-10-12' },
          before: { back_on: null, day: '2026-10-02' },
        },
      });
    });

    it('always has a back day, on a day still to come and within four weeks', () => {
      expect(later(undefined).reason).toBe('bad_value:back_on');
      expect(later('soon').reason).toBe('bad_value:back_on');
      expect(later(TODAY).reason).toBe('back_not_ahead');
      expect(later('2026-10-01').reason).toBe('back_not_ahead');
      expect(later('2026-10-30').ok).toBe(true);
      expect(later('2026-10-31').reason).toBe('back_too_far');
    });

    it('is only for a todo of theirs that is still open', () => {
      expect(
        weekChange({ op: 'later', type: 'habit', id: 'h1', back_on: '2026-10-12' }, habit).reason,
      ).toBe('op_not_for_type');
      expect(later('2026-10-12', null).reason).toBe('no_item');
      expect(later('2026-10-12', { ...todo, archived: true }).reason).toBe('archived');
      expect(later('2026-10-12', { ...todo, completed_at: '2026-10-01T10:00:00Z' }).reason).toBe(
        'already_done',
      );
    });

    it('is no change when it is already put off until that day', () => {
      const put = { ...todo, due_day: null, resurface_at: '2026-10-12' };
      expect(later('2026-10-12', put).reason).toBe('no_change');
      expect(later('2026-10-19', put).change.before).toEqual({ back_on: '2026-10-12', day: null });
    });
  });

  describe('habit days', () => {
    const planned = { ...habit, planned_days: ['2026-10-02', '2026-09-30'] };
    const days = (list, item = planned) =>
      weekChange({ op: 'habit_days', type: 'habit', id: item?.id, days: list }, item);

    it('sets the days a habit is planned on in the week, with the days it was on', () => {
      expect(days(['2026-10-04', '2026-10-03', '2026-10-03'])).toEqual({
        ok: true,
        change: {
          cid: null,
          op: 'habit_days',
          type: 'habit',
          id: 'h1',
          title: 'Run',
          days: ['2026-10-03', '2026-10-04'],
          // only the days inside the week count as what it was
          before: { days: ['2026-10-02'] },
        },
      });
    });

    it('can take a habit off the week', () => {
      expect(days([]).change).toMatchObject({ days: [], before: { days: ['2026-10-02'] } });
      expect(days([], habit).reason).toBe('no_change');
    });

    it('keeps to the days being planned', () => {
      expect(days(['2026-10-05']).reason).toBe('outside_week');
      expect(days(['2026-10-01']).reason).toBe('outside_week');
      expect(days(['Saturday']).reason).toBe('bad_days');
      expect(days(undefined).reason).toBe('bad_days');
      expect(days(['2026-10-02']).reason).toBe('no_change');
    });

    it('leaves a day already gone as it is when it is named beside the new ones', () => {
      // planned on 30 September, before the days being planned: naming it changes nothing
      expect(days(['2026-09-30', '2026-10-03']).change).toMatchObject({
        days: ['2026-10-03'],
        before: { days: ['2026-10-02'] },
      });
      expect(days(['2026-09-30', '2026-10-02']).reason).toBe('no_change');
      // a day gone that it was never planned on is still turned away
      expect(days(['2026-09-29', '2026-10-03']).reason).toBe('outside_week');
    });

    it('is only for a habit of theirs', () => {
      expect(weekChange({ op: 'habit_days', type: 'todo', id: 't1', days: [] }, todo).reason).toBe(
        'op_not_for_type',
      );
      expect(days(['2026-10-03'], { ...planned, archived: true }).reason).toBe('archived');
    });
  });

  describe('the shape of the week', () => {
    const shape = (s, w = week) => weekChange({ op: 'week_shape', shape: s }, null, w);

    it('sets the busy days, keeping what they were', () => {
      expect(shape({ busy_days: ['2026-10-04', '2026-10-03'] })).toEqual({
        ok: true,
        change: {
          cid: null,
          op: 'week_shape',
          type: null,
          id: null,
          title: '',
          // the week it is kept for, and the first day the busy days were stated for
          week_start: '2026-09-28',
          from: '2026-10-02',
          shape: { busy_days: ['2026-10-03', '2026-10-04'] },
          before: { busy_days: ['2026-10-03'] },
        },
      });
    });

    it('states the busy days from here on: one already gone is not part of what it was', () => {
      const r = shape({ busy_days: [] }, { ...week, busy_days: ['2026-09-29', '2026-10-03'] });
      expect(r.change.shape).toEqual({ busy_days: [] });
      expect(r.change.before).toEqual({ busy_days: ['2026-10-03'] });
      // only a day gone was busy: from here on nothing changes
      expect(shape({ busy_days: [] }, { ...week, busy_days: ['2026-09-29'] }).reason).toBe(
        'no_change',
      );
    });

    it('belongs to the first day it acts on when the week does not say where it starts', () => {
      const loose = { ...week };
      delete loose.week_start;
      expect(shape({ busy_days: [] }, loose).change.week_start).toBe('2026-10-02');
    });

    it('sets only the hours that change, in half hour steps', () => {
      const r = shape({ hours: { normal_day: 1.5, busy_day: 1, weekend_day: 3.2 } });
      expect(r.change.shape).toEqual({ hours: { normal_day: 1.5, weekend_day: 3 } });
      expect(r.change.before).toEqual({ hours: { normal_day: 2, weekend_day: 4 } });
    });

    it('takes hours for a week that has none yet', () => {
      const r = shape({ hours: { normal_day: 2 } }, { ...week, hours: null });
      expect(r.change.shape).toEqual({ hours: { normal_day: 2 } });
      expect(r.change.before).toEqual({ hours: { normal_day: null } });
    });

    it('drops a shape that changes nothing or cannot be read', () => {
      expect(shape({ busy_days: ['2026-10-03'], hours: { normal_day: 2 } }).reason).toBe(
        'no_change',
      );
      expect(shape({ busy_days: ['2026-10-09'] }).reason).toBe('outside_week');
      // a busy day already gone, named beside the new ones, stays as it is
      const gone = { ...week, busy_days: ['2026-09-29', '2026-10-03'] };
      expect(shape({ busy_days: ['2026-09-29', '2026-10-04'] }, gone).change).toMatchObject({
        shape: { busy_days: ['2026-10-04'] },
        before: { busy_days: ['2026-10-03'] },
      });
      expect(shape({ busy_days: ['2026-09-28', '2026-10-04'] }, gone).reason).toBe('outside_week');
      expect(shape({ busy_days: ['Thursday'] }).reason).toBe('bad_days');
      expect(shape({ hours: { normal_day: 30 } }).reason).toBe('bad_value:hours');
      expect(shape({ hours: 3 }).reason).toBe('bad_value:hours');
      expect(shape(null).reason).toBe('bad_shape');
    });

    it('needs a review to keep the shape on', () => {
      expect(shape({ busy_days: [] }, { ...week, has_review: false }).reason).toBe('no_review');
    });
  });

  describe('the intention', () => {
    const intend = (text, w = week) => weekChange({ op: 'intention', intention: text }, null, w);

    it("rewrites the week's intention, by its note", () => {
      expect(intend('  One thing at a time ')).toEqual({
        ok: true,
        change: {
          cid: null,
          op: 'intention',
          type: 'note',
          id: 'n9',
          title: 'One thing at a time',
          week_start: '2026-09-28',
          fields: { text: 'One thing at a time' },
          before: { text: 'Protect my mornings' },
        },
      });
    });

    it('is new when the week has none', () => {
      const r = intend('Rest first', { ...week, intention: null });
      expect(r.change).toMatchObject({ id: null, before: { text: null } });
    });

    it('is one short line, and not the one they have', () => {
      expect(intend('').reason).toBe('bad_value:intention');
      expect(intend('x'.repeat(201)).reason).toBe('bad_value:intention');
      expect(intend('Protect my mornings').reason).toBe('no_change');
    });
  });

  describe('a milestone', () => {
    const steps = [
      { title: 'Draft the outline', by: '2026-10-06', minutes: 45, kind: 'todo' },
      { title: 'How is the draft going?', by: '2026-10-12', kind: 'check_in' },
    ];
    const mile = (m, w = week) => weekChange({ op: 'milestone', milestone: m }, null, w);

    it('sets up its steps in order, each with a day to finish by', () => {
      expect(mile({ goal: ' Conference talk ', date: '2026-10-20', steps })).toEqual({
        ok: true,
        change: {
          cid: null,
          op: 'milestone',
          type: null,
          id: null,
          title: 'Conference talk',
          week_start: '2026-09-28',
          milestone: { goal: 'Conference talk', date: '2026-10-20', steps },
        },
      });
    });

    it('is for a date still to come, with steps between now and then', () => {
      expect(mile({ goal: 'Talk', date: TODAY, steps }).reason).toBe('milestone_not_ahead');
      expect(mile({ goal: 'Talk', date: '2026-10-20', steps: [] }).reason).toBe(
        'milestone_needs_steps',
      );
      expect(mile({ goal: 'Talk', date: '2026-10-10', steps }).reason).toBe('step_outside');
      expect(
        mile({ goal: 'Talk', date: '2026-10-20', steps: [{ ...steps[0], by: '2026-10-01' }] })
          .reason,
      ).toBe('step_outside');
      expect(
        mile({ goal: 'Talk', date: '2026-10-20', steps: Array(7).fill(steps[0]) }).reason,
      ).toBe('too_many_steps');
    });

    it('drops one it cannot read', () => {
      expect(mile(null).reason).toBe('bad_milestone');
      expect(mile({ goal: '', date: '2026-10-20', steps }).reason).toBe('bad_milestone');
      expect(mile({ goal: 'Talk', date: 'later', steps }).reason).toBe('bad_milestone');
      expect(
        mile({ goal: 'Talk', date: '2026-10-20', steps: [{ ...steps[0], kind: 'reminder' }] })
          .reason,
      ).toBe('bad_step');
      expect(
        mile({ goal: 'Talk', date: '2026-10-20', steps: [{ ...steps[0], minutes: -5 }] }).reason,
      ).toBe('bad_step');
    });

    it('needs a review to hold a check in, and none for todos alone', () => {
      const none = { ...week, has_review: false };
      expect(mile({ goal: 'Talk', date: '2026-10-20', steps }, none).reason).toBe('no_review');
      expect(mile({ goal: 'Talk', date: '2026-10-20', steps: [steps[0]] }, none).ok).toBe(true);
    });
  });

  describe('the weekly day', () => {
    const move = (weekday, w = week) => weekChange({ op: 'weekly_day', weekday }, null, w);

    it('moves to another day of the week, and says which it was', () => {
      expect(move(3)).toEqual({
        ok: true,
        change: {
          cid: null,
          op: 'weekly_day',
          type: null,
          id: null,
          title: '',
          fields: { weekday: 3 },
          before: { weekday: 0 },
        },
      });
    });

    it('is a weekday, and not the one they have', () => {
      expect(move(0).reason).toBe('no_change');
      expect(move(7).reason).toBe('bad_value:weekday');
      expect(move('Wednesday').reason).toBe('bad_value:weekday');
    });
  });

  describe('checked a second time', () => {
    it('reads the same from a checked change as from the one proposed', () => {
      const cases = [
        [{ op: 'later', type: 'todo', id: 't1', back_on: '2026-10-12' }, todo],
        [
          { op: 'habit_days', type: 'habit', id: 'h1', days: ['2026-10-03'] },
          { ...habit, planned_days: ['2026-10-02'] },
        ],
        [{ op: 'week_shape', shape: { busy_days: [], hours: { normal_day: 1 } } }, null],
        [{ op: 'intention', intention: 'Rest first' }, null],
        [
          {
            op: 'milestone',
            milestone: {
              goal: 'Talk',
              date: '2026-10-20',
              steps: [{ title: 'Outline', by: '2026-10-06', kind: 'todo' }],
            },
          },
          null,
        ],
        [{ op: 'weekly_day', weekday: 3 }, null],
      ];
      for (const [raw, item] of cases) {
        const first = weekChange({ cid: 'c1', ...raw }, item);
        expect(first.ok).toBe(true);
        // the card's own row, checked again against the same week and item
        expect(weekChange(first.change, item)).toEqual(first);
      }
    });
  });

  describe('on a card', () => {
    it('holds one shape, one intention and one weekly day', () => {
      const { changes, dropped } = checkCard(
        [
          { op: 'week_shape', shape: { busy_days: [] } },
          { op: 'week_shape', shape: { hours: { normal_day: 1 } } },
          { op: 'intention', intention: 'Rest first' },
          { op: 'intention', intention: 'Move every day' },
          { op: 'weekly_day', weekday: 2 },
        ],
        () => weekCtx(),
      );
      expect(changes.map((c) => c.cid)).toEqual(['c1', 'c3', 'c5']);
      expect(dropped).toEqual([
        { cid: 'c2', reason: 'conflict' },
        { cid: 'c4', reason: 'conflict' },
      ]);
    });

    it('says one thing about an item: a todo is moved or put off, not both', () => {
      const { changes, dropped } = checkCard(
        [
          { op: 'change', type: 'todo', id: 't1', fields: { day: '2026-10-03' } },
          { op: 'later', type: 'todo', id: 't1', back_on: '2026-10-12' },
        ],
        () => weekCtx(todo),
      );
      expect(changes).toHaveLength(1);
      expect(dropped).toEqual([{ cid: 'c2', reason: 'conflict' }]);
    });

    it('takes several milestones', () => {
      const one = {
        op: 'milestone',
        milestone: {
          goal: 'Talk',
          date: '2026-10-20',
          steps: [{ title: 'Outline', by: '2026-10-06', kind: 'todo' }],
        },
      };
      const two = { ...one, milestone: { ...one.milestone, goal: 'Trip' } };
      expect(checkCard([one, two], () => weekCtx()).changes).toHaveLength(2);
    });
  });
});
