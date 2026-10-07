/**
 * The weekly read: what Gremly prepares before the weekly review opens.
 *
 * One model call per person per week (weekRead in the models table, at medium
 * effort; at low it took a habit's name for a count). Code gathers what Gremly
 * knows about the person, works out every count and total, and gives each item
 * a short id. The model writes the challenge and its evidence, what they are
 * coming off and what is coming up, priority options, each with a line that
 * could be the week's intention, a guess at their free hours, busy days,
 * milestones, what needs them and habit days. Code then turns the short ids
 * back into real ones, drops anything it does not know, checks every date and
 * number and takes the dashes out.
 *
 *   gatherRead (reads)  →  renderRead (pure)  →  the model  →  checkRead (pure)
 *
 * The prompt is semantic rules only. Nothing here reads the person's words:
 * code handles ids, dates and numbers, and the meaning is the model's.
 */

import { db, addDays, daysBetween, relativeDay, weekdayName, personIdentity } from '../context/db';
import { jsonCall, modelFor } from '../context/llm';
import { clockTime, noDashes } from '../brief/writer';
import { weeklyTarget } from '../brief/behind';
import {
  isCancelledEntry,
  localStartIso,
  meetingsFrom,
  minutesIn,
  syncedOn,
  syncedRange,
} from '../../shared/calendar.js';
import {
  LOOK_AHEAD_DAYS,
  READ_AHEAD_DAYS,
  daysOffOf,
  isDay,
  minutesOf,
  normHours,
  spanDays,
  weekdayOf,
} from '../../shared/week.js';
import { gremlyPut, habitAllowance, habitOpenDays } from '../../shared/weekBoard.js';
import { easesFrom, pauseSpans } from '../../shared/habitWeek.js';
import { upNext, upNextWords } from '../../shared/upNext.js';
import { checkWeekChange, normDay, normMinutes } from '../../shared/changes/check.js';
import { STEP_KINDS, WEEK_LIMITS, NAME_LIMIT } from '../../shared/changes/fields.js';

export const WEEK_READ_VERSION = 'week-read-2026-10-09d';

/** The most open todos the read lists; the figures still count every one. */
export const TODO_LIST_MAX = 120;
const DATED_MAX = 60;
const ENTRIES_A_DAY = 12;

/** What the read may hold of each kind. */
export const READ_LIMITS = {
  evidence: 4,
  coming_up: 8,
  priorities: 5,
  picks: 3,
  intentions: 3,
  milestones: 4,
  answers: 4,
  needs_you: 4,
};

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const enc = encodeURIComponent;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "45 minutes", "1 hour", "5 hours 30 minutes". */
export function lengthWords(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? plural(h, 'hour', 'hours') : '', m || !h ? plural(m, 'minute', 'minutes') : '']
    .filter(Boolean)
    .join(' ');
}

/** "2.5 hours", "1 hour", "0.5 hours": minutes to the nearest half hour, the way the review speaks of time. */
export function hoursWords(min) {
  const h = Math.round(min / 30) / 2;
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
}

/**
 * What already sits on each day being planned: how many open todos have that
 * day, and the minutes they add up to, a todo with no length counted as the
 * board counts it (minutesOf).
 * @param {object[]} todos every open todo, listed or not
 * @param {string[]} days the days being planned
 */
export function dayLoads(todos, days) {
  return days.map((day) => {
    const on = todos.filter((t) => t.due_day === day);
    return { day, todos: on.length, minutes: on.reduce((n, t) => n + minutesOf(t), 0) };
  });
}

/** The day this many calendar months before a day, kept inside the shorter month. */
export function monthsBefore(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 - n, 1));
  const lastOfMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(d, lastOfMonth));
  return first.toISOString().slice(0, 10);
}

// ── What the read is given, shaped ──────────────────────────────────────────

const priorityLines = (v) =>
  (Array.isArray(v) ? v : []).map((k) => (typeof k === 'string' ? k : k?.text)).filter(Boolean);

const wholeMinutes = (v) => (Number.isInteger(v) && v > 0 ? v : null);

/** An open todo as the read sees it: its length, its age, how often it has moved, its dates. */
export function shapeTodo(t) {
  return {
    id: t.id,
    title: t.name || t.title || 'Untitled',
    minutes: wholeMinutes(t.time_estimate_minutes),
    created: typeof t.created_at === 'string' ? t.created_at.slice(0, 10) : null,
    moved: Number.isInteger(t.sweep_reschedule_count) ? t.sweep_reschedule_count : 0,
    due_day: isDay(t.due_day) ? t.due_day : null,
    deadline: isDay(t.target_date) ? t.target_date : null,
    back_on: isDay(t.resurface_at) ? t.resurface_at : null,
    // it has a time of day: an appointment, which no review rearranges
    timed: typeof t.due_time === 'string' && t.due_time !== '',
  };
}

/**
 * The todos on a day they chose themselves, among the days being planned:
 * every one with a day there, except where the day is the one Gremly's last
 * spread of this same week gave it (workers/shared/weekBoard.js gremlyPut).
 * @returns {Set<string>} their ids
 */
export function theirDays(g) {
  const days = spanDays(g.first, g.last).filter((d) => d >= g.today);
  const answers = { planned: { gremly: g.last_review?.put || null } };
  return new Set(
    (g.todos || [])
      .filter((t) => t.due_day && days.includes(t.due_day) && !gremlyPut(t, answers))
      .map((t) => t.id),
  );
}

/**
 * A habit as the read sees it: what they aim for, how the last four weeks
 * went (days it was logged, last week and the three weeks before), the days
 * it is already planned on, and any pause or lighter version still to run.
 * paused is what the board's rules read (weekBoard.js habitOpenDays): a day
 * inside a pause is no day to put it on.
 */
export function shapeHabit(h, { progress = [], plans = [], eases = [], today }) {
  const mine = eases.filter((e) => e?.habit_id === h.id);
  const cadence = ['weekly', 'monthly'].includes(h.cadence) ? h.cadence : 'daily';
  const logged = new Set(progress.filter((p) => p.habit_id === h.id).map((p) => p.occurred_day));
  const weekAgo = addDays(today, -6);
  const monthAgo = addDays(today, -27);
  let lastWeek = 0;
  let before = 0;
  for (const day of logged) {
    if (!isDay(day) || day > today || day < monthAgo) continue;
    if (day >= weekAgo) lastWeek += 1;
    else before += 1;
  }
  let target = null;
  // a weekly habit with no count kept aims for one
  if (cadence === 'weekly') target = weeklyTarget({ ...h, cadence }) ?? 1;
  if (cadence === 'monthly') target = h.target_per_period > 0 ? h.target_per_period : 1;
  return {
    id: h.id,
    title: h.name || h.title || 'Habit',
    cadence,
    target,
    days_active: Array.isArray(h.days_active)
      ? h.days_active.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : [],
    breaking: h.subtype === 'break_habit',
    minutes: wholeMinutes(h.time_estimate_minutes),
    start_date: isDay(h.start_date) ? h.start_date : null,
    end_date: isDay(h.end_date) ? h.end_date : null,
    last_week: lastWeek,
    before,
    planned: plans
      .filter((p) => p.habit_id === h.id && isDay(p.planned_date))
      .map((p) => p.planned_date)
      .sort(),
    paused: pauseSpans(mine, h.id),
    eased: easesFrom(mine, today).map((e) => ({
      mode: e.mode,
      first: e.first,
      last: e.last,
      note: e.note,
    })),
  };
}

