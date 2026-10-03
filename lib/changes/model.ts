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
  itemTitle,
  normDay,
  normTime,
  scheduleLabel,
  scheduleOf,
} from '../../workers/shared/changes/check';
export type {
  Change,
  CheckContext,
  PlanChange,
  Schedule,
} from '../../workers/shared/changes/check';
export { fieldDef, OPS, TYPES } from '../../workers/shared/changes/fields';
export type { ChangeOp, FieldDef, ItemType } from '../../workers/shared/changes/fields';
