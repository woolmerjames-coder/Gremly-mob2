/**
 * The week's board, worked out: each day being planned with the todos and
 * habits on it and the room it has left, the todos put off with the day each
 * comes back, and each habit's days.
 *
 * Nothing on the board is saved until they finish. What it shows is three
 * things laid over one another, the later standing over the earlier:
 *
 * 1. what is saved: a todo's own day, its day to come back, a habit's days
 * 2. Gremly's spread (the week's row, spread): where it put each todo that
 *    had no day of its own, and when the rest come back
 * 3. their own moves on the board (the row's answers.board)
 *
 * A todo is on the board unless its own day is outside the days being planned
 * (workers/shared/weekBoard.js todoSpot). Every todo on the board that is on
 * no day has a day it comes back on: Gremly's when the spread gave one, else
 * one worked out here by the same rule the spread uses (spreadReturns), so a
 * Later never goes without a day.
 *
 * A habit can be paused for the days being planned, or given a lighter
 * version for them (lib/week/habitWeek.ts). Paused, it is on none of the
 * days and takes none of their room; it stays in the list so the pause can be
 * ended where it was made. Like every other move, neither is saved until they
 * finish.
 *
 * Once the week is planned the same board is where it is changed by hand
 * (Your week, Change your week). There is no spread then, and a todo with no
 * day and no day to come back is left as it is (assign: false): it is shown
 * as loose, to be given a day, and nothing is written for it unless they
 * move it.
 *
 * Pure: dates, ids and numbers only. Gremly reads the same picture through
 * get_week (workers/cortex/agent/tools/getWeek.js), from what workingPicture
 * sends with a message.
 */
import type {
  WeekAnswers,
  WeekBoardMoves,
  WeekRelief,
  WeekReviewRow,
  WeekSpread,
} from '../../repo/weekReviewRepo';
import {
  KEEP_ASK_FROM,
  backDays,
  busyFor,
  dayKind,
  gremlyPut,
  habitAllowance,
  habitOpenDays,
  hoursFor,
  isDay,
  minutesOf,
  released,
  returnsCap,
  spanDays,
  spreadReturns,
  todoSpot,
  type DayKind,
  type WeekHours,
} from '../model';
import {
  easeApplied,
  easeNote,
  easeOver,
  easePlan,
  pauseSpans,
  pausedOn,
  type EaseMode,
} from '../habitWeek';

type Item = Record<string, any>;

/** A todo on the board: on a day, or put off until one. */
export interface BoardTodo {
  id: string;
  title: string;
  /** Its length, thirty minutes when it has none */
  minutes: number;
  /** The day it is on, or null when it is put off */
  day: string | null;
  /** The day it comes back, when it is put off */
  backOn: string | null;
  /** Gremly put it where it is, and they have not moved it since */
  gremly: boolean;
  /**
   * It is on a day they gave it themselves, and it is kept there: Gremly
   * plans around it and never moves it. The day is one it was saved on before
   * the review, or one they put it on by hand on the board.
   */
  theirs: boolean;
  /**
   * They put it where it is by hand on the board, on this day or off until
   * the day it comes back, and nothing of that is saved yet
   */
  byHand: boolean;
  /** Its hard date, when it has one */
  by: string | null;
  /** It has a time of day: an appointment, which no one's rearranging frees */
  timed: boolean;
  /** A step towards something bigger, set up in the review */
  step: boolean;
  /** When it was added, as YYYY-MM-DD, and how often it has been moved */
  created: string | null;
  moved: number;
  /** The part of their life it belongs to, for the lists that are grouped */
  group: string | null;
  /** Where it is saved now: its own day, or the day it comes back */
  saved: { day: string | null; backOn: string | null };
}

export interface BoardHabit {
  id: string;
  title: string;
  minutes: number;
  /** The days it is on, among the days being planned */
  days: string[];
  /** How many days they aim for among these days */
  target: number;
  /** The days saved for it now, among the days being planned */
  saved: string[];
  /**
   * How it is over every day being planned, as the board has it: paused (left
   * alone, and on none of them), on a lighter version, or as usual (null)
   */
  ease: 'pause' | 'lighter' | null;
  /** What the lighter version is, in their words, when it is on one */
  note: string;
  /**
   * What a lighter version chosen here starts from: the words it is saved
   * with for these days, else the habit's own smallest version
   */
  smallest: string;
  /** What is saved for it over every one of these days; null when nothing holds them all */
  savedEase: { mode: 'pause' | 'lighter'; note: string } | null;
  /** Something is saved for it on at least one of these days: a pause or a lighter version */
  savedEased: boolean;
  /** The days it is paused on, when a pause holds only some of the days being planned */
  pausedDays: string[];
  /** What finishing the board would write for it over these days; null when nothing */
  easeTo: BoardEase | null;
}

/** A pause, a lighter version or the usual, over a stretch of days. */
export interface BoardEase {
  mode: EaseMode;
  first: string;
  last: string;
  note: string;
}

export interface BoardDay {
  day: string;
  kind: DayKind;
  busy: boolean;
  /** The minutes that kind of day gives, and what is on it */
  minutes: number;
  habitMinutes: number;
  todoMinutes: number;
  /** What is left; below nothing when the day is over */
  left: number;
  /** What their own todos on it take (theirs): the ones kept there, and the ones they put there by hand */
  theirMinutes: number;
  /** What everything on it that is not Gremly's takes: theirs, and what waits on its day for a spread */
  ownMinutes: number;
  /**
   * How far their own todos, with the habits, put it over its room; none
   * when they fit, and none on a day that holds no todo of theirs
   */
  over: number;
  todos: BoardTodo[];
  habits: { id: string; title: string; minutes: number }[];
  /** Gremly's few words about the day, from the spread */
  note: string | null;
}