// How many of the days being planned a habit can be put on is the board's rule
// (workers/shared/weekBoard.js habitAllowance), shared with the app's board.
export { habitAllowance };

/** Minutes booked on a day, with meetings that overlap counted once. */
export function bookedMinutes(meetings) {
  const spans = (meetings || [])
    .map((m) => [m.start, m.end])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let until = -1;
  for (const [a, b] of spans) {
    if (b <= until) continue;
    total += b - Math.max(a, until);
    until = b;
  }
  return total;
}

/** The last date an all day calendar entry covers (its end is the midnight after, or a second before). */
function allDayEnd(e) {
  const start = e.start_at.slice(0, 10);
  if (!e.end_at) return start;
  const last = new Date(Date.parse(e.end_at) - 1000).toISOString().slice(0, 10);
  return last > start ? last : start;
}

/** Every row of a select, a thousand at a time: the API hands back no more per call. */
async function selectAll(d, path, most = 5000) {
  const rows = [];
  for (let from = 0; from < most; from += 1000) {
    const page = (await d.select(`${path}&order=id.asc&limit=1000&offset=${from}`)) || [];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The dated things Gremly holds and the whole days on their calendar, from today to six weeks out. */
function datedThings({ notes, quick, allDayAhead, chapters, today, horizon }) {
  const dated = [];
  const add = (type, id, what, title, date, more = {}) =>
    dated.push({
      type,
      id,
      what,
      title: title || 'Untitled',
      date,
      end: null,
      time: null,
      ...more,
    });
  for (const n of notes || []) {
    if (!isDay(n.target_date)) continue;
    add('note', n.id, n.subtype === 'event' ? 'event' : 'note', n.title, n.target_date, {
      end: isDay(n.end_date) && n.end_date > n.target_date ? n.end_date : null,
      time: n.event_time ? String(n.event_time).slice(0, 5) : null,
    });
  }
  for (const c of quick || []) {
    if (!isDay(c.event_date)) continue;
    add('calendar_event', c.id, 'event', c.title, c.event_date, {
      time: c.event_time ? String(c.event_time).slice(0, 5) : null,
    });
  }
  for (const e of allDayAhead || []) {
    if (!e?.start_at || isCancelledEntry(e)) continue;
    const start = e.start_at.slice(0, 10);
    const end = allDayEnd(e);
    add('synced_event', e.id, 'on their calendar, all day', e.title, start, {
      end: end > start ? end : null,
    });
  }
  for (const c of chapters || []) {
    if (isDay(c.start_date) && c.start_date > today && c.start_date <= horizon)
      add('chapter', c.id, 'a chapter of their life starts', c.title, c.start_date);
    if (isDay(c.end_date) && c.end_date >= today && c.end_date <= horizon)
      add('chapter', c.id, 'a chapter of their life ends', c.title, c.end_date);
  }
  return dated;
}

/**
 * Their last review, from the four weeks up to this one: the week it planned,
 * its intention, its priorities with how many of their todos got done since,
 * and the free hours they set. For an extra review that is this same week's
 * own review. With no review, an intention kept for last week is still given.
 */
async function lastReviewOf(d, userId, row, weekStart) {
  const from = row?.week_start || addDays(weekStart, -7);
  const intentions = await d.select(
    `notes?owner_id=eq.${userId}&journal_subtype=eq.intention&archived=eq.false&target_date=gte.${from}&target_date=lte.${addDays(from, 6)}&select=title,body,target_date&order=target_date.desc&limit=1`,
  );
  const intention = intentions?.[0];
  if (!row && !intention) return null;
  const answers = row?.answers && typeof row.answers === 'object' ? row.answers : {};
  const picked = (Array.isArray(answers.priorities) ? answers.priorities : []).slice(0, 5);
  const idsOf = (x) => (Array.isArray(x?.item_ids) ? x.item_ids : []).filter((id) => UUID.test(id));
  const ids = [...new Set(picked.flatMap(idsOf))].slice(0, 60);
  const rows = ids.length
    ? await d.select(
        `todos?owner_id=eq.${userId}&id=in.(${ids.join(',')})&select=id,completed_at&limit=60`,
      )
    : [];
  const isDone = new Map((rows || []).map((t) => [t.id, !!t.completed_at]));
  return {
    week_start: from,
    reviewed: !!row,
    intention: trim(intention?.body || intention?.title || '', 200) || null,
    priorities: picked
      .filter((x) => typeof x?.text === 'string' && x.text.trim())
      .map((x) => {
        const mine = idsOf(x).filter((id) => isDone.has(id));
        return { text: x.text, of: mine.length, done: mine.filter((id) => isDone.get(id)).length };
      }),
    hours: answers.hours && typeof answers.hours === 'object' ? answers.hours : null,
    // this same week planned before: where Gremly's spread put each todo then
    put:
      row &&
      from === weekStart &&
      answers.planned?.gremly &&
      typeof answers.planned.gremly === 'object'
        ? answers.planned.gremly
        : null,
  };
}

/**
 * Everything the read is given, gathered and shaped. The replay builds the
 * same shape by hand for its made up people.
 * @param {object} env
 * @param {string} userId
 * @param {{today: string, first: string, last: string, week_start: string, tz: string,
 *   days_off?: number[], at?: Date}} p today is the person's day; first to last are the
 *   days being planned; week_start is the first day of the week they belong to
 */
export async function gatherRead(env, userId, p) {
  const d = db(env);
  const { today, first, last, tz } = p;
  const at = p.at || new Date();
  const horizon = addDays(today, LOOK_AHEAD_DAYS);
  const mine = `owner_id=eq.${userId}`;
  const [
    person,
    worlds,
    chapters,
    open,
    done,
    habitRows,
    progress,
    plans,
    eases,
    notes,
    quick,
    range,
    allDayAhead,
    tokens,
    lastReviews,
  ] = await Promise.all([
    personIdentity(env, userId),
    d.select(
      `worlds?${mine}&phase=in.(active,evolving,dormant)&select=id,name,display_name,phase,summary,key_priorities&order=last_signal_at.desc.nullslast&limit=30`,
    ),
    d.select(
      `chapters?${mine}&phase=in.(upcoming,active)&select=id,title,phase,start_date,end_date,summary,key_priorities&order=start_date.desc.nullslast&limit=30`,
    ),
    selectAll(
      d,
      `todos?${mine}&completed_at=is.null&archived=eq.false&select=id,name,title,due_day,due_time,target_date,time_estimate_minutes,created_at,sweep_reschedule_count,resurface_at`,
    ),
    selectAll(
      d,
      `todos?${mine}&completed_at=gte.${enc(localStartIso(tz, addDays(today, -6)))}&select=id,name,title,completed_at`,
    ),
    d.select(
      `habits?${mine}&archived=eq.false&select=id,name,title,cadence,target_per_period,days_active,subtype,start_date,end_date,time_estimate_minutes&order=created_at.asc&limit=200`,
    ),
    selectAll(
      d,
      `habit_progress?${mine}&occurred_day=gte.${addDays(today, -27)}&occurred_day=lte.${today}&select=habit_id,occurred_day`,
    ),
    d.select(
      `habit_plans?${mine}&planned_date=gte.${first}&planned_date=lte.${last}&select=habit_id,planned_date&limit=500`,
    ),
    // a habit paused or on a lighter version on any day from today to the last one planned
    d.select(
      `habit_adaptations?${mine}&period_end=gte.${today}&period_start=lte.${last}&select=id,habit_id,mode,period_start,period_end,floor_note&limit=200`,
    ),
    // dated things Gremly holds, from today to six weeks out; a journal note is not a plan
    d.select(
      `notes?${mine}&archived=eq.false&external_source=is.null&or=(subtype.is.null,subtype.neq.journal)&target_date=gte.${today}&target_date=lte.${horizon}&select=id,title,subtype,target_date,event_time,end_date&order=target_date.asc&limit=150`,
    ),
    d.select(
      `calendar_events?${mine}&event_date=gte.${today}&event_date=lte.${horizon}&select=id,title,event_date,event_time,duration_minutes&order=event_date.asc&limit=150`,
    ),
    // the connected calendar: every meeting on the days being planned
    syncedRange(d, userId, tz, first, last),
    // and what fills whole days from today to six weeks out
    d.select(
      `synced_calendar_events?${mine}&archived=eq.false&is_all_day=eq.true&start_at=gte.${today}T00:00:00Z&start_at=lte.${horizon}T23:59:59Z&select=id,title,start_at,end_at,is_all_day&order=start_at.asc&limit=150`,
    ),
    d.select(`calendar_tokens?${mine}&is_active=eq.true&select=id&limit=1`),
    // their last review that got under way, from the four weeks up to this one;
    // for an extra review that is this same week's own
    d.select(
      `weekly_reviews?${mine}&week_start=lte.${p.week_start}&week_start=gte.${addDays(p.week_start, -READ_AHEAD_DAYS)}&status=in.(started,done)&select=week_start,status,answers&order=week_start.desc&limit=1`,
    ),
  ]);

  // the connected calendar on each day being planned
  const calendarDays = spanDays(first, last).map((day) => {
    const { meetings, allDay } = meetingsFrom({ synced: syncedOn(range, day, tz), tz });
    return {
      day,
      // each timed entry with its id, so the read can name one as a moment that is coming up
      meetings: meetings.map((m) => ({
        id: m.id,
        title: m.title || 'Busy',
        start: m.start,
        end: m.end,
      })),
      all_day: allDay.map((e) => e.title || 'Untitled'),
    };
  });

  return {
    tz,
    today,
    now: minutesIn(tz, at),
    first,
    last,
    week_start: p.week_start,
    days_off: daysOffOf(p.days_off),
    person,
    worlds: (worlds || []).map((w) => ({
      name: w.display_name || w.name || 'World',
      phase: w.phase,
      summary: w.summary || '',
      priorities: priorityLines(w.key_priorities),
    })),
    chapters: (chapters || []).map((c) => ({
      id: c.id,
      title: c.title || 'Untitled',
      phase: c.phase,
      start_date: isDay(c.start_date) ? c.start_date : null,
      end_date: isDay(c.end_date) ? c.end_date : null,
      summary: c.summary || '',
      priorities: priorityLines(c.key_priorities),
    })),
    todos: open.map(shapeTodo),
    // newest first, so the ones named are the latest when there are many
    done: [...(done || [])]
      .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)))
      .map((t) => ({ title: t.name || t.title || 'Untitled' })),
    habits: (habitRows || [])
      .map((h) =>
        shapeHabit(h, {
          progress: progress || [],
          plans: plans || [],
          eases: eases || [],
          today,
        }),
      )
      .filter((h) => !h.end_date || h.end_date >= today),
    dated: datedThings({ notes, quick, allDayAhead, chapters, today, horizon }),
    // the open Chapter with the nearest date, worked out in code (shared/upNext.js)
    up_next: upNext(chapters || [], today),
    calendar: { connected: (tokens || []).length > 0, days: calendarDays },
    last_review: await lastReviewOf(d, userId, lastReviews?.[0], p.week_start),
  };
}

