/**
 * The plan's reads and writes against the app's store (Daily brief in Chat):
 * the candidate pool and the day's meetings as they are now, and saying yes
 * to a plan.
 *
 * Saying yes writes daily_block and scheduled_start_iso on each todo and habit
 * (the fields Today reads), makes a reach fact into a todo, writes the day's
 * daily_briefs row with its sequences, and credits feeding (5% an item, three
 * items a day). Items an earlier plan placed that the new one leaves out lose
 * their time. There is no separate locked state on the items: something is on
 * Today or it is not.
 */

import { useGremlyStore } from '../store/useGremlyStore';
import { selectHabitsDueToday, selectTodosDueToday } from '../store/selectors';
import { getDateService, nowTimestamp } from '../date/DateService';
import { getTimeBlockBoundaries } from '../capacity/capacityHelpers';
import { readDco } from '../brief/dco';
import { doneInWeek, meetingsForDay } from '../brief/useDayCard';
import { localDateOf, localMinutesToIso } from '../brief/time';
import type { DayMeeting } from '../brief/dayCard';
import type { PlanItem } from '../brief/types';
import type { SequencedItem } from '../types';
import { buildCandidatePool, windowFor, type Candidate } from './candidatePool';
import { habitsOnDay, todosDueOn } from './dayItems';
import { plannedOn, weekAround } from '../week/habitWeek';
import { withFeedAnimation } from '../brief/feeding';
import { buildDayRecord, type DayRecord, type DayThreadMeta } from '../brief/dayRecord';
import { useTodayThread } from '../brief/todayThread';

export function poolFromStore(): Candidate[] {
  const s = useGremlyStore.getState();
  const ds = getDateService();
  // the person's day: it ends at their day end, not at midnight
  const today = ds.ritualDay();
  // their own week: the seven days that end on their weekly day
  const weekFirst = weekAround(today, s.weeklyDay).first;
  const progress = (s.habitProgress ?? []) as {
    habit_id: string;
    occurred_day: string;
    count?: number;
  }[];
  const { brief } = readDco(s.dco);
  // habits skipped today in the thread are not planned again today
  const meta = useTodayThread.getState().thread?.metadata_json as
    | { ritual_day?: string; skipped_habits?: string[] }
    | undefined;
  const skipped = new Set(meta?.ritual_day === today ? (meta.skipped_habits ?? []) : []);
  return buildCandidatePool({
    today,
    todosDueToday: selectTodosDueToday(s as any),
    habitsDueToday: selectHabitsDueToday(s as any),
    todos: s.todos,
    habits: s.habits,
    doneThisWeek: doneInWeek(progress, weekFirst, today),
    doneToday: new Set(progress.filter((p) => p.occurred_day === today).map((p) => p.habit_id)),
    placedIds: placedOn(today),
    week: { weeklyDay: s.weeklyDay, eases: s.habitAdaptations },
    claims: brief?.claims ?? [],
    reach: brief?.reach ?? null,
    blocks: s.timeBlockPreferences,
    plannedHabits: plannedOn((s as any).habitPlans ?? [], today),
  }).filter((c) => !skipped.has(c.id));
}

/** A todo or habit picked from Due today that is not in today's pool. */
export function candidateFromStore(id: string, kind: 'todo' | 'habit'): Candidate | null {
  const s = useGremlyStore.getState();
  const item =
    kind === 'habit' ? s.habits.find((h) => h.id === id) : s.todos.find((t) => t.id === id);
  if (!item) return null;
  return {
    id,
    kind,
    title: (item as { name?: string }).name || (item as { title?: string }).title || 'Untitled',
    minutes:
      item.time_estimate_minutes && item.time_estimate_minutes > 0
        ? item.time_estimate_minutes
        : null,
    why: 'Added by you',
    window: windowFor(item.time_window, s.timeBlockPreferences),
    source: kind === 'habit' ? 'habit' : 'due',
  };
}