export interface Board {
  first: string;
  last: string;
  days: BoardDay[];
  /**
   * Every todo on a day they gave it themselves, among the days being
   * planned, whatever they have since said of them: what the question about
   * their own days is asked of
   */
  theirs: KeptTodo[];
  /** Put off, by the day each comes back */
  later: BoardTodo[];
  /**
   * On no day and with no day to come back: only on a board that gives no
   * days of its own (assign: false), where they wait to be given one
   */
  loose: BoardTodo[];
  habits: BoardHabit[];
  hours: Required<WeekHours>;
  /** The days a Later can come back on */
  returns: string[];
  totals: {
    /** Every minute the days give, and what the habits and the todos on them take */
    room: number;
    habits: number;
    placed: number;
    /** What is put off, and everything on the board together */
    later: number;
    all: number;
    /** How many todos are on a day, and how many habit sessions have one */
    todosPlaced: number;
    habitSessions: number;
  };
}

/** A todo on a day they gave it themselves. */
export interface KeptTodo {
  id: string;
  title: string;
  minutes: number;
  day: string;
  timed: boolean;
  /** They have freed it for Gremly to place again (or said to rearrange it all) */
  freed: boolean;
}

export interface BoardInput {
  today: string;
  /** The days the review plans (ReviewOn) */
  span: { span_start: string; span_end: string };
  daysOff: number[];
  /** The review: its read, its answers with their own moves, and Gremly's spread */
  row: Pick<WeekReviewRow, 'read' | 'answers' | 'spread'>;
  todos: Item[];
  habits: Item[];
  habitPlans: Item[];
  /** Their habits' pauses and lighter versions as saved (habit_adaptations) */
  eases?: Item[];
  /** The part of their life each todo belongs to, by id */
  groups?: Map<string, string>;
  /**
   * Whether a todo on no day, with no day to come back, is given one here.
   * True in the review, where a Later never goes without a day. False once
   * the week is planned and is being changed by hand.
   */
  assign?: boolean;
}

const dayOf = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return isDay(s) ? s : null;
};

/** A lighter version's few words, tidied the way they are saved. */
const noteOf = easeNote;

/**
 * The part of their life each item belongs to: the world it is linked to most
 * strongly, by name. An item linked to none is in no group.
 */
export function groupsOf(worlds: Item[], links: Item[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const w of worlds ?? []) {
    const name = String(w?.display_name || w?.name || '').trim();
    if (w?.id && name) names.set(w.id, name);
  }
  const best = new Map<string, { name: string; score: number }>();
  for (const l of links ?? []) {
    const name = names.get(l?.world_id);
    if (!name || !l?.drop_id) continue;
    const score = typeof l.relevance_score === 'number' ? l.relevance_score : 0;
    const had = best.get(l.drop_id);
    if (!had || score > had.score) best.set(l.drop_id, { name, score });
  }
  return new Map([...best].map(([id, b]) => [id, b.name]));
}

/** A habit as the board's rules read it (workers/shared/weekBoard.js). */
function habitRule(h: Item) {
  const cadence = ['weekly', 'monthly'].includes(h.cadence) ? h.cadence : 'daily';
  const active = Array.isArray(h.days_active)
    ? h.days_active.filter((d: unknown) => Number.isInteger(d))
    : [];
  let target: number | null = null;
  // a weekly habit with no count kept aims for its set days, or for one
  if (cadence === 'weekly') {
    target = h.target_per_period > 0 ? h.target_per_period : active.length || 1;
  }
  if (cadence === 'monthly') target = h.target_per_period > 0 ? h.target_per_period : 1;
  return {
    cadence,
    target,
    days_active: active,
    breaking: h.subtype === 'break_habit',
    start_date: dayOf(h.start_date),
    end_date: dayOf(h.end_date),
  };
}

/** The spread as lookups, when it was made for days that are still being planned. */
function spreadOf(spread: WeekSpread | null | undefined, days: string[]) {
  const place = new Map<string, string>();
  const later = new Map<string, string>();
  const habitDays = new Map<string, string[]>();
  const notes = new Map<string, string>();
  const order = new Map<string, number>();
  if (spread && typeof spread === 'object') {
    (spread.place ?? []).forEach((p, i) => {
      if (days.includes(p.day)) place.set(p.id, p.day);
      order.set(p.id, i);
    });
    for (const l of spread.later ?? []) if (isDay(l.back_on)) later.set(l.id, l.back_on);
    for (const h of spread.habit_days ?? []) {
      habitDays.set(
        h.id,
        (h.days ?? []).filter((d) => days.includes(d)),
      );
    }
    for (const n of spread.notes ?? [])
      if (days.includes(n.day) && n.note) notes.set(n.day, n.note);
  }
  return { place, later, habitDays, notes, order };
}

