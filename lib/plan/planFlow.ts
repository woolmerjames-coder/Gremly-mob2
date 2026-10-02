/**
 * The plan in today's thread (Daily brief in Chat), worked out without side
 * effects: what each version holds, how a change re-fits it, the suggested
 * changes under it, and Gremly's fixed lines around it.
 */

import type { BriefPlanMeta, OfferButton, PlanItem, UnplacedItem } from '../brief/types';
import type { Candidate } from './candidatePool';
import { fitSlots, freeMinutes, PLAN_DAY_END, type Busy } from './slotFitter';

/** An item in a plan, placed or not. */
export interface PlanEntry {
  id: string;
  kind: 'todo' | 'habit' | 'reach';
  title: string;
  minutes: number;
  window: [number, number];
  reason: string | null;
  fromFact?: boolean;
}

/** A change to the plan: by a tap, a suggestion or a typed message. */
export interface PlanOp {
  op: 'remove' | 'add' | 'move';
  id: string;
  window: [number, number] | null;
}

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
    });
  meta.items.forEach((x) => add(x, x.start, x.end));
  meta.unplaced.forEach((x) => add(x));
  const order = meta.order?.length ? meta.order : [...all.keys()];
  const out = order.map((id) => all.get(id)).filter((e): e is PlanEntry => !!e);
  for (const e of all.values()) if (!out.includes(e)) out.push(e);
  return out;
}

/**
 * Place the entries and describe the result as a plan message. `busy` is
 * meetings and set times; nothing ends after `dayEnd` (10pm, or when they set
 * off: lib/brief/dayRecord.ts).
 */
export function fitPlan(
  entries: PlanEntry[],
  busy: Busy[],
  from: number,
  dayEnd: number = PLAN_DAY_END,
): Pick<BriefPlanMeta, 'items' | 'unplaced' | 'order' | 'from'> {
  const fit = fitSlots(
    entries.map((e) => ({ id: e.id, minutes: e.minutes, window: e.window })),
    busy,
    from,
    dayEnd,
  );
  const byId = new Map(entries.map((e) => [e.id, e]));
  return {
    from,
    order: entries.map((e) => e.id),
    items: fit.placed.map((p) => {
      const e = byId.get(p.id)!;
      return {
        id: e.id,
        kind: e.kind,
        title: e.title,
        start: p.start,
        end: p.end,
        reason: e.reason,
        window: e.window,
        minutes: e.minutes,
        fromFact: e.fromFact,
      };
    }),
    unplaced: fit.unplaced.map((id) => {
      const e = byId.get(id)!;
      return {
        id: e.id,
        title: e.title,
        kind: e.kind,
        window: e.window,
        minutes: e.minutes,
        reason: e.reason,
        fromFact: e.fromFact,
      };
    }),
  };
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
    if (existing) return entries;
    const c = pool.find((x) => x.id === op.id);
    return c ? [...entries, entryFromCandidate(c, from, op.window)] : entries;
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
  alreadyLocked: "It's already locked in. Tell me what to change and I'll rework it.",
  relock: ' Lock it in again to update Today.',
  thanks: 'Any time.',
  keptReason: 'Kept for today',
};

/** Gremly's line after a change. */
export function changeText(
  op: PlanOp,
  title: string,
  placed: PlanItem | undefined,
  wasLocked: boolean,
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
  return wasLocked ? text + PLAN_COPY.relock : text;
}

/** Gremly's line when something chosen did not fit. */
export function unplacedText(unplaced: UnplacedItem[]): string | null {
  if (!unplaced.length) return null;
  const names = namesOf(unplaced.map((u) => u.title));
  return unplaced.length === 1
    ? `I couldn't find a good gap for ${names} today, so it's not in the plan.`
    : `I couldn't find good gaps for ${names} today, so they're not in the plan.`;
}

/** Gremly's line after Lock it in. */
export function lockText(created: string[]): string {
  let t = "Locked in. It's all on Today, with plenty of room left.";
  if (created.length)
    t += ` I've added ${namesOf(created)} as ${created.length === 1 ? 'a todo' : 'todos'} too.`;
  return t;
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
