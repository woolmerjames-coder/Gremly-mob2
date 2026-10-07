/**
 * The week's review (the weekly review): one weekly_reviews row per person per
 * week, and the two settings the week runs on, their weekly day and days off,
 * which live with the notification settings
 * (supabase/migrations/20261005210000_weekly_reviews.sql).
 *
 * The row keeps the read Gremly made, what the person answered, the latest
 * spread and the milestone check ins. answers and checkins are each one JSON
 * value, changed by reading, merging and writing back, so each change to a row
 * waits for the one before it, as the daily thread's metadata does.
 */
import { supabase } from '../supabase/client';
import { nowTimestamp } from '../date/DateService';
import { addDays } from '../week/model';
import type { ReviewKind, ReviewState, WeekHours, WeekStep } from '../week/model';
import type { Milestone } from '../changes/model';

/**
 * The weekly read: what Gremly prepared for the review's opening
 * (workers/inngest-jobs/week/read.js). Every id is a real one and every date a
 * real day, checked there. busy_days and each habit's days are among the days
 * first to last; the review that opens on a later day leaves out those gone.
 */
export interface WeekRead {
  /** The prompt version it was made with, when, on which of their days, and by which model */
  version: string;
  made_at: string;
  made_on: string;
  model: string;
  /** How hard the model was asked to think: low for the midweek extra, medium otherwise (reads made before 6 Oct have none) */
  effort?: 'low' | 'medium';
  /** The days it plans, first and last */
  first: string;
  last: string;
  /**
   * Worked out in code over every open todo: how many, their hours, how many
   * were added over three months ago, how many have moved ten times or more,
   * how many have a day or date gone by, how many fall on the days planned,
   * and how many the read was shown
   */
  figures: {
    open: number;
    hours: number;
    old: number;
    moved: number;
    gone: number;
    dated: number;
    listed: number;
  };
  /** The one thing most likely to make the week go wrong */
  challenge: { headline: string; why: string };
  evidence: { figure: string; label: string }[];
  coming_off: string;
  /** item is the dated thing the moment is, when it is one of theirs */
  coming_up: { when: string; what: string; item: { type: string; id: string } | null }[];
  /** Up to five, at most three of them Gremly's picks; item_ids are todos */
  priority_options: { text: string; why: string; gremly_pick: boolean; item_ids: string[] }[];
  intention_drafts: string[];
  /** Hours for their own things on each kind of day, in half hours; null when none could be used */
  free_hours_guess: (WeekHours & { reason: string }) | null;
  busy_days: string[];
  /** Each ready to go on a card as a milestone change; about is the dated thing it leads up to */
  milestones: (Milestone & { about: { type: string; id: string; title: string } })[];
  /** answers are the ones to tap under the question, its own; a read made before 9 October 2026 has none */
  needs_you: {
    item_ids: string[];
    title: string;
    stuck_because: string;
    question: string;
    answers?: string[];
  }[];
  habit_days: { habit_id: string; days: string[]; reason: string }[];
  /** How many times the check had to drop or put right something the model returned */
  dropped: number;
}

/**
 * What the person settled in the review, and where the review has got to, so
 * one left part way is picked up where it was. Next week starts from the hours
 * and busy days.
 */