/** The week's board as it stands. */
export function boardOf(p: BoardInput): Board {
  const today = p.today;
  const days = spanDays(p.span.span_start, p.span.span_end).filter((d) => d >= today);
  const first = days[0] ?? p.span.span_start;
  const last = p.span.span_end;
  const span = { today, first, last };
  const answers = p.row.answers ?? {};
  const mine: WeekBoardMoves = answers.board ?? {};
  const spread = spreadOf(p.row.spread, days);
  const hours = hoursFor(answers, p.row.read);
  const busy = busyFor(answers, p.row.read, days);
  const returns = backDays(today, last);
  const priorityIds = new Set((answers.priorities ?? []).flatMap((x) => x.item_ids ?? []));

  // ── the habits ──
  const habits: BoardHabit[] = [];
  const stretch = { first: days[0] ?? first, last: days[days.length - 1] ?? last };
  for (const h of p.habits) {
    if (h.archived) continue;
    const usual = habitRule(h);
    // Not on the board when it has no day among these whatever is paused. One
    // that is only paused stays, so the pause can be ended here.
    if (!habitAllowance(usual, days)) continue;
    // their own choice on the board stands over what is saved
    const savedEases = (p.eases ?? []).filter((r) => r?.habit_id === h.id);
    const chosen = mine.habit_ease?.[h.id];
    const want: BoardEase | null = chosen
      ? { mode: chosen.mode, ...stretch, note: noteOf(chosen.note) }
      : null;
    const easeTo = want && !easePlan(savedEases, want).same ? want : null;
    const eases = easeTo ? easeApplied(savedEases, h.id, easeTo) : savedEases;
    const over = easeOver(eases, h.id, days);
    const savedOver = easeOver(savedEases, h.id, days);
    const pausedDays = days.filter((d) => pausedOn(eases, h.id, d));
    const rule = { ...usual, paused: pauseSpans(eases, h.id) };
    const allow = habitAllowance(rule, days);
    const saved = p.habitPlans
      .filter((x) => x.habit_id === h.id)
      .map((x) => dayOf(x.planned_date))
      .filter((d): d is string => !!d && days.includes(d))
      .sort();
    const own = mine.habit_days?.[h.id];
    const on = Array.isArray(own) ? own : saved.length ? saved : (spread.habitDays.get(h.id) ?? []);
    habits.push({
      id: h.id,
      title: h.name || h.title || 'Habit',
      minutes: minutesOf(h),
      // a day it is paused on is no day of its: nothing shows it or asks about it there
      days: [...new Set(on.filter((d) => days.includes(d) && !pausedDays.includes(d)))].sort(),
      target: rule.cadence === 'daily' ? habitOpenDays(rule, days).length : allow,
      saved,
      ease: over?.mode ?? null,
      note: over?.mode === 'lighter' ? over.note : '',
      smallest: (savedOver?.mode === 'lighter' && savedOver.note) || noteOf(h.floor_note),
      savedEase: savedOver ? { mode: savedOver.mode, note: savedOver.note } : null,
      savedEased: !easePlan(savedEases, { mode: 'usual', ...stretch }).same,
      pausedDays,
      easeTo,
    });
  }

  // ── the todos ──
  const onDay = new Map<string, BoardTodo[]>(days.map((d) => [d, []]));
  const later: BoardTodo[] = [];
  const unplaced: BoardTodo[] = [];
  const theirs: KeptTodo[] = [];
  for (const t of p.todos) {
    if (t.archived || t.completed_at) continue;
    const savedDay = dayOf(t.due_day);
    const savedBack = dayOf(t.resurface_at);
    const spot = todoSpot({ due_day: savedDay, back_on: savedBack }, span);
    const ownDay = mine.placed?.[t.id];
    const ownBack = mine.later?.[t.id];
    // Whose its day is, when it is on one of the days being planned: theirs,
    // unless Gremly's last spread of this week put it there. And whether
    // that day is released for Gremly to plan again (weekBoard.js released).
    const placed = { id: t.id as string, due_day: savedDay, timed: !!t.due_time };
    const own = spot.spot === 'fixed' && !gremlyPut(placed, answers);
    const free = spot.spot === 'fixed' && released(placed, answers);
    const todo: BoardTodo = {
      id: t.id,
      title: t.name || t.title || 'Untitled',
      minutes: minutesOf(t),
      day: null,
      backOn: null,
      gremly: false,
      theirs: false,
      byHand: false,
      by: dayOf(t.target_date),
      timed: placed.timed,
      step: !!t.views?.milestone,
      created: dayOf(t.created_at),
      moved: Number.isInteger(t.sweep_reschedule_count) ? t.sweep_reschedule_count : 0,
      group: p.groups?.get(t.id) ?? null,
      saved: {
        day: spot.spot === 'fixed' || spot.spot === 'own' ? spot.day : null,
        backOn: spot.spot === 'later' ? spot.back_on : null,
      },
    };
    if (own && spot.spot === 'fixed' && !ownDay && !ownBack) {
      theirs.push({
        id: todo.id,
        title: todo.title,
        minutes: todo.minutes,
        day: spot.day,
        timed: todo.timed,
        freed: free,
      });
    }
    const back = spread.later.get(t.id);
    // Their own moves stand over everything. A day they gave a todo on the
    // board is theirs like one they gave it before: it counts against the
    // day's room, and Gremly plans around it.
    if (ownDay && days.includes(ownDay)) {
      todo.day = ownDay;
      todo.theirs = true;
      todo.byHand = true;
    } else if (ownBack && isDay(ownBack) && ownBack > today) {
      todo.backOn = ownBack;
      todo.byHand = true;
    }
    // then what is saved: a day of its own that is kept, here or elsewhere
    else if (spot.spot === 'fixed' && !free) {
      todo.day = spot.day;
      todo.theirs = true;
    } else if (spot.spot === 'own') continue;
    // What is already put off keeps its day, whatever a spread made before it
    // was put off says. Only one of the things that matter most this week is
    // Gremly's to bring back onto a day (the spread is made by the same rule).
    else if (spot.spot === 'later' && !priorityIds.has(t.id)) todo.backOn = spot.back_on;
    // then Gremly's spread
    else if (spread.place.has(t.id)) {
      todo.day = spread.place.get(t.id) as string;
      todo.gremly = true;
    } else if (spot.spot === 'fixed') {
      // Released from its day for Gremly to plan again. It goes where the
      // spread puts it (above), or to later when the spread puts it off, and
      // until a spread says either it stays where it is: nothing they dated
      // is ever dropped into Later for want of an answer.
      if (back && returns.includes(back)) {
        todo.backOn = back;
        todo.gremly = true;
      } else todo.day = spot.day;
    } else if (spot.spot === 'later') todo.backOn = spot.back_on;
    else if (back && returns.includes(back)) {
      todo.backOn = back;
      todo.gremly = true;
    }

    if (todo.day) (onDay.get(todo.day) as BoardTodo[]).push(todo);
    else if (todo.backOn) later.push(todo);
    else unplaced.push(todo);
  }
  // ── what Gremly placed gives way ──
  // His spread was made for the board as it stood then. What they have put on
  // a day since, a todo or a habit, stands over it, so a day may no longer
  // have room for what he placed there. No day is ever over its room because
  // of something of his: on such a day his placements give way, by the rule
  // his spread is checked with (workers/inngest-jobs/week/spread.js
  // checkSpread). What he placed last leaves first, what matters most to them
  // after the rest. Each goes to the next day with room for it, and to Later
  // when there is none. One held to a hard date on these days goes only to a
  // day up to that date, and stays where it was when none of them has room.
  const rank = (t: BoardTodo) => spread.order.get(t.id) ?? Number.MAX_SAFE_INTEGER;
  const roomOn = new Map(
    days.map((d) => [
      d,
      Math.round(hours[dayKind(d, { daysOff: p.daysOff, busyDays: busy }) as DayKind] * 60),
    ]),
  );
  const loadOn = new Map(
    days.map((d) => [
      d,
      habits.filter((h) => h.days.includes(d)).reduce((n, h) => n + h.minutes, 0) +
        (onDay.get(d) as BoardTodo[]).reduce((n, t) => n + t.minutes, 0),
    ]),
  );
  const room = (d: string) => roomOn.get(d) as number;
  const load = (d: string) => loadOn.get(d) as number;
  const dueIn = (t: BoardTodo) => (t.by && days.includes(t.by) ? t.by : null);
  // one on the day of its hard date, or past it, has no later day to go to
  const bound = (t: BoardTodo, d: string) => {
    const by = dueIn(t);
    return !!by && by <= d;
  };
  const gaveWay: { todo: BoardTodo; from: string }[] = [];
  for (const d of days) {
    const list = onDay.get(d) as BoardTodo[];
    while (load(d) > room(d)) {
      const his = list.filter((t) => t.gremly && !bound(t, d));
      if (!his.length) break;
      const undated = his.filter((t) => !dueIn(t));
      const plain = undated.filter((t) => !priorityIds.has(t.id));
      const from = plain.length ? plain : undated.length ? undated : his;
      const out = from.reduce((a, b) => (rank(b) >= rank(a) ? b : a));
      list.splice(list.indexOf(out), 1);
      loadOn.set(d, load(d) - out.minutes);
      gaveWay.push({ todo: out, from: d });
    }
  }
  const fitsOn = (t: BoardTodo, d: string) => load(d) + t.minutes <= room(d);
  const putOn = (t: BoardTodo, d: string) => {
    t.day = d;
    (onDay.get(d) as BoardTodo[]).push(t);
    loadOn.set(d, load(d) + t.minutes);
  };
  // the ones held to a date first: the room up to their dates is theirs before anything else moves into it
  for (const s of [
    ...gaveWay.filter((x) => dueIn(x.todo)),
    ...gaveWay.filter((x) => !dueIn(x.todo)),
  ]) {
    const by = dueIn(s.todo);
    const next = days.find((d) => d > s.from && (!by || d <= by) && fitsOn(s.todo, d));
    if (next) putOn(s.todo, next);
    else if (!by) {
      // to Later, still by his hand: it is given its day to come back with the rest below
      s.todo.day = null;
      unplaced.push(s.todo);
    } else {
      const before = days.filter((d) => d < s.from && fitsOn(s.todo, d));
      putOn(s.todo, before.length ? before[before.length - 1] : s.from);
    }
  }

  // What is on no day and has no day to come back on is given one, spread
  // out; or left loose, on a board that gives no days of its own.
  const loose: BoardTodo[] = [];
  if (p.assign === false) {
    loose.push(...unplaced.sort((a, b) => a.title.localeCompare(b.title)));
  } else if (unplaced.length) {
    const load = new Map<string, number>();
    for (const t of later) load.set(t.backOn as string, (load.get(t.backOn as string) ?? 0) + 1);
    const given = spreadReturns(
      // the oldest first, so what has waited longest comes back soonest
      [...unplaced]
        .sort(
          (a, b) => (a.created ?? '').localeCompare(b.created ?? '') || a.id.localeCompare(b.id),
        )
        .map((t) => ({ id: t.id })),
      { days: returns, load, cap: returnsCap(unplaced.length + later.length, returns.length) },
    );
    for (const t of unplaced) {
      t.backOn = given.get(t.id) ?? null;
      if (t.backOn) later.push(t);
    }
  }
  later.sort(
    (a, b) =>
      (a.backOn as string).localeCompare(b.backOn as string) || a.title.localeCompare(b.title),
  );

  // ── the days ──
  const boardDays: BoardDay[] = days.map((day) => {
    const kind = dayKind(day, { daysOff: p.daysOff, busyDays: busy }) as DayKind;
    const minutes = Math.round(hours[kind] * 60);
    const dayHabits = habits
      .filter((h) => h.days.includes(day))
      .map((h) => ({ id: h.id, title: h.title, minutes: h.minutes }));
    const todos = (onDay.get(day) as BoardTodo[]).sort(
      // Gremly's order where it gave one (what matters most first), then the oldest
      (a, b) =>
        rank(a) - rank(b) ||
        (a.created ?? '').localeCompare(b.created ?? '') ||
        a.id.localeCompare(b.id),
    );
    const habitMinutes = dayHabits.reduce((n, h) => n + h.minutes, 0);
    const todoMinutes = todos.reduce((n, t) => n + t.minutes, 0);
    const theirMinutes = todos.filter((t) => t.theirs).reduce((n, t) => n + t.minutes, 0);
    return {
      day,
      kind,
      busy: busy.includes(day),
      minutes,
      habitMinutes,
      todoMinutes,
      left: minutes - habitMinutes - todoMinutes,
      theirMinutes,
      ownMinutes: todos.filter((t) => !t.gremly).reduce((n, t) => n + t.minutes, 0),
      // only a day that holds todos of theirs: habits alone do not make one
      over: theirMinutes > 0 ? Math.max(0, habitMinutes + theirMinutes - minutes) : 0,
      todos,
      habits: dayHabits,
      note: spread.notes.get(day) ?? null,
    };
  });

  const sum = (list: number[]) => list.reduce((n, x) => n + x, 0);
  const placed = sum(boardDays.map((d) => d.todoMinutes));
  const laterMinutes = sum(later.map((t) => t.minutes));
  return {
    first,
    last,
    days: boardDays,
    theirs: theirs.sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title)),
    later,
    loose,
    habits,
    hours,
    returns,
    totals: {
      room: sum(boardDays.map((d) => d.minutes)),
      habits: sum(boardDays.map((d) => d.habitMinutes)),
      placed,
      later: laterMinutes,
      all: placed + laterMinutes,
      todosPlaced: sum(boardDays.map((d) => d.todos.length)),
      habitSessions: sum(habits.map((h) => h.days.length)),
    },
  };
}

