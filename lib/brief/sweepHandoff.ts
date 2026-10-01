/**
 * Sweep from the brief and back (Daily brief in Chat).
 *
 * Sweep first (or the day card's Sweep row) opens the real Sweep. Nothing in
 * Sweep changes: on the way in the brief notes what was waiting, and when the
 * thread is back on screen it compares. What left Sweep was swept; what now
 * carries today's date, or became a Lock In, was kept for today. Then the
 * thread gets an event line and Gremly's follow-up, worked out from data:
 * plan around what was kept, or add it to the plan already there. Closing
 * Sweep before deciding anything puts the offer's buttons back.
 */

import { useGremlyStore, isHabitLockedIn } from '../store/useGremlyStore';
import { selectSweepCandidatesUnified } from '../store/selectors';
import { getDateService } from '../date/DateService';
import type { BriefOfferMeta, OfferButton } from './types';
import { planLabel } from './offerFlow';

export interface SweepItemState {
  title: string;
  dueDay: string | null;
  lockedIn: boolean;
}

export interface SweepSnapshot {
  /** Sweep's candidates, by id */
  candidates: Map<string, SweepItemState>;
}

export interface PendingSweep {
  threadId: string;
  /** The offer Sweep first was tapped on, to put its buttons back */
  offerId: string | null;
  offer: BriefOfferMeta | null;
  before: SweepSnapshot;
}

let pending: PendingSweep | null = null;

function stateOf(id: string): SweepItemState | null {
  const s = useGremlyStore.getState();
  const t = s.todos.find((x) => x.id === id);
  if (t)
    return {
      title: t.name || t.title || 'Untitled',
      dueDay: t.due_day ?? null,
      lockedIn: !!t.commitment,
    };
  const h = s.habits.find((x) => x.id === id);
  if (h) return { title: h.name || 'Habit', dueDay: null, lockedIn: isHabitLockedIn(h) };
  const n = s.notes.find((x) => x.id === id);
  if (n) return { title: n.title || 'Note', dueDay: null, lockedIn: false };
  return null;
}

export function snapshotSweep(): SweepSnapshot {
  const s = useGremlyStore.getState();
  const candidates = new Map<string, SweepItemState>();
  for (const { candidate } of selectSweepCandidatesUnified(s as any)) {
    const st = stateOf(candidate.id);
    if (st) candidates.set(candidate.id, st);
  }
  return { candidates };
}

export function startBriefSweep(p: Omit<PendingSweep, 'before'>): void {
  pending = { ...p, before: snapshotSweep() };
}

/** The Sweep that was opened from the brief, if it has not been handed back yet. */
export function takeBriefSweep(): PendingSweep | null {
  const p = pending;
  pending = null;
  return p;
}

export interface SweepOutcome {
  swept: number;
  kept: { id: string; title: string }[];
  /** Nothing left waiting */
  allDone: boolean;
}

/**
 * What happened in Sweep: everything that left Sweep, or stayed with a new
 * date or a Lock In, was swept; what now carries today's date or is locked
 * in was kept for today.
 */
export function compareSweep(
  before: SweepSnapshot,
  after: SweepSnapshot,
  now: (id: string) => SweepItemState | null,
  today: string,
): SweepOutcome {
  let swept = 0;
  const kept: { id: string; title: string }[] = [];
  for (const [id, was] of before.candidates) {
    const is = now(id);
    const left = !after.candidates.has(id);
    const changed = !!is && (is.dueDay !== was.dueDay || is.lockedIn !== was.lockedIn);
    if (left || changed) swept++;
    const forToday =
      !!is && ((is.dueDay === today && was.dueDay !== today) || (is.lockedIn && !was.lockedIn));
    if (forToday) kept.push({ id, title: is!.title });
  }
  return { swept, kept, allDone: after.candidates.size === 0 };
}

export function readSweepOutcome(before: SweepSnapshot): SweepOutcome {
  return compareSweep(before, snapshotSweep(), stateOf, getDateService().today());
}

/** "Swept 7 things, 3 kept for today" */
export function sweepEventText(o: SweepOutcome): string {
  return `Swept ${o.swept} ${o.swept === 1 ? 'thing' : 'things'}${o.kept.length ? `, ${o.kept.length} kept for today` : ''}`;
}

function names(titles: string[]): string {
  // titles as the person typed them (changing case by rule gets names wrong)
  const t = titles;
  return t.length <= 1 ? t.join('') : `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`;
}

/** Gremly's follow-up after Sweep, and its buttons. */
export function sweepFollowUp(
  o: SweepOutcome,
  opts: { livePlan: boolean; planFrom: number | null },
): { text: string; buttons: OfferButton[] } {
  const lead = o.allDone ? 'Nice, all sorted.' : "Nice, that's a good dent in it.";
  const plan: OfferButton[] =
    opts.planFrom !== null
      ? [
          { id: 'plan', label: planLabel(opts.planFrom), action: 'plan', primary: true },
          { id: 'not_today', label: 'Not now', action: 'not_today' },
        ]
      : [];
  if (!o.kept.length) {
    if (opts.livePlan || !plan.length)
      return { text: `${lead} Nothing extra for today.`, buttons: [] };
    return {
      text: `${lead} Nothing extra for today. Want me to plan what's already due?`,
      buttons: plan,
    };
  }
  const them = o.kept.length === 1 ? 'it' : 'them';
  if (opts.livePlan) {
    return {
      text: `${lead} Want me to add ${names(o.kept.map((k) => k.title))} to the plan?`,
      buttons: [
        {
          id: 'add_kept',
          label: `Add ${them}`,
          action: 'add_kept',
          primary: true,
          value: JSON.stringify(o.kept.map((k) => k.id)),
        },
        { id: 'leave_plan', label: 'Leave the plan as it is', action: 'leave_plan' },
      ],
    };
  }
  if (!plan.length) {
    return {
      text: `${lead} You kept ${names(o.kept.map((k) => k.title))} for today.`,
      buttons: [],
    };
  }
  return {
    text: `${lead} You kept ${names(o.kept.map((k) => k.title))} for today. Want me to fit ${them} in with the rest?`,
    buttons: plan,
  };
}

export const SWEEP_COPY = {
  leavePlan: "Sure, leaving it as it is. They're on Today whenever you get to them.",
};
