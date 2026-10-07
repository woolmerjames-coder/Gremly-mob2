/**
 * The plan in today's thread (Daily brief in Chat), worked out without side
 * effects: what each version holds, how a change re-fits it, the suggested
 * changes under it, and Gremly's fixed lines around it.
 */

import type { BriefPlanMeta, OfferButton, PlanItem, UnplacedItem } from '../brief/types';
import type { Candidate } from './candidatePool';
import {
  BUFFER_MINUTES,
  fitSlots,
  freeMinutes,
  PLAN_DAY_END,
  roomLeft,
  type Busy,
} from './slotFitter';

/** A time the person named may go as late as midnight, past the end of planning */
const LATEST = 24 * 60;

/** An item in a plan, placed or not. */
export interface PlanEntry {
  id: string;
  kind: 'todo' | 'habit' | 'reach';
  title: string;
  minutes: number;
  window: [number, number];
  reason: string | null;
  fromFact?: boolean;
  /** Picked by the person: it is placed ahead of anything Gremly chose */
  chosen?: boolean;
}

/** A change to the plan: by a tap, a suggestion or a typed message. */
export interface PlanOp {
  op: 'remove' | 'add' | 'move';
  id: string;
  window: [number, number] | null;
  /** An add the person picked themselves (Add something, kept in Sweep) */
  chosen?: boolean;
}

/** Why something the person picked is in the plan */
export const CHOSEN_REASON = 'Added by you';

const DEFAULT_MINUTES = 30;

export function entryFromCandidate(
  c: Candidate,
  from: number,
  window?: [number, number] | null,
): PlanEntry {
  return {
    id: c.id,
    kind: c.kind,
    title: c.title,
    minutes: c.minutes ?? DEFAULT_MINUTES,
    window: window ?? c.window ?? [from, PLAN_DAY_END],
    reason: c.why || null,
    fromFact: c.fromFact,
  };
}

/** The plan's items in placing order, placed and unplaced. */
export function entriesOf(meta: BriefPlanMeta): PlanEntry[] {
  const from = meta.from ?? 0;
  const all = new Map<string, PlanEntry>();
  const add = (x: PlanItem | UnplacedItem, start?: number, end?: number) =>
    all.set(x.id, {
      id: x.id,
      kind: x.kind ?? 'todo',
      title: x.title,
      minutes:
        x.minutes ?? (start !== undefined && end !== undefined ? end - start : DEFAULT_MINUTES),
      window: x.window ?? [from, PLAN_DAY_END],
      reason: x.reason ?? null,
      fromFact: x.fromFact,
      ...(x.chosen ? { chosen: true } : {}),
    });
  meta.items.forEach((x) => add(x, x.start, x.end));
  meta.unplaced.forEach((x) => add(x));
  const order = meta.order?.length ? meta.order : [...all.keys()];
  const out = order.map((id) => all.get(id)).filter((e): e is PlanEntry => !!e);
  for (const e of all.values()) if (!out.includes(e)) out.push(e);
  return out;
}

export interface PlaceOptions {
  /** Meetings and set times */
  busy: Busy[];
  /** Nothing Gremly places starts before this (the time now on today's plan) */
  from: number;
  /** Nothing Gremly places ends after this (10pm, or when they set off) */
  dayEnd?: number;
  /** The earliest a time the person named can go: the time now today, midnight on another day */
  now?: number;
  /** Times named in this change, by item: each goes there, or at the first free time after it */
  pins?: Map<string, number>;
  /** The plan as it is now: what the person picked or gave a time before keeps its place */
  placed?: PlanItem[];
  /** Items the change itself moves or takes out: placed afresh */
  touched?: Iterable<string>;
  /**
   * The gap kept between items and either side of meetings: 15 minutes when
   * left out, none for a plan they asked for back to back (BriefPlanMeta.buffer)
   */
  buffer?: number;
}

/** What placing a plan gives: the parts of the plan message it sets. */
export type PlanFit = Pick<BriefPlanMeta, 'items' | 'unplaced' | 'order' | 'from' | 'buffer'>;

