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
export declare const FIELDS_VERSION: number;
export declare const GROUPS: Record<FieldGroup, string>;
export declare const OPS: Record<ChangeOp, string>;
export declare const TYPES: Record<ItemType, { ops: ChangeOp[]; fields: Record<string, FieldDef> }>;
export declare const PLAN_KINDS: Array<
  'add_block' | 'remove_block' | 'plan_add' | 'plan_remove' | 'plan_move'
>;
export declare function fieldsOf(type: string): Record<string, FieldDef> | null;
export declare function fieldDef(type: string, field: string): FieldDef | null;
