/**
 * The change model's checks: every change Gremly proposes is read, checked
 * against the item as it is and normalised here before anyone sees it. The
 * Workers run it before a card is sent and the app runs it again before a card
 * is drawn, so a change that fails is dropped and never shown.
 *
 * A change:
 *   { cid, op, type, id, fields, days, to, plan }
 * - op: one of OPS in fields.js
 * - type: 'todo' | 'habit' | 'note' (not used by 'plan')
 * - id: the item's id (not for 'add')
 * - fields: for 'add', 'change' and 'convert', the new value of each field
 *   that changes, by the field names in fields.js. A text field that can be
 *   added to takes { add: 'words' } to add rather than replace. A field that
 *   can be cleared takes null.
 * - days: for 'log' and 'unlog', the days (YYYY-MM-DD)
 * - to: for 'convert', the kind it becomes
 * - plan: for 'plan', the day turn's set time or plan change
 *
 * The week's own operations (WEEK_OPS in fields.js) are checked here too, by
 * checkWeekChange, against the person's week on the context (ctx.week): the
 * days they act on, the week's hours and busy days, its intention, and the
 * weekly day. They come with what they need by name: back_on for 'later',
 * days for 'habit_days', shape for 'week_shape', intention, milestone, and
 * weekday for 'weekly_day'. With no week on the context they are dropped.
 * What comes back says which week it is for where that matters (week_start on
 * the shape, the intention and a milestone), and can be checked again as it
 * is, like any other change.
 *
 * What comes back adds:
 * - title: the item's name as it reads now (or the new name for an add)
 * - before: each changed field's value on the item as it was read, filled in
 *   here and never by the model, so the card can show "from" and the app can
 *   spot an edit made since
 *
 * The item snapshot uses the app store's names (fields.js column). Links and
 * logs that live outside the item come in on the snapshot too: world_ids,
 * chapter_ids and, for a habit, logged_days.
 *
 * Pure: no clock, no I/O. Today comes in on the context.
 */

import {
  TYPES,
  OPS,
  PLAN_KINDS,
  WEEK_OPS,
  EASE_OPS,
  STEP_KINDS,
  WEEK_LIMITS,
  NAME_LIMIT,
  fieldDef,
} from './fields.js';
import { DAY_KINDS, LATER_MAX_DAYS, addDays, daysBetween, normHours } from '../week.js';
import {
  EASE_MAX_DAYS,
  EASE_MODES,
  easeNote,
  easeOn,
  easePlan,
  easesFrom,
  pausedOn,
  weekAround,
} from '../habitWeek.js';

// ── Values ──────────────────────────────────────────────────────────────────

/** A real calendar date as YYYY-MM-DD, or undefined. */
export function normDay(v) {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d)
    return undefined;
  return s;
}

/**
 * A time as HH:MM on a 24 hour clock, or undefined. It reads a 24 hour time
 * (seconds are dropped) and a 12 hour one with am or pm, the way times are
 * written to Gremly everywhere it reads them.
 */