// ── What the model reads ────────────────────────────────────────────────────

/**
 * The figures the model is given instead of counting for itself: every open
 * todo is counted, listed or not.
 * @param {object[]} todos
 * @param {string} today
 * @param {string[]} [days] the days being planned
 */
export function figuresOf(todos, today, days = []) {
  const cutoff = monthsBefore(today, 3);
  const inDays = (d) => !!d && days.includes(d);
  return {
    open: todos.length,
    hours: Math.round(todos.reduce((n, t) => n + minutesOf(t), 0) / 60),
    old: todos.filter((t) => t.created && t.created < cutoff).length,
    moved: todos.filter((t) => t.moved >= 10).length,
    // a day or a date that has gone by, and one that falls on the days being planned
    gone: todos.filter(
      (t) => (t.due_day && t.due_day < today) || (t.deadline && t.deadline < today),
    ).length,
    dated: todos.filter((t) => inDays(t.due_day) || inDays(t.deadline)).length,
  };
}

const todoDate = (t) => t.deadline || t.due_day || t.back_on || null;
const byDateThenAge = (a, b) =>
  (todoDate(a) || '9999').localeCompare(todoDate(b) || '9999') ||
  (a.created || '').localeCompare(b.created || '') ||
  String(a.id).localeCompare(String(b.id));

/**
 * The open todos the read lists when there are more than it can take: the
 * dated ones first, then the most moved, the oldest and the newest. Chosen by
 * dates and counts alone.
 */