/**
 * Place a plan's items and describe the result as a plan message. Items claim
 * time in this order, so what the person asked for is never pushed out by
 * what Gremly chose:
 *   1. a time named in this change: there, or the first free time after it;
 *   2. what the person picked themselves: where it already is, else anywhere
 *      in its window;
 *   3. a time they named before: where it is;
 *   4. everything else, in placing order, in its window.
 * A named time stays where it was named when that time is free, even after the
 * plan would otherwise end; when a meeting or something already in the plan is
 * there, it goes at the first free time after. It is never before now. Nothing
 * else goes before `from` or after `dayEnd`.
 *
 * The gap between things is the plan's own (opts.buffer). A plan made back to
 * back says so in what comes back, so every later fit of it keeps to that.
 */
export function placePlan(entries: PlanEntry[], opts: PlaceOptions): PlanFit {
  const { busy, from } = opts;
  const buffer = opts.buffer ?? BUFFER_MINUTES;
  const dayEnd = opts.dayEnd ?? PLAN_DAY_END;
  const floor = opts.now ?? 0;
  const pins = opts.pins ?? new Map<string, number>();
  const touched = new Set(opts.touched ?? []);
  const was = new Map(
    (opts.placed ?? []).filter((x) => !touched.has(x.id)).map((x) => [x.id, x] as const),
  );

  type Claim = { e: PlanEntry; tries: [number, number][]; named: boolean };
  const claims: Claim[] = [];
  const claimed = new Set<string>();
  const claim = (e: PlanEntry, tries: [number, number][], named: boolean) => {
    if (claimed.has(e.id)) return;
    claimed.add(e.id);
    claims.push({ e, tries, named });
  };
  for (const e of entries) {
    const at = pins.get(e.id);
    if (at !== undefined) claim(e, [[Math.max(at, floor), LATEST]], true);
  }
  for (const e of entries) {
    if (!e.chosen) continue;
    const w = was.get(e.id);
    if (w?.pinned && w.start >= floor) claim(e, [[w.start, LATEST]], true);
    else if (w && w.start >= from) claim(e, [[w.start, dayEnd], e.window], false);
    else claim(e, [e.window], false);
  }
  for (const e of entries) {
    const w = was.get(e.id);
    if (w?.pinned) claim(e, [[Math.max(w.start, floor), LATEST]], true);
  }
  for (const e of entries) claim(e, [e.window], false);

  const items: PlanItem[] = [];
  const unplaced: UnplacedItem[] = [];
  for (const c of claims) {
    const e = c.e;
    const others = items.map((x) => ({ start: x.start, end: x.end }));
    let spot: { start: number; end: number } | null = null;
    for (const w of c.tries) {
      const one = [{ id: e.id, minutes: e.minutes, window: w }];
      const fit = c.named
        ? // a named time: there when it is free, with no gap needed around it
          fitSlots(one, [...busy, ...others], floor, LATEST, 0)
        : fitSlots(one, [...busy, ...others], from, dayEnd, buffer);
      if (fit.placed.length) {
        spot = fit.placed[0];
        break;
      }
    }
    if (!spot) {
      unplaced.push({
        id: e.id,
        title: e.title,
        kind: e.kind,
        window: e.window,
        minutes: e.minutes,
        reason: e.reason,
        fromFact: e.fromFact,
        ...(e.chosen ? { chosen: true } : {}),
      });
      continue;
    }
    items.push({
      id: e.id,
      kind: e.kind,
      title: e.title,
      start: spot.start,
      end: spot.end,
      reason: e.reason,
      window: e.window,
      minutes: e.minutes,
      fromFact: e.fromFact,
      ...(c.named ? { pinned: true } : {}),
      ...(e.chosen ? { chosen: true } : {}),
    });
  }
  items.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  return {
    from,
    order: claims.map((c) => c.e.id),
    items,
    unplaced,
    ...(buffer !== BUFFER_MINUTES ? { buffer } : {}),
  };
}

/** Place a new plan: what the person picked first, then the rest in order. */
export function fitPlan(
  entries: PlanEntry[],
  busy: Busy[],
  from: number,
  dayEnd: number = PLAN_DAY_END,
  buffer?: number,
): PlanFit {
  return placePlan(entries, { busy, from, dayEnd, buffer });
}

