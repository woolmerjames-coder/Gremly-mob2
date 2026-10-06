/**
 * The week's board as it stands now: the model (./model.ts) fed from the
 * store, the review in hand (lib/week/review/session) and their week
 * (lib/week/thisWeek). useBoard is for what draws it, and redraws when any of
 * those change; currentBoard is for the review's own work, at the moment it
 * needs the board (saving it, telling Gremly about it).
 */
import { useMemo } from 'react';
import { getDateService } from '../../date/DateService';
import { useGremlyStore } from '../../store/useGremlyStore';
import { useWeekSession, type WeekSession } from '../review/session';
import { useThisWeek } from '../thisWeek';
import type { WeekRelief } from '../../repo/weekReviewRepo';
import { reliefBasis, spanDays, spreadBasis } from '../model';
import { boardOf, groupsOf, type Board } from './model';

type Item = Record<string, any>;

function build(
  s: Pick<WeekSession, 'row' | 'on' | 'moves'>,
  data: { todos: Item[]; habits: Item[]; habitPlans: Item[]; worlds: Item[]; links: Item[] },
  daysOff: number[],
  today: string,
): Board | null {
  if (!s.row || !s.on) return null;
  return boardOf({
    today,
    span: s.on,
    daysOff,
    row: { read: s.row.read, spread: s.row.spread, answers: { ...s.row.answers, board: s.moves } },
    todos: data.todos ?? [],
    habits: data.habits ?? [],
    habitPlans: data.habitPlans ?? [],
    groups: groupsOf(data.worlds, data.links),
  });
}

/** The board of the review in hand, at this moment; null when there is none. */
export function currentBoard(): Board | null {
  const st = useGremlyStore.getState() as any;
  return build(
    useWeekSession.getState(),
    {
      todos: st.todos,
      habits: st.habits,
      habitPlans: st.habitPlans,
      worlds: st.worlds,
      links: st.dropWorldLinks,
    },
    useThisWeek.getState().daysOff,
    getDateService().ritualDay(),
  );
}

/** The board of the review in hand, redrawn as their items, their moves or Gremly's spread change. */
export function useBoard(): Board | null {
  const todos = useGremlyStore((st: any) => st.todos) as Item[];
  const habits = useGremlyStore((st: any) => st.habits) as Item[];
  const habitPlans = useGremlyStore((st: any) => st.habitPlans) as Item[];
  const worlds = useGremlyStore((st: any) => st.worlds) as Item[];
  const links = useGremlyStore((st: any) => st.dropWorldLinks) as Item[];
  const row = useWeekSession((s) => s.row);
  const on = useWeekSession((s) => s.on);
  const moves = useWeekSession((s) => s.moves);
  const daysOff = useThisWeek((w) => w.daysOff);
  const today = getDateService().ritualDay();
  return useMemo(
    () => build({ row, on, moves }, { todos, habits, habitPlans, worlds, links }, daysOff, today),
    [row, on, moves, todos, habits, habitPlans, worlds, links, daysOff, today],
  );
}

/**
 * What the spread in hand was made for, against the answers as they stand:
 * the line the answers come to now (want), the line the spread was made for
 * (have), and whether they differ (stale: a new one is on its way, or about
 * to be asked for).
 *
 * What the spread was made for is what this app asked for when it asked in
 * this sitting (the session's spreadFor); for a spread read with its row it
 * is what the spread says of itself. So an app and a worker that word the
 * line differently never leave a spread looking out of date for good.
 */
export function spreadState(
  s: Pick<WeekSession, 'row' | 'on' | 'spreadFor'>,
  today: string,
): { want: string | null; have: string | null; stale: boolean } {
  if (!s.row || !s.on) return { want: null, have: null, stale: false };
  const days = spanDays(s.on.span_start, s.on.span_end).filter((d) => d >= today);
  const want = spreadBasis(s.row.answers, s.row.read, days, today);
  const have = s.row.spread ? (s.spreadFor ?? s.row.spread.basis ?? null) : null;
  return { want, have, stale: !!s.row.spread && want !== have };
}

/**
 * Whether the board can be finished: Gremly's spread for these answers is on
 * it. One that failed leaves the board theirs to finish by hand.
 */
export function boardReady(): boolean {
  const s = useWeekSession.getState();
  if (s.spreadFailed) return true;
  if (s.fitting || !s.row?.spread) return false;
  return !spreadState(s, getDateService().ritualDay()).stale;
}

/**
 * Gremly's suggestions for their over-full days, when they were made for the
 * answers as they stand now (reliefBasis): an answer to one of their cards
 * does not change that, a change to the hours or to what is kept does.
 */
export function reliefOf(
  s: Pick<WeekSession, 'row' | 'on' | 'reliefFor'>,
  today: string,
): WeekRelief | null {
  const relief = s.row?.spread?.relief ?? null;
  if (!s.row || !s.on || !relief) return null;
  const days = spanDays(s.on.span_start, s.on.span_end).filter((d) => d >= today);
  const madeFor = s.reliefFor ?? relief.basis;
  return madeFor === reliefBasis(s.row.answers, s.row.read, days, today) ? relief : null;
}

export function currentRelief(): WeekRelief | null {
  return reliefOf(useWeekSession.getState(), getDateService().ritualDay());
}

export function useRelief(): WeekRelief | null {
  const row = useWeekSession((s) => s.row);
  const on = useWeekSession((s) => s.on);
  const reliefFor = useWeekSession((s) => s.reliefFor);
  const today = getDateService().ritualDay();
  return useMemo(() => reliefOf({ row, on, reliefFor }, today), [row, on, reliefFor, today]);
}

/**
 * Whether the spread in hand was made for other answers than the review's
 * are now: a new one is on its way, or about to be asked for.
 */
export function useSpreadStale(): boolean {
  const row = useWeekSession((s) => s.row);
  const on = useWeekSession((s) => s.on);
  const spreadFor = useWeekSession((s) => s.spreadFor);
  const today = getDateService().ritualDay();
  return useMemo(
    () => spreadState({ row, on, spreadFor }, today).stale,
    [row, on, spreadFor, today],
  );
}