export function todosToList(todos, today, most = TODO_LIST_MAX) {
  if (todos.length <= most) return [...todos].sort(byDateThenAge);
  const horizon = addDays(today, LOOK_AHEAD_DAYS);
  const picked = new Map();
  const take = (list, n) => {
    let taken = 0;
    for (const t of list) {
      if (picked.size >= most || taken >= n) break;
      if (picked.has(t.id)) continue;
      picked.set(t.id, t);
      taken += 1;
    }
  };
  take(
    todos.filter((t) => todoDate(t) && todoDate(t) <= horizon).sort(byDateThenAge),
    Math.floor(most / 2),
  );
  take(
    todos.filter((t) => t.moved > 0).sort((a, b) => b.moved - a.moved || byDateThenAge(a, b)),
    Math.floor(most / 6),
  );
  const byAge = [...todos].sort(
    (a, b) => (a.created || '').localeCompare(b.created || '') || byDateThenAge(a, b),
  );
  take(byAge, Math.floor(most / 6));
  take([...byAge].reverse(), most);
  return [...picked.values()].sort(byDateThenAge);
}

/** How a habit is going, as a sentence: given as a table, the model took a name for a count. */
export function habitSentence(h, today) {
  if (h.breaking) return 'a habit they are breaking, so it is not put on days.';
  let aim = 'aiming for every day';
  if (h.cadence === 'weekly') aim = `aiming for ${h.target} a week`;
  else if (h.cadence === 'monthly') aim = `aiming for ${h.target} a month`;
  else if (h.days_active?.length && h.days_active.length < 7)
    aim = `aiming for ${plural(h.days_active.length, 'set day', 'set days')} a week`;
  const each = h.minutes ? `, about ${plural(h.minutes, 'minute', 'minutes')} each` : '';
  const went = `, done ${plural(h.last_week, 'time', 'times')} last week and ${plural(h.before, 'time', 'times')} in the three weeks before.`;
  let start = '';
  if (h.start_date && h.start_date > today) start = ` It starts on ${h.start_date}.`;
  else if (h.start_date && h.start_date >= addDays(today, -27))
    start = ` They started it on ${h.start_date}.`;
  const planned = h.planned?.length ? ` Already planned on ${h.planned.join(', ')}.` : '';
  return `${aim}${each}${went}${start}${planned}${easedWords(h)}`;
}

/** A habit's pause or lighter version still to run, in words: the days, and what each asks. */
function easedWords(h) {
  return (h.eased || [])
    .map((e) =>
      e.mode === 'pause'
        ? ` Paused from ${e.first} to ${e.last}: they asked to be left alone about it on those days, so it goes on none of them.`
        : ` On a lighter version from ${e.first} to ${e.last}${e.note ? `, “${e.note}”` : ''}: its days and its count are as usual, and the smaller version counts in full.`,
    )
    .join('');
}

const dayWords = (day, today) => `${day} ${weekdayName(day)}, ${relativeDay(day, today)}`;

/** "18:00" as 6pm, the way the rest of the input gives times. */
function clockOf(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return Number.isInteger(h) && Number.isInteger(m) ? clockTime(h * 60 + m) : '';
}

/**
 * What is on their calendar on the days being planned. The lines call it
 * entries and booked time, never meetings: a calendar holds a life as well as
 * a working week, and what the model is told is what it says back. Each timed
 * entry has a short id, kept in refs, so a moment that is coming up can be
 * one of them.
 */
function calendarLines(calendar, today, refs) {
  if (!calendar?.connected)
    return ['THE CALENDAR: none is connected, so what is on their calendar is not known.'];
  const L = [
    'THE CALENDAR ON THE DAYS BEING PLANNED (each entry: id, time, what it is called; booked time worked out exactly):',
  ];
  let entries = 0;
  let booked = 0;
  let n = 0;
  for (const c of calendar.days || []) {
    entries += c.meetings?.length || 0;
    booked += bookedMinutes(c.meetings);
    const name = `${weekdayName(c.day)} ${c.day}`;
    const whole = c.all_day?.length
      ? ` All day: ${c.all_day.map((t) => trim(t, 60)).join('; ')}.`
      : '';
    if (!c.meetings?.length) {
      L.push(`${name}: nothing booked.${whole}`);
      continue;
    }
    const shown = c.meetings.slice(0, ENTRIES_A_DAY).map((m) => {
      n += 1;
      const ref = `c${n}`;
      // one that has gone by today is no moment still to come
      if (c.day >= today) {
        refs.set(ref, { type: 'synced_event', id: m.id || null, title: m.title, date: c.day });
      }
      return `${ref} ${clockTime(m.start)} to ${clockTime(m.end)} ${trim(m.title, 50)}`;
    });
    const more =
      c.meetings.length > ENTRIES_A_DAY ? `; and ${c.meetings.length - ENTRIES_A_DAY} more` : '';
    L.push(
      `${name}: ${plural(c.meetings.length, 'entry', 'entries')}, ${lengthWords(bookedMinutes(c.meetings))} booked: ${shown.join('; ')}${more}.${whole}`,
    );
  }
  L.push(
    `Across those days: ${plural(entries, 'entry', 'entries')}, ${lengthWords(booked)} booked.`,
  );
  return L;
}

function weekGoneLines(g) {
  const L = ['THE WEEK JUST GONE:'];
  const done = g.done || [];
  L.push(
    done.length
      ? `Todos done in the last seven days (${done.length}): ${done
          .slice(0, 30)
          .map((t) => trim(t.title, 60))
          .join('; ')}${done.length > 30 ? '; and more' : ''}.`
      : 'No todos were done in the last seven days.',
  );
  // With no review to go on, nothing is said: told there was none, the model
  // told them so, as if they had been away from something they never began.
  const lr = g.last_review;
  if (!lr) return L;
  // said by the week it planned: their last review is not always last week's
  const week = `the week starting ${lr.week_start}`;
  if (lr.reviewed) {
    L.push(
      `Their last weekly review planned ${week}${lr.week_start === g.week_start ? ', this same week' : ''}.`,
    );
  }
  if (lr.intention) L.push(`Their intention for ${week}: "${lr.intention}"`);
  if (lr.priorities?.length) {
    const lines = lr.priorities.map(
      (x) =>
        `${trim(x.text, 90)}${x.of ? ` (${x.done} of ${plural(x.of, 'todo', 'todos')} done)` : ''}`,
    );
    L.push(`Their priorities in that review: ${lines.join('; ')}.`);
  }
  const h = lr.hours || {};
  const hours = [
    ['normal_day', 'on a normal day'],
    ['busy_day', 'on a busy day'],
    ['weekend_day', 'on a day off'],
  ]
    .filter(([k]) => normHours(h[k]) !== undefined)
    .map(([k, words]) => `${normHours(h[k])} ${words}`);
  if (hours.length) L.push(`The free hours they set in that review: ${hours.join(', ')}.`);
  return L;
}

