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
  | 'reminder'
  | 'world'
  | 'items'
  | 'gremly';
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
  /** Worlds and Chapters: a field set only when one is made */
  add_only?: boolean;
  /** Worlds and Chapters: an 'asked' field Gremly may set on a new one */
  new_main?: boolean;
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
  | 'priority'
  | 'intention'
  | 'milestone'
  | 'weekly_day';
export declare const WEEK_OPS: Record<WeekOp, string>;
/** A habit paused, given a lighter version, or set back to usual, for a stretch of days */
export type EaseOp = 'ease';
export declare const EASE_OPS: Record<EaseOp, string>;
export declare const STEP_KINDS: Array<'todo' | 'check_in'>;
export declare const WEEK_LIMITS: {
  intention: number;
  priority: number;
  priorities: number;
  goal: number;
  steps: number;
};
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

/** Worlds and Chapters themselves (Worlds rebuild, stage 2), kept apart from TYPES. */
export type PlaceType = 'world' | 'chapter';
export type PlaceOp = 'close' | 'merge';
export declare const PLACE_OPS: Record<PlaceOp, string>;
export declare const PLACE_OP_WORDS: Record<'archive' | 'restore', string>;
export declare const PLACE_TYPES: Record<
  PlaceType,
  {
    ops: Array<ChangeOp | PlaceOp>;
    fields: Record<string, Omit<FieldDef, 'column'> & { column: string | null }>;
  }
>;
export declare function placeFieldDef(
  type: string,
  field: string,
): (Omit<FieldDef, 'column'> & { column: string | null }) | null;