/**
 * The board as Gremly is told it with a message (the review's working
 * picture, lib/cortex WeekTurnContext): every todo on a day, every todo put
 * off with its day, and every habit's days. Nothing here is saved yet, so
 * get_week reads it over what the database holds.
 */
export function workingPicture(board: Board): {
  placed: { id: string; day: string }[];
  later: { id: string; back_on: string }[];
  habit_days: { id: string; days: string[] }[];
} {
  return {
    placed: board.days.flatMap((d) => d.todos.map((t) => ({ id: t.id, day: d.day }))),
    later: board.later.map((t) => ({ id: t.id, back_on: t.backOn as string })),
    habit_days: board.habits.map((h) => ({ id: h.id, days: h.days })),
  };
}

/**
 * Their own moves, as the spread is asked with them: it never moves what
 * they placed, and a habit they paused here takes none of the week's room.
 */
export function ownMoves(moves: WeekBoardMoves | null | undefined): {
  placed: { id: string; day: string }[];
  later: { id: string; back_on: string }[];
  habit_days: { id: string; days: string[] }[];
  habit_ease: { id: string; mode: EaseMode }[];
} {
  return {
    placed: Object.entries(moves?.placed ?? {}).map(([id, day]) => ({ id, day })),
    later: Object.entries(moves?.later ?? {}).map(([id, back_on]) => ({ id, back_on })),
    habit_days: Object.entries(moves?.habit_days ?? {}).map(([id, days]) => ({ id, days })),
    habit_ease: Object.entries(moves?.habit_ease ?? {}).map(([id, e]) => ({ id, mode: e.mode })),
  };
}