/**
 * The read's input, in the order it was tested in, with a short id for every
 * todo, habit and dated thing.
 * @returns {{text: string, figures: object, listed: number,
 *   refs: {todos: Map<string, string>, habits: Map<string, object>, dated: Map<string, object>,
 *   calendar: Map<string, object>}}}
 */
/**
 * @param {object} g what was gathered
 * @param {{theirs?: Set<string>}} [o] theirs: the todos whose day is one they
 *   chose and are keeping; worked out from g when not given (theirDays). The
 *   spread gives its own, since by then they may have freed some.
 */
export function renderRead(g, o = {}) {
  const today = g.today;
  const days = spanDays(g.first, g.last);
  const theirs = o.theirs || theirDays(g);
  const refs = { todos: new Map(), habits: new Map(), dated: new Map(), calendar: new Map() };

  const figures = figuresOf(g.todos, today, days);
  const listed = todosToList(g.todos, today);
  const todoRef = new Map();
  listed.forEach((t, i) => {
    const ref = `t${i + 1}`;
    todoRef.set(t.id, ref);
    refs.todos.set(ref, t.id);
    // a todo with a date can be what a milestone leads up to
    const date = t.deadline || t.due_day;
    if (date) refs.dated.set(ref, { type: 'todo', id: t.id, title: t.title, date });
  });

  const L = [];
  L.push(`NOW: ${weekdayName(today)} ${today}, ${clockTime(g.now ?? 0)}.`);
  const off = daysOffOf(g.days_off);
  L.push(
    `THE DAYS BEING PLANNED: ${plural(days.length, 'day', 'days')}, ${weekdayName(g.first)} ${g.first} to ${weekdayName(g.last)} ${g.last}.`,
    days
      .map((d) => `${weekdayName(d)} ${d}${off.includes(weekdayOf(d)) ? ' (a day off)' : ''}`)
      .join('; '),
  );

  L.push('', 'WORLDS, THE PARTS OF THEIR LIFE (name | how active | summary | priorities):');
  if (!g.worlds?.length) L.push('(none yet)');
  for (const w of g.worlds || []) {
    L.push(
      `${trim(w.name, 60)} | ${w.phase} | ${trim(w.summary, 260) || 'no summary'} | ${(w.priorities || []).map((k) => trim(k, 90)).join('; ') || 'none named'}`,
    );
  }

  L.push('', 'CHAPTERS (title | phase | dates | summary | priorities):');
  if (!g.chapters?.length) L.push('(none)');
  for (const c of g.chapters || []) {
    L.push(
      `${trim(c.title, 80)} | ${c.phase} | ${c.start_date || 'no start'} to ${c.end_date || 'no end set'} | ${trim(c.summary, 260) || 'no summary'} | ${(c.priorities || []).map((k) => trim(k, 90)).join('; ') || 'none named'}`,
    );
  }
  const next = upNextWords(g.up_next);
  if (next) L.push(`UP NEXT AMONG THEIR CHAPTERS, WORKED OUT IN CODE: ${next}.`);

  // dated things ahead: what Gremly holds, whole days on their calendar, and todos due by a date
  const horizon = addDays(today, LOOK_AHEAD_DAYS);
  const byDate = (a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id));
  const everyDated = [
    ...(g.dated || []).filter((x) => isDay(x.date) && x.date >= today && x.date <= horizon),
    ...listed
      .filter((t) => t.deadline && t.deadline >= today && t.deadline <= horizon)
      .map((t) => ({
        type: 'todo',
        id: t.id,
        what: 'a todo is due by',
        title: t.title,
        date: t.deadline,
      })),
  ];
  // when there are too many to list, what Gremly holds and what is due come
  // before whole days on a calendar, so the weeks further out are not lost
  const held = everyDated.filter((x) => x.type !== 'synced_event').sort(byDate);
  const wholeDays = everyDated.filter((x) => x.type === 'synced_event').sort(byDate);
  const ahead = [
    ...held.slice(0, DATED_MAX),
    ...wholeDays.slice(0, Math.max(0, DATED_MAX - held.length)),
  ].sort(byDate);
  L.push('', 'DATED THINGS AHEAD, THE NEXT SIX WEEKS (id | date | what it is | title):');
  if (!ahead.length) L.push('(nothing dated)');
  let nd = 0;
  for (const x of ahead) {
    let ref = x.type === 'todo' ? todoRef.get(x.id) : null;
    if (!ref) {
      nd += 1;
      ref = `d${nd}`;
      refs.dated.set(ref, { type: x.type, id: x.id, title: x.title, date: x.date });
    }
    const time = x.time ? clockOf(x.time) : '';
    const when = `${dayWords(x.date, today)}${x.end ? `, until ${x.end}` : ''}${time ? `, at ${time}` : ''}`;
    L.push(`${ref} | ${when} | ${x.what} | ${trim(x.title, 90)}`);
  }
  if (everyDated.length > ahead.length) {
    L.push(
      `${plural(everyDated.length - ahead.length, 'more dated thing is', 'more dated things are')} not listed.`,
    );
  }

  L.push('', ...calendarLines(g.calendar, today, refs.calendar));

  L.push('', 'HABITS (id | name: how it is going):');
  if (!g.habits?.length) L.push('(none)');
  (g.habits || []).forEach((h, i) => {
    const ref = `h${i + 1}`;
    refs.habits.set(ref, h);
    L.push(`${ref} | ${trim(h.title, 70)}: ${habitSentence(h, today)}`);
  });

  L.push('', ...weekGoneLines(g));

  const capped =
    listed.length < figures.open
      ? ` Only ${listed.length} of them are listed below: the dated ones, the most moved, the oldest and the newest.`
      : '';
  L.push(
    '',
    figures.open
      ? `FIGURES (worked out exactly, use these rather than adding up yourself): ${plural(figures.open, 'open todo', 'open todos')} adding up to about ${plural(figures.hours, 'hour', 'hours')}. ${figures.old} of them were added more than three months ago. ${figures.moved} have been moved to another day ten times or more. ${figures.gone} have a day or a date that has already gone by. ${figures.dated} have a day or a date on the days being planned.${capped}`
      : 'FIGURES (worked out exactly): they have no open todos.',
  );
  // What already sits on each day being planned. A single day can be the
  // challenge, and its load is then quoted from here, not added up by the
  // model (9 October: two runs in six quoted a day's total of their own).
  const loads = dayLoads(g.todos, days);
  if (loads.some((x) => x.todos)) {
    L.push(
      `ON EACH DAY BEING PLANNED (the todos that have that day, worked out exactly, one with no length counted as half an hour): ${loads
        .map(
          (x) =>
            `${weekdayName(x.day)} ${x.day}: ${
              x.todos ? `${plural(x.todos, 'todo', 'todos')}, ${hoursWords(x.minutes)}` : 'none'
            }`,
        )
        .join('; ')}.`,
    );
  }

  L.push('', 'OPEN TODOS (id | title | length | added | moved | dates):');
  if (!listed.length) L.push('(none)');
  for (const t of listed) {
    const dates = [
      t.due_day ? `day ${t.due_day}${theirs.has(t.id) ? ', which they chose' : ''}` : '',
      t.deadline ? `due by ${t.deadline}` : '',
      t.back_on ? `put off until ${t.back_on}` : '',
    ].filter(Boolean);
    L.push(
      `${todoRef.get(t.id)} | ${trim(t.title, 90)} | ${t.minutes ? plural(t.minutes, 'minute', 'minutes') : 'no length set'} | added ${t.created || 'unknown'} | ${t.moved ? `moved ${plural(t.moved, 'time', 'times')}` : 'never moved'} | ${dates.join(', ') || 'no date'}`,
    );
  }

  return { text: L.join('\n'), figures, listed: listed.length, refs };
}

