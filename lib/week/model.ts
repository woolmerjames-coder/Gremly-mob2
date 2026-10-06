/**
 * The person's week in the app: the date rules of the weekly review, shared
 * with both Workers (workers/shared/week.js). This module is the app's door to
 * them, the way lib/changes/model.ts is for the change model.
 */
export {
  DAY_KINDS,
  DEFAULT_DAYS_OFF,
  DEFAULT_MINUTES,
  DEFAULT_WEEKLY_DAY,
  HOURS_MAX,
  LATER_MAX_DAYS,
  LOOK_AHEAD_DAYS,
  PROMOTED_AFTER,
  WEEK_STEPS,
  addDays,
  cycleOf,
  dayKind,
  dayRoom,
  daysBetween,
  daysOffOf,
  extraUsed,
  isDay,
  minutesOf,
  normHours,
  readServes,
  reviewOn,
  reviewWith,
  spanDays,
  summaryWeekOf,
  weekdayOf,
  weeklyDayOf,
} from '../../workers/shared/week';
export type {
  DayKind,
  ReviewKind,
  ReviewState,
  WeekHours,
  WeekStep,
} from '../../workers/shared/week';
// the week board's rules, shared with the worker that spreads a week
export {
  FALLBACK_HOURS,
  KEEP_ASK_FROM,
  backDays,
  busyFor,
  gremlyPut,
  habitAllowance,
  habitOpenDays,
  hoursFor,
  released,
  reliefBasis,
  returnsCap,
  spreadBasis,
  spreadReturns,
  todoSpot,
} from '../../workers/shared/weekBoard';
