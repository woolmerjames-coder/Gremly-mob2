/**
 * The week's own changes, applied (the weekly review): a todo put off with
 * the day it comes back, the days a habit is planned on, the week's busy days
 * and free hours, its intention, a milestone's steps, and the weekly day.
 *
 * Each is one of WEEK_OPS (workers/shared/changes/fields.js), checked by
 * checkWeekChange before it reaches a card. Applying one is only ever the
 * person's tap, through applyChanges (lib/changes/apply.ts), and each hands
 * back its Undo, built from what was there at that moment. Nothing they did
 * since the card was made is overwritten: a change whose "before" no longer
 * holds is left unapplied and says so.
 *
 * Where each is kept:
 * - later: on the todo (lib/changes/later.ts)
 * - habit_days: habit_plans rows, through the store's setHabitPlan and
 *   removeHabitPlan
 * - week_shape: the hours and busy days in the answers of the week's review
 * - priority: one more thing among what matters most, in the same answers
 * - intention: a journal note with journal_subtype intention, dated the first
 *   day of the week, which the brief already reads
 * - milestone: a todo for each step to do, marked with what it is a step
 *   towards, and the check ins on the week's review
 * - weekly_day: with the notification settings, where the summary reads it
 *
 * The shape, a priority, the intention and a milestone say which week they
 * are for (week_start on the change), so one made in a review of next week is
 * kept for next week, whatever week today is in.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date/DateService';
import { generateDropId } from '../minddrop/ids';
import {
  changeWeekReview,
  getWeekReview,
  saveWeeklyDay,
  type WeekAnswers,
  type WeekCheckIn,
  type WeekReviewRow,
} from '../repo/weekReviewRepo';
import { useThisWeek, weekStartFor } from '../week/thisWeek';
import { rowSaved, useWeekSession } from '../week/review/session';
import { addDays, type WeekHours } from '../week/model';
import { intentionText } from '../week/intention';
import { WEEK_LIMITS, type Change, type WeekCheckContext } from './model';
import { putOffTodo } from './later';

type Item = Record<string, any>;

/** What applying one of the week's changes came to. */
export type WeekOutcome =
  | { ok: true; revert: () => Promise<void>; createdId?: string }
  | { ok: false; reason: 'stale' | 'gone' | 'failed'; message: string };

function store(): any {
  return useGremlyStore.getState();
}

const failed = (message: string): WeekOutcome => ({ ok: false, reason: 'failed', message });
const stale = (what: string): WeekOutcome => ({
  ok: false,
  reason: 'stale',
  message: `${what} changed since, so it was left as it is.`,
});

/** Thrown from inside a write to the week's review when what the card showed no longer holds. */
class ChangedSince extends Error {}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The note that holds the intention of the week that starts on a day, when there is one. */
export function intentionNote(weekStart: string): Item | null {
  const weekEnd = addDays(weekStart, 6);
  const notes: Item[] = store().notes ?? [];
  return (
    notes.find(
      (n) =>
        n.journal_subtype === 'intention' &&
        !n.archived &&
        n.target_date != null &&
        String(n.target_date).slice(0, 10) >= weekStart &&
        String(n.target_date).slice(0, 10) <= weekEnd,
    ) ?? null
  );
}

/**
 * An intention's words as a card's "before" states them: Gremly is sent them
 * on one line and cut to the length an intention has, so the note's own words
 * are read the same way before the two are compared.
 */
function asStated(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  return text.replace(/\s+/g, ' ').trim().slice(0, 200) || null;
}

/** The days a habit is planned on, between two days. */
export function plannedDays(habitId: string, first: string, last: string): string[] {
  const plans: Item[] = store().habitPlans ?? [];
  return plans
    .filter((p) => p.habit_id === habitId && p.planned_date >= first && p.planned_date <= last)
    .map((p) => p.planned_date as string)
    .sort();
}

/**
 * What matters most in the week that starts on a day, as its review has it:
 * the review under way in today's thread when it is that week's (next week,
 * brought forward, is not the week they are in), otherwise this week's.
 */
function prioritiesIn(weekStart: string): string[] {
  const underWay = useWeekSession.getState().row;
  const mine = useThisWeek.getState().review;
  const row =
    underWay && underWay.week_start === weekStart
      ? underWay
      : mine && mine.week_start === weekStart
        ? mine
        : null;
  return (row?.answers.priorities ?? []).map((p) => p.text);
}