/**
 * How picks sit in the day, for the pick sheet: the time still free once they
 * are in with the gaps kept, or that they only fit with no gaps, or that some
 * have no place either way. Worked out by placing them as the plan would, so
 * the sheet and the plan it makes never disagree.
 */
export interface PickRoom {
  /** spaced: all fit with the gaps. tight: all fit only back to back. over: some fit neither way. */
  fit: 'spaced' | 'tight' | 'over';
  /** Minutes still free for more, with the gaps kept (0 unless spaced) */
  left: number;
  /**
   * over: minutes of what the plan will leave out. Back to back would not
   * hold everything either, so the plan is made with its gaps, and this is
   * what has no place in that plan.
   */
  over: number;
}

export function planRoom(entries: PlanEntry[], opts: PlaceOptions): PickRoom {
  const gap = opts.buffer ?? BUFFER_MINUTES;
  const dayEnd = opts.dayEnd ?? PLAN_DAY_END;
  const spaced = placePlan(entries, { ...opts, buffer: gap });
  if (!spaced.unplaced.length) {
    return {
      fit: 'spaced',
      left: roomLeft(opts.busy, spaced.items, opts.from, Math.max(opts.from, dayEnd), gap),
      over: 0,
    };
  }
  // Back to back is a way to fit several things: one thing alone that only
  // fits hard up against a meeting has no good gap, as it always has not.
  const tight = gap > 0 && entries.length > 1 ? placePlan(entries, { ...opts, buffer: 0 }) : spaced;
  if (!tight.unplaced.length) return { fit: 'tight', left: 0, over: 0 };
  return {
    fit: 'over',
    left: 0,
    over: spaced.unplaced.reduce((a, u) => a + (u.minutes ?? DEFAULT_MINUTES), 0),
  };
}

/**
 * Fit a plan again after a change. What the person picked or gave a time
 * themselves keeps its place; touched: items the change itself moves or takes
 * out, which it places afresh.
 */
export function refitKeeping(
  entries: PlanEntry[],
  placed: PlanItem[],
  busy: Busy[],
  from: number,
  dayEnd: number = PLAN_DAY_END,
  touched: Iterable<string> = [],
  now: number = 0,
  buffer?: number,
): PlanFit {
  return placePlan(entries, { busy, from, dayEnd, placed, touched, now, buffer });
}

/** Apply one change. A move with no time asks for later than where it is now. */
export function applyOp(
  entries: PlanEntry[],
  op: PlanOp,
  pool: Candidate[],
  from: number,
  placed: PlanItem[],
): PlanEntry[] {
  if (op.op === 'remove') return entries.filter((e) => e.id !== op.id);
  const existing = entries.find((e) => e.id === op.id);
  if (op.op === 'add') {
    if (existing) {
      // picking something Gremly already put in makes it theirs
      return op.chosen
        ? entries.map((e) => (e.id === op.id ? { ...e, chosen: true, reason: CHOSEN_REASON } : e))
        : entries;
    }
    const c = pool.find((x) => x.id === op.id);
    if (!c) return entries;
    const e = entryFromCandidate(c, from, op.window);
    return [...entries, op.chosen ? { ...e, chosen: true, reason: CHOSEN_REASON } : e];
  }
  // move
  const now = placed.find((p) => p.id === op.id);
  const window: [number, number] = op.window ?? [(now ? now.end : from) + 45, PLAN_DAY_END];
  if (existing) return entries.map((e) => (e.id === op.id ? { ...e, window } : e));
  const c = pool.find((x) => x.id === op.id);
  return c ? [...entries, entryFromCandidate(c, from, window)] : entries;
}

/** "1h 30m", "45m", "2h" */
export function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "1:15pm", "6pm" */
export function spoken(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
}

/** "Tomorrow" or "Friday" for a plan made for another day; null for today. */
export function otherDayTitle(day: string, today: string): string | null {
  if (day === today) return null;
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  if (Math.round((b - a) / 864e5) === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(b));
}

function weekdayName(day: string): string {
  const at = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(at),
  );
}

/** How a plan's day is named. */
export interface PlanDay {
  /** The plan is for the person's own day */
  today: boolean;
  /** "today", "tomorrow", or the weekday when tomorrow would be misread */
  word: string;
  /** The weekday the plan is for */
  weekday: string;
}

