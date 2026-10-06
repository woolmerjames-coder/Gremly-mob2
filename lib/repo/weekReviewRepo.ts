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
import type { ReviewKind, ReviewState, WeekHours } from '../week/model';
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
  needs_you: { item_ids: string[]; title: string; stuck_because: string; question: string }[];
  habit_days: { habit_id: string; days: string[]; reason: string }[];
  /** How many times the check had to drop or put right something the model returned */
  dropped: number;
}

/** What the person settled in the review. Next week starts from the hours and busy days. */
export interface WeekAnswers {
  priorities?: { text: string; item_ids: string[] }[];
  /** Hours free for their own things on each kind of day */
  hours?: WeekHours;
  /** The busy days of the week, YYYY-MM-DD */
  busy_days?: string[];
  /** The note that holds the week's intention */
  intention_id?: string | null;
  /** What they decided on each thing that needed them */
  needs_you?: { title: string; item_ids: string[]; decision: string }[];
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
  spread: Record<string, unknown> | null;
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

/**
 * Change a review's answers and check ins from what they are when the change
 * is made: change is handed the row as it is now and gives back what to write.
 * Returns the row as written, or null when it is no longer there.
 */
export function changeWeekReview(
  rowId: string,
  change: (row: WeekReviewRow) => { answers?: WeekAnswers; checkins?: WeekCheckIn[] },
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