/**
 * The person's week as the week's changes are checked against it in the app
 * (checkWeekChange): from today to the end of the week they are in, with the
 * shape, the intention and what matters most as they stand.
 * @param forWeek the week a change says it is for, when it says: what matters
 *   most is read from that week's review
 */
export function weekCheckContext(forWeek?: string | null): WeekCheckContext {
  const w = useThisWeek.getState();
  const today = getDateService().ritualDay();
  const weekStart = weekStartFor(w.weeklyDay);
  const review = w.review;
  const note = intentionNote(weekStart);
  return {
    first: today,
    last: addDays(weekStart, 6),
    week_start: weekStart,
    hours: review?.answers.hours ?? null,
    busy_days: review?.answers.busy_days ?? [],
    has_review: !!review && (review.status === 'started' || review.status === 'done'),
    intention: note ? { id: note.id, text: intentionText(note) ?? '' } : null,
    priorities: prioritiesIn(forWeek ?? weekStart),
    weekly_day: w.weeklyDay,
  };
}

/** The week a change is for: the one it names, or the week they are in. */
function weekOf(change: Change): string {
  return change.week_start ?? weekStartFor(useThisWeek.getState().weeklyDay);
}

/**
 * The review of the week that starts on a day: the app's copy when it is this
 * week's, otherwise read from the account (a review of next week, brought
 * forward, is not the week they are in).
 */
async function reviewFor(weekStart: string): Promise<WeekReviewRow | null> {
  const mine = useThisWeek.getState().review;
  if (mine && mine.week_start === weekStart) return mine;
  // the review under way in today's thread, when it is of another week (next week, brought forward)
  const underWay = useWeekSession.getState().row;
  if (underWay && underWay.week_start === weekStart) return underWay;
  const userId = store().userId as string | null;
  return userId ? getWeekReview(userId, weekStart) : null;
}

/** Write to a week's review and keep the app's copy in step (it keeps only this week's). */
async function writeReview(
  row: WeekReviewRow,
  change: Parameters<typeof changeWeekReview>[1],
): Promise<WeekReviewRow> {
  const saved = await changeWeekReview(row.id, change);
  if (!saved) throw new Error("This week's review is no longer there.");
  useThisWeek.getState().setReview(saved);
  // the review under way holds its own copy of the row: it follows too
  rowSaved(saved);
  return saved;
}

// ── Each change ─────────────────────────────────────────────────────────────

async function applyLater(change: Change): Promise<WeekOutcome> {
  const todo = (store().todos ?? []).find((t: Item) => t.id === change.id) as Item | undefined;
  if (!todo || todo.archived) {
    return { ok: false, reason: 'gone', message: 'That todo is no longer here.' };
  }
  // nothing they did since is overwritten: done, or its day or back day moved, after the card was made
  const day = todo.due_day ? String(todo.due_day).slice(0, 10) : null;
  const back = todo.resurface_at ? String(todo.resurface_at).slice(0, 10) : null;
  if (
    todo.completed_at ||
    (change.before && (day !== change.before.day || back !== change.before.back_on))
  ) {
    return stale(change.title);
  }
  const revert = await putOffTodo(todo, change.fields?.back_on as string);
  return { ok: true, revert };
}

async function applyHabitDays(change: Change): Promise<WeekOutcome> {
  const id = change.id as string;
  if (!(store().habits ?? []).some((h: Item) => h.id === id && !h.archived)) {
    return { ok: false, reason: 'gone', message: 'That habit is no longer here.' };
  }
  const want = change.days ?? [];
  const was = (change.before?.days as string[] | undefined) ?? [];
  const planned = (): Set<string> =>
    new Set(
      (store().habitPlans ?? [])
        .filter((p: Item) => p.habit_id === id)
        .map((p: Item) => p.planned_date as string),
    );
  // only what differs from now is written, so a day they changed by hand since is left alone
  const before = planned();
  const add = want.filter((d) => !before.has(d));
  const remove = was.filter((d) => !want.includes(d) && before.has(d));
  for (const d of remove) await store().removeHabitPlan(id, d);
  for (const d of add) await store().setHabitPlan(id, d);
  // the store's writers put their own change back when the save fails and do
  // not throw, so what was saved is read back rather than assumed
  const after = planned();
  const added = add.filter((d) => after.has(d));
  const removed = remove.filter((d) => !after.has(d));
  const undo = async () => {
    for (const d of added) await store().removeHabitPlan(id, d);
    for (const d of removed) await store().setHabitPlan(id, d);
  };
  if (added.length !== add.length || removed.length !== remove.length) {
    // a habit's days are changed whole or not at all
    await undo();
    return failed(`${change.title}'s days could not be saved.`);
  }
  return { ok: true, revert: undo };
}

