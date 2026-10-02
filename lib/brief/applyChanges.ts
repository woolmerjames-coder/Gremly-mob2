/**
 * Applying the day turn's card (Daily brief in Chat). Each ticked change is
 * written the way the app already writes it (the store for todos and habits,
 * today's thread metadata for set times), and what it means for the plan is
 * handed back so the plan can be re-fitted as one new version
 * (usePlanFlow.reviseAfterChanges). A change that fails is reported, never
 * claimed.
 */

import type { DayChange } from '../cortex/CortexClient';
import { useGremlyStore } from '../store/useGremlyStore';
import { patchDailyThreadMeta } from '../repo/dailyThreadRepo';
import { generateDropId } from '../minddrop/ids';
import { useTodayThread } from './todayThread';
import type { DailyThreadMeta } from './types';
import type { ThreadBlock } from './dayRecord';
import type { PlanChange } from '../plan/usePlanFlow';

export interface ApplyResult {
  done: string[];
  failed: string[];
  plan: PlanChange;
  /** Set times or travel changed: the plan is re-fitted even with no item change */
  frameChanged: boolean;
}

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** The thread's own lists, as they are now. */
function threadLists(threadId: string | null) {
  const t = useTodayThread.getState().thread;
  const meta = (t && t.id === threadId ? t.metadata_json : null) as Partial<DailyThreadMeta> | null;
  return {
    blocks: [...(meta?.fixed_blocks ?? [])] as ThreadBlock[],
    removed: [...(meta?.fixed_removed ?? [])],
    skipped: [...(meta?.skipped_habits ?? [])],
  };
}

export async function applyDayChanges(
  changes: DayChange[],
  ctx: { date: string; threadId: string | null; inPlan: Set<string>; hasPlan: boolean },
): Promise<ApplyResult> {
  const s = useGremlyStore.getState();
  const out: ApplyResult = {
    done: [],
    failed: [],
    plan: { add: [], remove: [], pin: [] },
    frameChanged: false,
  };
  const lists = threadLists(ctx.threadId);
  let listsChanged = false;
  const offPlan = (id?: string) => {
    if (id && ctx.inPlan.has(id)) out.plan.remove.push(id);
  };

  for (const c of changes) {
    try {
      switch (c.kind) {
        case 'create_todo': {
          const todo = await s.createTodo({
            name: c.title,
            due_day: c.day ?? ctx.date,
            ...(c.start !== null && c.start !== undefined ? { due_time: hhmm(c.start) } : {}),
            ...(c.minutes ? { time_estimate_minutes: c.minutes } : {}),
          } as any);
          if (ctx.hasPlan && (c.day ?? ctx.date) === ctx.date && c.start != null && todo?.id) {
            out.plan.add.push({
              id: todo.id,
              kind: 'todo',
              start: c.start,
              minutes: c.minutes ?? null,
            });
          }
          break;
        }
        case 'retime': {
          const moved = c.day && c.day !== ctx.date;
          if (c.item === 'habit') {
            // a habit's time today lives in the plan
          } else {
            await s.updateTodo(c.id!, {
              due_time: hhmm(c.start!),
              ...(moved ? { due_day: c.day, scheduled_date: c.day } : {}),
            } as any);
          }
          if (moved) offPlan(c.id);
          else if (ctx.inPlan.has(c.id!)) out.plan.pin.push({ id: c.id!, start: c.start! });
          else if (ctx.hasPlan)
            out.plan.add.push({
              id: c.id!,
              kind: c.item === 'habit' ? 'habit' : 'todo',
              start: c.start!,
              minutes: null,
            });
          break;
        }
        case 'move_day':
          await s.updateTodo(c.id!, { due_day: c.day, scheduled_date: c.day } as any);
          if (c.day !== ctx.date) offPlan(c.id);
          break;
        case 'rename':
          if (c.item === 'habit') await s.updateHabit(c.id!, { name: c.title } as any);
          else await s.updateTodo(c.id!, { name: c.title, title: c.title } as any);
          break;
        case 'complete':
          if (c.item === 'habit') await s.completeHabit(c.id!);
          else await s.completeTodo(c.id!);
          offPlan(c.id);
          break;
        case 'cancel':
          if (c.item === 'habit') {
            // a habit is never archived from a chat line: it is skipped today
            if (!lists.skipped.includes(c.id!)) lists.skipped.push(c.id!);
            listsChanged = true;
          } else {
            await s.archiveTodo(c.id!, 'cancelled in chat');
          }
          offPlan(c.id);
          break;
        case 'skip_habit':
          if (!lists.skipped.includes(c.id!)) lists.skipped.push(c.id!);
          listsChanged = true;
          offPlan(c.id);
          break;
        case 'add_block':
          lists.blocks.push({
            id: `chat:${generateDropId()}`,
            title: c.title,
            start: c.start!,
            end: c.end ?? null,
            travel: c.travel === true,
          });
          listsChanged = true;
          out.frameChanged = true;
          break;
        case 'remove_block':
          lists.blocks = lists.blocks.filter((b) => b.id !== c.id);
          if (!lists.removed.includes(c.id!)) lists.removed.push(c.id!);
          listsChanged = true;
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
        case 'plan_remove':
          offPlan(c.id);
          break;
        case 'plan_move':
          out.plan.pin.push({ id: c.id!, start: c.start! });
          break;
        default:
          throw new Error(`unknown change ${(c as DayChange).kind}`);
      }
      out.done.push(c.cid);
    } catch (err) {
      console.warn('[DayTurn] could not apply', c.kind, err);
      out.failed.push(c.cid);
    }
  }

  if (listsChanged && ctx.threadId) {
    const patch = {
      fixed_blocks: lists.blocks,
      fixed_removed: lists.removed,
      skipped_habits: lists.skipped,
    };
    try {
      await patchDailyThreadMeta(ctx.threadId, patch);
      useTodayThread.getState().patchMeta(ctx.threadId, patch);
    } catch (err) {
      console.warn('[DayTurn] could not save the set times', err);
      // the set times did not save: those changes are not done
      const listKinds = new Set(['add_block', 'remove_block', 'skip_habit']);
      for (const c of changes) {
        if (listKinds.has(c.kind) || (c.kind === 'cancel' && c.item === 'habit')) {
          out.done = out.done.filter((x) => x !== c.cid);
          if (!out.failed.includes(c.cid)) out.failed.push(c.cid);
        }
      }
      out.frameChanged = false;
    }
  }
  return out;
}

/** "Updated 3 things" */
export function changedEventText(n: number): string {
  return `Updated ${n} ${n === 1 ? 'thing' : 'things'}`;
}