/**
 * The words for a plan's day. today is the person's day, which ends at their
 * day end and not at midnight. late is the time after midnight before it
 * ends: the clock already says the next day then, so that day goes by its
 * weekday instead of "tomorrow".
 */
export function planDay(day: string, today: string, late = false): PlanDay {
  const weekday = weekdayName(day);
  if (day === today) return { today: true, word: 'today', weekday };
  const next = otherDayTitle(day, today) === 'Tomorrow';
  return { today: false, word: next && !late ? 'tomorrow' : weekday, weekday };
}

/** The card's title for a plan made for another day; null for today's. */
export function planDayTitle(d: PlanDay): string | null {
  return d.today ? null : d.word.charAt(0).toUpperCase() + d.word.slice(1);
}

/** The button that says yes to a proposal. */
export function yesLabel(d: PlanDay): string {
  return d.today ? 'Put it on Today' : `That's ${d.word}`;
}

/** The tag on a plan that was said yes to. */
export function setTag(d: PlanDay): string {
  return d.today ? 'On Today' : `On ${d.weekday}`;
}

/** The one line a plan folds to after Not now. */
export function notSetLine(d: PlanDay): string {
  return d.today ? 'Plan not set' : 'Plan not set. The morning brief will have it.';
}

/** "Your day", "Your afternoon", "Your evening": from where the plan starts. */
export function planHeading(from: number): string {
  if (from < 12 * 60) return 'Your day';
  if (from < 17 * 60) return 'Your afternoon';
  return 'Your evening';
}

/** "3 things, 1h 30m, still 4h 10m free" */
export function planSummary(
  meta: BriefPlanMeta,
  meetings: Busy[],
  end: number = PLAN_DAY_END,
): string {
  const from = meta.from ?? 0;
  const planned = meta.items.reduce((a, x) => a + (x.end - x.start), 0);
  const free = freeMinutes(meetings, meta.items, from, Math.max(from, end));
  const n = meta.items.length;
  return `${n} ${n === 1 ? 'thing' : 'things'}, ${duration(planned)}, still ${duration(free)} free`;
}

/** Names in a sentence: "a, b and c". */
export function namesOf(titles: string[]): string {
  // titles as the person typed them: changing case by rule gets names wrong
  const t = titles;
  if (t.length <= 1) return t.join('');
  return `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`;
}

/**
 * Up to three suggested changes under a proposal, worked out from the plan
 * and the pool: move a habit placed before 6pm to the evening, add the best
 * candidate left out, skip the last thing placed.
 */
export function suggestions(meta: BriefPlanMeta, pool: Candidate[]): OfferButton[] {
  const out: OfferButton[] = [];
  const inPlan = new Set([...meta.items.map((x) => x.id), ...meta.unplaced.map((x) => x.id)]);
  const movable = meta.items.find(
    (x) => x.kind === 'habit' && x.start < 18 * 60 && x.end <= PLAN_DAY_END - 60,
  );
  if (movable) {
    out.push({
      id: `move-${movable.id}`,
      label: `Move ${movable.title} after 6`,
      action: 'plan_edit',
      value: JSON.stringify({ op: 'move', id: movable.id, window: [18 * 60, PLAN_DAY_END] }),
    });
  }
  const left = pool.find((c) => !inPlan.has(c.id) && c.source !== 'reach');
  if (left) {
    out.push({
      id: `add-${left.id}`,
      label: `Add ${left.title}`,
      action: 'plan_edit',
      value: JSON.stringify({ op: 'add', id: left.id, window: null }),
    });
  }
  const last = [...meta.items].reverse().find((x) => x.id !== movable?.id);
  if (last && meta.items.length > 1) {
    out.push({
      id: `skip-${last.id}`,
      label: `Skip ${last.title} today`,
      action: 'plan_edit',
      value: JSON.stringify({ op: 'remove', id: last.id, window: null }),
    });
  }
  return out.slice(0, 3);
}