async function applyShape(change: Change): Promise<WeekOutcome> {
  const row = await reviewFor(weekOf(change));
  if (!row) return failed('That week has no review to keep that on yet.');
  const shape = change.shape ?? {};
  const kinds = Object.keys(shape.hours ?? {}) as (keyof WeekHours)[];
  // the busy days stated are the ones from here on; days already gone stay as they are
  const from = change.from ?? '';
  const stated = (list: string[] | undefined) => (list ?? []).filter((d) => d >= from);
  // what was there when the write was made, for Undo
  let was: Pick<WeekAnswers, 'hours' | 'busy_days'> = {};
  try {
    await writeReview(row, (now) => {
      // nothing they answered since is overwritten
      if (shape.busy_days && !same(stated(now.answers.busy_days), change.before?.busy_days)) {
        throw new ChangedSince();
      }
      for (const kind of kinds) {
        if (!same(now.answers.hours?.[kind], change.before?.hours?.[kind]))
          throw new ChangedSince();
      }
      was = { hours: now.answers.hours, busy_days: now.answers.busy_days };
      const gone = (now.answers.busy_days ?? []).filter((d) => d < from);
      return {
        answers: {
          ...now.answers,
          ...(shape.busy_days ? { busy_days: [...gone, ...shape.busy_days] } : {}),
          ...(shape.hours ? { hours: { ...(now.answers.hours ?? {}), ...shape.hours } } : {}),
        },
      };
    });
  } catch (err) {
    if (err instanceof ChangedSince) return stale('Your week');
    throw err;
  }
  return {
    ok: true,
    revert: async () => {
      // only what this change set goes back; anything else answered since stays
      await writeReview(row, (now) => {
        const answers = { ...now.answers };
        if (shape.busy_days) answers.busy_days = was.busy_days ?? [];
        if (kinds.length) {
          const hours: WeekHours = { ...(now.answers.hours ?? {}) };
          for (const kind of kinds) {
            const before = was.hours?.[kind];
            if (before === undefined) delete hours[kind];
            else hours[kind] = before;
          }
          answers.hours = hours;
        }
        return { answers };
      });
    },
  };
}

/**
 * One more thing among what matters most this week, in their own words. It is
 * kept with the priorities they picked on the review's card, and that card
 * shows it from then on. One that is already there is as they wanted, so
 * nothing is written twice; a week that has filled up since the card was made
 * is left as it is.
 */
async function applyPriority(change: Change): Promise<WeekOutcome> {
  const text = String(change.fields?.text ?? '').trim();
  if (!text) return failed('There is nothing to add.');
  const row = await reviewFor(weekOf(change));
  if (!row) return failed('That week has no review to keep that on yet.');
  const isIt = (p: { text: string }) => p.text.trim().toLowerCase() === text.toLowerCase();
  let added = false;
  try {
    await writeReview(row, (now) => {
      const list = now.answers.priorities ?? [];
      if (list.some(isIt)) return {};
      // nothing they chose since is pushed out to make room
      if (list.length >= WEEK_LIMITS.priorities) throw new ChangedSince();
      added = true;
      return { answers: { ...now.answers, priorities: [...list, { text, item_ids: [] }] } };
    });
  } catch (err) {
    if (err instanceof ChangedSince) return stale('What matters most this week');
    throw err;
  }
  return {
    ok: true,
    revert: async () => {
      // only what this change added comes out; anything else chosen since stays
      if (!added) return;
      await writeReview(row, (now) => ({
        answers: {
          ...now.answers,
          priorities: (now.answers.priorities ?? []).filter((p) => !isIt(p)),
        },
      }));
    },
  };
}

