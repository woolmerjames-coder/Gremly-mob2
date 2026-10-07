/**
 * A habit on a day of their week, in the app: which habit a morning checks in
 * on, the day one can move to, the week a count toward a weekly target is
 * made in, and what a pause or a lighter version is. The rules are shared
 * with the workers (workers/shared/habitWeek.js); this module is the app's
 * door to them, the way lib/week/model.ts is for the week's dates.
 */
export {
  EASE_MAX_DAYS,
  EASE_MODES,
  EASE_NOTE_MAX,
  QUIET_FIELD,
  behindInWeek,
  checkInOpen,
  dayOfWeek,
  daysLeft,
  easeApplied,
  easeNote,
  easeOf,
  easeOn,
  easeOver,
  easePlan,
  easesFrom,
  habitShape,
  habitToCheckIn,
  loadOn,
  moveDayFor,
  moveDaysFor,
  paceFloor,
  pauseSpans,
  pausedOn,
  plannedOn,
  roomLeft,
  unpaused,
  weekAround,
  weeklyTarget,
} from '../../workers/shared/habitWeek';
export type { Ease, EaseMode, EasePlan, HabitShape } from '../../workers/shared/habitWeek';