// ── The prompt ──────────────────────────────────────────────────────────────

// Started from the prompt tested on 5 October 2026 (the plan's Tested prompts),
// with the two rules added after that test: health, and a part week.
export function readSystem(person) {
  const who = person?.first_name
    ? `Their first name is ${person.first_name}.`
    : 'Their name is not known.';
  return {
    fixed: `You are Gremly, a small companion who helps one person run their week. It is the weekly review: you read everything you know about them and prepare the opening of a short conversation that plans the coming week. They will see your read as cards and answer by tapping or typing.

What to produce:
The challenge is the single thing most likely to make this week go wrong, said plainly to them in one short headline, with a why that names the real facts behind it. Choose it by weighing what is dated this week and soon, what has been hanging longest, how much open work there is against the time they have, and what they said they care about. It must be specific to this person and this week. How much is on their list as a whole is the challenge only when nothing more particular is. When one dated thing, one piece of work or one stretch of days is where the week is most likely to go wrong, that is the challenge, and the size of the list is at most part of its why.
Evidence is two to four figures that prove the challenge, each a short number or count with a few words of label, all taken from the data. A date is not a figure, though the number of days until it can be.
Coming off is one sentence about the week they just had, from what the data shows.
Coming up lists up to eight dated moments in the next six weeks that should shape this week, in date order, each said briefly and without its date, which has a field of its own. What is on their calendar belongs here too when it is a moment in their life: something that matters to them beyond an ordinary day, as far as you can judge from what you know of them. An entry that is part of their routine does not. When a moment is one of the dated things or one of the calendar entries in the data, give its id with it.
Priority options are up to five things that could matter most this week, each tied to the todo ids it covers when there are any. Mark at most three as your picks. Favour hard dates, things that unblock bigger goals, and things they named as priorities. With each give an intention: one short first person line of ten words or fewer that they could hold onto all week if this is what their week is for. It says how they mean to go about the week, in their own voice, and does not repeat the priority as a task to do.
Free hours guess is how many hours on a normal day, a busy day and a day off they likely have for their own things outside work and fixed commitments, in half hour steps, with a short reason. When they set their free hours in their last review, start from those. When there is no calendar, guess from what you know of their life and say that it is a guess they can change.
Busy days are the days being planned that look heavy from the calendar or dated things, each given as its date. Leave it empty when nothing shows it.
Milestones are for events and deliverables more than a week away that need preparing for: something that takes several pieces of work on the days before it. A dated thing that is itself one piece of work is a todo, however far off it is, and never gets a milestone. Each one leads up to one dated thing in the data, which you name by its id. For each, give two to four steps in order, each with a date to finish by, rough minutes, and whether it is a todo to do or a check in Gremly should hold during an evening wrap up to see how it is going. Each step is something new to add to their list, never a todo they already have, and at least one step of every milestone is a todo to do. Only include goals the data supports.
Needs you holds up to four things that are blocking them, chosen from what has been moved the most or hanging the longest and what matters most. Group todos that are really one problem. Its title is in the todos' own words: the name of the todo when it is about one, and the words their names share when it groups several, never a name of your own for them. For each say in a few words why it seems stuck and one question that would unstick it. With the question give two to four answers they might tap, each a few words in their own voice, and each a different answer to that question and to no other.
Habit days suggests which of the days being planned each habit they are actually trying to keep should go on, spread so it fits the week and builds back from where they are rather than their full target, and never on more days than they aim for. Leave out habits that look abandoned for months unless something in the data says they want them back.

Rules:
Some todos are on a day they chose themselves. Those days are their own decisions and are not yours to change: take them as given when you weigh how much the week already holds.
Use only facts in the data. Never invent calendar entries, people or dates. Never speak of the data or of what you were given: write as someone who knows them.
What is on their calendar is entries of every kind, and you cannot take any of them for a meeting. Speak of what is on their calendar, or of the time that is booked, and of one entry as what its own name says it is. Never count them or describe them as meetings.
Some of what you know is about their health, body or mind. Let it shape the week: their energy, appointments, rest and how much to ask of them. Plan health todos and habits like any others. Write about it only as discreetly as they would want on a screen someone else might glance at. In your own words never name a condition, a treatment or therapy of any kind, a medication, a medical test or a medical speciality, even when one of their own items names it: speak of that item only in general terms, by when it is and what it asks of their week. This holds for every line you write, about what they did last week and their habits as much as about what is ahead, and it comes before the rule that a needs you title is in the todos' own words. Read your words once more as a stranger glancing at the screen would: that stranger should not be able to tell what this person's health involves.
The days being planned may be the rest of this week rather than a whole week. Plan only those days, and judge how much fits by how many are left.
Write to them as you, warmly and briefly, in plain words. No dashes used as punctuation. In the sentences they will read, say a date or a time the way a person would in a message to a friend. The form the data gives a date in is for the fields that ask for a date, and only for those.
Use ids exactly as given, and only where an id is asked for: never write an id in your words.`,
    varying: who,
  };
}

const text = (description) => ({ type: 'string', description });
const list = (items, description) => ({ type: 'array', items, description });
// every field is asked for: Gemini leaves out what its schema does not require
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties) });
const A_DAY = 'YYYY-MM-DD';

