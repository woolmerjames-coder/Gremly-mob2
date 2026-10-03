/**
 * Applying the day turn's card (Daily brief in Chat). Each ticked change goes
 * through the change model (lib/changes): the same checks, writes, item
 * history and Undo as chat's card, with skips and set times kept on today's
 * thread. What it means for the plan is handed back so the plan can be
 * re-fitted as one new version (usePlanFlow.reviseAfterChanges). A change
 * that fails is reported, never claimed.
 */
import type { DayChange } from '../cortex/CortexClient';
import type { PlanChange } from '../plan/usePlanFlow';
import { applyChanges } from '../changes/apply';
import { fromDayChange } from '../changes/fromLegacy';
import { checkChange, type Change } from '../changes/model';
import { contextFor } from '../changes/snapshot';

export interface ApplyResult {
  done: string[];
  failed: string[];
  plan: PlanChange;
  /** Set times or travel changed: the plan is re-fitted even with no item change */
  frameChanged: boolean;
  /** Puts back everything that was done, in one go */
  revert: () => Promise<void>;
}

export async function applyDayChanges(
  changes: DayChange[],
  ctx: { date: string; threadId: string | null; inPlan: Set<string>; hasPlan: boolean },
): Promise<ApplyResult> {
  const out: ApplyResult = {
    done: [],
    failed: [],
    plan: { add: [], remove: [], pin: [] },
    frameChanged: false,
    revert: async () => {},
  };

  // read and check each one against the item as it is now
  const checked: Change[] = [];
  for (const c of changes) {
    try {
      const raw = fromDayChange(c, ctx.date);
      const r = checkChange(raw, contextFor(raw));
      if (r.ok) checked.push({ ...r.change, cid: c.cid });
      else {
        console.warn('[DayTurn] change not applied', c.kind, r.reason);
        out.failed.push(c.cid);
      }
    } catch (err) {
      console.warn('[DayTurn] could not read', c.kind, err);
      out.failed.push(c.cid);
    }
  }

  const { outcomes, revertAll } = await applyChanges(checked, {
    source: 'thread',
    threadId: ctx.threadId,
  });
  out.revert = revertAll;
  const created = new Map<string, string>();
  for (const o of outcomes) {
    if (o.ok) {
      out.done.push(o.cid);
      if (o.createdId) created.set(o.cid, o.createdId);
    } else {
      console.warn('[DayTurn] could not apply', o.cid, o.message);
      out.failed.push(o.cid);
    }
  }

  // what the changes that went through mean for today's plan
  const offPlan = (id?: string) => {
    if (id && ctx.inPlan.has(id)) out.plan.remove.push(id);
  };
  const done = new Set(out.done);
  for (const c of changes) {
    if (!done.has(c.cid)) continue;
    switch (c.kind) {
      case 'create_todo': {
        const id = created.get(c.cid);
        if (ctx.hasPlan && (c.day ?? ctx.date) === ctx.date && c.start != null && id) {
          out.plan.add.push({ id, kind: 'todo', start: c.start, minutes: c.minutes ?? null });
        }
        break;
      }
      case 'retime':
        if (c.day && c.day !== ctx.date) offPlan(c.id);
        else if (ctx.inPlan.has(c.id!)) out.plan.pin.push({ id: c.id!, start: c.start! });
        else if (ctx.hasPlan) {
          out.plan.add.push({
            id: c.id!,
            kind: c.item === 'habit' ? 'habit' : 'todo',
            start: c.start!,
            minutes: null,
          });
        }
        break;
      case 'move_day':
        if (c.day !== ctx.date) offPlan(c.id);
        break;
      case 'complete':
      case 'cancel':
      case 'skip_habit':
      case 'plan_remove':
        offPlan(c.id);
        break;
      case 'add_block':
      case 'remove_block':
        out.frameChanged = true;
        break;
      case 'plan_add':
        out.plan.add.push({
          id: c.id!,
          kind: c.item === 'habit' ? 'habit' : 'todo',
          start: c.start ?? null,
          minutes: c.minutes ?? null,
        });
        break;
      case 'plan_move':
        out.plan.pin.push({ id: c.id!, start: c.start! });
        break;
      default:
        break;
    }
  }
  // the card's order, whatever order they were applied in
  const order = new Map(changes.map((c, i) => [c.cid, i]));
  out.done.sort((a, b) => order.get(a)! - order.get(b)!);
  out.failed.sort((a, b) => order.get(a)! - order.get(b)!);
  return out;
}

/** "Updated 3 things" */
export function changedEventText(n: number): string {
  return `Updated ${n} ${n === 1 ? 'thing' : 'things'}`;
}

/** "Put back 3 things" */
export function undoneEventText(n: number): string {
  return `Put back ${n} ${n === 1 ? 'thing' : 'things'}`;
}
