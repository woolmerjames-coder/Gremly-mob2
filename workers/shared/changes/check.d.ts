// Types for check.js, for the app's TypeScript.
import type { ChangeOp, EaseOp, ItemType, WeekOp } from './fields';
import type { WeekHours } from '../week';

export interface Schedule {
  per: 'day' | 'week' | 'month';
  times: number;
  /** Fixed days of the week for a weekly habit, 0 Sunday to 6 Saturday */
  days?: number[];
}
export interface PlanChange {
  kind: 'add_block' | 'remove_block' | 'plan_add' | 'plan_remove' | 'plan_move' | 'plan_day';
  id?: string;
  item?: 'todo' | 'habit';
  title?: string;
  /** Minutes from local midnight */
  start?: number | null;
  end?: number | null;
  /** plan_add with no time: a stretch of the day to fit it into, from here */
  after?: number | null;
  minutes?: number | null;
  travel?: boolean;
  /** The day turn's own words for the row */
  label?: string;
}
/** The week's busy days and free hours, the parts of them a change sets. */
export interface WeekShape {
  busy_days?: string[];
  hours?: WeekHours;
}
/** One step towards a milestone: a todo to do, or a check in Gremly holds. */
export interface MilestoneStep {
  title: string;
  /** The day to finish it by */
  by: string;
  minutes?: number;
  kind: 'todo' | 'check_in';
}
export interface Milestone {
  goal: string;
  /** The date it is for */
  date: string;
  steps: MilestoneStep[];
}
/** One checked change, as the card shows it and the app applies it. */
export interface Change {
  cid: string;
  op: ChangeOp | WeekOp | EaseOp;
  type: ItemType | null;
  id: string | null;
  /** The item's name as it reads now, or the new name for an add */
  title: string;
  fields?: Record<string, any>;
  before?: Record<string, any>;
  days?: string[];
  to?: ItemType;
  plan?: PlanChange;
  /** week_shape: the busy days and hours it sets */
  shape?: WeekShape;
  /** week_shape, priority, intention and milestone: the first day of the week it is for */
  week_start?: string;
  /** week_shape: the first day its busy days were stated for; busy days before it stay as they are */
  from?: string;
  /** milestone: what is set up */
  milestone?: Milestone;
  /** ease: the pause, lighter version or return to usual, and the days it runs */
  ease?: EaseChange;
}
/** A habit's pause, lighter version or return to usual, over a stretch of days. */
export interface EaseChange {
  mode: 'pause' | 'lighter' | 'usual';
  first: string;
  last: string;
  /** What the lighter version is, in a few words; empty when none was given */
  note: string;
}
/** The person's week, for the week's own changes (checkWeekChange). */
export interface WeekCheckContext {
  /** The days the week's changes act on */
  first: string;
  last: string;
  /** The first day of the week they belong to; first when left out */
  week_start?: string;
  hours?: WeekHours | null;
  busy_days?: string[];
  /** The week has a review, which keeps its shape and its check ins */
  has_review?: boolean;
  intention?: { id?: string | null; text: string } | null;
  /**
   * What matters most to them this week as it stands, each in its own words.
   * Null from an app build that cannot keep a new one, which is then never offered one.
   */
  priorities?: string[] | null;
  /** 0 Sunday to 6 Saturday */
  weekly_day?: number;
}
export interface CheckContext {
  today?: string;
  item?: Record<string, any> | null;
  worlds?: string[];
  chapters?: string[];
  groups?: Array<'main' | 'asked'>;
  week?: WeekCheckContext | null;
  /** For ease: their weekly day and their habit_adaptations rows */
  ease?: {
    weekly_day?: number;
    rows?: Record<string, any>[];
    /** The days a weekly review under way is planning: a stretch with no days given is these */
    span?: { first: string; last: string } | null;
  } | null;
}
export declare function normDay(v: unknown): string | undefined;
export declare function normTime(v: unknown): string | undefined;
export declare function normMinutes(v: unknown): number | undefined;
export declare function normSchedule(v: unknown): Schedule | undefined;
export declare function scheduleOf(item: Record<string, any> | null | undefined): Schedule;
export declare function scheduleLabel(s: Schedule | null | undefined): string;
export declare function itemTitle(
  type: string,
  item: Record<string, any> | null | undefined,
): string;
export declare function beforeValue(
  type: string,
  item: Record<string, any> | null | undefined,
  field: string,
): any;
export declare function checkChange(
  raw: Record<string, any>,
  ctx?: CheckContext,
): { ok: true; change: Change } | { ok: false; reason: string };
export declare function checkEase(
  raw: Record<string, any>,
  ctx?: CheckContext,
): { ok: true; change: Change } | { ok: false; reason: string };
export declare function checkWeekChange(
  raw: Record<string, any>,
  ctx?: CheckContext,
): { ok: true; change: Change } | { ok: false; reason: string };
export declare function checkCard(
  raws: Array<Record<string, any>>,
  ctxFor?: (raw: Record<string, any>) => CheckContext,
): { changes: Change[]; dropped: Array<{ cid: string; reason: string }> };
