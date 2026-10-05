/**
 * The week's own changes, applied (the weekly review): a todo put off with
 * the day it comes back, the days a habit is planned on, the week's busy days
 * and free hours, its intention, a milestone's steps, and the weekly day.
 *
 * Each is one of WEEK_OPS (workers/shared/changes/fields.js), checked by
 * checkWeekChange before it reaches a card. Applying one is only ever the
 * person's tap, through applyChanges (lib/changes/apply.ts), and each hands
 * back its Undo, built from what was there at that moment.
 *
 * Where each is kept:
 * - later: on the todo (lib/changes/later.ts)
 * - habit_days: habit_plans rows, through the store's setHabitPlan and
 *   removeHabitPlan
 * - week_shape: the hours and busy days in the answers of the week's review
 * - intention: a journal note with journal_subtype intention, dated the first
 *   day of the week, which the brief already reads
 * - milestone: a todo for each step to do, marked with what it is a step
 *   towards, and the check ins on the week's review
 * - weekly_day: with the notification settings, where the summary reads it
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date/DateService';
import { generateDropId } from '../minddrop/ids';
import {
  changeWeekReview,
  saveWeeklyDay,
  type WeekCheckIn,
  type WeekReviewRow,
} from '../repo/weekReviewRepo';
import { useThisWeek, weekStartFor } from '../week/thisWeek';
import { addDays, type WeekHours } from '../week/model';
import type { Change, WeekCheckContext } from './model';
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

/** The days a habit is planned on, between two days. */
export function plannedDays(habitId: string, first: string, last: string): string[] {
  const plans: Item[] = store().habitPlans ?? [];
  return plans
    .filter((p) => p.habit_id === habitId && p.planned_date >= first && p.planned_date <= last)
    .map((p) => p.planned_date as string)
    .sort();
}

/**
 * The person's week as the week's changes are checked against it in the app
 * (checkWeekChange): from today to the end of the week they are in, with the
 * shape and the intention as they stand.
 */
export function weekCheckContext(): WeekCheckContext {
  const w = useThisWeek.getState();
  const today = getDateService().ritualDay();
  const weekStart = weekStartFor(w.weeklyDay);
  const review = w.review;
  const note = intentionNote(weekStart);
  return {
    first: today,
    last: addDays(weekStart, 6),
    hours: review?.answers.hours ?? null,
    busy_days: review?.answers.busy_days ?? [],
    has_review: !!review && (review.status === 'started' || review.status === 'done'),
    intention: note ? { id: note.id, text: String(note.body ?? note.title ?? '') } : null,
    weekly_day: w.weeklyDay,
  };
}

// ── Each change ─────────────────────────────────────────────────────────────

async function applyLater(change: Change): Promise<WeekOutcome> {
  const todo = (store().todos ?? []).find((t: Item) => t.id === change.id) as Item | undefined;
  if (!todo || todo.archived) {
    return { ok: false, reason: 'gone', message: 'That todo is no longer here.' };
  }
  // nothing they did since is overwritten: its day or its back day moved after the card was made
  const day = todo.due_day ? String(todo.due_day).slice(0, 10) : null;
  const back = todo.resurface_at ? String(todo.resurface_at).slice(0, 10) : null;
  if (change.before && (day !== change.before.day || back !== change.before.back_on)) {
    return {
      ok: false,
      reason: 'stale',
      message: `${change.title} changed since, so it was left as it is.`,
    };
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
  const planned = new Set(
    (store().habitPlans ?? [])
      .filter((p: Item) => p.habit_id === id)
      .map((p: Item) => p.planned_date),
  );
  // only what differs from now is written, so a day they changed by hand since is left alone
  const add = want.filter((d) => !planned.has(d));
  const remove = was.filter((d) => !want.includes(d) && planned.has(d));
  for (const d of remove) await store().removeHabitPlan(id, d);
  for (const d of add) await store().setHabitPlan(id, d);
  return {
    ok: true,
    revert: async () => {
      for (const d of add) await store().removeHabitPlan(id, d);
      for (const d of remove) await store().setHabitPlan(id, d);
    },
  };
}

/** Write to the week's review and keep the app's copy in step. */
async function writeReview(
  row: WeekReviewRow,
  change: Parameters<typeof changeWeekReview>[1],
): Promise<WeekReviewRow> {
  const saved = await changeWeekReview(row.id, change);
  if (!saved) throw new Error("This week's review is no longer there.");
  useThisWeek.getState().setReview(saved);
  return saved;
}

async function applyShape(change: Change): Promise<WeekOutcome> {
  const row = useThisWeek.getState().review;
  if (!row) return failed('Your week has no review to keep that on yet.');
  const shape = change.shape ?? {};
  const before = { hours: row.answers.hours, busy_days: row.answers.busy_days };
  await writeReview(row, (now) => ({
    answers: {
      ...now.answers,
      ...(shape.busy_days ? { busy_days: shape.busy_days } : {}),
      ...(shape.hours ? { hours: { ...(now.answers.hours ?? {}), ...shape.hours } } : {}),
    },
  }));
  return {
    ok: true,
    revert: async () => {
      // only what this change set goes back; anything else answered since stays
      await writeReview(row, (now) => {
        const answers = { ...now.answers };
        if (shape.busy_days) answers.busy_days = before.busy_days ?? [];
        if (shape.hours) {
          const hours: WeekHours = { ...(now.answers.hours ?? {}) };
          for (const kind of Object.keys(shape.hours) as (keyof WeekHours)[]) {
            const was = before.hours?.[kind];
            if (was === undefined) delete hours[kind];
            else hours[kind] = was;
          }
          answers.hours = hours;
        }
        return { answers };
      });
    },
  };
}

async function applyIntention(change: Change): Promise<WeekOutcome> {
  const text = String(change.fields?.text ?? '').trim();
  if (!text) return failed('There is no intention to save.');
  const weekStart = weekStartFor(useThisWeek.getState().weeklyDay);
  const title = text.slice(0, 80);
  // the week's intention when it has one: that note is rewritten, never a second one made
  const note = intentionNote(weekStart);
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
  const row = useThisWeek.getState().review;
  // check ins are kept on the week's review
  if (asks.length && !row) return failed('Your week has no review to keep the check ins on yet.');
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
    // a milestone is set up whole or not at all
    await undoTodos().catch(() => undefined);
    throw err;
  }
}

async function applyWeeklyDay(change: Change): Promise<WeekOutcome> {
  const userId = store().userId as string | null;
  if (!userId) return failed('You are not signed in.');
  const to = change.fields?.weekday as number;
  const was = useThisWeek.getState().weeklyDay;
  await saveWeeklyDay(userId, to);
  useThisWeek.getState().setWeeklyDay(to);
  return {
    ok: true,
    revert: async () => {
      await saveWeeklyDay(userId, was);
      useThisWeek.getState().setWeeklyDay(was);
    },
  };
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