/** What finishing the board has to write: only where the board differs from what is saved. */
export interface BoardDiff {
  /** A todo that goes on a day it is not saved on */
  place: { id: string; day: string }[];
  /** A todo put off until a day it is not already coming back on */
  later: { id: string; backOn: string }[];
  /** A habit's days to add and to take away */
  habits: { id: string; add: string[]; remove: string[] }[];
  /** A habit paused, given a lighter version or set back to usual over the days being planned */
  eases: ({ id: string } & BoardEase)[];
}

export function boardDiff(board: Board): BoardDiff {
  const place: BoardDiff['place'] = [];
  for (const d of board.days) {
    for (const t of d.todos) if (t.saved.day !== d.day) place.push({ id: t.id, day: d.day });
  }
  const later: BoardDiff['later'] = [];
  for (const t of board.later) {
    // put off already, for that day: nothing to write
    if (t.saved.day === null && t.saved.backOn === t.backOn) continue;
    later.push({ id: t.id, backOn: t.backOn as string });
  }
  const habits: BoardDiff['habits'] = [];
  for (const h of board.habits) {
    const add = h.days.filter((d) => !h.saved.includes(d));
    const remove = h.saved.filter((d) => !h.days.includes(d));
    if (add.length || remove.length) habits.push({ id: h.id, add, remove });
  }
  const eases = board.habits.flatMap((h) => (h.easeTo ? [{ id: h.id, ...h.easeTo }] : []));
  return { place, later, habits, eases };
}