export function normTime(v) {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase().replace(/\./g, '');
  const twelve = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(s);
  if (twelve) {
    const h12 = Number(twelve[1]);
    const min = Number(twelve[2] ?? 0);
    if (h12 < 1 || h12 > 12 || min > 59) return undefined;
    const h = (h12 % 12) + (twelve[3] === 'pm' ? 12 : 0);
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** Whole minutes from 1 to a day, or undefined. */
export function normMinutes(v) {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  const r = Math.round(n);
  return r >= 1 && r <= 1440 ? r : undefined;
}

function normText(v, max) {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.length > max ? undefined : s;
}

function uniqStrings(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const x of list) {
    if (typeof x !== 'string') continue;
    const s = x.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

const PERIODS = { day: 10, week: 7, month: 31 };

/**
 * A habit's schedule: { per: 'day' | 'week' | 'month', times, days? }, days
 * being fixed days of the week (0 Sunday to 6 Saturday) for a weekly habit.
 */
export function normSchedule(v) {
  if (!v || typeof v !== 'object') return undefined;
  const per = v.per;
  if (!(per in PERIODS)) return undefined;
  let days;
  if (v.days != null) {
    if (per !== 'week' || !Array.isArray(v.days)) return undefined;
    days = [...new Set(v.days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
    if (!days.length || days.length !== new Set(v.days).size) return undefined;
  }
  const times = days ? days.length : Number(v.times);
  if (!Number.isInteger(times) || times < 1 || times > PERIODS[per]) return undefined;
  return days ? { per, times, days } : { per, times };
}

/** The schedule a habit has now, from the tracking fields the app counts by. */
export function scheduleOf(item) {
  const cadence = String(item?.cadence || 'daily').toLowerCase();
  const per = cadence.startsWith('week') ? 'week' : cadence.startsWith('month') ? 'month' : 'day';
  const times =
    Number.isInteger(item?.target_per_period) && item.target_per_period > 0
      ? item.target_per_period
      : 1;
  const days =
    Array.isArray(item?.days_active) && item.days_active.length && per === 'week'
      ? [...item.days_active].sort()
      : null;
  return days ? { per, times: days.length, days } : { per, times };
}

/** The label a schedule is stored and shown as: daily, 3x/week, weekly, 2x/month. */
export function scheduleLabel(s) {
  if (!s) return '';
  if (s.per === 'day') return s.times === 1 ? 'daily' : `${s.times}x/day`;
  if (s.per === 'week') return s.times === 1 ? 'weekly' : `${s.times}x/week`;
  return s.times === 1 ? 'monthly' : `${s.times}x/month`;
}

function sameSchedule(a, b) {
  return (
    a.per === b.per &&
    a.times === b.times &&
    JSON.stringify(a.days || null) === JSON.stringify(b.days || null)
  );
}

// ── The item ────────────────────────────────────────────────────────────────

export function itemTitle(type, item) {
  if (!item) return '';
  const t = type === 'note' ? item.title || item.name : item.name || item.title;
  return String(t || '').trim();
}

/** A field's value on the item now, normalised the way a change states it. */
export function beforeValue(type, item, field) {
  const def = fieldDef(type, field);
  if (!def || !item) return null;
  // with the label it shows, so a label out of step with its tracking still counts as a change
  if (def.kind === 'schedule') return { ...scheduleOf(item), label: item.frequency ?? null };
  const raw = item[def.column];
  switch (def.kind) {
    case 'day':
      return normDay(raw) ?? null;
    case 'time':
      return normTime(raw) ?? null;
    case 'minutes':
      return normMinutes(raw) ?? null;
    case 'flag':
      return raw === true;
    case 'tags':
    case 'links':
      return uniqStrings(raw);
    case 'reminder':
    case 'list':
      return Array.isArray(raw) ? raw : [];
    default:
      return raw == null || raw === '' ? null : raw;
  }
}

function isEvent(item) {
  return !!item && (item.subtype === 'event' || !!normDay(item.target_date));
}

// ── One field ───────────────────────────────────────────────────────────────

/**
 * Read one field's new value against what the item has.
 * @returns {{value: any} | {noop: true} | {error: string}}
 */
function readField(type, field, raw, before, ctx) {
  const def = fieldDef(type, field);
  if (!def) return { error: `unknown_field:${field}` };
  if (ctx.groups && !ctx.groups.includes(def.group)) return { error: `not_asked:${field}` };
  if (raw === null) {
    if (!def.clear) return { error: `cannot_clear:${field}` };
    return before == null || (Array.isArray(before) && !before.length)
      ? { noop: true }
      : { value: null };
  }
  switch (def.kind) {
    case 'text': {
      if (raw && typeof raw === 'object' && 'add' in raw) {
        if (!def.add) return { error: `cannot_add:${field}` };
        const add = normText(raw.add, def.max);
        if (!add) return { error: `bad_value:${field}` };
        return { value: { add } };
      }
      const v = normText(raw, def.max);
      if (!v) return { error: `bad_value:${field}` };
      return v === (typeof before === 'string' ? before.trim() : before)
        ? { noop: true }
        : { value: v };
    }
    case 'day':
    case 'time':
    case 'minutes': {
      const v =
        def.kind === 'day' ? normDay(raw) : def.kind === 'time' ? normTime(raw) : normMinutes(raw);
      if (v === undefined) return { error: `bad_value:${field}` };
      return v === before ? { noop: true } : { value: v };
    }
    case 'enum':
      if (!def.values.includes(raw)) return { error: `bad_value:${field}` };
      return raw === before ? { noop: true } : { value: raw };
    case 'flag':
      if (typeof raw !== 'boolean') return { error: `bad_value:${field}` };
      return raw === before ? { noop: true } : { value: raw };
    case 'schedule': {
      const v = normSchedule(raw);
      if (!v) return { error: `bad_value:${field}` };
      const same =
        before &&
        sameSchedule(v, before) &&
        (before.label == null || before.label === scheduleLabel(v));
      return same ? { noop: true } : { value: v };
    }
    case 'tags':
    case 'links': {
      if (!raw || typeof raw !== 'object') return { error: `bad_value:${field}` };
      const known = def.kind === 'links' ? new Set(ctx[field] || []) : null;
      const have = new Set(before || []);
      const add = uniqStrings(raw.add).filter((x) => !have.has(x));
      const remove = uniqStrings(raw.remove).filter((x) => have.has(x));
      if (known && add.some((x) => !known.has(x))) return { error: `unknown_link:${field}` };
      if (!add.length && !remove.length) return { noop: true };
      return { value: { add, remove } };
    }
    case 'list': {
      if (!raw || typeof raw !== 'object') return { error: `bad_value:${field}` };
      const items = Array.isArray(before) ? before : [];
      const byId = new Map(items.map((i) => [i.id, i]));
      const add = uniqStrings(raw.add).filter((t) => t.length <= 300);
      const ids = (k) => uniqStrings(raw[k]);
      for (const k of ['tick', 'untick', 'remove']) {
        if (ids(k).some((id) => !byId.has(id))) return { error: `unknown_list_item:${field}` };
      }
      const tick = ids('tick').filter((id) => !byId.get(id).checked);
      const untick = ids('untick').filter((id) => byId.get(id).checked);
      const remove = ids('remove');
      if (!add.length && !tick.length && !untick.length && !remove.length) return { noop: true };
      return { value: { add, tick, untick, remove } };
    }
    case 'reminder': {
      if (!raw || typeof raw !== 'object') return { error: `bad_value:${field}` };
      const have = Array.isArray(before) ? before : [];
      const remove = uniqStrings(raw.remove);
      if (remove.some((id) => !have.some((r) => r.id === id)))
        return { error: `unknown_reminder:${field}` };
      const add = [];
      for (const r of Array.isArray(raw.add) ? raw.add : []) {
        const time = normTime(r?.time);
        const repeat = r?.repeat || 'once';
        if (!time || !['once', 'daily', 'weekdays', 'weekends', 'weekly'].includes(repeat)) {
          return { error: `bad_value:${field}` };
        }
        const day = r?.day == null ? null : normDay(r.day);
        if (r?.day != null && !day) return { error: `bad_value:${field}` };
        if (repeat === 'once' && !day) return { error: `bad_value:${field}` };
        let days;
        if (repeat === 'weekly') {
          days = [...new Set(Array.isArray(r?.days) ? r.days : [])]
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
            .sort();
          if (!days.length) return { error: `bad_value:${field}` };
        }
        add.push({ time, repeat, ...(day ? { day } : {}), ...(days ? { days } : {}) });
      }
      if (!add.length && !remove.length) return { noop: true };
      return { value: { add, remove } };
    }
    default:
      return { error: `unknown_kind:${field}` };
  }
}

function readFields(type, rawFields, item, ctx, { forAdd = false } = {}) {
  if (!rawFields || typeof rawFields !== 'object' || Array.isArray(rawFields)) {
    return { error: 'no_fields' };
  }
  // a note given a date in the same change is dated from then on
  const dated = isEvent(item) || (rawFields.day != null && normDay(rawFields.day) !== undefined);
  const fields = {};
  const before = {};
  for (const [field, raw] of Object.entries(rawFields)) {
    const def = fieldDef(type, field);
    if (!def) return { error: `unknown_field:${field}` };
    if (def.events && !forAdd && !dated) return { error: `not_an_event:${field}` };
    if (forAdd && raw === null) continue;
    const b = forAdd ? null : beforeValue(type, item, field);
    const r = readField(type, field, raw, b, ctx);
    if (r.error) return { error: r.error };
    if (r.noop) continue;
    fields[field] = r.value;
    if (!forAdd) before[field] = b;
  }
  return { fields, before };
}

// ── One change ──────────────────────────────────────────────────────────────

function readDays(days, today, logged, op) {
  const list = [...new Set((Array.isArray(days) ? days : []).map(normDay))];
  if (!list.length || list.some((d) => !d)) return { error: 'bad_days' };
  if (today && list.some((d) => d > today)) return { error: 'future_day' };
  if (Array.isArray(logged)) {
    const have = new Set(logged);
    const keep = list.filter((d) => (op === 'log' ? !have.has(d) : have.has(d)));
    if (!keep.length) return { noop: true };
    return { days: keep.sort() };
  }
  return { days: list.sort() };
}

function readPlan(plan) {
  if (!plan || !PLAN_KINDS.includes(plan.kind)) return { error: 'bad_plan' };
  const mins = (v) =>
    v == null ? null : Number.isInteger(v) && v >= 0 && v <= 1440 ? v : undefined;
  const start = mins(plan.start);
  const end = mins(plan.end);
  const after = mins(plan.after);
  if (start === undefined || end === undefined || after === undefined)
    return { error: 'bad_plan_time' };
  if (plan.kind === 'add_block' && (start == null || !String(plan.title || '').trim()))
    return { error: 'bad_plan' };
  if (plan.kind !== 'add_block' && plan.kind !== 'plan_day' && !plan.id)
    return { error: 'bad_plan' };
  if (plan.kind === 'plan_move' && start == null) return { error: 'bad_plan_time' };
  return { plan: { ...plan, start, end, ...(after != null ? { after } : {}) } };
}

/**
 * Check one change against the item it names.
 * @param {object} raw the change as proposed
 * @param {{today?: string, item?: object|null, worlds?: string[], chapters?: string[], groups?: string[]}} ctx
 * @returns {{ok: true, change: object} | {ok: false, reason: string}}
 */
export function checkChange(raw, ctx = {}) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'unknown_op' };
  if (WEEK_OP_NAMES.includes(raw.op)) return checkWeekChange(raw, ctx);
  if (raw.op in EASE_OPS) return checkEase(raw, ctx);
  if (!(raw.op in OPS)) return { ok: false, reason: 'unknown_op' };
  const base = { cid: raw.cid || null, op: raw.op };

  if (raw.op === 'plan') {
    const p = readPlan(raw.plan);
    if (p.error) return { ok: false, reason: p.error };
    return {
      ok: true,
      change: {
        ...base,
        type: raw.type || null,
        id: raw.id || p.plan.id || null,
        title: String(p.plan.title || '').trim(),
        plan: p.plan,
      },
    };
  }

  const type = raw.type;
  const spec = TYPES[type];
  if (!spec) return { ok: false, reason: 'unknown_type' };
  if (!spec.ops.includes(raw.op)) return { ok: false, reason: 'op_not_for_type' };

  if (raw.op === 'add') {
    const r = readFields(type, raw.fields, null, ctx, { forAdd: true });
    if (r.error) return { ok: false, reason: r.error };
    if (typeof r.fields.name !== 'string') return { ok: false, reason: 'add_needs_name' };
    return {
      ok: true,
      change: { ...base, type, id: null, title: r.fields.name, fields: r.fields, before: {} },
    };
  }

  const item = ctx.item;
  if (!item || (raw.id && item.id && item.id !== raw.id)) return { ok: false, reason: 'no_item' };
  if (item.external_source) return { ok: false, reason: 'calendar_item' };
  const archived = item.archived === true;
  if (raw.op === 'restore' ? !archived : archived)
    return { ok: false, reason: archived ? 'archived' : 'not_archived' };
  const done = { ...base, type, id: item.id || raw.id, title: itemTitle(type, item) };

  switch (raw.op) {
    case 'change': {
      const r = readFields(type, raw.fields, item, ctx);
      if (r.error) return { ok: false, reason: r.error };
      if (!Object.keys(r.fields).length) return { ok: false, reason: 'no_change' };
      return { ok: true, change: { ...done, fields: r.fields, before: r.before } };
    }
    case 'done':
      return item.completed_at ? { ok: false, reason: 'no_change' } : { ok: true, change: done };
    case 'reopen':
      return item.completed_at ? { ok: true, change: done } : { ok: false, reason: 'no_change' };
    case 'log':
    case 'unlog': {
      const r = readDays(raw.days, ctx.today, item.logged_days, raw.op);
      if (r.error) return { ok: false, reason: r.error };
      if (r.noop) return { ok: false, reason: 'no_change' };
      return { ok: true, change: { ...done, days: r.days } };
    }
    case 'skip_today':
    case 'archive':
    case 'restore':
      return { ok: true, change: done };
    case 'convert': {
      const to = raw.to;
      if (!TYPES[to] || to === type) return { ok: false, reason: 'bad_convert' };
      const r = readFields(to, raw.fields || {}, null, ctx, { forAdd: true });
      if (r.error) return { ok: false, reason: r.error };
      return { ok: true, change: { ...done, to, fields: r.fields, before: {} } };
    }
    default:
      return { ok: false, reason: 'unknown_op' };
  }
}

// ── The week ────────────────────────────────────────────────────────────────

const WEEK_OP_NAMES = Object.keys(WEEK_OPS);

/** Days as a sorted list with no repeats, or null when one is not a real date. */
function dayList(days) {
  if (!Array.isArray(days)) return null;
  const list = [...new Set(days.map(normDay))];
  return list.some((d) => !d) ? null : list.sort();
}

const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A milestone's steps, read against today and the date it is for. */
function readSteps(steps, today, date) {
  if (!Array.isArray(steps) || !steps.length) return { error: 'milestone_needs_steps' };
  if (steps.length > WEEK_LIMITS.steps) return { error: 'too_many_steps' };
  const out = [];
  for (const s of steps) {
    const title = normText(s?.title, NAME_LIMIT);
    const by = normDay(s?.by);
    if (!title || !by || !STEP_KINDS.includes(s?.kind)) return { error: 'bad_step' };
    // a step is done between now and the date it leads up to
    if ((today && by < today) || by > date) return { error: 'step_outside' };
    const step = { title, by, kind: s.kind };
    if (s.minutes != null) {
      const minutes = normMinutes(s.minutes);
      if (minutes === undefined) return { error: 'bad_step' };
      step.minutes = minutes;
    }
    out.push(step);
  }
  return { steps: out };
}

/**
 * Check one of the week's own changes (WEEK_OPS) against the person's week.
 * @param {object} raw the change as proposed
 * @param {{today?: string, item?: object|null, week?: {first: string, last: string,
 *   week_start?: string, hours?: object|null, busy_days?: string[], has_review?: boolean,
 *   intention?: {id?: string|null, text: string}|null, weekly_day?: number}|null}} ctx
 *   week: the days the week's changes act on (first to last), the first day of
 *   the week they belong to, the week's shape and intention as they stand,
 *   whether the week has a review to keep its shape and check ins on, and the
 *   weekly day. A habit's snapshot carries planned_days, the days it is
 *   planned on now.
 * @returns {{ok: true, change: object} | {ok: false, reason: string}}
 */
export function checkWeekChange(raw, ctx = {}) {
  const w = ctx.week;
  if (!w || !normDay(w.first) || !normDay(w.last)) return { ok: false, reason: 'no_week' };
  const base = { cid: raw.cid || null, op: raw.op };
  const today = ctx.today || null;
  const inWeek = (d) => d >= w.first && d <= w.last;
  // the week the shape, the intention and the check ins are kept for
  const weekStart = normDay(w.week_start) || w.first;
  // the item a change names, as the item changes read it
  const itemFor = (type) => {
    if (raw.type !== type) return { reason: 'op_not_for_type' };
    const item = ctx.item;
    if (!item || (raw.id && item.id && item.id !== raw.id)) return { reason: 'no_item' };
    if (item.external_source) return { reason: 'calendar_item' };
    if (item.archived === true) return { reason: 'archived' };
    return { item };
  };

  switch (raw.op) {
    case 'later': {
      const r = itemFor('todo');
      if (r.reason) return { ok: false, reason: r.reason };
      if (r.item.completed_at) return { ok: false, reason: 'already_done' };
      // as proposed, or as a checked change states it
      const back = normDay(raw.back_on ?? raw.fields?.back_on);
      if (!back) return { ok: false, reason: 'bad_value:back_on' };
      // every Later comes back: on a day still to come, within four weeks
      if (today && back <= today) return { ok: false, reason: 'back_not_ahead' };
      if (today && daysBetween(today, back) > LATER_MAX_DAYS)
        return { ok: false, reason: 'back_too_far' };
      const before = {
        back_on: normDay(r.item.resurface_at) ?? null,
        day: normDay(r.item.due_day) ?? null,
      };
      if (before.back_on === back && before.day === null) return { ok: false, reason: 'no_change' };
      return {
        ok: true,
        change: {
          ...base,
          type: 'todo',
          id: r.item.id || raw.id,
          title: itemTitle('todo', r.item),
          fields: { back_on: back },
          before,
        },
      };
    }
    case 'habit_days': {
      const r = itemFor('habit');
      if (r.reason) return { ok: false, reason: r.reason };
      const stated = dayList(raw.days);
      if (!stated) return { ok: false, reason: 'bad_days' };
      // A day already gone that the habit was planned on stays as it is, so
      // naming it changes nothing and it is no part of the change. Any other
      // day outside the days these changes act on is turned away.
      const planned = dayList(r.item.planned_days) || [];
      const days = stated.filter((d) => !(d < w.first && planned.includes(d)));
      if (days.some((d) => !inWeek(d))) return { ok: false, reason: 'outside_week' };
      const was = planned.filter(inWeek);
      if (sameList(days, was)) return { ok: false, reason: 'no_change' };
      // A day it is paused on is no day to put it on: nothing would show it
      // or ask about it there. Known only when their pauses came with the turn.
      const id = r.item.id || raw.id;
      if (days.some((d) => !was.includes(d) && pausedOn(ctx.ease?.rows, id, d)))
        return { ok: false, reason: 'day_paused' };
      return {
        ok: true,
        change: {
          ...base,
          type: 'habit',
          id: r.item.id || raw.id,
          title: itemTitle('habit', r.item),
          days,
          before: { days: was },
        },
      };
    }
    case 'week_shape': {
      // the shape is kept on the week's review, so there has to be one
      if (!w.has_review) return { ok: false, reason: 'no_review' };
      const s = raw.shape;
      if (!s || typeof s !== 'object' || Array.isArray(s))
        return { ok: false, reason: 'bad_shape' };
      const shape = {};
      const before = {};
      if (s.busy_days != null) {
        const stated = dayList(s.busy_days);
        if (!stated) return { ok: false, reason: 'bad_days' };
        // the days stated are the ones from here on: a busy day already gone
        // stays as it is, so naming it changes nothing
        const busy = dayList(w.busy_days) || [];
        const days = stated.filter((d) => !(d < w.first && busy.includes(d)));
        if (days.some((d) => !inWeek(d))) return { ok: false, reason: 'outside_week' };
        const was = busy.filter(inWeek);
        if (!sameList(days, was)) {
          shape.busy_days = days;
          before.busy_days = was;
        }
      }
      if (s.hours != null) {
        if (typeof s.hours !== 'object' || Array.isArray(s.hours))
          return { ok: false, reason: 'bad_value:hours' };
        const hours = {};
        const hoursWas = {};
        for (const kind of DAY_KINDS) {
          if (s.hours[kind] == null) continue;
          const h = normHours(s.hours[kind]);
          if (h === undefined) return { ok: false, reason: 'bad_value:hours' };
          const was = normHours(w.hours?.[kind]) ?? null;
          if (h === was) continue;
          hours[kind] = h;
          hoursWas[kind] = was;
        }
        if (Object.keys(hours).length) {
          shape.hours = hours;
          before.hours = hoursWas;
        }
      }
      if (!Object.keys(shape).length) return { ok: false, reason: 'no_change' };
      return {
        ok: true,
        change: {
          ...base,
          type: null,
          id: null,
          title: '',
          week_start: weekStart,
          // the first day the busy days were stated for
          from: w.first,
          shape,
          before,
        },
      };
    }
    case 'intention': {
      const text = normText(raw.intention ?? raw.fields?.text, WEEK_LIMITS.intention);
      if (!text) return { ok: false, reason: 'bad_value:intention' };
      const was = typeof w.intention?.text === 'string' ? w.intention.text.trim() : null;
      if (text === was) return { ok: false, reason: 'no_change' };
      return {
        ok: true,
        change: {
          ...base,
          type: 'note',
          // the week's intention when it has one already: that note is rewritten
          id: w.intention?.id || null,
          title: text,
          week_start: weekStart,
          fields: { text },
          before: { text: was || null },
        },
      };
    }
    case 'milestone': {
      const m = raw.milestone;
      if (!m || typeof m !== 'object') return { ok: false, reason: 'bad_milestone' };
      const goal = normText(m.goal, WEEK_LIMITS.goal);
      const date = normDay(m.date);
      if (!goal || !date) return { ok: false, reason: 'bad_milestone' };
      if (today && date <= today) return { ok: false, reason: 'milestone_not_ahead' };
      const r = readSteps(m.steps, today, date);
      if (r.error) return { ok: false, reason: r.error };
      // check ins are kept on the week's review, so there has to be one
      if (!w.has_review && r.steps.some((s) => s.kind === 'check_in'))
        return { ok: false, reason: 'no_review' };
      return {
        ok: true,
        change: {
          ...base,
          type: null,
          id: null,
          title: goal,
          week_start: weekStart,
          milestone: { goal, date, steps: r.steps },
        },
      };
    }
    case 'weekly_day': {
      const d = raw.weekday ?? raw.fields?.weekday;
      if (!Number.isInteger(d) || d < 0 || d > 6) return { ok: false, reason: 'bad_value:weekday' };
      const was = Number.isInteger(w.weekly_day) ? w.weekly_day : null;
      if (d === was) return { ok: false, reason: 'no_change' };
      return {
        ok: true,
        change: {
          ...base,
          type: null,
          id: null,
          title: '',
          fields: { weekday: d },
          before: { weekday: was },
        },
      };
    }
    default:
      return { ok: false, reason: 'unknown_op' };
  }
}

// ── A habit eased for a stretch of days ─────────────────────────────────────

/** A pause or lighter version as a checked change states it. */
const easeFacts = (e) => ({ mode: e.mode, first: e.first, last: e.last, note: e.note });

/**
 * Check a habit's pause, lighter version or return to usual.
 *
 * A pause or a lighter version starts today or later and ends within four
 * weeks of today. With no first day it starts today; with no last day it runs
 * to the end of the week its first day is in. During the weekly review both
 * are the days being planned instead (ctx.ease.span). A lighter version is
 * said in a few words: theirs when they gave them, otherwise the ones it
 * already has on its first day, otherwise the smallest version saved on the
 * habit, otherwise none. One that is already so is no change; but a last day
 * stated for one that runs past it is read as when it should end, and comes
 * back as usual from the day after.
 *
 * Usual ends one stretch: from today, or from the day given, to the last day
 * of the pause or lighter version that holds then, or of the next one to come
 * when none does. A last day given is used as it is. The days before its
 * first day stay as they were, so usual from a later day is how a pause is
 * made to end sooner.
 *
 * @param {object} raw the change as proposed: ease {mode, from?, until?, note?}; a
 *   checked change states it as ease {mode, first, last, note}
 * @param {{today?: string, item?: object|null, ease?: {weekly_day?: number, rows?: object[], span?: {first: string, last: string}|null}|null}} ctx
 *   ease: their weekly day and their habit_adaptations rows. Without it the
 *   change is not one this place can make.
 * @returns {{ok: true, change: object} | {ok: false, reason: string}}
 */
export function checkEase(raw, ctx = {}) {
  const today = normDay(ctx.today);
  if (!ctx.ease || !today) return { ok: false, reason: 'unknown_op' };
  if (raw.type && raw.type !== 'habit') return { ok: false, reason: 'op_not_for_type' };
  const item = ctx.item;
  if (!item || (raw.id && item.id && item.id !== raw.id)) return { ok: false, reason: 'no_item' };
  if (item.archived === true) return { ok: false, reason: 'archived' };
  if (item.subtype === 'break_habit') return { ok: false, reason: 'ease_breaking' };
  const e = raw.ease;
  if (!e || typeof e !== 'object' || !EASE_MODES.includes(e.mode))
    return { ok: false, reason: 'bad_ease' };
  const id = item.id || raw.id;
  const rows = (ctx.ease.rows || []).filter((r) => r?.habit_id === id);
  const base = {
    cid: raw.cid || null,
    op: raw.op,
    type: 'habit',
    id,
    title: itemTitle('habit', item),
  };
  // what it is under from today on, which the app holds the card against
  const before = { eases: easesFrom(rows, today).map(easeFacts) };

  // as proposed (from, until), or as a checked change states it (first, last)
  const given = (v) => v !== undefined && v !== null && v !== '';
  const from = e.from ?? e.first;
  const until = e.until ?? e.last;
  // the days a weekly review is planning, when one is under way and they are still ahead
  const span = ctx.ease.span && normDay(ctx.ease.span.last) >= today ? ctx.ease.span : null;
  const spanFirst = span && normDay(span.first) > today ? normDay(span.first) : today;

  if (e.mode === 'usual') {
    const first = given(from) ? normDay(from) : today;
    if (!first) return { ok: false, reason: 'bad_value:from' };
    if (first < today) return { ok: false, reason: 'ease_past' };
    let last = given(until) ? normDay(until) : null;
    if (given(until) && !last) return { ok: false, reason: 'bad_value:until' };
    // the one that holds on its first day, or the next to come
    if (!last) last = easesFrom(rows, first)[0]?.last ?? null;
    if (!last) return { ok: false, reason: 'no_change' };
    if (last < first) return { ok: false, reason: 'ease_ends_first' };
    if (easePlan(rows, { mode: 'usual', first, last }).same)
      return { ok: false, reason: 'no_change' };
    return {
      ok: true,
      change: { ...base, ease: { mode: 'usual', first, last, note: '' }, before },
    };
  }

  const first = given(from) ? normDay(from) : spanFirst;
  if (!first) return { ok: false, reason: 'bad_value:from' };
  if (first < today) return { ok: false, reason: 'ease_past' };
  let last;
  if (given(until)) last = normDay(until);
  else {
    // the end of their week, or of the days being planned; never past the furthest it may run
    const end = span && first <= normDay(span.last) ? normDay(span.last) : null;
    const furthest = addDays(today, EASE_MAX_DAYS);
    last = end || weekAround(first, ctx.ease.weekly_day ?? 0).last;
    if (last > furthest && first <= furthest) last = furthest;
  }
  if (!last) return { ok: false, reason: 'bad_value:until' };
  if (last < first) return { ok: false, reason: 'ease_ends_first' };
  if (daysBetween(today, last) > EASE_MAX_DAYS) return { ok: false, reason: 'ease_too_far' };
  let note = '';
  if (e.mode === 'lighter') {
    const now = easeOn(rows, id, first);
    note =
      easeNote(e.note) || (now?.mode === 'lighter' ? now.note : '') || easeNote(item.floor_note);
  }
  if (easePlan(rows, { mode: e.mode, first, last, note }).same) {
    // It already is that way on every one of those days. A last day stated
    // for one that runs past it says when it should end: it is back to usual
    // from the day after, which is the change that makes it so.
    const now = easeOn(rows, id, last);
    if (given(until) && now && now.last > last) {
      return {
        ok: true,
        change: {
          ...base,
          ease: { mode: 'usual', first: addDays(last, 1), last: now.last, note: '' },
          before,
        },
      };
    }
    return { ok: false, reason: 'ease_already' };
  }
  return { ok: true, change: { ...base, ease: { mode: e.mode, first, last, note }, before } };
}

/** The week's changes a card holds one of: a second is a conflict. */
const ONE_PER_CARD = ['week_shape', 'intention', 'weekly_day'];

// ── A card ──────────────────────────────────────────────────────────────────

/**
 * Check every change on a card. Changes that fail are dropped with their
 * reason. Two changes to the same item merge into one row: field changes join
 * (a later value for the same field wins), and any other change to an item
 * that already has a row is dropped as a conflict, so a card can't say two
 * things about one item. Rows are numbered c1, c2, … when they came without.
 * @param {object[]} raws
 * @param {(raw: object) => object} ctxFor the context for one change (its item)
 */
export function checkCard(raws, ctxFor) {
  const changes = [];
  const dropped = [];
  const rowFor = new Map();
  (Array.isArray(raws) ? raws : []).forEach((raw, i) => {
    const cid = raw?.cid || `c${i + 1}`;
    const r = checkChange({ ...raw, cid }, ctxFor ? ctxFor(raw) : {});
    if (!r.ok) {
      dropped.push({ cid, reason: r.reason });
      return;
    }
    const c = r.change;
    const key = ONE_PER_CARD.includes(c.op)
      ? `week:${c.op}`
      : c.op === 'plan' || !c.id
        ? null
        : `${c.type}:${c.id}`;
    if (key && rowFor.has(key)) {
      const row = rowFor.get(key);
      if (row.op === 'change' && c.op === 'change') {
        row.fields = { ...row.fields, ...c.fields };
        row.before = { ...c.before, ...row.before };
      } else {
        dropped.push({ cid, reason: 'conflict' });
      }
      return;
    }
    if (key) rowFor.set(key, c);
    changes.push(c);
  });
  return { changes, dropped };
}
