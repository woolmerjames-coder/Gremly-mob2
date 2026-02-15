import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date';
import type { Todo, Habit, Note } from '../types';
import type { HabitProgressRow } from '../store/useGremlyStore';

// ─────────────────────────────────────────────────────────────────────────────
// Payload shape (matches Cloudflare Worker request schema)
// ─────────────────────────────────────────────────────────────────────────────

export interface WeeklySummaryPayload {
  userId: string;
  weekStartDate: string; // ISO date (Monday)
  weekEndDate: string; // ISO date (Sunday)

  stats: {
    todosCompleted: number;
    todosCreated: number;
    todosCompletedLastWeek: number;
    habitsTracked: Record<
      string,
      {
        targetDays: number;
        completedDays: boolean[]; // [Mon, Tue, ..., Sun]
      }
    >;
    journalEntries: number;
    lockIns: number;
    ideasCaptured: number;
    mindDropsCreated: number;
    mindDropsSwept: number;
  };

  completedTodos: Array<{
    title: string;
    completedAt: string;
    createdAt: string;
    dueDate?: string;
    wasOverdue: boolean;
  }>;

  staleItems: Array<{
    id: string;
    title: string;
    type: string;
    createdAt: string;
    lastTouchedAt: string;
  }>;

  spaceActivity: Array<{
    spaceName: string;
    itemCount: number;
    lastInteraction: string;
  }>;

  completionsByDay: Record<string, number>;
  completionsByTimeBlock: {
    morning: number;
    afternoon: number;
    evening: number;
  };

  upcomingEvents: Array<{
    title: string;
    date: string;
    startTime?: string;
    isAllDay: boolean;
    isRecurring: boolean;
    isUserCreated: boolean;
    hasGremlyInteraction: boolean;
    spaceId?: string;
    linkedTodoCount: number;
  }>;

  upcomingTodos: Array<{
    title: string;
    dueDate: string;
  }>;

  recentJournalExcerpts: Array<{
    excerpt: string;
    date: string;
  }>;

