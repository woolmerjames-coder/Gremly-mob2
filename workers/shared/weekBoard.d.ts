/** Types for the week board's rules (weekBoard.js), for the app (lib/week/board). */
import type { WeekHours } from './week';

export declare const FALLBACK_HOURS: Required<WeekHours>;
export declare const RETURNS_A_DAY_MIN: number;
export declare const KEEP_ASK_FROM: number;

export type TodoSpot =
  | { spot: 'fixed'; day: string }
  | { spot: 'own'; day: string }
  | { spot: 'later'; back_on: string }
  | { spot: 'free' };

export declare function todoSpot(
  t: { due_day?: string | null; back_on?: string | null } | null | undefined,
  span: { today: string; first: string; last: string },
): TodoSpot;

type Answered = {
  hours?: WeekHours | null;
  busy_days?: string[] | null;
  priorities?: { item_ids?: string[] }[] | null;
  keep?: 'all' | 'some' | 'none';
  freed?: string[];
  planned?: { gremly?: Record<string, string> } | null;
  relieved?: Record<string, string>;
  intention?: string | null;
  challenge?: { note?: string | null } | null;
  needs_you?: { title: string; decision?: string | null }[] | null;
  touched?: number;
} | null;

type Placed = { id?: string; due_day?: string | null; timed?: boolean } | null | undefined;
export declare function gremlyPut(t: Placed, answers: Answered | undefined): boolean;
export declare function released(t: Placed, answers: Answered | undefined): boolean;
type Read = { free_hours_guess?: WeekHours | null; busy_days?: string[] | null } | null;

export declare function hoursFor(
  answers: Answered | undefined,
  read: Read | undefined,
): Required<WeekHours>;
export declare function busyFor(
  answers: Answered | undefined,
  read: Read | undefined,
  days: string[],
): string[];
export declare function reliefBasis(
  answers: Answered | undefined,
  read: Read | undefined,
  days: string[],
  today: string,
): string;
export declare function spreadBasis(
  answers: Answered | undefined,
  read: Read | undefined,
  days: string[],
  today: string,
): string;

export declare function backDays(today: string, last: string): string[];

export declare function returnsCap(total: number, days: number): number;

export declare function spreadReturns(
  list: { id: string; back_on?: string | null; by?: string | null }[],
  p: { days: string[]; load?: Map<string, number> | [string, number][]; cap: number },
): Map<string, string>;

/** A habit as the board's rules read it. */
export interface BoardHabitRule {
  cadence?: string;
  target?: number | null;
  days_active?: number[] | null;
  breaking?: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export declare function habitOpenDays(h: BoardHabitRule, days: string[]): string[];
export declare function habitAllowance(
  h: BoardHabitRule | null | undefined,
  days: string[],
): number;