/** Read a suggestion button's change back. */
export function opFromButton(button: OfferButton): PlanOp | null {
  try {
    const v = JSON.parse(button.value || '');
    if (!v || typeof v.id !== 'string' || !['remove', 'add', 'move'].includes(v.op)) return null;
    const w =
      Array.isArray(v.window) && v.window.length === 2 ? (v.window as [number, number]) : null;
    return { op: v.op, id: v.id, window: w };
  } catch {
    return null;
  }
}

export const PLAN_COPY = {
  introFallback:
    "Here's what I'd do with what's on today. I've kept it light so there's room if the day runs over.",
  nothingToPlan: "There's nothing on today's list to plan around, so the rest of the day is yours.",
  noRoom: "There isn't a clear stretch left today to fit anything in, so I'd leave it as it is.",
  noRoomTravel: "There isn't a clear stretch left before you set off, so I'd leave it as it is.",
  dismissed: "No problem. It'll be right here if you want it later.",
  dismissedOtherDay: 'No problem. The morning brief will bring it.',
  again: ' Say yes again to keep the change.',
  againAfterChanges: "Here's the plan with those changes. Say yes again to keep them.",
  thanks: 'Any time.',
  keptReason: 'Kept for today',
  yourPicks: "Here's the day with what you picked, around everything that's fixed.",
  backToBack: "Back to back it is. Here's how it lays out.",
  withSpace: "With some space, then. Here's what fits.",
  unfitFailed: "That didn't save, so nothing has moved.",
  dayGone: "That day has gone, so there's nothing left of it to plan.",
};

// ── when the picks only fit back to back ────────────────────────────────────

/** Gremly's question when everything picked fits only with no gaps between. */
export function spacingAskText(d: PlanDay): string {
  return `Those only fit ${d.word} back to back. Want them back to back, or with some space between them?`;
}

export function spacingButtons(): OfferButton[] {
  return [
    { id: 'plan_tight', label: 'Back to back', action: 'plan_spacing', value: 'tight' },
    { id: 'plan_spaced', label: 'With some space', action: 'plan_spacing', value: 'spaced' },
  ];
}

// ── what they picked and did not fit ────────────────────────────────────────

/** The day after a plan's day, as they would say it now: "tomorrow", or its weekday. */
export function dayAfterWord(planDate: string, today: string, late = false): string {
  return planDay(dayAfter(planDate), today, late).word;
}

/** The day after a day. */
export function dayAfter(day: string): string {
  const at = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  return new Date(at + 864e5).toISOString().slice(0, 10);
}

/**
 * Gremly's line when something they picked did not fit, with the offer for
 * the todos among it: another day, and put off for later when that is one of
 * the buttons (unfitButtons).
 * @param todos the todos that did not fit, which the buttons act on
 * @param p.day the plan's day ("today"); p.next the day after it ("tomorrow")
 */
export function unfitAskText(
  unplaced: UnplacedItem[],
  todos: UnplacedItem[],
  p: { day: string; next: string; later: boolean },
): string {
  const said = unplacedText(unplaced, p.day) ?? '';
  const all = todos.length === unplaced.length;
  const what = all ? (todos.length === 1 ? 'it' : 'them') : namesOf(todos.map((t) => t.title));
  return `${said} Want ${what} ${p.next} instead${p.later ? ', or put off for later' : ''}?`;
}

/**
 * The buttons under it. Later is there only when every one of the todos can
 * still be put off (lib/sweep/cardDays.ts laterOffered).
 */
export function unfitButtons(count: number, word: string, later: boolean): OfferButton[] {
  return [
    { id: 'unfit_tomorrow', label: `Move to ${word}`, action: 'plan_unfit', value: 'tomorrow' },
    ...(later
      ? [{ id: 'unfit_later', label: 'Later', action: 'plan_unfit' as const, value: 'later' }]
      : []),
    {
      id: 'unfit_leave',
      label: count === 1 ? 'Leave it' : 'Leave them',
      action: 'plan_unfit',
      value: 'leave',
    },
  ];
}

/** Gremly's line once they are moved to the next day. */
export function unfitMovedText(titles: string[], word: string): string {
  return titles.length === 1
    ? `Done, ${titles[0]} is on ${word} now.`
    : `Done, ${namesOf(titles)} are on ${word} now.`;
}