export interface WeekAnswers {
  /** The step the review is on (lib/week/review); done once it is finished */
  step?: WeekStep;
  /** What they said to Gremly's read of the week: about right, or what he had wrong */
  challenge?: { agreed: boolean; note?: string };
  priorities?: { text: string; item_ids: string[] }[];
  /** Hours free for their own things on each kind of day */
  hours?: WeekHours;
  /** The busy days of the week, YYYY-MM-DD */
  busy_days?: string[];
  /** Deadlines and big moments they took off the week's list, by key (lib/week/review dateKey) */
  dates_out?: string[];
  /** The week's intention as they kept it, and the note that holds it */
  intention?: string | null;
  intention_id?: string | null;
  /** The milestones set up: the dated thing each leads up to, its goal and how many steps */
  milestones?: { about: string; goal: string; steps: number }[];
  /** What they decided on each thing that needed them */
  needs_you?: { title: string; item_ids: string[]; decision: string }[];
  /** What they typed to Gremly during the review, for the week's spread to weigh */
  said?: { step: WeekStep; text: string }[];
  /** Gremly's picks and guesses were taken for the steps they did not do (Just plan it) */
  guessed?: boolean;
  /**
   * How many times a change to their items was saved during the review (a
   * card of Gremly's applied or taken back, the steps towards something set
   * up or undone). The spread is made from their items, so it is part of
   * what a spread was made for (workers/shared/weekBoard.js spreadBasis).
   */
  touched?: number;
  /** The Done step has asked whether to move their weekly day to the day of this review */
  day_asked?: boolean;
  /**
   * Their own moves on the week's board, which stand over Gremly's spread.
   * Nothing on the board is saved until they finish, so this is where a board
   * left part way is kept.
   */
  board?: WeekBoardMoves;
  /**
   * What they said of the days they gave their todos themselves: keep them
   * (which is also what happens when they are never asked), keep some, or
   * hand them all to Gremly to rearrange (workers/shared/weekBoard.js released)
   */
  keep?: 'all' | 'some' | 'none';
  /** With keep 'some': the todos they freed for Gremly to place again */
  freed?: string[];
  /**
   * Their over-full days that have been dealt with, and how: a suggestion of
   * Gremly's taken (moved), changed by hand on the board, or left as it is
   */
  relieved?: Record<string, 'moved' | 'changed' | 'left'>;
  /**
   * What saving the board came to, for the week in short, and the plan itself
   * (days): the todos and the habits on each day, by id, so the week can be
   * read back as what was planned against what got done (lib/week/yourWeek.ts)
   */
  planned?: WeekPlanned;
}

export interface WeekPlanned {
  /** Todos on a day, todos put off, and habit sessions with a day */
  todos: number;
  later: number;
  habit_days: number;
  days?: Record<string, { todos: string[]; habits: string[] }>;
  /**
   * Where Gremly's spread put each todo it placed, todo id to day. A todo
   * still on that day when this week is planned again is Gremly's to place
   * again; any other day a todo is on is theirs.
   */
  gremly?: Record<string, string>;
}

/**
 * Gremly's suggestions for their over-full days (workers/inngest-jobs/week/
 * relief.js storedRelief): for each day that holds more of their own todos
 * than it has room for, which could leave it and where to. Nothing moves
 * unless they take a suggestion. Made beside the spread and kept inside it.
 */
export interface WeekRelief {
  version: string;
  /** The answers it was made for (workers/shared/weekBoard.js reliefBasis) */
  basis: string;
  /** The call failed: the days are named, with no moves */
  failed?: boolean;
  model?: string | null;
  days: {
    day: string;
    /** How far over its room the day is, in minutes */
    over: number;
    /** How many moves Gremly offered for it, before the checks: none means he would leave it */
    asked?: number;
    /** to: the day it could move to; null when it goes to Later, back on back_on */
    moves: { id: string; to: string | null; back_on: string | null }[];
    /** How far over it would still be with every move taken */
    still: number;
    note: string;
  }[];
  counts?: Record<string, number>;
}

/**
 * Their own moves on the board: a todo on a day, a todo put off, a habit's
 * days, and a habit paused, given a lighter version or set back to usual for
 * the days being planned.
 */
export interface WeekBoardMoves {
  placed?: Record<string, string>;
  later?: Record<string, string>;
  habit_days?: Record<string, string[]>;
  /** note: what the lighter version is, in their words */
  habit_ease?: Record<string, { mode: 'pause' | 'lighter' | 'usual'; note?: string }>;
  /** They have opened the board at least once */
  opened?: boolean;
}

/**
 * Gremly's spread of a week (workers/inngest-jobs/week/spread.js storedSpread):
 * the todos it placed on days and the ones it put off, each with the day it
 * comes back, the days each habit is on, and a short note for a day. Checked
 * by code before it is kept: every id is theirs, no day is over its room.
 */
export interface WeekSpread {
  version: string;
  made_at: string;
  made_on: string;
  model: string | null;
  effort?: string;
  /** The days it planned */
  first: string;
  last: string;
  /** The answers it was made for (workers/shared/weekBoard.js spreadBasis) */
  basis: string;
  place: { id: string; day: string }[];
  later: { id: string; back_on: string }[];
  habit_days: { id: string; days: string[] }[];
  notes: { day: string; note: string }[];
  counts?: Record<string, number>;
  relief?: WeekRelief | null;
}

