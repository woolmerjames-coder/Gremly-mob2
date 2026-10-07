/**
 * The item a change is read against, from the app's store: the item itself,
 * the Worlds and Chapters it is linked to, and for a habit the days it is
 * logged on. The checks (workers/shared/changes/check.js) read the same shape
 * the Workers build from the database.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date/DateService';
import { EASE_OPS, WEEK_OPS, type CheckContext, type ItemType } from './model';
import { plannedDays, weekCheckContext } from './week';

type Item = Record<string, any>;

/** The item as the store has it, or null. */
export function findItem(type: ItemType, id: string | null | undefined): Item | null {
  if (!id) return null;
  const s = useGremlyStore.getState() as any;
  const list: Item[] | undefined =
    type === 'todo' ? s.todos : type === 'habit' ? s.habits : s.notes;
  return list?.find((x) => x.id === id) ?? null;
}

/** The item with what lives beside it: its links, and a habit's logged days. */
export function snapshotOf(type: ItemType, id: string | null | undefined): Item | null {
  const item = findItem(type, id);
  if (!item) return null;
  const s = useGremlyStore.getState() as any;
  const world_ids = (s.dropWorldLinks ?? [])
    .filter((l: any) => l.drop_id === item.id)
    .map((l: any) => l.world_id);
  const chapter_ids = (s.dropChapterLinks ?? [])
    .filter((l: any) => l.drop_id === item.id)
    .map((l: any) => l.chapter_id);
  const snap: Item = { ...item, world_ids, chapter_ids };
  if (type === 'habit') {
    snap.logged_days = (s.habitProgress ?? [])
      .filter((p: any) => p.habit_id === item.id)
      .map((p: any) => p.occurred_day);
  }
  return snap;
}

/**
 * What one change is checked against: its item, today, and the Worlds and
 * Chapters there are. One of the week's own changes is also checked against
 * the person's week, and a habit's days against the days it is planned on now.
 * A habit's pause or lighter version is checked against their weekly day and
 * the ones it has now.
 */
export function contextFor(raw: {
  op?: string | null;
  type?: string | null;
  id?: string | null;
}): CheckContext {
  const s = useGremlyStore.getState() as any;
  const type = raw.type as ItemType | undefined;
  const ctx: CheckContext = {
    today: getDateService().today(),
    item: type && raw.id ? snapshotOf(type, raw.id) : null,
    worlds: (s.worlds ?? []).map((w: any) => w.id),
    chapters: (s.chapters ?? []).map((c: any) => c.id),
  };
  if (raw.op && raw.op in WEEK_OPS) {
    const week = weekCheckContext();
    ctx.week = week;
    if (raw.op === 'habit_days' && ctx.item) {
      ctx.item = { ...ctx.item, planned_days: plannedDays(ctx.item.id, week.first, week.last) };
    }
  }
  // a habit's pause or lighter version: their weekly day, and what is eased
  // now. A habit's days are checked against it too: none goes on a paused day.
  if (raw.op && (raw.op in EASE_OPS || raw.op === 'habit_days')) {
    ctx.ease = { weekly_day: s.weeklyDay ?? 0, rows: s.habitAdaptations ?? [] };
  }
  return ctx;
}