/** Whether finishing the board would write anything. */
export function diffEmpty(d: BoardDiff): boolean {
  return !d.place.length && !d.later.length && !d.habits.length && !d.eases.length;
}

/**
 * A diff kept to what they moved themselves: on a board changed by hand once
 * the week is planned, only their own moves are written.
 */
export function onlyMoved(diff: BoardDiff, moves: WeekBoardMoves | null | undefined): BoardDiff {
  const todos = new Set([...Object.keys(moves?.placed ?? {}), ...Object.keys(moves?.later ?? {})]);
  // a habit they paused loses its days with the pause: that is their move too
  const habits = new Set([
    ...Object.keys(moves?.habit_days ?? {}),
    ...Object.keys(moves?.habit_ease ?? {}),
  ]);
  return {
    place: diff.place.filter((p) => todos.has(p.id)),
    later: diff.later.filter((l) => todos.has(l.id)),
    habits: diff.habits.filter((h) => habits.has(h.id)),
    eases: diff.eases,
  };
}

/** What was planned for each day: the todos and the habits on it, by id. */
export type PlannedDays = Record<string, { todos: string[]; habits: string[] }>;

/**
 * The plan as the board has it, kept on the week when the board is saved, so
 * the week can later be read back as what was planned against what got done.
 * The days the board holds are written afresh. A day the board does not hold
 * (one already gone by) stays as it was planned, and so does a todo that was
 * planned for a day and is no longer open: it is done, and the board, which
 * shows only what is open, no longer has it.
 * @param open the ids of the todos that are still open
 */
export function plannedDays(
  board: Board,
  before: PlannedDays | null | undefined,
  open: Set<string>,
): PlannedDays {
  const days: PlannedDays = { ...(before ?? {}) };
  for (const d of board.days) {
    const kept = (before?.[d.day]?.todos ?? []).filter((id) => !open.has(id));
    days[d.day] = {
      todos: [...new Set([...kept, ...d.todos.map((t) => t.id)])],
      habits: d.habits.map((h) => h.id),
    };
  }
  return days;
}

// ── Their own moves ─────────────────────────────────────────────────────────

/**
 * Move a todo to a day, or put it off. Put off, it comes back on the day it
 * was already coming back on when it had one, else the day with the fewest
 * returns. A move back to where the board would have it anyway is still kept
 * as theirs, so a later spread does not move it again.
 */
export function moveTodo(
  board: Board,
  moves: WeekBoardMoves | null | undefined,
  id: string,
  to: string | 'later',
): WeekBoardMoves {
  const placed = { ...(moves?.placed ?? {}) };
  const later = { ...(moves?.later ?? {}) };
  delete placed[id];
  delete later[id];
  if (to !== 'later') {
    if (board.days.some((d) => d.day === to)) placed[id] = to;
    return { ...(moves ?? {}), placed, later };
  }
  const todo = [...board.days.flatMap((d) => d.todos), ...board.later, ...board.loose].find(
    (t) => t.id === id,
  );
  const load = new Map<string, number>();
  for (const t of board.later) {
    if (t.id !== id) load.set(t.backOn as string, (load.get(t.backOn as string) ?? 0) + 1);
  }
  const back = spreadReturns([{ id, back_on: todo?.saved.backOn ?? null }], {
    days: board.returns,
    load,
    cap: returnsCap(board.later.length + 1, board.returns.length),
  }).get(id);
  if (back) later[id] = back;
  return { ...(moves ?? {}), placed, later };
}

/** Put a habit on a day, or take it off. */
export function toggleHabitDay(
  board: Board,
  moves: WeekBoardMoves | null | undefined,
  id: string,
  day: string,
): WeekBoardMoves {
  const habit = board.habits.find((h) => h.id === id);
  if (!habit || !board.days.some((d) => d.day === day)) return moves ?? {};
  const days = habit.days.includes(day)
    ? habit.days.filter((d) => d !== day)
    : [...habit.days, day].sort();
  return { ...(moves ?? {}), habit_days: { ...(moves?.habit_days ?? {}), [id]: days } };
}

/**
 * Pause a habit for the days being planned, give it a lighter version for
 * them, or neither. What they ask for is what the board then shows: neither
 * ends whatever is saved for these days, and asking again for what is
 * already saved is no move at all.
 * @param want what it should be over these days; null for neither
 * @param note what the lighter version is, in their words
 */
export function easeHabitOnBoard(
  board: Board,
  moves: WeekBoardMoves | null | undefined,
  id: string,
  want: 'pause' | 'lighter' | null,
  note = '',
): WeekBoardMoves {
  const habit = board.habits.find((h) => h.id === id);
  if (!habit) return moves ?? {};
  const ease = { ...(moves?.habit_ease ?? {}) };
  const saved = habit.savedEase;
  const words = noteOf(note);
  delete ease[id];
  if (want === 'pause') {
    if (saved?.mode !== 'pause') ease[id] = { mode: 'pause' };
  } else if (want === 'lighter') {
    if (saved?.mode !== 'lighter' || saved.note !== words)
      ease[id] = { mode: 'lighter', note: words };
  } else if (habit.savedEased) ease[id] = { mode: 'usual' };
  return { ...(moves ?? {}), habit_ease: ease };
}

