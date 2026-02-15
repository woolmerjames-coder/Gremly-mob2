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
    dueDate: string;
    ageDays: number;
    sweepRescheduleCount: number;
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

export async function buildWeeklySummaryPayload(): Promise<WeeklySummaryPayload | null> {
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

  // ── Stale / zombie thresholds ─────────────────────────────────────────
  const staleAgeThreshold = ds().addDays(today, -14); // Must be created 14+ days ago
  const recentDueCutoff = ds().addDays(today, -3); // due_date within last 3 days or today

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
      id: t.id,
      dropId: t.drop_id,
      completedAt: t.completed_at,
      archived: t.archived,
      type: 'todo' as const,
      dueDate: t.due_date ?? null,
      skippedInSweepAt: t.skipped_in_sweep_at ?? null,
      lastCheckedInAt: null as string | null,
      sweptAt: null as string | null,
      subtype: null as string | null,
    })),
    ...habits
      .filter((h) => dayInRange(dayFromTimestamp(h.created_at), weekStartDate, weekEndDate))
      .map((h) => ({
        id: h.id,
        dropId: h.drop_id,
        completedAt: h.last_completed_at ?? null,
        archived: h.archived,
        type: 'habit' as const,
        dueDate: null as string | null,
        skippedInSweepAt: null as string | null,
        lastCheckedInAt: h.last_checked_in_at ?? null,
        sweptAt: null as string | null,
        subtype: null as string | null,
      })),
    ...notes
      .filter((n) => dayInRange(dayFromTimestamp(n.created_at), weekStartDate, weekEndDate))
      .map((n) => ({
        id: n.id,
        dropId: n.drop_id,
        completedAt: null as string | null,
        archived: n.archived,
        type: 'note' as const,
        dueDate: null as string | null,
        skippedInSweepAt: n.skipped_in_sweep_at ?? null,
        lastCheckedInAt: null as string | null,
        sweptAt: n.swept_at ?? null,
        subtype: n.subtype as string | null,
      })),
  ];

  const mindDropItems = allItemsThisWeek.filter((i) => i.dropId != null);
  const mindDropsCreated = mindDropItems.length;
  // Swept/processed = user has made a decision on this mind drop
  const mindDropsSwept = mindDropItems.filter((i) => {
    // Archived = cleared in Sweep
    if (i.archived) return true;

    if (i.type === 'todo') {
      // Completed, scheduled (has due_date), or explicitly skipped in Sweep
      return i.completedAt != null || i.dueDate != null || i.skippedInSweepAt != null;
    }

    if (i.type === 'habit') {
      // Has any progress logged this week, or was checked in on
      const hasProgress = habitProgress.some(
        (p) =>
          p.habit_id === i.id && p.occurred_day >= weekStartDate && p.occurred_day <= weekEndDate,
      );
      return hasProgress || i.lastCheckedInAt != null;
    }

    if (i.type === 'note') {
      // Has been swept, or is a journal (intentional capture)
      return i.sweptAt != null || i.subtype === 'journal';
    }

    return false;
  }).length;

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

  // ═══════════════════════════════════════════════════════════════════
  // STALE / ZOMBIE ITEMS
  // Two signals for finding items the user keeps avoiding in Sweep:
  //
  // Signal 1 (primary): sweep_reschedule_count >= 7
  //   Item has been bumped 7+ times via "Tomorrow"/"Next Week" in Sweep.
  //   This is the strongest signal — it directly measures avoidance.
  //   Works for ANY item regardless of age.
  //
  // Signal 2 (secondary): created 14+ days ago AND due_date is today/recent
  //   The gap between creation and a perpetually-bumped due_date reveals
  //   items being pushed forward daily. Catches existing zombies while
  //   reschedule counts are still accumulating from zero.
  //
  // Signal 3 (tertiary): created 14+ days ago with NO due_date at all
  //   Floating items that were dropped in and never scheduled.
  //
  // Items with due_date far in the future are excluded — those are planned.
  // ═══════════════════════════════════════════════════════════════════
  const staleTodos = state.todos.filter((t) => {
    if (t.completed_at || t.archived) return false;

    const createdDate = t.created_at?.slice(0, 10) ?? '';
    const dueDate = t.due_date?.slice(0, 10) ?? '';
    const rescheduleCount = t.sweep_reschedule_count ?? 0;

    // Signal 1: Rescheduled 7+ times — zombie regardless of age
    if (rescheduleCount >= 7) return true;

    // Signal 2: Created 14+ days ago with due_date of today or recent (being bumped daily)
    if (createdDate && createdDate <= staleAgeThreshold) {
      if (dueDate && dueDate >= recentDueCutoff && dueDate <= today) return true;
    }

    // Signal 3: Created 14+ days ago with no due_date — just floating
    if (createdDate && createdDate <= staleAgeThreshold && !dueDate) return true;

    return false;
  });

  // For habits: stale = created 14+ days ago, active, no recent check-in
  const staleHabits = habits.filter((h) => {
    if (h.last_completed_at || h.archived) return false;
    if (h.subtype !== 'start_habit') return false;

    const createdDate = h.created_at?.slice(0, 10) ?? '';
    if (!createdDate || createdDate > staleAgeThreshold) return false;

    // No check-in in the last 14 days = abandoned habit
    const lastActivity = h.last_checked_in_at ?? h.updated_at ?? h.created_at ?? '';
    const lastActivityDate = lastActivity.slice(0, 10);
    return lastActivityDate <= staleAgeThreshold;
  });

  // Build the stale items array with all context the AI needs
  const staleItems = [
    ...staleTodos.map((t) => {
      const createdDate = t.created_at?.slice(0, 10) ?? '';
      const dueDate = t.due_date?.slice(0, 10) ?? '';
      const createdMs = new Date(createdDate).getTime();
      const todayMs = new Date(today).getTime();
      const ageDays = Math.round((todayMs - createdMs) / (1000 * 60 * 60 * 24));
      const rescheduleCount = t.sweep_reschedule_count ?? 0;

      return {
        id: t.id,
        title: t.title || t.name,
        type: 'todo' as const,
        createdAt: t.created_at ?? '',
        dueDate,
        ageDays,
        sweepRescheduleCount: rescheduleCount,
        lastTouchedAt: t.updated_at ?? t.created_at ?? '',
      };
    }),
    ...staleHabits.map((h) => {
      const createdDate = h.created_at?.slice(0, 10) ?? '';
      const createdMs = new Date(createdDate).getTime();
      const todayMs = new Date(today).getTime();
      const ageDays = Math.round((todayMs - createdMs) / (1000 * 60 * 60 * 24));

      return {
        id: h.id,
        title: h.name,
        type: 'habit' as const,
        createdAt: h.created_at ?? '',
        dueDate: '',
        ageDays,
        sweepRescheduleCount: 0,
        lastTouchedAt: h.last_checked_in_at ?? h.updated_at ?? h.created_at ?? '',
      };
    }),
  ]
    // Sort priority: highest reschedule count first, then oldest first
    .sort((a, b) => {
      if (b.sweepRescheduleCount !== a.sweepRescheduleCount) {
        return b.sweepRescheduleCount - a.sweepRescheduleCount;
      }
      return b.ageDays - a.ageDays;
    });

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

  // Fetch next week's calendar events (they may not be in memory yet)
  try {
    await useGremlyStore.getState().fetchCalendarEventsForRange(nextWeekStart, nextWeekEnd);
  } catch (err) {
    console.warn('[WeeklySummary] Failed to fetch next week calendar events:', err);
    // Non-blocking — continue with whatever's in the store
  }

  // Re-read state after calendar fetch since calendarEvents record may have been updated
  const freshState = useGremlyStore.getState();

  // External synced events (from calendar provider, now in memory)
  const externalEventsNextWeek: WeeklySummaryPayload['upcomingEvents'] = [];

  for (let d = 0; d < 7; d++) {
    const dateStr = ds().addDays(nextWeekStart, d);
    const dayEvents = (freshState.calendarEvents ?? {})[dateStr] ?? [];
    for (const ev of dayEvents) {
      externalEventsNextWeek.push({
        title: ev.title ?? 'Untitled',
        date: dateStr,
        startTime: ev.isAllDay
          ? undefined
          : (() => {
              if (!ev.startAt) return undefined;
              try {
                const userTz =
                  state.userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
                return new Date(ev.startAt).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                  timeZone: userTz,
                });
              } catch {
                return ev.startAt?.slice(11, 16); // Fallback to UTC
              }
            })(),
        isAllDay: ev.isAllDay ?? !ev.startAt,
        isRecurring: false,
        isUserCreated: false,
        hasGremlyInteraction: false,
        spaceId: undefined,
        linkedTodoCount: 0,
      });
    }
  }

  // User-created events (from calendar_events Supabase table)
  const userEventsNextWeek = (freshState.userCalendarEvents ?? [])
    .filter((e) => {
      const eventDate = e.event_date;
      return eventDate >= nextWeekStart && eventDate <= nextWeekEnd;
    })
    .map((e) => ({
      title: e.title ?? 'Untitled',
      date: e.event_date,
      startTime: e.event_time ?? undefined,
      isAllDay: !e.event_time,
      isRecurring: false,
      isUserCreated: true,
      hasGremlyInteraction: !!e.space_id,
      spaceId: e.space_id ?? undefined,
      linkedTodoCount: 0,
    }));

  const upcomingEvents = [...externalEventsNextWeek, ...userEventsNextWeek].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.startTime ?? '').localeCompare(b.startTime ?? '');
  });

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
