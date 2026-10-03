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

import { TYPES, OPS, PLAN_KINDS, fieldDef } from './fields.js';

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

/** A time on a 24 hour clock as HH:MM, or undefined. Seconds are dropped. */
export function normTime(v) {
  if (typeof v !== 'string') return undefined;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v.trim());
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
  if (def.kind === 'schedule') return scheduleOf(item);
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
      return before && sameSchedule(v, before) ? { noop: true } : { value: v };
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
  const fields = {};
  const before = {};
  for (const [field, raw] of Object.entries(rawFields)) {
    const def = fieldDef(type, field);
    if (!def) return { error: `unknown_field:${field}` };
    if (def.events && !forAdd && !isEvent(item)) return { error: `not_an_event:${field}` };
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
  if (start === undefined || end === undefined) return { error: 'bad_plan_time' };
  if (plan.kind === 'add_block' && (start == null || !String(plan.title || '').trim()))
    return { error: 'bad_plan' };
  if (plan.kind !== 'add_block' && !plan.id) return { error: 'bad_plan' };
  if (plan.kind === 'plan_move' && start == null) return { error: 'bad_plan_time' };
  return { plan: { ...plan, start, end } };
}

/**
 * Check one change against the item it names.
 * @param {object} raw the change as proposed
 * @param {{today?: string, item?: object|null, worlds?: string[], chapters?: string[], groups?: string[]}} ctx
 * @returns {{ok: true, change: object} | {ok: false, reason: string}}
 */
export function checkChange(raw, ctx = {}) {
  if (!raw || typeof raw !== 'object' || !(raw.op in OPS))
    return { ok: false, reason: 'unknown_op' };
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
    const key = c.op === 'plan' || !c.id ? null : `${c.type}:${c.id}`;
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