/**
 * Their moves without the ones a saved change has overtaken: when a card of
 * Gremly's moved a todo, or changed a habit's days or paused it, what is
 * saved is their latest word.
 */
export function withoutMoves(
  moves: WeekBoardMoves | null | undefined,
  /** eases: habits whose pause or lighter version was saved, their days left as they chose them */
  ids: { todos?: string[]; habits?: string[]; eases?: string[] },
): WeekBoardMoves {
  const placed = { ...(moves?.placed ?? {}) };
  const later = { ...(moves?.later ?? {}) };
  const habitDays = { ...(moves?.habit_days ?? {}) };
  const habitEase = { ...(moves?.habit_ease ?? {}) };
  for (const id of ids.todos ?? []) {
    delete placed[id];
    delete later[id];
  }
  for (const id of ids.habits ?? []) {
    delete habitDays[id];
    delete habitEase[id];
  }
  for (const id of ids.eases ?? []) delete habitEase[id];
  return { ...(moves ?? {}), placed, later, habit_days: habitDays, habit_ease: habitEase };
}

// ── Their own days, and the days they overfill ──────────────────────────────

/**
 * Where the board's step stands: the question about their own days (keep),
 * picking which of them to keep (pick), an over-full day to look at
 * (overfull), a todo that matters most and is on no day (unfitted), or the
 * board itself.
 *
 * The question is asked once, when they have many todos on days of their own
 * (KEEP_ASK_FROM); with fewer they are kept without asking, and so they are
 * when they said Just plan it, which asks nothing more of them. After it,
 * each day their own todos overfill is taken in turn until every one has
 * been dealt with (answers.relieved): the ones they kept there, and the ones
 * they put there by hand on the board, whatever they said of their days.
 * Keeping their days never means keeping an over-full day without a word.
 *
 * Last, once Gremly's spread for these answers is on the board (ready): each
 * todo that is one of the things that matter most this week and is on no day
 * of it is taken in turn (unfitted), until each has been dealt with
 * (answers.fitted). What matters most never goes to Later without a word.
 */
export type BoardStage =
  | { stage: 'keep' }
  | { stage: 'pick' }
  | { stage: 'overfull'; day: string }
  | { stage: 'unfitted'; id: string }
  | { stage: 'board' };

export function boardStage(
  board: Board,
  answers: WeekAnswers | null | undefined,
  /** ready: the spread for these answers is on the board, so what it left off the days is known */
  open: { asking?: boolean; picking?: boolean; ready?: boolean } = {},
): BoardStage {
  if (open.picking) return { stage: 'pick' };
  const unasked = answers?.keep === undefined && !answers?.guessed;
  if (open.asking || (unasked && board.theirs.length >= KEEP_ASK_FROM)) return { stage: 'keep' };
  const over = board.days.find((d) => d.over > 0 && !answers?.relieved?.[d.day]);
  if (over) return { stage: 'overfull', day: over.day };
  const off = open.ready
    ? unfitted(board, answers).find((u) => !answers?.fitted?.[u.todo.id])
    : null;
  return off ? { stage: 'unfitted', id: off.todo.id } : { stage: 'board' };
}

// ── What matters most, on no day ────────────────────────────────────────────

/** The shortest part a todo is split into, and the most parts. */
export const PART_MIN = 30;
export const PARTS_MAX = 4;

/** A todo that is one of the things that matter most this week and is on no day of it. */
export interface Unfitted {
  todo: BoardTodo;
  /** Some day has room for it as the board stands: it is on no day, though it would fit one */
  fits: boolean;
  /**
   * The day it can go on whole: one with room for it as the board stands,
   * else the day with the most room once what Gremly placed there gives way.
   * Null when no day can hold it.
   */
  day: string | null;
  /** It in parts, each with the day it goes on; null when it cannot be split to fit */
  parts: { minutes: number; day: string }[] | null;
}

/**
 * The todos that matter most this week (the ones their priorities cover) and
 * are on no day of the week: put off by the spread, or still put off from
 * before the review. One they put off themselves on the board is their own
 * choice and is not among them.
 *
 * For each, what the board can offer, worked out from minutes alone. A day's
 * room for it is what the day gives, less its habits and everything on it
 * that is not Gremly's: what he placed gives way to what matters most
 * (boardOf). A todo with a hard date inside the week is only offered days up
 * to that date. It is split into the fewest equal parts, of half an hour or
 * more, that each fit a day of their own, the earliest days first.
 */
export function unfitted(board: Board, answers: WeekAnswers | null | undefined): Unfitted[] {
  const priorityIds = new Set((answers?.priorities ?? []).flatMap((x) => x.item_ids ?? []));
  const inWeek = (day: string | null) => !!day && board.days.some((d) => d.day === day);
  return board.later
    .filter((t) => priorityIds.has(t.id) && !t.byHand)
    .sort((a, b) => b.minutes - a.minutes || a.id.localeCompare(b.id))
    .map((todo) => {
      const days = board.days.filter((d) => !inWeek(todo.by) || d.day <= (todo.by as string));
      const room = (d: BoardDay) => d.minutes - d.habitMinutes - d.ownMinutes;
      const asIs = days.find((d) => d.left >= todo.minutes);
      const most = days.reduce<BoardDay | null>(
        (best, d) => (room(d) >= todo.minutes && (!best || room(d) > room(best)) ? d : best),
        null,
      );
      let parts: Unfitted['parts'] = null;
      const mostParts = Math.min(PARTS_MAX, Math.floor(todo.minutes / PART_MIN));
      for (let n = 2; n <= mostParts && !parts; n++) {
        // equal parts to the next five minutes, the last taking what is left
        const each = Math.ceil(todo.minutes / n / 5) * 5;
        const on = days.filter((d) => room(d) >= each).slice(0, n);
        // a last part shorter than the shortest is no part: more parts will not do either
        if (todo.minutes - each * (n - 1) < PART_MIN) break;
        if (on.length === n) {
          parts = on.map((d, i) => ({
            minutes: i < n - 1 ? each : todo.minutes - each * (n - 1),
            day: d.day,
          }));
        }
      }
      return { todo, fits: !!asIs, day: (asIs ?? most)?.day ?? null, parts };
    });
}