async function applyIntention(change: Change): Promise<WeekOutcome> {
  const text = String(change.fields?.text ?? '').trim();
  if (!text) return failed('There is no intention to save.');
  const weekStart = weekOf(change);
  const title = text.slice(0, 80);
  // the week's intention when it has one: that note is rewritten, never a second one made
  const note = intentionNote(weekStart);
  // nothing they wrote since is overwritten
  if (change.before && asStated(intentionText(note)) !== asStated(change.before.text)) {
    return stale('Your intention');
  }
  if (note) {
    const was = { title: note.title ?? null, body: note.body ?? null };
    await store().updateNote(note.id, { title, body: text });
    return { ok: true, revert: () => store().updateNote(note.id, was) };
  }
  const created = await store().createNote({
    subtype: 'journal',
    title,
    body: text,
    origin: 'manual',
    canonicalType: 'log',
    journal_subtype: 'intention',
    target_date: weekStart,
    tags: ['intention'],
    views: { week_review: true, week_start: weekStart },
  });
  const id = created?.id as string | undefined;
  if (!id) throw new Error('It was not saved.');
  return { ok: true, createdId: id, revert: () => store().deleteNote(id) };
}

async function applyMilestone(change: Change): Promise<WeekOutcome> {
  const m = change.milestone;
  if (!m) return failed('There is nothing to set up.');
  const asks = m.steps.filter((s) => s.kind === 'check_in');
  // check ins are kept on the week's review
  const row = asks.length ? await reviewFor(weekOf(change)) : null;
  if (asks.length && !row) return failed('That week has no review to keep the check ins on yet.');
  const todoIds: string[] = [];
  const undoTodos = async () => {
    for (const id of todoIds) await store().deleteTodo(id);
  };
  try {
    for (const s of m.steps.filter((x) => x.kind === 'todo')) {
      const created = await store().createTodo({
        name: s.title,
        due_day: s.by,
        ...(s.minutes ? { time_estimate_minutes: s.minutes } : {}),
        // what the step is a step towards, so the brief can say so on its day
        views: { milestone: { goal: m.goal, date: m.date } },
      });
      if (!created?.id) throw new Error('A step was not saved.');
      todoIds.push(created.id as string);
    }
    const added: WeekCheckIn[] = asks.map((s) => ({
      id: generateDropId(),
      goal: m.goal,
      goal_date: m.date,
      date: s.by,
      title: s.title,
      status: 'open',
    }));
    if (row && added.length) {
      await writeReview(row, (now) => ({ checkins: [...now.checkins, ...added] }));
    }
    const ids = new Set(added.map((c) => c.id));
    return {
      ok: true,
      revert: async () => {
        if (row && added.length) {
          await writeReview(row, (now) => ({
            checkins: now.checkins.filter((c) => !ids.has(c.id)),
          }));
        }
        await undoTodos();
      },
    };
  } catch (err) {
    // a milestone is set up whole or not at all: the steps already added come
    // out again, and if that fails too it is said, since they are still there
    await undoTodos().catch((undoErr) =>
      console.warn(
        '[Week] a milestone failed part way and its steps could not be taken back:',
        undoErr,
      ),
    );
    throw err;
  }
}

async function applyWeeklyDay(change: Change): Promise<WeekOutcome> {
  const userId = store().userId as string | null;
  if (!userId) return failed('You are not signed in.');
  const to = change.fields?.weekday as number;
  const was = useThisWeek.getState().weeklyDay;
  // nothing they chose since is overwritten
  if (change.before && change.before.weekday != null && change.before.weekday !== was) {
    return stale('Your weekly day');
  }
  const move = async (weekday: number) => {
    await saveWeeklyDay(userId, weekday);
    // the week they are in follows the weekly day, so its review is read again
    useThisWeek.getState().setWeeklyDay(weekday);
    await useThisWeek.getState().refresh();
  };
  await move(to);
  return { ok: true, revert: () => move(was) };
}

/** Apply one of the week's own changes. Throws when a write fails; applyChanges reports it. */
export async function applyWeekChange(change: Change): Promise<WeekOutcome> {
  switch (change.op) {
    case 'later':
      return applyLater(change);
    case 'habit_days':
      return applyHabitDays(change);
    case 'week_shape':
      return applyShape(change);
    case 'priority':
      return applyPriority(change);
    case 'intention':
      return applyIntention(change);
    case 'milestone':
      return applyMilestone(change);
    case 'weekly_day':
      return applyWeeklyDay(change);
    default:
      throw new Error(`No way to apply ${change.op}`);
  }
}
