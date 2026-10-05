// Types for check.js, for the app's TypeScript.
import type { ChangeOp, ItemType } from './fields';

export interface Schedule {
  per: 'day' | 'week' | 'month';
  times: number;
  /** Fixed days of the week for a weekly habit, 0 Sunday to 6 Saturday */
  days?: number[];
}
export interface PlanChange {
  kind: 'add_block' | 'remove_block' | 'plan_add' | 'plan_remove' | 'plan_move' | 'plan_day';
  id?: string;
  item?: 'todo' | 'habit';
  title?: string;
  /** Minutes from local midnight */
  start?: number | null;
  end?: number | null;
  /** plan_add with no time: a stretch of the day to fit it into, from here */
  after?: number | null;
  minutes?: number | null;
  travel?: boolean;
  /** The day turn's own words for the row */
  label?: string;
}
/** One checked change, as the card shows it and the app applies it. */
export interface Change {
  cid: string;
  op: ChangeOp;
  type: ItemType | null;
  id: string | null;
  /** The item's name as it reads now, or the new name for an add */
  title: string;
  fields?: Record<string, any>;
  before?: Record<string, any>;
  days?: string[];
  to?: ItemType;
  plan?: PlanChange;
}
export interface CheckContext {
  today?: string;
  item?: Record<string, any> | null;
  worlds?: string[];
  chapters?: string[];
  groups?: Array<'main' | 'asked'>;
}
export declare function normDay(v: unknown): string | undefined;
export declare function normTime(v: unknown): string | undefined;
export declare function normMinutes(v: unknown): number | undefined;
export declare function normSchedule(v: unknown): Schedule | undefined;
export declare function scheduleOf(item: Record<string, any> | null | undefined): Schedule;
export declare function scheduleLabel(s: Schedule | null | undefined): string;
export declare function itemTitle(
  type: string,
  item: Record<string, any> | null | undefined,
): string;
export declare function beforeValue(
  type: string,
  item: Record<string, any> | null | undefined,
  field: string,
): any;
export declare function checkChange(
  raw: Record<string, any>,
  ctx?: CheckContext,
): { ok: true; change: Change } | { ok: false; reason: string };
export declare function checkCard(
  raws: Array<Record<string, any>>,
  ctxFor?: (raw: Record<string, any>) => CheckContext,
): { changes: Change[]; dropped: Array<{ cid: string; reason: string }> };
