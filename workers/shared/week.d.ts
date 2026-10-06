// Types for week.js, for the app's TypeScript.
export type DayKind = 'normal_day' | 'busy_day' | 'weekend_day';
export type ReviewKind = 'weekly' | 'extra' | 'brought_forward';
export type ReviewState = 'ready' | 'started' | 'done' | 'skipped';
export type WeekStep =
  | 'offer'
  | 'challenge'
  | 'priorities'
  | 'shape'
  | 'intention'
  | 'ahead'
  | 'needs_you'
  | 'board'
  | 'done';
/** Hours free on each kind of day, in half hour steps */
export type WeekHours = Partial<Record<DayKind, number>>;

export declare const DEFAULT_WEEKLY_DAY: number;
export declare const DEFAULT_DAYS_OFF: number[];
export declare const PROMOTED_AFTER: number;
export declare const LATER_MAX_DAYS: number;
export declare const PIPE_LEAD_HOURS: number;
export declare const READ_AHEAD_NEEDS_REVIEW: boolean;
export declare const READ_AHEAD_DAYS: number;
export declare const LOOK_AHEAD_DAYS: number;
export declare const DEFAULT_MINUTES: number;
export declare const HOURS_MAX: number;
export declare const DAY_KINDS: DayKind[];
export declare const REVIEW_KINDS: ReviewKind[];
export declare const REVIEW_STATES: ReviewState[];
export declare const WEEK_STEPS: WeekStep[];

export declare function isDay(v: unknown): v is string;
export declare function addDays(day: string, n: number): string;
export declare function daysBetween(a: string, b: string): number;
export declare function weekdayOf(day: string): number;
export declare function weeklyDayOf(v: unknown): number;
export declare function daysOffOf(v: unknown): number[];
export declare function cycleOf(
  today: string,
  weeklyDay: number | null | undefined,
): { since: number; start: string; week_start: string; week_end: string; next: string };
export declare function reviewOn(
  today: string,
  weeklyDay: number | null | undefined,
): {
  kind: ReviewKind;
  promoted: boolean;
  fresh: boolean;
  week_start: string;
  span_start: string;
  span_end: string;
};
export declare function reviewWith(
  today: string,
  weeklyDay: number | null | undefined,
  row: { week_start?: string; status?: string | null; kind?: string | null } | null | undefined,
): {
  kind: ReviewKind;
  promoted: boolean;
  fresh: boolean;
  resumed?: boolean;
  week_start: string;
  span_start: string;
  span_end: string;
};
export declare function summaryWeekOf(
  day: string,
  weeklyDay: number | null | undefined,
): { start: string; end: string };
export declare function readServes(
  review: { kind: ReviewKind },
  row: { kind?: string | null; read?: object | null } | null | undefined,
): boolean;
export declare function extraUsed(row: { kind?: string | null } | null | undefined): boolean;
export declare function spanDays(first: string, last: string): string[];
export declare function dayKind(
  day: string,
  opts?: { daysOff?: number[] | null; busyDays?: string[] | null },
): DayKind;
export declare function normHours(v: unknown): number | undefined;
export declare function minutesOf(
  item: { time_estimate_minutes?: number | null; minutes?: number | null } | null | undefined,
): number;
export declare function dayRoom(
  hours: WeekHours | null | undefined,
  kind: DayKind,
  placed: number,
): { minutes: number | null; placed: number; left: number | null };