/** A moment Gremly asks how a milestone is going, in that evening's wrap up. */
export interface WeekCheckIn {
  id: string;
  /** What the milestone is for, and the date it is for */
  goal: string;
  goal_date: string;
  /** The day Gremly asks */
  date: string;
  /** What to ask about */
  title: string;
  status: 'open' | 'done' | 'skipped';
}

export interface WeekReviewRow {
  id: string;
  owner_id: string;
  /** The first day of the week it is for, and the first day it plans */
  week_start: string;
  span_start: string;
  status: ReviewState;
  kind: ReviewKind;
  read: WeekRead | null;
  answers: WeekAnswers;
  spread: WeekSpread | null;
  checkins: WeekCheckIn[];
  prompt_versions: Record<string, string>;
  created_at: string;
  completed_at: string | null;
}

const TABLE = 'weekly_reviews';
const SETTINGS = 'notification_preferences';

function asRow(data: unknown): WeekReviewRow | null {
  const r = data as Partial<WeekReviewRow> | null;
  if (!r || typeof r.id !== 'string' || typeof r.week_start !== 'string') return null;
  return {
    ...(r as WeekReviewRow),
    answers: (r.answers ?? {}) as WeekAnswers,
    checkins: Array.isArray(r.checkins) ? r.checkins : [],
  };
}

/** The review for the week that starts on a day, or null when there is none. */
export async function getWeekReview(
  userId: string,
  weekStart: string,
): Promise<WeekReviewRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('owner_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the week's review: ${error.message}`);
  return asRow(data);
}

/**
 * The finished reviews of the weeks that start from one day to another, for
 * the weekly archive: each with its answers, which hold the intention, what
 * mattered most and the plan the week was saved with.
 */
export async function getDoneWeekReviews(
  userId: string,
  from: string,
  to: string,
): Promise<Pick<WeekReviewRow, 'id' | 'week_start' | 'status' | 'answers'>[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id,week_start,status,answers')
    .eq('owner_id', userId)
    .eq('status', 'done')
    .gte('week_start', from)
    .lte('week_start', to)
    .limit(120);
  if (error) throw new Error(`Failed to read the weeks' reviews: ${error.message}`);
  return ((data ?? []) as Partial<WeekReviewRow>[])
    .filter((r) => typeof r.id === 'string' && typeof r.week_start === 'string')
    .map((r) => ({
      id: r.id as string,
      week_start: r.week_start as string,
      status: 'done' as const,
      answers: (r.answers ?? {}) as WeekAnswers,
    }));
}

/** Their weekly day and days off, as weekdays (0 Sunday to 6 Saturday), or null when not set. */
export async function getWeekSettings(
  userId: string,
): Promise<{ weekly_day: number | null; days_off: number[] | null }> {
  const { data, error } = await supabase
    .from(SETTINGS)
    .select('weekly_day,days_off')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the week's settings: ${error.message}`);
  const row = data as { weekly_day?: number | null; days_off?: number[] | null } | null;
  return { weekly_day: row?.weekly_day ?? null, days_off: row?.days_off ?? null };
}

/** Move the day of the week their weekly review happens on. */
export async function saveWeeklyDay(userId: string, weekday: number): Promise<void> {
  const { data, error } = await supabase
    .from(SETTINGS)
    .update({ weekly_day: weekday })
    .eq('user_id', userId)
    .select('weekly_day')
    .maybeSingle();
  if (error) throw new Error(`Failed to save the weekly day: ${error.message}`);
  // an update that matched no row saved nothing, and says so rather than passing as saved
  if (!data)
    throw new Error('Failed to save the weekly day: there are no settings to keep it with.');
}

const turns = new Map<string, Promise<unknown>>();
function inTurn<T>(rowId: string, work: () => Promise<T>): Promise<T> {
  const before = turns.get(rowId) ?? Promise.resolve();
  const mine = before.then(work, work);
  turns.set(
    rowId,
    mine.catch(() => undefined),
  );
  return mine;
}

/** Their days off: the days of the week that count as days off, 0 Sunday to 6 Saturday. */
export async function saveDaysOff(userId: string, days: number[]): Promise<void> {
  const { data, error } = await supabase
    .from(SETTINGS)
    .update({ days_off: days })
    .eq('user_id', userId)
    .select('days_off')
    .maybeSingle();
  if (error) throw new Error(`Failed to save the days off: ${error.message}`);
  if (!data)
    throw new Error('Failed to save the days off: there are no settings to keep them with.');
}