export const READ_SCHEMA = obj({
  challenge: obj({
    headline: text('one short headline, said to them'),
    why: text('the real facts behind it, in a sentence or two'),
  }),
  evidence: list(
    obj({
      figure: text('a short number or count'),
      label: text('a few words saying what it counts'),
    }),
    'two to four',
  ),
  coming_off: text('one sentence about the week they just had'),
  coming_up: list(
    obj({
      about: text(
        'the id of the dated thing or the calendar entry it is, or empty when it is neither',
      ),
      when: text(`its date, ${A_DAY}`),
      what: text('the moment itself, said briefly'),
    }),
    'up to eight, in date order',
  ),
  priority_options: list(
    obj({
      text: text('the priority, in a few words'),
      why: text('why it matters this week, briefly'),
      gremly_pick: { type: 'boolean', description: 'true for at most three' },
      item_ids: list(
        { type: 'string' },
        'the ids of the todos it covers, none when it covers none',
      ),
      intention: text(
        'one first person line of ten words or fewer to hold onto if this is what the week is for',
      ),
    }),
    'up to five',
  ),
  free_hours_guess: obj({
    normal_day: { type: 'number', description: 'hours, in half hour steps' },
    busy_day: { type: 'number', description: 'hours, in half hour steps' },
    weekend_day: { type: 'number', description: 'hours on a day off, in half hour steps' },
    reason: text('a short reason'),
  }),
  busy_days: list({ type: 'string' }, `the heavy days among the days being planned, each ${A_DAY}`),
  milestones: list(
    obj({
      goal: text('what it leads up to, in a few words'),
      about: text('the id of the dated thing it leads up to'),
      steps: list(
        obj({
          title: text('the step, as a todo would be named'),
          by: text(`the date to finish it by, ${A_DAY}`),
          minutes: { type: 'integer', description: 'rough minutes it takes' },
          kind: { type: 'string', enum: [...STEP_KINDS] },
        }),
        'two to four, in order',
      ),
    }),
    'none when nothing dated is more than a week away and needs preparing for',
  ),
  needs_you: list(
    obj({
      item_ids: list({ type: 'string' }, 'the ids of the todos it is about'),
      title: text("what it is, in the todos' own words"),
      stuck_because: text('why it seems stuck, in a few words'),
      question: text('one question that would unstick it'),
      answers: list(
        { type: 'string' },
        'two to four answers to that question they might tap, a few words each',
      ),
    }),
    'up to four',
  ),
  habit_days: list(
    obj({
      habit_id: text('the id of the habit'),
      days: list({ type: 'string' }, `days among the days being planned, each ${A_DAY}`),
      reason: text('why these days, briefly'),
    }),
    'one for each habit worth planning',
  ),
});

// ── What comes back, checked ────────────────────────────────────────────────

/** Gremly's own words, on one line, without dashes, cut to a length. */
function said(v, max) {
  if (typeof v !== 'string') return '';
  const s = noDashes(v.replace(/\s+/g, ' ').trim());
  return s.length > max ? s.slice(0, max).trim() : s;
}

const asList = (v) => (Array.isArray(v) ? v : []);

/** The longest answer a needs you card can show as one to tap. */
const ANSWER_MAX = 48;

/**
 * The answers to tap under a needs you question: each said once, short
 * enough to be tapped, and no more than a card has room for. One too long to
 * tap is left out whole, since half an answer is not theirs to give.
 */
function checkAnswers(raw, drop) {
  const answers = [];
  for (const a of asList(raw)) {
    const words = said(a, 200);
    if (!words) drop('needs_you_answer', 'empty');
    else if (words.length > ANSWER_MAX) drop('needs_you_answer', 'too_long');
    else if (answers.includes(words)) drop('needs_you_answer', 'twice');
    else if (answers.length >= READ_LIMITS.answers) drop('needs_you_answer', 'too_many');
    else answers.push(words);
  }
  return answers;
}

/** A milestone's steps: each a real step between today and the date it leads up to. */
function checkSteps(raw, today, date, drop) {
  const steps = [];
  for (const s of asList(raw)) {
    const title = said(s?.title, Math.min(NAME_LIMIT, 120));
    const by = normDay(s?.by);
    if (!title || !by || !STEP_KINDS.includes(s?.kind)) drop('milestone_step', 'bad_step');
    else if (by < today || by > date) drop('milestone_step', 'step_outside');
    else if (steps.length >= WEEK_LIMITS.steps) drop('milestone_step', 'too_many');
    else {
      const minutes = normMinutes(s?.minutes);
      steps.push({ title, by, kind: s.kind, ...(minutes !== undefined ? { minutes } : {}) });
    }
  }
  return steps;
}

/**
 * Check what the model returned against what it was given: every id is one it
 * was handed, every date is real and where it should be, every number is in
 * range, and nothing holds more than its limit. Anything that fails is dropped
 * or put right, and each time is counted (dropped), so it shows in the logs
 * and fails the replay.
 * @param {object} output the model's reply
 * @param {object} g what gatherRead gave
 * @param {{refs: object}} r what renderRead gave
 * @returns {{read: object, dropped: {what: string, why: string}[]}}
 */