  recentNotesTitles: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ds = () => getDateService();

/** Compute the Monday YYYY-MM-DD for the week containing `today`. */
function getMonday(today: string): string {
  const date = ds().fromDateString(today);
  if (!date) return today;
  const dow = date.getDay(); // 0=Sun … 6=Sat
  const offset = dow === 0 ? -6 : 1 - dow; // Mon=0, Tue=-1, …, Sun=-6
  return ds().addDays(today, offset);
}

/** YYYY-MM-DD from an ISO-8601 timestamp (handles both date-only & full ISO). */
function dayFromTimestamp(ts: string): string {
  return ts.slice(0, 10);
}

/** Hour (0-23) from an ISO-8601 timestamp, local time. */
function hourFromTimestamp(ts: string): number {
  try {
    return new Date(ts).getHours();
  } catch {
    return 12; // fallback to noon
  }
}

/** Check if a YYYY-MM-DD string falls in [start, end] inclusive. */
function dayInRange(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}

/** Most-recent non-null ISO timestamp from a list. */
function latestTimestamp(...timestamps: (string | null | undefined)[]): string {
  let latest = '';
  for (const t of timestamps) {
    if (t && t > latest) latest = t;
  }
  return latest;
}

/** Display title for an item (prefers `title`, falls back to `name`). */
function itemTitle(item: { title?: string | null; name?: string }): string {
  return item.title?.trim() || item.name || '(untitled)';
}

// Day-of-week labels indexed Mon(0)→Sun(6) for `completionsByDay`.
const DAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** Map JS getDay (0=Sun) to our Mon-based index 0-6. */
function jsDayToMondayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildWeeklySummaryPayload(): WeeklySummaryPayload | null {
  const state = useGremlyStore.getState();

  if (!state.userId || !state.isInitialized) return null;

  // ── Week boundaries ────────────────────────────────────────────────────
  const today = ds().getCurrentDate(); // YYYY-MM-DD
  const weekStartDate = getMonday(today); // Monday
  const weekEndDate = ds().addDays(weekStartDate, 6); // Sunday

  const prevWeekStart = ds().addDays(weekStartDate, -7);
  const prevWeekEnd = ds().addDays(weekStartDate, -1);

  const nextWeekStart = ds().addDays(weekEndDate, 1);
  const nextWeekEnd = ds().addDays(nextWeekStart, 6);

  // ── Stale threshold (14 days ago) ──────────────────────────────────────
  const staleThreshold = ds().addDays(today, -14);

  // ── Raw data ───────────────────────────────────────────────────────────
  const todos: Todo[] = state.todos ?? [];
  const habits: Habit[] = state.habits ?? [];
  const habitProgress: HabitProgressRow[] = state.habitProgress ?? [];
  const notes: Note[] = state.notes ?? [];
  const spaces = state.spaces ?? [];
  const calendarEvents = state.calendarEvents ?? {};
  const userCalendarEvents = state.userCalendarEvents ?? [];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. Todos completed this week
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const completedThisWeek = todos.filter(
    (t) =>
      t.completed_at && dayInRange(dayFromTimestamp(t.completed_at), weekStartDate, weekEndDate),
  );

  // 2. Todos completed LAST week (for trend comparison)
  const completedLastWeek = todos.filter(
    (t) =>
      t.completed_at && dayInRange(dayFromTimestamp(t.completed_at), prevWeekStart, prevWeekEnd),
  );

  // 3. Todos created this week
  const todosCreatedThisWeek = todos.filter((t) =>
    dayInRange(dayFromTimestamp(t.created_at), weekStartDate, weekEndDate),
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. Habits tracked
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const activeStartHabits = habits.filter((h) => !h.archived && h.subtype === 'start_habit');

  // Build a lookup: habitId → Set<YYYY-MM-DD> of days with progress this week
  const progressByHabit = new Map<string, Set<string>>();
  for (const row of habitProgress) {
    if (dayInRange(row.occurred_day, weekStartDate, weekEndDate)) {
      const set = progressByHabit.get(row.habit_id) ?? new Set();
      set.add(row.occurred_day);
      progressByHabit.set(row.habit_id, set);
    }
  }

  const habitsTracked: Record<string, { targetDays: number; completedDays: boolean[] }> = {};

  for (const habit of activeStartHabits) {
    const daysSet = progressByHabit.get(habit.id) ?? new Set();

    // Build completedDays [Mon..Sun] – check if each day has progress
    const completedDays: boolean[] = [];
    for (let i = 0; i < 7; i++) {
      const dayStr = ds().addDays(weekStartDate, i);
      completedDays.push(daysSet.has(dayStr));
    }

    // targetDays: prefer days_active length, then target_per_period, default 7
    const targetDays = habit.days_active?.length ?? habit.target_per_period ?? 7;

    habitsTracked[itemTitle(habit)] = { targetDays, completedDays };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5-8. Counts
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const journalEntries = notes.filter(
    (n) =>
      n.subtype === 'journal' &&
      dayInRange(dayFromTimestamp(n.created_at), weekStartDate, weekEndDate),
  ).length;

  const ideasCaptured = notes.filter(
    (n) =>
      n.subtype === 'idea' &&
      dayInRange(dayFromTimestamp(n.created_at), weekStartDate, weekEndDate),
  ).length;

  // 6. Lock-ins: count todos + habits with locked_in_at within the week
  const lockIns =
    todos.filter(
      (t) =>
        t.locked_in_at && dayInRange(dayFromTimestamp(t.locked_in_at), weekStartDate, weekEndDate),
    ).length +
    habits.filter(
      (h) =>
        h.locked_in_at && dayInRange(dayFromTimestamp(h.locked_in_at), weekStartDate, weekEndDate),
    ).length;

  // 8. Mind Drops created / swept
  const allItemsThisWeek = [
    ...todosCreatedThisWeek.map((t) => ({
      dropId: t.drop_id,
      completedAt: t.completed_at,
      archived: t.archived,
      type: 'todo' as const,
    })),
    ...habits
      .filter((h) => dayInRange(dayFromTimestamp(h.created_at), weekStartDate, weekEndDate))
      .map((h) => ({
        dropId: h.drop_id,
        completedAt: h.last_completed_at ?? null,
        archived: h.archived,
        type: 'habit' as const,
      })),
    ...notes
      .filter((n) => dayInRange(dayFromTimestamp(n.created_at), weekStartDate, weekEndDate))
      .map((n) => ({
        dropId: n.drop_id,
        completedAt: null as string | null,
        archived: n.archived,
        type: 'note' as const,
      })),
  ];

  const mindDropItems = allItemsThisWeek.filter((i) => i.dropId != null);
  const mindDropsCreated = mindDropItems.length;
  // Swept = completed (for todos) or acted upon (non-archived habits/notes that exist)
  const mindDropsSwept = mindDropItems.filter(
    (i) =>
      i.completedAt != null ||
      (i.type === 'habit' && !i.archived) ||
      (i.type === 'note' && !i.archived),
  ).length;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 9. Completed todos detail
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const completedTodosDetail = completedThisWeek.map((t) => {
    const dueDate = t.due_date ?? t.due_day ?? undefined;
    const wasOverdue =
      !!dueDate && !!t.completed_at && dayFromTimestamp(dueDate) < dayFromTimestamp(t.completed_at);

    return {
      title: itemTitle(t),
      completedAt: t.completed_at!,
      createdAt: t.created_at,
      ...(dueDate ? { dueDate } : {}),
      wasOverdue,
    };
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 10. Stale items (active, untouched >14 days)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const staleTodos: WeeklySummaryPayload['staleItems'] = todos
    .filter((t) => !t.archived && !t.completed_at)
    .map((t) => {
      const lastTouched = latestTimestamp(t.updated_at, t.completed_at, t.locked_in_at);
      return {
        id: t.id,
        title: itemTitle(t),
        type: 'todo',
        createdAt: t.created_at,
        lastTouchedAt: lastTouched || t.created_at,
      };
    })
    .filter((i) => dayFromTimestamp(i.lastTouchedAt) < staleThreshold);

  const staleHabits = habits
    .filter((h) => !h.archived)
    .map((h) => {
      const lastTouched = latestTimestamp(h.updated_at, h.locked_in_at, h.last_checked_in_at);
      return {
        id: h.id,
        title: itemTitle(h),
        type: 'habit',
        createdAt: h.created_at,
        lastTouchedAt: lastTouched || h.created_at,
      };
    })
    .filter((i) => dayFromTimestamp(i.lastTouchedAt) < staleThreshold);

  const staleItems = [...staleTodos, ...staleHabits];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 11. Space activity
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const spaceActivity = spaces.map((space) => {
    const spaceItems = [
      ...todos.filter((t) => t.space_id === space.id && !t.archived),
      ...habits.filter((h) => h.space_id === space.id && !h.archived),
      ...notes.filter((n) => n.space_id === space.id && !n.archived),
    ];

    const lastInteraction = spaceItems.reduce((max, item) => {
      const ts = latestTimestamp(item.updated_at, item.created_at);
      return ts > max ? ts : max;
    }, space.created_at);

    return {
      spaceName: space.name,
      itemCount: spaceItems.length,
      lastInteraction,
    };
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 12. Completions by day
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const completionsByDay: Record<string, number> = {};
  for (const label of DAY_LABELS) completionsByDay[label] = 0;

  for (const t of completedThisWeek) {
    try {
      const d = new Date(t.completed_at!);
      const idx = jsDayToMondayIndex(d.getDay());
      completionsByDay[DAY_LABELS[idx]]++;
    } catch {
      // skip unparseable
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 13. Completions by time block
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const completionsByTimeBlock = { morning: 0, afternoon: 0, evening: 0 };

  for (const t of completedThisWeek) {
    const h = hourFromTimestamp(t.completed_at!);
    if (h >= 5 && h < 12) completionsByTimeBlock.morning++;
    else if (h >= 12 && h < 17) completionsByTimeBlock.afternoon++;
    else completionsByTimeBlock.evening++;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 14. Upcoming events (next week)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const upcomingEvents: WeeklySummaryPayload['upcomingEvents'] = [];

  // External calendar events for each day in next week
  for (let i = 0; i < 7; i++) {
    const dayStr = ds().addDays(nextWeekStart, i);
    const dayEvents = calendarEvents[dayStr] ?? [];
    for (const evt of dayEvents) {
      upcomingEvents.push({
        title: evt.title,
        date: dayStr,
        startTime: evt.isAllDay ? undefined : evt.startAt?.slice(11, 16),
        isAllDay: evt.isAllDay,
        isRecurring: false,
        isUserCreated: false,
        hasGremlyInteraction: false,
        linkedTodoCount: 0,
      });
    }
  }

  // User calendar events in next week
  for (const evt of userCalendarEvents) {
    if (dayInRange(evt.event_date, nextWeekStart, nextWeekEnd)) {
      upcomingEvents.push({
        title: evt.title,
        date: evt.event_date,
        startTime: evt.event_time ?? undefined,
        isAllDay: !evt.event_time,
        isRecurring: false,
        isUserCreated: true,
        hasGremlyInteraction: !!evt.space_id,
        spaceId: evt.space_id ?? undefined,
        linkedTodoCount: 0,
      });
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 15. Upcoming todos (due next week)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const upcomingTodos = todos
    .filter((t) => {
      if (t.archived || t.completed_at) return false;
      const due = t.due_date ?? t.due_day;
      return due && dayInRange(dayFromTimestamp(due), nextWeekStart, nextWeekEnd);
    })
    .map((t) => ({
      title: itemTitle(t),
      dueDate: dayFromTimestamp(t.due_date ?? t.due_day!),
    }));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 16. Recent journal excerpts (up to 5, this week, newest first)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const recentJournalExcerpts = notes
    .filter(
      (n) =>
        n.subtype === 'journal' &&
        dayInRange(dayFromTimestamp(n.created_at), weekStartDate, weekEndDate),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5)
    .map((n) => ({
      excerpt: (n.body ?? '').slice(0, 200),
      date: dayFromTimestamp(n.created_at),
    }));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 17. Recent notes titles (up to 10, non-journal, this week)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const recentNotesTitles = notes
    .filter(
      (n) =>
        n.subtype !== 'journal' &&
        dayInRange(dayFromTimestamp(n.created_at), weekStartDate, weekEndDate) &&
        n.title,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10)
    .map((n) => n.title!);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Assemble payload
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const payload: WeeklySummaryPayload = {
    userId: state.userId,
    weekStartDate,
    weekEndDate,

    stats: {
      todosCompleted: completedThisWeek.length,
      todosCreated: todosCreatedThisWeek.length,
      todosCompletedLastWeek: completedLastWeek.length,
      habitsTracked,
      journalEntries,
      lockIns,
      ideasCaptured,
      mindDropsCreated,
      mindDropsSwept,
    },

    completedTodos: completedTodosDetail,
    staleItems,
    spaceActivity,
    completionsByDay,
    completionsByTimeBlock,
    upcomingEvents,
    upcomingTodos,
    recentJournalExcerpts,
    recentNotesTitles,
  };

  console.log('[WeeklySummary] Payload built:', {
    todosCompleted: payload.stats.todosCompleted,
    todosCreated: payload.stats.todosCreated,
    todosCompletedLastWeek: payload.stats.todosCompletedLastWeek,
    habitsTracked: Object.keys(payload.stats.habitsTracked).length,
    journalEntries: payload.stats.journalEntries,
    lockIns: payload.stats.lockIns,
    ideasCaptured: payload.stats.ideasCaptured,
    mindDropsCreated: payload.stats.mindDropsCreated,
    mindDropsSwept: payload.stats.mindDropsSwept,
    staleItems: payload.staleItems.length,
    spaceActivity: payload.spaceActivity.length,
    upcomingEvents: payload.upcomingEvents.length,
    upcomingTodos: payload.upcomingTodos.length,
    recentJournalExcerpts: payload.recentJournalExcerpts.length,
    recentNotesTitles: payload.recentNotesTitles.length,
  });

  return payload;
}