/**
 * A week's row made by the app, for a week that has none yet: the week they
 * said not this week to before Gremly made a read for it. Returns the row
 * that is there when another was made in the meantime.
 */
export async function createWeekReview(
  userId: string,
  row: { week_start: string; span_start: string; status: ReviewState; kind: ReviewKind },
): Promise<WeekReviewRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ owner_id: userId, ...row })
    .select('*')
    .maybeSingle();
  // one person has one row a week: when it appeared since, that row stands
  if (error?.code === '23505') return getWeekReview(userId, row.week_start);
  if (error) throw new Error(`Failed to save the week's review: ${error.message}`);
  return asRow(data);
}

/**
 * Move a review to another week: the one just done on a day that then becomes
 * their weekly day counts as the new week's. Gives back 'taken' when that week
 * already has a review, and nothing is changed then.
 */
export async function moveWeekReview(
  rowId: string,
  to: { week_start: string; span_start: string; kind: ReviewKind },
): Promise<WeekReviewRow | 'taken' | null> {
  return inTurn(rowId, async () => {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ ...to, updated_at: nowTimestamp() })
      .eq('id', rowId)
      .select('*')
      .maybeSingle();
    if (error?.code === '23505') return 'taken' as const;
    if (error) throw new Error(`Failed to move the week's review: ${error.message}`);
    return asRow(data);
  });
}

/**
 * Change a review from what it is when the change is made: change is handed
 * the row as it is now and gives back what to write: its answers, its check
 * ins, and how far it has got (status, with completed_at once it is done).
 * Returns the row as written, or null when it is no longer there.
 */
export function changeWeekReview(
  rowId: string,
  change: (row: WeekReviewRow) => {
    answers?: WeekAnswers;
    checkins?: WeekCheckIn[];
    status?: ReviewState;
    completed_at?: string | null;
  },
): Promise<WeekReviewRow | null> {
  return inTurn(rowId, async () => {
    const { data: current, error: readError } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', rowId)
      .maybeSingle();
    if (readError) throw new Error(`Failed to read the week's review: ${readError.message}`);
    const row = asRow(current);
    if (!row) return null;
    const { data, error } = await supabase
      .from(TABLE)
      .update({ ...change(row), updated_at: nowTimestamp() })
      .eq('id', rowId)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Failed to save the week's review: ${error.message}`);
    return asRow(data);
  });
}

/** A check in with the review that keeps it. */
export interface DueCheckIn extends WeekCheckIn {
  /** The id of the weekly_reviews row it is kept on */
  row_id: string;
}

/** How far back a review that still holds a check in to come can have been made. */
const CHECKIN_REVIEWS_BACK_DAYS = 180;

/**
 * The open check ins whose day falls from one day to another, the earliest
 * first. A check in is kept on the review it was set up in, and its day can
 * be weeks after that week, so every review that holds any is read.
 */
export async function getDueCheckIns(
  userId: string,
  from: string,
  to: string,
): Promise<DueCheckIn[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id,week_start,checkins')
    .eq('owner_id', userId)
    .gte('week_start', addDays(from, -CHECKIN_REVIEWS_BACK_DAYS))
    .neq('checkins', '[]')
    .limit(60);
  if (error) throw new Error(`Failed to read the check ins: ${error.message}`);
  const out: DueCheckIn[] = [];
  for (const r of (data ?? []) as { id: string; checkins?: unknown }[]) {
    for (const c of Array.isArray(r.checkins) ? (r.checkins as WeekCheckIn[]) : []) {
      if (!c || typeof c.id !== 'string' || c.status !== 'open') continue;
      if (typeof c.date !== 'string' || c.date < from || c.date > to) continue;
      out.push({ ...c, row_id: r.id });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/**
 * Settle a check in on the review that keeps it: done once it is answered,
 * skipped when they pass on it. Returns the row as written, or null when the
 * review or the check in is no longer there.
 */
export async function settleCheckIn(
  rowId: string,
  checkInId: string,
  status: 'done' | 'skipped',
): Promise<WeekReviewRow | null> {
  let found = false;
  const saved = await changeWeekReview(rowId, (row) => ({
    checkins: row.checkins.map((c) => {
      if (c.id !== checkInId) return c;
      found = true;
      return { ...c, status };
    }),
  }));
  return found ? saved : null;
}
