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
  on: { today: string; planned: Set<string>; doneToday: Set<string> },
): boolean;
export declare function habitToCheckIn(p: {
  today: string;
  habits: Row[];
  plans: Row[];
  doneToday: Iterable<string>;
}): { id: string; title: string; minutes: number } | null;
export declare function weekAround(
  today: string,
  weeklyDay: number,
): { first: string; last: string };
export declare function daysLeft(today: string, weeklyDay: number): string[];
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
}): string | null;
export declare function moveDaysFor(p: {
  habits: Row[];
  days: string[];
  plans: Row[];
  room: Map<string, number>;
}): Map<string, string>;