/**
 * The pool for another day (planning tomorrow): todos due that day, and
 * habits on for it (daily, its weekday, or behind for the week by then). No
 * claims or reach, which are today's.
 */
export function poolForDay(day: string): Candidate[] {
  const ds = getDateService();
  const today = ds.ritualDay();
  if (day === today) return poolFromStore();
  const s = useGremlyStore.getState();
  // the week that day is in, which is their own
  const weekFirst = weekAround(day, s.weeklyDay).first;
  const progress = (s.habitProgress ?? []) as {
    habit_id: string;
    occurred_day: string;
    count?: number;
  }[];
  const todosDue = todosDueOn(s.todos, day);
  const habitsOn = habitsOnDay(s.habits, day, s.habitAdaptations);
  const pool = buildCandidatePool({
    today: day,
    todosDueToday: todosDue,
    habitsDueToday: habitsOn,
    todos: s.todos,
    habits: s.habits,
    doneThisWeek: weekFirst <= today ? doneInWeek(progress, weekFirst, today) : new Map(),
    doneToday: new Set(),
    placedIds: new Set(),
    week: { weeklyDay: s.weeklyDay, eases: s.habitAdaptations },
    claims: [],
    reach: null,
    blocks: s.timeBlockPreferences,
    forToday: false,
    plannedHabits: plannedOn((s as any).habitPlans ?? [], day),
    // the plan is for another day, so a todo due on it is due that day, not today
    realToday: today,
  });
  return pool;
}

/** The todos and habits an earlier plan gave a time on this day. */
export function placedOn(day: string): Set<string> {
  const s = useGremlyStore.getState();
  const on = (x: { scheduled_start_iso?: string | null }) =>
    !!x.scheduled_start_iso && localDateOf(x.scheduled_start_iso) === day;
  return new Set([...s.todos.filter(on), ...s.habits.filter(on)].map((x) => x.id));
}

/**
 * A new day: times placed on earlier days come off their todos and habits,
 * so yesterday's plan never shows on Today. Times placed for today (a plan
 * made last night for tomorrow) or later stay.
 */
export function resetStaleAssignments(today: string): number {
  const s = useGremlyStore.getState();
  let cleared = 0;
  const stale = (x: {
    daily_block?: unknown;
    scheduled_start_iso?: string | null;
    updated_at?: string | null;
  }) => {
    if (x.scheduled_start_iso) {
      const day = localDateOf(x.scheduled_start_iso);
      return !!day && day < today;
    }
    // a block with no time (the old organize): stale once it was set before today
    if (x.daily_block == null) return false;
    const touched = x.updated_at ? getDateService().dayOf(x.updated_at) : null;
    return !touched || touched < today;
  };
  const clear = { daily_block: null, scheduled_start_iso: null };
  for (const t of s.todos) {
    if (stale(t)) {
      void s.updateTodo(t.id, clear);
      cleared++;
    }
  }
  for (const h of s.habits) {
    if (stale(h)) {
      void s.updateHabit(h.id, clear);
      cleared++;
    }
  }
  return cleared;
}

export function meetingsFromStore(date: string): DayMeeting[] {
  const s = useGremlyStore.getState();
  return meetingsForDay(date, new Set(readDco(s.dco).cancelledCalendarIds));
}

/**
 * The day record for a day, from the store: meetings, set times from memory
 * and the thread, travel and where planning stops (lib/brief/dayRecord.ts).
 */
export function dayRecordFromStore(date: string): DayRecord {
  const s = useGremlyStore.getState();
  const { anchors, frame, cancelledCalendarIds } = readDco(s.dco);
  const meetings = meetingsForDay(date, new Set(cancelledCalendarIds));
  const meta = useTodayThread.getState().thread?.metadata_json as
    | (DayThreadMeta & { ritual_day?: string })
    | undefined;
  return buildDayRecord({
    today: date,
    frame,
    threadMeta: meta?.ritual_day === date ? meta : null,
    meetings,
    anchors,
  });
}

