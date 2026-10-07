/**
 * The change model in the app: one shape for every change Gremly proposes,
 * from chat, Mind Drop, the Save items pill, today's thread and, later,
 * Sweep. The field list and the checks are shared with both Workers
 * (workers/shared/changes); this module is the app's door to them.
 *
 * Agreed in "Gremly agent: one change model" (2 Oct 2026).
 */
export {
  beforeValue,
  checkCard,
  checkChange,
  checkWeekChange,
  itemTitle,
  normDay,
  normTime,
  scheduleLabel,
  scheduleOf,
} from '../../workers/shared/changes/check';
export type {
  Change,
  CheckContext,
  Milestone,
  MilestoneStep,
  PlanChange,
  Schedule,
  WeekCheckContext,
  WeekShape,
} from '../../workers/shared/changes/check';
export {
  EASE_OPS,
  fieldDef,
  NAME_LIMIT,
  OPS,
  TYPES,
  WEEK_LIMITS,
  WEEK_OPS,
} from '../../workers/shared/changes/fields';
export type {
  ChangeOp,
  EaseOp,
  FieldDef,
  ItemType,
  WeekOp,
} from '../../workers/shared/changes/fields';
