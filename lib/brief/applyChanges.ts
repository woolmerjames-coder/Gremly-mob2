/**
 * Applying a card in today's thread (Daily brief in Chat): the day turn's
 * (applyDayChanges) or the agent's (applyCardChanges). Each ticked change goes
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
import { contextFor, findItem } from '../changes/snapshot';

export interface ApplyResult {
  done: string[];
  failed: string[];
  plan: PlanChange;
  /** Set times or travel changed: the plan is re-fitted even with no item change */
  frameChanged: boolean;
  /** They accepted Gremly's offer to plan the rest of today */
  planDay?: boolean;
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

type CardContext = { date: string; threadId: string | null; inPlan: Set<string>; hasPlan: boolean };

const minutesOf = (t: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Applying the agent's card (agent plan step 7). The rows were checked by the
 * worker against each item as it was; applyChanges spots any edit made since
 * and leaves that row unchanged rather than overwrite it. What the applied
 * rows mean for today's plan is worked out from the change model, the way
 * applyDayChanges works it out from the day turn's kinds.
 */
export async function applyCardChanges(changes: Change[], ctx: CardContext): Promise<ApplyResult> {
  const out: ApplyResult = {
    done: [],
    failed: [],
    plan: { add: [], remove: [], pin: [] },
    frameChanged: false,
    revert: async () => {},
  };
  const { outcomes, revertAll } = await applyChanges(changes, {
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
      console.warn('[BriefTurn] could not apply', o.cid, o.message);
      out.failed.push(o.cid);
    }
  }
  const done = new Set(out.done);
  for (const c of changes) {
    if (done.has(c.cid)) planEffectOf(c, created.get(c.cid) ?? null, ctx, out);
  }
  const order = new Map(changes.map((c, i) => [c.cid, i]));
  out.done.sort((a, b) => order.get(a)! - order.get(b)!);
  out.failed.sort((a, b) => order.get(a)! - order.get(b)!);
  return out;
}

/** What one applied change means for today's plan. */
function planEffectOf(c: Change, createdId: string | null, ctx: CardContext, out: ApplyResult) {
  const offPlan = (id: string | null | undefined) => {
    if (id && ctx.inPlan.has(id)) out.plan.remove.push(id);
  };
  const intoPlan = (
    id: string,
    kind: 'todo' | 'habit',
    start: number | null,
    minutes: number | null,
  ) => {
    if (ctx.inPlan.has(id)) {
      if (start != null) out.plan.pin.push({ id, start });
    } else if (ctx.hasPlan) {
      out.plan.add.push({ id, kind, start, minutes });
    }
  };
  const f = (c.fields ?? {}) as {
    day?: string | null;
    time?: string | null;
    length?: number | null;
  };
  switch (c.op) {
    case 'plan': {
      const p = c.plan!;
      if (p.kind === 'plan_day') out.planDay = true;
      else if (p.kind === 'add_block' || p.kind === 'remove_block') out.frameChanged = true;
      else if (p.kind === 'plan_remove') offPlan(p.id);
      else if (p.kind === 'plan_move' && p.id && p.start != null)
        out.plan.pin.push({ id: p.id, start: p.start });
      else if (p.kind === 'plan_add' && p.id && ctx.hasPlan) {
        out.plan.add.push({
          id: p.id,
          kind: p.item === 'habit' ? 'habit' : 'todo',
          start: p.start ?? null,
          ...(p.after != null ? { after: p.after } : {}),
          minutes: p.minutes ?? null,
        });
      }
      return;
    }
    case 'add': {
      const start = minutesOf(f.time);
      if (c.type === 'todo' && createdId && f.day === ctx.date && start != null && ctx.hasPlan) {
        out.plan.add.push({ id: createdId, kind: 'todo', start, minutes: f.length ?? null });
      }
      return;
    }
    case 'change': {
      if (!c.id || (c.type !== 'todo' && c.type !== 'habit')) return;
      if ('day' in f && f.day !== ctx.date) return offPlan(c.id);
      if (!('time' in f) && !('day' in f)) return;
      const start = minutesOf(f.time);
      // a time on its own counts for today's plan only when the item is for today
      const day =
        'day' in f
          ? f.day
          : c.type === 'todo'
            ? ((findItem('todo', c.id) as { due_day?: string | null } | null)?.due_day ?? null)
            : ctx.date;
      if (day === ctx.date && start != null) intoPlan(c.id, c.type, start, null);
      return;
    }
    case 'done':
    case 'archive':
    case 'skip_today':
    case 'convert':
    case 'later': // put off for later, it leaves its day, and with it today's plan
      return offPlan(c.id);
    case 'log':
      if ((c.days ?? []).includes(ctx.date)) offPlan(c.id);
      return;
    default:
      return;
  }
}

/** "Updated 3 things" */
export function changedEventText(n: number): string {
  return `Updated ${n} ${n === 1 ? 'thing' : 'things'}`;
}

/** "Put back 3 things" */
export function undoneEventText(n: number): string {
  return `Put back ${n} ${n === 1 ? 'thing' : 'things'}`;
}