/**
 * Each day's load from their own todos and its habits, against its hours:
 * what the question about their days shows before they answer, and while
 * they pick which to keep. Their own are the ones on a day they are saved on,
 * and the ones they have put on a day by hand on the board.
 * @param freed the todos they have freed so far, which no longer count
 */
export function keepLoad(
  board: Board,
  freed: string[] = [],
): { day: string; minutes: number; load: number; count: number; over: number }[] {
  return board.days.map((d) => {
    const mine = board.theirs.filter((t) => t.day === d.day && !freed.includes(t.id));
    const byHand = d.todos.filter((t) => t.byHand);
    const load = d.habitMinutes + [...mine, ...byHand].reduce((n, t) => n + t.minutes, 0);
    const count = mine.length + byHand.length;
    return {
      day: d.day,
      minutes: d.minutes,
      load,
      count,
      over: count ? Math.max(0, load - d.minutes) : 0,
    };
  });
}

/** One of Gremly's suggested moves for an over-full day, as its card shows it. */
export interface ReliefMove {
  id: string;
  title: string;
  minutes: number;
  /** The day it would move to; null when it would go to Later, back on backOn */
  to: string | null;
  backOn: string | null;
}

/**
 * Gremly's suggestions for one over-full day, checked against the board as
 * it stands now: a move is kept only while its todo is still theirs on that
 * day and the day it would go to still has room beside everything that is
 * not Gremly's (his own placements are spread again around what they move).
 * Null when the relief has nothing for the day. asked is how many moves he
 * offered for it before any check: none means he would leave the day as it is.
 */
export function reliefFor(
  board: Board,
  relief: WeekRelief | null | undefined,
  day: string,
): { over: number; asked: number; moves: ReliefMove[]; still: number; note: string } | null {
  const from = board.days.find((d) => d.day === day);
  const given = relief?.days?.find((d) => d.day === day);
  if (!from || !given) return null;
  const room = new Map(
    board.days.map((d) => [d.day, d.over > 0 ? 0 : d.minutes - d.habitMinutes - d.ownMinutes]),
  );
  const moves: ReliefMove[] = [];
  for (const m of given.moves ?? []) {
    const todo = from.todos.find((t) => t.id === m.id && t.theirs && !t.timed);
    if (!todo || moves.some((x) => x.id === m.id)) continue;
    const move = { id: todo.id, title: todo.title, minutes: todo.minutes };
    if (m.to) {
      if (m.to === day || (room.get(m.to) ?? -1) < todo.minutes) continue;
      room.set(m.to, (room.get(m.to) as number) - todo.minutes);
      moves.push({ ...move, to: m.to, backOn: null });
    } else {
      const back = m.back_on && board.returns.includes(m.back_on) ? m.back_on : null;
      moves.push({ ...move, to: null, backOn: back ?? board.returns[0] ?? null });
    }
  }
  const usable = moves.filter((m) => m.to || m.backOn);
  return {
    over: from.over,
    asked: given.asked ?? (given.moves ?? []).length,
    moves: usable,
    still: Math.max(0, from.over - usable.reduce((n, m) => n + m.minutes, 0)),
    // his line was written for the moves as he made them
    note: usable.length === (given.moves ?? []).length ? (given.note ?? '') : '',
  };
}

/** Take suggested moves: each becomes a move of their own on the board. */
export function applyRelief(
  moves: WeekBoardMoves | null | undefined,
  taken: ReliefMove[],
): WeekBoardMoves {
  const placed = { ...(moves?.placed ?? {}) };
  const later = { ...(moves?.later ?? {}) };
  for (const m of taken) {
    delete placed[m.id];
    delete later[m.id];
    if (m.to) placed[m.id] = m.to;
    else if (m.backOn) later[m.id] = m.backOn;
  }
  return { ...(moves ?? {}), placed, later };
}

/**
 * How many todos are on a day by Gremly's hand, and how many by theirs (a day
 * they gave it before, or a move on the board): what his line about the
 * board counts.
 */
export function placedBy(board: Board): { gremly: number; own: number } {
  const on = board.days.flatMap((d) => d.todos);
  const gremly = on.filter((t) => t.gremly).length;
  return { gremly, own: on.length - gremly };
}

/**
 * Where Gremly's spread put each todo on the board as it is saved: kept on
 * the week (answers.planned.gremly), so that when this week is planned again
 * his own placements are his to place again, and every other day is theirs.
 */
export function gremlyPlaced(board: Board): Record<string, string> {
  const put: Record<string, string> = {};
  for (const d of board.days) for (const t of d.todos) if (t.gremly) put[t.id] = d.day;
  return put;
}
