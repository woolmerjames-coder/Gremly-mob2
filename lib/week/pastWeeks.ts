/**
 * Past weeks, for the weekly archive: the finished review of each week, read
 * when the archive opens and kept here so the list draws from one place, and
 * each week in short: its intention, what mattered most, and what was planned
 * against what got done.
 *
 * The plan is the one kept when the week's board was saved; how it went is
 * read from the items as they are now (lib/week/yourWeek.ts).
 */
import { create } from 'zustand';
import { useGremlyStore } from '../store/useGremlyStore';
import { getDoneWeekReviews } from '../repo/weekReviewRepo';
import type { WeekReviewRow } from '../repo/weekReviewRepo';
import type { YourWeek } from './yourWeek';

export type PastReview = Pick<WeekReviewRow, 'id' | 'week_start' | 'status' | 'answers'>;

interface PastWeeksState {
  /** Whose reviews these are: someone else signing in starts from nothing */
  owner: string | null;
  /** The finished reviews read so far, by the first day of their week */
  byWeek: Record<string, PastReview>;
  /** The last read failed: the archive shows its summaries without their reviews, and says so */
  failed: boolean;
  /** Read the finished reviews of the weeks that start from one day to another */
  load: (from: string, to: string) => Promise<void>;
}

export const usePastWeeks = create<PastWeeksState>((set, get) => ({
  owner: null,
  byWeek: {},
  failed: false,
  load: async (from, to) => {
    const userId = useGremlyStore.getState().userId;
    if (!userId) return;
    // what was read for someone else is dropped before anything of theirs is asked for
    if (get().owner !== userId) set({ owner: userId, byWeek: {}, failed: false });
    try {
      const rows = await getDoneWeekReviews(userId, from, to);
      // they signed out, or someone else in, while it was being read
      if (get().owner !== userId) return;
      set((s) => ({
        failed: false,
        byWeek: { ...s.byWeek, ...Object.fromEntries(rows.map((r) => [r.week_start, r])) },
      }));
    } catch (err) {
      console.warn("[Week] could not read the past weeks' reviews:", err);
      if (get().owner === userId) set({ failed: true });
    }
  },
}));

const NO_WEEKS: Record<string, PastReview> = {};

/** The reviews read for one person: none of anyone else's, whoever was signed in before. */
export function pastWeeksOf(
  s: Pick<PastWeeksState, 'owner' | 'byWeek'>,
  userId: string | null,
): Record<string, PastReview> {
  return userId && s.owner === userId ? s.byWeek : NO_WEEKS;
}

/** A week in short, for its row in the archive. */
export interface WeekInShort {
  intention: string | null;
  /** What mattered most, as they kept it: three at most */
  priorities: string[];
  /** How much was planned, and how much of it got done; null when no plan was kept */
  planned: number | null;
  done: number;
}

/**
 * A week they planned, in short. Null when the review kept nothing to show.
 * A todo counts once however many days of the plan it was on: one moved on,
 * when the week was planned again or changed by hand, is still one thing
 * planned. A habit counts once for each day it was planned on. Pure.
 */
export function weekInShort(week: YourWeek): WeekInShort | null {
  const withPlan = week.days.filter((d) => d.planned !== null);
  const todos = new Set<string>();
  const todosDone = new Set<string>();
  let sessions = 0;
  let sessionsDone = 0;
  for (const d of withPlan) {
    for (const t of d.todos) {
      if (!t.planned) continue;
      todos.add(t.id);
      if (t.state === 'done') todosDone.add(t.id);
    }
    for (const h of d.habits) {
      if (!h.planned) continue;
      sessions += 1;
      if (h.done) sessionsDone += 1;
    }
  }
  const planned = withPlan.length ? todos.size + sessions : null;
  const done = todosDone.size + sessionsDone;
  const priorities = week.priorities.slice(0, 3);
  if (!week.intention && !priorities.length && planned === null) return null;
  return { intention: week.intention, priorities, planned, done };
}

/** "Planned 14, done 11", or nothing when no plan was kept. */
export function plannedLine(w: WeekInShort): string | null {
  if (w.planned === null) return null;
  return `Planned ${w.planned}, done ${w.done}`;
}
