// Types for fields.js, for the app's TypeScript.
export type ItemType = 'todo' | 'habit' | 'note';
export type FieldKind =
  | 'text'
  | 'day'
  | 'time'
  | 'minutes'
  | 'enum'
  | 'flag'
  | 'schedule'
  | 'tags'
  | 'links'
  | 'list'
  | 'reminder';
export type FieldGroup = 'main' | 'asked';
export interface FieldDef {
  kind: FieldKind;
  group: FieldGroup;
  column: string;
  about: string;
  max?: number;
  clear?: boolean;
  add?: boolean;
  events?: boolean;
  values?: string[];
}
export type ChangeOp =
  | 'add'
  | 'change'
  | 'done'
  | 'reopen'
  | 'log'
  | 'unlog'
  | 'skip_today'
  | 'archive'
  | 'restore'
  | 'convert'
  | 'plan';
/** The week's own operations (the weekly review), kept apart from OPS. */
export type WeekOp =
  | 'later'
  | 'habit_days'
  | 'week_shape'
  | 'intention'
  | 'milestone'
  | 'weekly_day';
export declare const WEEK_OPS: Record<WeekOp, string>;
export declare const STEP_KINDS: Array<'todo' | 'check_in'>;
export declare const WEEK_LIMITS: { intention: number; goal: number; steps: number };
export declare const NAME_LIMIT: number;
export declare const FIELDS_VERSION: number;
export declare const GROUPS: Record<FieldGroup, string>;
export declare const OPS: Record<ChangeOp, string>;
export declare const TYPES: Record<ItemType, { ops: ChangeOp[]; fields: Record<string, FieldDef> }>;
export declare const PLAN_KINDS: Array<
  'add_block' | 'remove_block' | 'plan_add' | 'plan_remove' | 'plan_move' | 'plan_day'
>;
export declare function fieldsOf(type: string): Record<string, FieldDef> | null;
export declare function fieldDef(type: string, field: string): FieldDef | null;