/** Gremly's line once they are put off, each with the day it comes back. */
export function unfitLaterText(back: { title: string; day: string }[]): string {
  return `Done. ${namesOf(back.map((b) => `${b.title} comes back ${b.day}`))}.`;
}

/** Added to either line when some of them could not be moved. */
export function unfitStayedText(titles: string[]): string {
  return titles.length === 1
    ? `${titles[0]} stayed where it was.`
    : `${namesOf(titles)} stayed where they were.`;
}

/** Gremly's line when they are left where they are. */
export function unfitLeftText(count: number): string {
  return count === 1 ? "Sure, I've left it where it is." : "Sure, I've left them where they are.";
}

/** Gremly's line after a change. */
export function changeText(
  op: PlanOp,
  title: string,
  placed: PlanItem | undefined,
  /** The plan had already been said yes to: the changed one needs a yes again */
  wasSet: boolean,
): string {
  const name = title;
  let text: string;
  if (op.op === 'remove') text = `Taken ${name} out for today. Everything else stays where it was.`;
  else if (op.op === 'add')
    text = placed
      ? `Added ${name} at ${spoken(placed.start)}.`
      : `There isn't a good gap for ${name} today, so I've left it off.`;
  else
    text = placed
      ? `Done, ${name} is at ${spoken(placed.start)} now. Everything else stays where it was.`
      : `I couldn't find room for ${name} then, so I've left it off.`;
  return wasSet ? text + PLAN_COPY.again : text;
}

/** Gremly's line when something chosen did not fit. day: the plan's day, as they would say it. */
export function unplacedText(unplaced: UnplacedItem[], day = 'today'): string | null {
  if (!unplaced.length) return null;
  const names = namesOf(unplaced.map((u) => u.title));
  return unplaced.length === 1
    ? `I couldn't find a good gap for ${names} ${day}, so it's not in the plan.`
    : `I couldn't find good gaps for ${names} ${day}, so they're not in the plan.`;
}

/** Gremly's line after a plan is said yes to. */
export function yesText(created: string[], d: PlanDay): string {
  let t = d.today
    ? "That's all on Today, with plenty of room left."
    : "Done. It'll be on Today when you wake up.";
  if (created.length)
    t += ` I've added ${namesOf(created)} as ${created.length === 1 ? 'a todo' : 'todos'} too.`;
  return t;
}

/** Gremly's line after Not now. */
export function dismissedText(d: PlanDay): string {
  return d.today ? PLAN_COPY.dismissed : PLAN_COPY.dismissedOtherDay;
}

/** Gremly's line when a plan is asked for and the day already has one. */
export function alreadySetText(d: PlanDay): string {
  const where = d.today ? 'on Today' : `set for ${d.word}`;
  return `It's already ${where}. Tell me what to change and I'll rework it.`;
}

/**
 * What can wait: data, never a model. Anything past its date is for Sweep;
 * what is simply due (no claim on today, not behind) can wait for tomorrow;
 * habits behind for the week are named as the ones to pick back up.
 */
export function whatCanWait(pool: Candidate[], overdue: number): string {
  // what is simply due (no claim on today, not behind for the week) can wait;
  // nothing is called urgent or not, since only the context knows that
  const canWait = pool.filter((c) => c.source === 'due' || c.source === 'habit').slice(0, 3);
  const behind = pool.filter((c) => c.source === 'behind').map((c) => c.title);
  const cap = (t: string) => t.replace(/^./, (x) => x.toUpperCase());
  const waitLine = canWait.length
    ? `${cap(namesOf(canWait.map((c) => c.title)))} can wait until tomorrow.`
    : '';
  if (overdue > 0) {
    const n = overdue === 1 ? 'one past its date is' : `${overdue} past their dates are`;
    return `The ${n} the ones to decide on, and Sweep is the quickest way to do that.${waitLine ? ` ${waitLine}` : ''}`;
  }
  const behindLine = behind.length
    ? ` ${cap(namesOf(behind))} ${behind.length === 1 ? 'is the one' : 'are the ones'} to pick back up this week.`
    : '';
  if (!canWait.length) {
    return `Everything on today's list has a reason to be today.${behindLine}`;
  }
  return `${waitLine.replace(/\.$/, '')} without putting the week off track.${behindLine}`;
}