/** Save the picker's estimate as the item's duration, when it had none. */
export function saveEstimates(estimates: { id: string; kind: string; minutes: number }[]): void {
  const s = useGremlyStore.getState();
  for (const e of estimates) {
    if (e.kind === 'todo' && s.todos.some((t) => t.id === e.id && !t.time_estimate_minutes)) {
      void s.updateTodo(e.id, { time_estimate_minutes: e.minutes });
    } else if (
      e.kind === 'habit' &&
      s.habits.some((h) => h.id === e.id && !h.time_estimate_minutes)
    ) {
      void s.updateHabit(e.id, { time_estimate_minutes: e.minutes });
    }
  }
}

/**
 * What a planned start writes on its todo or habit: the time, and the block
 * that time falls in, so the two never disagree.
 */
export function plannedTimePatch(
  date: string,
  start: number,
): { daily_block: 'morning' | 'day' | 'evening'; scheduled_start_iso: string } {
  return { daily_block: blockFor(start), scheduled_start_iso: localMinutesToIso(date, start) };
}

function blockFor(start: number): 'morning' | 'day' | 'evening' {
  const b = getTimeBlockBoundaries(useGremlyStore.getState().timeBlockPreferences);
  const h = Math.floor(start / 60);
  if (h < b.morning.endHour) return 'morning';
  if (h < b.day.endHour) return 'day';
  return 'evening';
}

export interface LockResult {
  /** Titles of suggestions that became todos */
  created: string[];
  /** The items as placed (reach facts now carry their new todo ids) */
  items: PlanItem[];
}

export async function lockPlanItems(
  date: string,
  items: PlanItem[],
  earlier: PlanItem[],
): Promise<LockResult> {
  const store = useGremlyStore.getState();
  const created: string[] = [];
  const locked: PlanItem[] = [];

  for (const item of items) {
    let id = item.id;
    let kind: 'todo' | 'habit' = item.kind === 'habit' ? 'habit' : 'todo';
    if (item.kind === 'reach') {
      // a suggestion from what they said becomes a real todo only now
      const todo = await store.createTodo({
        name: item.title,
        due_day: date,
        time_estimate_minutes: item.minutes ?? item.end - item.start,
      } as any);
      id = todo.id;
      kind = 'todo';
      created.push(item.title);
    }
    const patch = plannedTimePatch(date, item.start);
    if (kind === 'habit') await store.updateHabit(id, patch);
    else await store.updateTodo(id, patch);
    locked.push({ ...item, id, kind });
  }

  // what an earlier plan placed and this one leaves out goes back to unplanned
  const keep = new Set(items.map((x) => x.id));
  for (const old of earlier) {
    if (keep.has(old.id) || old.kind === 'reach') continue;
    const clear = { daily_block: null, scheduled_start_iso: null };
    if (old.kind === 'habit') await store.updateHabit(old.id, clear);
    else await store.updateTodo(old.id, clear);
  }

  const s = useGremlyStore.getState();

  // the day's daily_briefs row, in time order within each block
  const seq = {
    morning: [] as SequencedItem[],
    day: [] as SequencedItem[],
    evening: [] as SequencedItem[],
  };
  for (const x of [...locked].sort((a, b) => a.start - b.start)) {
    seq[blockFor(x.start)].push({ id: x.id, type: x.kind === 'habit' ? 'habit' : 'todo' });
  }
  await s
    .saveBrief({
      date,
      morning_sequence: seq.morning,
      day_sequence: seq.day,
      evening_sequence: seq.evening,
      completed_at: nowTimestamp(),
    })
    .catch((err: unknown) => console.warn('[Plan] could not save the day', err));

  // feeding: 5% an item, three items a day across every plan said yes to
  await withFeedAnimation(() => s.creditPlanItems(locked.length)).catch(() => undefined);
  return { created, items: locked };
}
