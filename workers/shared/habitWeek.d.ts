/** Types for a habit on a day of their week (habitWeek.js), for the app (lib/week/habitWeek). */
import type { WeekHours } from './week';

export declare const QUIET_FIELD: 'checkins_quiet_until';

type Row = Record<string, any>;

export interface HabitShape {
  id: string;
  title: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  days_active: number[];
  breaking: boolean;
  archived: boolean;
  start_date: string | null;
  end_date: string | null;
  minutes: number;
  quiet_until: string | null;
}

export declare function habitShape(h: Row | null | undefined): HabitShape;
export declare function plannedOn(plans: Row[] | null | undefined, day: string): Set<string>;
export declare function checkInOpen(
  habit: Row,
  on: { today: string; planned: Set<string>; doneToday: Set<string>; eases?: Row[] | null },
): boolean;
export declare function habitToCheckIn(p: {
  today: string;
  habits: Row[];
  plans: Row[];
  doneToday: Iterable<string>;
  eases?: Row[] | null;
}): { id: string; title: string; minutes: number } | null;
export declare function weekAround(
  today: string,
  weeklyDay: number,
): { first: string; last: string };
export declare function daysLeft(today: string, weeklyDay: number): string[];
export declare function dayOfWeek(today: string, weeklyDay: number): number;
export declare function weeklyTarget(habit: Row | null | undefined): number | null;
export declare function paceFloor(target: number, daysGone: number): number;
export declare function behindInWeek(p: {
  habit: Row | null | undefined;
  done: number;
  today: string;
  weeklyDay: number;
  eases?: Row[] | null;
}): boolean;

export declare const EASE_MAX_DAYS: number;
export declare const EASE_NOTE_MAX: number;
export declare const EASE_MODES: readonly ['pause', 'lighter', 'usual'];
/** What a habit can be given for a stretch of days; usual takes a pause or lighter version away */
export type EaseMode = 'pause' | 'lighter' | 'usual';
/** A pause or a lighter version, as the rules read a habit_adaptations row */
export interface Ease {
  id: string | null;
  habit_id: string;
  mode: 'pause' | 'lighter';
  first: string;
  last: string;
  note: string;
}
export declare function easeNote(v: unknown): string;
export declare function easeOf(row: Row | null | undefined): Ease | null;
export declare function rowOfEase(e: {
  id?: string | null;
  habit_id: string;
  mode: 'pause' | 'lighter';
  first: string;
  last: string;
  note?: string | null;
}): Row;
export declare function easeOn(
  rows: Row[] | null | undefined,
  habitId: string,
  day: string,
): Ease | null;
export declare function pausedOn(
  rows: Row[] | null | undefined,
  habitId: string,
  day: string,
): boolean;
export declare function unpaused(
  rows: Row[] | null | undefined,
  habitId: string,
  days: string[],
): string[];
export declare function pauseSpans(
  rows: Row[] | null | undefined,
  habitId: string,
): { first: string; last: string }[];
export declare function easeOver(
  rows: Row[] | null | undefined,
  habitId: string,
  days: string[],
): Ease | null;
export declare function easesFrom(rows: Row[] | null | undefined, day: string): Ease[];
export interface EasePlan {
  remove: Row[];
  shorten: { row: Row; period_start: string; period_end: string }[];
  add: {
    mode: string;
    period_start: string;
    period_end: string;
    floor_note: string | null;
    source_ref: string | null;
  }[];
  same: boolean;
}
export declare function easePlan(
  rows: Row[] | null | undefined,
  to: { mode: EaseMode; first: string; last: string; note?: string | null },
): EasePlan;
export declare function easeApplied(
  rows: Row[] | null | undefined,
  habitId: string,
  to: { mode: EaseMode; first: string; last: string; note?: string | null },
): Row[];
export declare function roomLeft(p: {
  days: string[];
  hours: Required<WeekHours>;
  daysOff: number[];
  busyDays: string[];
  todos: Row[];
  habits: Row[];
  plans: Row[];
}): Map<string, number>;
export declare function moveDayFor(p: {
  habit: Row;
  days: string[];
  plans: Row[];
  room: Map<string, number>;
  eases?: Row[] | null;
}): string | null;
export declare function moveDaysFor(p: {
  habits: Row[];
  days: string[];
  plans: Row[];
  room: Map<string, number>;
  eases?: Row[] | null;
}): Map<string, string>;
export declare function loadOn(p: {
  days: string[];
  todos: Row[];
  habits: Row[];
  plans: Row[];
}): Map<string, number>;