export function checkRead(output, g, r) {
  const o = output && typeof output === 'object' ? output : {};
  const today = g.today;
  const days = spanDays(g.first, g.last);
  const horizon = addDays(today, LOOK_AHEAD_DAYS);
  const dropped = [];
  const drop = (what, why) => dropped.push({ what, why });
  const todoIds = (refs, what) => {
    const ids = [];
    for (const ref of asList(refs)) {
      const id = r.refs.todos.get(String(ref ?? '').trim());
      if (!id) drop(what, 'unknown_id');
      else if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };
  const dayList = (list, what) => {
    const out = [];
    for (const v of asList(list)) {
      const day = normDay(v);
      if (!day || !days.includes(day)) drop(what, 'day_outside');
      else if (!out.includes(day)) out.push(day);
    }
    return out.sort();
  };

  const headline = said(o.challenge?.headline, 140);
  if (!headline) throw new Error('the read came back without a challenge');
  const read = { challenge: { headline, why: said(o.challenge?.why, 400) } };

  read.evidence = [];
  for (const e of asList(o.evidence)) {
    const figure = said(e?.figure, 24);
    const label = said(e?.label, 60);
    if (!figure || !label) drop('evidence', 'empty');
    else if (read.evidence.length >= READ_LIMITS.evidence) drop('evidence', 'too_many');
    else read.evidence.push({ figure, label });
  }

  read.coming_off = said(o.coming_off, 300);

  read.coming_up = [];
  for (const c of asList(o.coming_up)) {
    const what = said(c?.what, 140);
    // a moment that is one of their dated things, or one of the entries on
    // their calendar, takes its date from that
    const named = String(c?.about ?? '').trim();
    const about = named ? r.refs.dated.get(named) || r.refs.calendar?.get(named) : null;
    if (named && !about) drop('coming_up', 'unknown_id');
    const when = about ? about.date : normDay(c?.when);
    if (!what) drop('coming_up', 'empty');
    else if (!when || when < today || when > horizon) drop('coming_up', 'date_outside');
    else
      read.coming_up.push({
        when,
        what,
        item: about?.id ? { type: about.type, id: about.id } : null,
      });
  }
  read.coming_up.sort((a, b) => a.when.localeCompare(b.when));
  if (read.coming_up.length > READ_LIMITS.coming_up) {
    drop('coming_up', 'too_many');
    read.coming_up = read.coming_up.slice(0, READ_LIMITS.coming_up);
  }

  read.priority_options = [];
  let picks = 0;
  for (const p of asList(o.priority_options)) {
    const words = said(p?.text, 120);
    if (!words) {
      drop('priority', 'empty');
      continue;
    }
    if (read.priority_options.length >= READ_LIMITS.priorities) {
      drop('priority', 'too_many');
      continue;
    }
    // at most three picks: a fourth stays an option, only not a pick
    const pick = p?.gremly_pick === true && picks < READ_LIMITS.picks;
    if (p?.gremly_pick === true && !pick) drop('priority_pick', 'too_many');
    if (pick) picks += 1;
    // the line to hold onto if this is what their week is for: the one the
    // intention card suggests once they have chosen it
    const intention = said(p?.intention, WEEK_LIMITS.intention);
    if (!intention) drop('intention', 'empty');
    read.priority_options.push({
      text: words,
      why: said(p?.why, 200),
      gremly_pick: pick,
      item_ids: todoIds(p?.item_ids, 'priority_item'),
      intention,
    });
  }

  // An app build from before each priority had a line of its own shows three
  // drafts to choose from: it is given the lines of Gremly's picks, then the
  // others', each once.
  read.intention_drafts = [];
  const byPick = [...read.priority_options].sort(
    (a, b) => Number(b.gremly_pick) - Number(a.gremly_pick),
  );
  for (const p of byPick) {
    if (read.intention_drafts.length >= READ_LIMITS.intentions) break;
    if (p.intention && !read.intention_drafts.includes(p.intention)) {
      read.intention_drafts.push(p.intention);
    }
  }

  const f = o.free_hours_guess && typeof o.free_hours_guess === 'object' ? o.free_hours_guess : {};
  const hours = {};
  for (const kind of ['normal_day', 'busy_day', 'weekend_day']) {
    const h = normHours(f[kind]);
    if (h === undefined) drop('free_hours', `bad_value:${kind}`);
    else hours[kind] = h;
  }
  read.free_hours_guess = Object.keys(hours).length
    ? { ...hours, reason: said(f.reason, 240) }
    : null;

  read.busy_days = dayList(o.busy_days, 'busy_day');

  read.milestones = [];
  for (const m of asList(o.milestones)) {
    const about = r.refs.dated.get(String(m?.about ?? '').trim());
    const goal = said(m?.goal, WEEK_LIMITS.goal);
    let why = null;
    if (!about) why = 'no_dated_thing';
    else if (!goal) why = 'empty';
    else if (daysBetween(today, about.date) <= 7) why = 'within_a_week';
    else if (read.milestones.length >= READ_LIMITS.milestones) why = 'too_many';
    if (why) {
      drop('milestone', why);
      continue;
    }
    const steps = checkSteps(m?.steps, today, about.date, drop);
    if (!steps.length) {
      drop('milestone', 'no_steps');
      continue;
    }
    // the check its change card goes through, so a milestone on a card can always be set up
    const checked = checkWeekChange(
      { op: 'milestone', milestone: { goal, date: about.date, steps } },
      { today, week: { first: g.first, last: g.last, week_start: g.week_start, has_review: true } },
    );
    if (!checked.ok) {
      drop('milestone', checked.reason);
      continue;
    }
    read.milestones.push({
      ...checked.change.milestone,
      about: { type: about.type, id: about.id, title: about.title },
    });
  }

  read.needs_you = [];
  for (const n of asList(o.needs_you)) {
    const title = said(n?.title, 120);
    const ids = todoIds(n?.item_ids, 'needs_you_item');
    if (!title || !ids.length) drop('needs_you', title ? 'no_items' : 'empty');
    else if (read.needs_you.length >= READ_LIMITS.needs_you) drop('needs_you', 'too_many');
    else
      read.needs_you.push({
        item_ids: ids,
        title,
        stuck_because: said(n?.stuck_because, 200),
        question: said(n?.question, 200),
        answers: checkAnswers(n?.answers, drop),
      });
  }

  read.habit_days = [];
  for (const h of asList(o.habit_days)) {
    const habit = r.refs.habits.get(String(h?.habit_id ?? '').trim());
    if (!habit) {
      drop('habit_days', 'unknown_id');
      continue;
    }
    if (read.habit_days.some((x) => x.habit_id === habit.id)) {
      drop('habit_days', 'twice');
      continue;
    }
    const open = habitOpenDays(habit, days);
    let on = dayList(h?.days, 'habit_day');
    if (on.some((d) => !open.includes(d))) {
      drop('habit_day', 'not_a_day_for_it');
      on = on.filter((d) => open.includes(d));
    }
    const most = habitAllowance(habit, days);
    if (on.length > most) {
      drop('habit_day', 'over_target');
      on = on.slice(0, most);
    }
    if (on.length) {
      read.habit_days.push({ habit_id: habit.id, days: on, reason: said(h?.reason, 200) });
    }
  }

  return { read, dropped };
}

// ── The call ────────────────────────────────────────────────────────────────

/**
 * The model step, given what was gathered (the replay calls this directly, and
 * can ask for another effort to compare).
 * @returns {Promise<{read: object, dropped: object[], model: string, input: string,
 *   figures: object, prompt_version: string}>}
 */
export async function runWeekRead(env, g, { effort = 'medium' } = {}) {
  const r = renderRead(g);
  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'weekRead'),
    fallback: modelFor(env, 'weekReadFallback'),
    system: readSystem(g.person),
    user: r.text,
    schema: READ_SCHEMA,
    maxTokens: 12000,
    effort,
    thinking: effort,
  });
  const { read, dropped } = checkRead(output, g, r);
  return {
    read,
    dropped,
    model,
    input: r.text,
    figures: { ...r.figures, listed: r.listed },
    prompt_version: WEEK_READ_VERSION,
    effort,
  };
}

/** The read as the week's row keeps it: what Gremly wrote, and what it was made from. */
export function storedRead(g, out, at = new Date()) {
  return {
    version: out.prompt_version,
    made_at: at.toISOString(),
    made_on: g.today,
    model: out.model,
    // how hard the model was asked to think: medium, or low for the midweek extra
    effort: out.effort,
    first: g.first,
    last: g.last,
    figures: out.figures,
    ...out.read,
    dropped: out.dropped.length,
  };
}
