/**
 * A habit on a day of their week, in the app: which habit a morning checks in
 * on and the day one can move to. The rules are shared with the worker that
 * writes the morning brief (workers/shared/habitWeek.js); this module is the
 * app's door to them, the way lib/week/model.ts is for the week's dates.
 */
export {
  QUIET_FIELD,
  checkInOpen,
  daysLeft,
  habitShape,
  habitToCheckIn,
  loadOn,
  moveDayFor,
  moveDaysFor,
  plannedOn,
  roomLeft,
  weekAround,
} from '../../workers/shared/habitWeek';
export type { HabitShape } from '../../workers/shared/habitWeek';
