import { createSelector } from 'reselect';
import { useGremlyStore, type HabitProgressRow } from './useGremlyStore';
import type { Todo, Habit, Note, Space } from '../types';
import type { SweepCandidate, SweepCandidateTodo, SweepCandidateNote } from '../sweep/types';

// ═══════════════════════════════════════════════════════════════════════════════
// DATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get today's date as YYYY-MM-DD in local timezone */
function getTodayDayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Get start of current week (Sunday) as YYYY-MM-DD */
function getWeekStartDayString(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek);
  return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
}

/** Get N days ago as YYYY-MM-DD */
function getDaysAgoDayString(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Check if a date string is today */
function isToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return dateStr.startsWith(getTodayDayString());
}

/** Get day of week (0-6, Sunday = 0) from YYYY-MM-DD string */
function getDayOfWeek(dayString: string): number {
  const [year, month, day] = dayString.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

// ═══════════════════════════════════════════════════════════════════════════════
// BASE SELECTORS (access raw store data)
// ═══════════════════════════════════════════════════════════════════════════════

type GremlyState = ReturnType<typeof useGremlyStore.getState>;

const selectTodos = (state: GremlyState) => state.todos;
const selectHabits = (state: GremlyState) => state.habits;
const selectNotes = (state: GremlyState) => state.notes;
const selectSpaces = (state: GremlyState) => state.spaces;
const selectTags = (state: GremlyState) => state.tags;
const selectHabitProgress = (state: GremlyState) => state.habitProgress;
const selectSpaceChats = (state: GremlyState) => state.spaceChats;
const selectSpaceChatMessages = (state: GremlyState) => state.spaceChatMessages;
const selectMilestones = (state: GremlyState) => state.milestones;
const selectIsLoading = (state: GremlyState) => state.isLoading;
const selectIsInitialized = (state: GremlyState) => state.isInitialized;

// ═══════════════════════════════════════════════════════════════════════════════
// HABIT COMPLETION TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

/** Map of habitId -> completion count this week */
export const selectCompletionsThisWeek = createSelector(
  [selectHabitProgress],
  (progress): Map<string, number> => {
    const weekStart = getWeekStartDayString();
    const map = new Map<string, number>();

    for (const row of progress) {
      if (row.occurred_day >= weekStart) {
        map.set(row.habit_id, (map.get(row.habit_id) ?? 0) + row.count);
      }
    }
    return map;
  },
);

/** Map of habitId -> completion count this month */
export const selectCompletionsThisMonth = createSelector(
  [selectHabitProgress],
  (progress): Map<string, number> => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const map = new Map<string, number>();

    for (const row of progress) {
      if (row.occurred_day >= monthStart) {
        map.set(row.habit_id, (map.get(row.habit_id) ?? 0) + row.count);
      }
    }
    return map;
  },
);

/** Map of habitId -> Set of occurred_day strings this week */
export const selectCompletionDaysThisWeek = createSelector(
  [selectHabitProgress],
  (progress): Map<string, Set<string>> => {
    const weekStart = getWeekStartDayString();
    const map = new Map<string, Set<string>>();

    for (const row of progress) {
      if (row.occurred_day >= weekStart) {
        if (!map.has(row.habit_id)) {
          map.set(row.habit_id, new Set());
        }
        map.get(row.habit_id)!.add(row.occurred_day);
      }
    }
    return map;
  },
);

/** Check if habit was completed today */
export const selectHabitCompletedToday = createSelector(
  [selectHabitProgress],
  (progress): Set<string> => {
    const today = getTodayDayString();
    const set = new Set<string>();

    for (const row of progress) {
      if (row.occurred_day === today) {
        set.add(row.habit_id);
      }
    }
    return set;
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// HABIT DUE TODAY LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine if a habit is "due" or "available" today.
 *
 * Philosophy (ADHD-friendly):
 * - Scheduled habits: specific days_active array defines when it shows
 * - Flexible habits: show as available anytime they haven't hit weekly/monthly target
 * - No "overdue" shame - just "available to log"
 */
function isHabitDueToday(
  habit: Habit,
  completionsThisWeek: number,
  completionsThisMonth: number,
  completedToday: boolean,
): boolean {
  // Already completed today - not "due" anymore (but may show in completed section)
  if (completedToday) return false;

  // Archived habits don't show
  if (habit.archived) return false;

  const cadence = habit.cadence ?? 'daily';
  const targetPerPeriod = habit.target_per_period ?? 1;
  const daysActive = habit.days_active;

  switch (cadence) {
    case 'daily':
      // Daily habits are always due (unless completed today)
      return true;

    case 'weekly':
      // Option A: specific days mode (days_active array)
      if (daysActive && daysActive.length > 0) {
        const todayDayOfWeek = new Date().getDay();
        // days_active contains day numbers (0-6) or day names
        const isDayActive = daysActive.some((day) => {
          if (typeof day === 'number') return day === todayDayOfWeek;
          if (typeof day === 'string') {
            const dayNum = parseInt(day, 10);
            if (!isNaN(dayNum)) return dayNum === todayDayOfWeek;
            // Handle day names like 'monday', 'tuesday', etc.
            const dayNames = [
              'sunday',
              'monday',
              'tuesday',
              'wednesday',
              'thursday',
              'friday',
              'saturday',
            ];
            return dayNames[todayDayOfWeek]?.toLowerCase() === day.toLowerCase();
          }
          return false;
        });
        return isDayActive;
      }
      // Option B: flexible "X times per week" mode
      return completionsThisWeek < targetPerPeriod;

    case 'monthly':
      // Flexible monthly - show if haven't hit target this month
      return completionsThisMonth < targetPerPeriod;

    default:
      // Unknown cadence - default to showing it
      return true;
  }
}

/** All habits that are due/available today (not completed today, not archived) */
export const selectHabitsDueToday = createSelector(
  [selectHabits, selectCompletionsThisWeek, selectCompletionsThisMonth, selectHabitCompletedToday],
  (habits, weeklyCompletions, monthlyCompletions, completedTodaySet): Habit[] => {
    return habits.filter((habit) =>
      isHabitDueToday(
        habit,
        weeklyCompletions.get(habit.id) ?? 0,
        monthlyCompletions.get(habit.id) ?? 0,
        completedTodaySet.has(habit.id),
      ),
    );
  },
);

/** All habits completed today */
export const selectHabitsCompletedToday = createSelector(
  [selectHabits, selectHabitCompletedToday],
  (habits, completedTodaySet): Habit[] => {
    return habits.filter((habit) => completedTodaySet.has(habit.id) && !habit.archived);
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// TODO SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/** Active (non-archived, non-completed) todos */
export const selectActiveTodos = createSelector([selectTodos], (todos): Todo[] =>
  todos.filter((t) => !t.archived && !t.completed_at),
);

/** Todos due today (due_day = today, not completed, not archived) */
export const selectTodosDueToday = createSelector([selectActiveTodos], (todos): Todo[] => {
  const today = getTodayDayString();
  return todos.filter((t) => t.due_day === today);
});

/** Overdue todos (due_day < today, not completed, not archived) */
export const selectOverdueTodos = createSelector([selectActiveTodos], (todos): Todo[] => {
  const today = getTodayDayString();
  return todos.filter((t) => t.due_day && t.due_day < today);
});

/** Todos completed today */
export const selectTodosCompletedToday = createSelector([selectTodos], (todos): Todo[] => {
  const today = getTodayDayString();
  return todos.filter((t) => t.completed_at && t.completed_at.startsWith(today));
});

/** Todos with commitment = true (locked in) */
export const selectLockedTodos = createSelector([selectActiveTodos], (todos): Todo[] =>
  todos.filter((t) => t.commitment === true),
);

/** Undated todos (no due_day, for triage) */
export const selectUndatedTodos = createSelector([selectActiveTodos], (todos): Todo[] =>
  todos.filter((t) => !t.due_day),
);

/** Recent drops: undated todos created in last 3 days */
export const selectRecentDrops = createSelector([selectUndatedTodos], (todos): Todo[] => {
  const threeDaysAgo = getDaysAgoDayString(3);
  return todos.filter((t) => {
    const createdDay = t.created_at?.split('T')[0];
    return createdDay && createdDay >= threeDaysAgo;
  });
});

/** "So You Don't Forget" - undated todos 5+ days old */
export const selectForgottenTodos = createSelector([selectUndatedTodos], (todos): Todo[] => {
  const fiveDaysAgo = getDaysAgoDayString(5);
  return todos.filter((t) => {
    const createdDay = t.created_at?.split('T')[0];
    return createdDay && createdDay < fiveDaysAgo;
  });
});

/** Archived todos */
export const selectArchivedTodos = createSelector([selectTodos], (todos): Todo[] =>
  todos.filter((t) => t.archived === true),
);

// ═══════════════════════════════════════════════════════════════════════════════
// TODAY PAGE COMBINED SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/** Locked items for Today (todos + habits with commitment = true) */
export const selectTodayLockedItems = createSelector(
  [selectLockedTodos, selectHabitsDueToday],
  (lockedTodos, habitsDueToday): (Todo | Habit)[] => {
    const lockedHabits = habitsDueToday.filter((h) => h.commitment === true);
    return [...lockedTodos, ...lockedHabits];
  },
);

/** Active items for Today Focus (due today, not locked, not completed) */
export const selectTodayActiveItems = createSelector(
  [selectTodosDueToday, selectHabitsDueToday, selectLockedTodos],
  (todosDueToday, habitsDueToday, lockedTodos): (Todo | Habit)[] => {
    const lockedIds = new Set(lockedTodos.map((t) => t.id));

    // Todos due today that aren't locked
    const activeTodos = todosDueToday.filter((t) => !lockedIds.has(t.id));

    // Habits due today that aren't locked
    const activeHabits = habitsDueToday.filter((h) => h.commitment !== true);

    return [...activeTodos, ...activeHabits];
  },
);

/** All items completed today (todos + habits) */
export const selectTodayCompletedItems = createSelector(
  [selectTodosCompletedToday, selectHabitsCompletedToday],
  (completedTodos, completedHabits): (Todo | Habit)[] => {
    return [...completedTodos, ...completedHabits];
  },
);

/** Today progress stats */
export const selectTodayProgress = createSelector(
  [selectTodayLockedItems, selectTodayActiveItems, selectTodayCompletedItems],
  (locked, active, completed) => {
    const totalEligible = locked.length + active.length + completed.length;
    const completedCount = completed.length;
    const percent = totalEligible > 0 ? Math.round((completedCount / totalEligible) * 100) : 0;

    return {
      completedCount,
      totalEligible,
      percent,
      fraction: totalEligible > 0 ? completedCount / totalEligible : 0,
    };
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// SWEEP SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sweep candidates: todos that need attention
 * - Due today or overdue
 * - Undated (need triage)
 * - Not completed, not archived
 */
export const selectSweepCandidates = createSelector(
  [selectTodosDueToday, selectOverdueTodos, selectUndatedTodos],
  (dueToday, overdue, undated): Todo[] => {
    // Combine and dedupe
    const allIds = new Set<string>();
    const result: Todo[] = [];

    for (const todo of [...overdue, ...dueToday, ...undated]) {
      if (!allIds.has(todo.id)) {
        allIds.add(todo.id);
        result.push(todo);
      }
    }

    return result;
  },
);

/** Sweep candidate count (for pill badge) */
export const selectSweepCandidateCount = createSelector(
  [selectSweepCandidates],
  (candidates): number => candidates.length,
);

/** Ideas for sweep (notes with subtype='idea', created in last 7 days) */
export const selectSweepIdeas = createSelector([selectNotes], (notes): Note[] => {
  const sevenDaysAgo = getDaysAgoDayString(7);
  return notes.filter(
    (n) => n.subtype === 'idea' && !n.archived && n.created_at?.split('T')[0] >= sevenDaysAgo,
  );
});

/** General logs for sweep (notes with subtype='catchall', created today) */
export const selectSweepGeneralLogs = createSelector([selectNotes], (notes): Note[] => {
  const today = getTodayDayString();
  return notes.filter(
    (n) => n.subtype === 'catchall' && !n.archived && n.created_at?.startsWith(today),
  );
});

/**
 * Full SweepCandidate selector - transforms store todos + notes into SweepCandidate[]
 *
 * This selector replicates the filtering logic from fetchSweepCandidatesForUser
 * to enable Sweep to read from the Zustand store (single source of truth).
 *
 * Filtering rules:
 *
 * TODOS included if:
 * - Not archived
 * - Not completed
 * - Either: overdue, due today, OR undated (needs triage)
 * - Has skipped_in_sweep_at set (deferred from previous sweep)
 *
 * NOTES included if:
 * - Not archived
 * - subtype = 'idea' AND created within last 7 days
 * - OR subtype = 'general'/'catchall'/'list'/'reference' AND created today
 * - OR has skipped_in_sweep_at set (deferred from previous sweep)
 * - Exclude journals (subtype = 'journal')
 */
export const selectSweepCandidatesUnified = createSelector(
  [selectTodos, selectNotes],
  (todos, notes): SweepCandidate[] => {
    const today = getTodayDayString();
    const sevenDaysAgo = getDaysAgoDayString(7);
    const result: SweepCandidate[] = [];

    // Process todos
    for (const todo of todos) {
      // Skip archived or completed
      if (todo.archived || todo.completed_at) continue;

      const dueDay = todo.due_day;
      const isOverdue = dueDay ? dueDay < today : false;
      const isDueToday = dueDay === today;
      const isUndated = !dueDay;
      const isCreatedToday = todo.created_at?.startsWith(today) ?? false;
      const wasSkipped = !!todo.skipped_in_sweep_at;

      // Include if: overdue, due today, undated, OR previously skipped
      if (isOverdue || isDueToday || isUndated || wasSkipped) {
        result.push({
          id: todo.id,
          kind: 'todo',
          createdAt: todo.created_at,
          dropId: todo.drop_id ?? null,
          skippedInSweepAt: todo.skipped_in_sweep_at ?? null,
          isOverdue,
          isDueToday,
          isCreatedToday,
          raw: todo as any, // Cast to SweepTodoRow - store Todo matches DB row
        } satisfies SweepCandidateTodo);
      }
    }

    // Process notes
    for (const note of notes) {
      // Skip archived
      if (note.archived) continue;

      // Skip journals - they don't appear in sweep
      if (note.subtype === 'journal') continue;

      const createdDay = note.created_at?.split('T')[0];
      const isCreatedToday = createdDay === today;
      const wasSkipped = !!note.skipped_in_sweep_at;

      // Ideas: include if created within last 7 days OR skipped
      const isIdea = note.subtype === 'idea';
      const isRecentIdea = isIdea && createdDay && createdDay >= sevenDaysAgo;

      // General/catchall/list/reference: include if created today OR skipped
      // Note: 'general' is a LogSubtype but not NoteSubtype - in practice DB may have
      // 'general' entries but TypeScript types them as 'catchall'
      const isOtherSubtype =
        note.subtype === 'catchall' || note.subtype === 'list' || note.subtype === 'reference';
      const isTodayOther = isOtherSubtype && isCreatedToday;

      // Include if matches time criteria OR was skipped
      if (isRecentIdea || isTodayOther || wasSkipped) {
        result.push({
          id: note.id,
          kind: 'note',
          createdAt: note.created_at,
          dropId: note.drop_id ?? null,
          skippedInSweepAt: note.skipped_in_sweep_at ?? null,
          isOverdue: false, // Notes don't have due dates
          isDueToday: false,
          isCreatedToday,
          raw: note as any, // Cast to SweepNoteRow
          attachments: [], // Attachments loaded separately if needed
        } satisfies SweepCandidateNote);
      }
    }

    // Sort: overdue first, then due today, then notes, then by created_at desc
    result.sort((a, b) => {
      // Overdue todos first
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      // Due today second
      if (a.isDueToday && !b.isDueToday) return -1;
      if (!a.isDueToday && b.isDueToday) return 1;
      // Then by created_at ascending (oldest first for sweep review)
      return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
    });

    return result;
  },
);

/** Count of unified sweep candidates */
export const selectSweepCandidateCountUnified = createSelector(
  [selectSweepCandidatesUnified],
  (candidates): number => candidates.length,
);

// ═══════════════════════════════════════════════════════════════════════════════
// NOTE SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/** Active (non-archived) notes */
export const selectActiveNotes = createSelector([selectNotes], (notes): Note[] =>
  notes.filter((n) => !n.archived),
);

/** Journal entries (subtype = 'journal') */
export const selectJournals = createSelector([selectActiveNotes], (notes): Note[] =>
  notes.filter((n) => n.subtype === 'journal'),
);

/** Recent journals (last 7 days) */
export const selectRecentJournals = createSelector([selectJournals], (journals): Note[] => {
  const sevenDaysAgo = getDaysAgoDayString(7);
  return journals
    .filter((j) => j.created_at?.split('T')[0] >= sevenDaysAgo)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
});

/** Ideas (subtype = 'idea') */
export const selectIdeas = createSelector([selectActiveNotes], (notes): Note[] =>
  notes.filter((n) => n.subtype === 'idea'),
);

/** Forgotten ideas (7+ days old, no due conversion) */
export const selectForgottenIdeas = createSelector([selectIdeas], (ideas): Note[] => {
  const sevenDaysAgo = getDaysAgoDayString(7);
  return ideas.filter((i) => {
    const createdDay = i.created_at?.split('T')[0];
    return createdDay && createdDay < sevenDaysAgo;
  });
});

/** Your Notes for Today page - created today OR favorited, last 7 days */
export const selectYourNotes = createSelector([selectActiveNotes], (notes): Note[] => {
  const today = getTodayDayString();
  const sevenDaysAgo = getDaysAgoDayString(7);

  return notes.filter((n) => {
    const createdDay = n.created_at?.split('T')[0] ?? '';
    const isCreatedToday = createdDay === today;
    const isFavorite = n.is_favorite === true;
    const isRecent = createdDay >= sevenDaysAgo;

    return (isCreatedToday || isFavorite) && isRecent;
  });
});

/** Archived notes */
export const selectArchivedNotes = createSelector([selectNotes], (notes): Note[] =>
  notes.filter((n) => n.archived === true),
);

/** Logs count for today (journals, ideas, general notes created today) */
export const selectTodayLogsCount = createSelector([selectActiveNotes], (notes): number => {
  const today = getTodayDayString();
  return notes.filter(
    (n) =>
      ['journal', 'idea', 'general', 'catchall'].includes(n.subtype) &&
      n.created_at?.startsWith(today),
  ).length;
});

// ═══════════════════════════════════════════════════════════════════════════════
// SPACE SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/** Active (non-archived) spaces */
export const selectActiveSpaces = createSelector([selectSpaces], (spaces): Space[] =>
  spaces.filter((s) => !s.archived_at),
);

/** Get todos for a specific space */
export const selectTodosBySpace = createSelector(
  [selectActiveTodos, (_state: GremlyState, spaceId: string) => spaceId],
  (todos, spaceId): Todo[] => todos.filter((t) => t.space_id === spaceId),
);

/** Get habits for a specific space */
export const selectHabitsBySpace = createSelector(
  [selectHabits, (_state: GremlyState, spaceId: string) => spaceId],
  (habits, spaceId): Habit[] => habits.filter((h) => h.space_id === spaceId && !h.archived),
);

/** Get notes for a specific space */
export const selectNotesBySpace = createSelector(
  [selectActiveNotes, (_state: GremlyState, spaceId: string) => spaceId],
  (notes, spaceId): Note[] => notes.filter((n) => n.space_id === spaceId),
);

/** Get completed todos count for a space */
export const selectCompletedTodosCountBySpace = createSelector(
  [selectTodos, (_state: GremlyState, spaceId: string) => spaceId],
  (todos, spaceId): number => todos.filter((t) => t.space_id === spaceId && t.completed_at).length,
);

/** Spaces with item counts */
export const selectSpacesWithCounts = createSelector(
  [selectActiveSpaces, selectTodos, selectHabits, selectNotes],
  (spaces, todos, habits, notes) => {
    return spaces.map((space) => {
      const spaceTodos = todos.filter((t) => t.space_id === space.id && !t.archived);
      const spaceHabits = habits.filter((h) => h.space_id === space.id && !h.archived);
      const spaceNotes = notes.filter((n) => n.space_id === space.id && !n.archived);

      return {
        ...space,
        todoCount: spaceTodos.filter((t) => !t.completed_at).length,
        habitCount: spaceHabits.length,
        noteCount: spaceNotes.length,
        completedCount: spaceTodos.filter((t) => t.completed_at).length,
      };
    });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// TAG SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/** Popular tags with usage counts */
export const selectPopularTags = createSelector(
  [selectTodos, selectHabits, selectNotes, selectTags],
  (todos, habits, notes, tags) => {
    const tagCounts = new Map<string, number>();

    // Count tag usage across all entities
    const countTags = (items: { tags?: string[] | null }[]) => {
      for (const item of items) {
        if (item.tags) {
          for (const tag of item.tags) {
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
          }
        }
      }
    };

    countTags(todos);
    countTags(habits);
    countTags(notes);

    // Sort by count descending
    return Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/** Search across all items (todos, habits, notes) */
export const createSearchSelector = (
  query: string,
  filters?: { type?: string; spaceId?: string; tag?: string },
) =>
  createSelector(
    [selectTodos, selectHabits, selectNotes],
    (todos, habits, notes): (Todo | Habit | Note)[] => {
      const lowerQuery = query.toLowerCase().trim();
      if (!lowerQuery && !filters?.type && !filters?.spaceId && !filters?.tag) {
        return [];
      }

      const results: (Todo | Habit | Note)[] = [];

      const matchesQuery = (item: {
        name?: string | null;
        title?: string | null;
        body?: string | null;
      }) => {
        if (!lowerQuery) return true;
        const name = (item.name ?? '').toLowerCase();
        const title = (item.title ?? '').toLowerCase();
        const body = (item.body ?? '').toLowerCase();
        return name.includes(lowerQuery) || title.includes(lowerQuery) || body.includes(lowerQuery);
      };

      const matchesFilters = (item: {
        type: string;
        space_id?: string | null;
        tags?: string[] | null;
      }) => {
        if (filters?.type && item.type !== filters.type) return false;
        if (filters?.spaceId && item.space_id !== filters.spaceId) return false;
        if (filters?.tag && !item.tags?.includes(filters.tag)) return false;
        return true;
      };

      if (!filters?.type || filters.type === 'todo') {
        results.push(...todos.filter((t) => !t.archived && matchesQuery(t) && matchesFilters(t)));
      }
      if (!filters?.type || filters.type === 'habit') {
        results.push(...habits.filter((h) => !h.archived && matchesQuery(h) && matchesFilters(h)));
      }
      if (!filters?.type || filters.type === 'note') {
        results.push(...notes.filter((n) => !n.archived && matchesQuery(n) && matchesFilters(n)));
      }

      return results;
    },
  );

// ═══════════════════════════════════════════════════════════════════════════════
// ARCHIVED ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

/** All archived items across all types */
export const selectAllArchivedItems = createSelector(
  [selectArchivedTodos, selectArchivedNotes, selectHabits],
  (archivedTodos, archivedNotes, habits): (Todo | Habit | Note)[] => {
    const archivedHabits = habits.filter((h) => h.archived === true);
    return [...archivedTodos, ...archivedHabits, ...archivedNotes];
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// HUB SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/** All items combined (todos + habits + notes) for derived selectors */
export const selectAllItems = createSelector(
  [selectTodos, selectHabits, selectNotes],
  (todos, habits, notes): (Todo | Habit | Note)[] => [...todos, ...habits, ...notes],
);

/** Discovered people from linked_people field on items */
export interface DiscoveredPerson {
  id: string;
  name: string;
  itemCount: number;
}

export const selectDiscoveredPeople = createSelector(
  [selectAllItems],
  (items): DiscoveredPerson[] => {
    const peopleMap = new Map<string, DiscoveredPerson>();

    for (const item of items) {
      const linkedPeople = (item as { linked_people?: Array<{ id: string; name: string }> })
        .linked_people;
      if (!linkedPeople) continue;

      for (const person of linkedPeople) {
        if (!person?.id || !person?.name) continue;
        const existing = peopleMap.get(person.id);
        if (existing) {
          existing.itemCount++;
        } else {
          peopleMap.set(person.id, { id: person.id, name: person.name, itemCount: 1 });
        }
      }
    }

    return [...peopleMap.values()].sort((a, b) => b.itemCount - a.itemCount);
  },
);

/** Discovered lists from notes with has_list=true */
export interface DiscoveredList {
  id: string;
  name: string;
  type: 'shopping' | 'packing' | 'custom';
  incompleteCount: number;
  totalCount: number;
}

export const selectDiscoveredLists = createSelector([selectNotes], (notes): DiscoveredList[] => {
  const lists: DiscoveredList[] = [];

  for (const note of notes) {
    if (note.archived) continue;
    if (!note.has_list || !note.list_items) continue;

    const items = Array.isArray(note.list_items) ? note.list_items : [];
    const incompleteCount = items.filter(
      (i: { checked?: boolean; completed_at?: string }) => !i.checked && !i.completed_at,
    ).length;

    // Determine list type from subtype or tags
    let listType: 'shopping' | 'packing' | 'custom' = 'custom';
    if (note.tags?.includes('shopping')) listType = 'shopping';
    if (note.tags?.includes('packing')) listType = 'packing';

    lists.push({
      id: note.id,
      name: note.title || 'Untitled List',
      type: listType,
      incompleteCount,
      totalCount: items.length,
    });
  }

  return lists;
});

/** Hub filtered todos - active, sorted by updated_at desc */
export const selectHubTodos = createSelector([selectActiveTodos], (todos) =>
  [...todos].sort(
    (a, b) =>
      new Date(b.updated_at || b.created_at).getTime() -
      new Date(a.updated_at || a.created_at).getTime(),
  ),
);

/** Hub filtered habits - active, sorted by updated_at desc */
export const selectHubHabits = createSelector([selectHabits], (habits) =>
  habits
    .filter((h) => !h.archived)
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime(),
    ),
);

/** Hub journals - notes with subtype='journal', sorted by created_at desc */
export const selectHubJournals = createSelector([selectActiveNotes], (notes) =>
  notes
    .filter((n) => n.subtype === 'journal')
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
);

/** Hub notes - non-journal notes, sorted by updated_at desc */
export const selectHubNotes = createSelector([selectActiveNotes], (notes) =>
  notes
    .filter((n) => n.subtype !== 'journal')
    .sort((a, b) =>
      (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''),
    ),
);

/** Unsorted items - ai_placed = true, no space assigned */
export const selectUnsortedItems = createSelector([selectAllItems], (items) =>
  items.filter((item) => item.ai_placed === true && !item.space_id && !item.archived),
);

/** All active items combined (for Hub V1 overview) */
export const selectAllActiveItems = createSelector(
  [selectActiveTodos, selectHubHabits, selectActiveNotes],
  (todos, habits, notes): (Todo | Habit | Note)[] => [...todos, ...habits, ...notes],
);

// ═══════════════════════════════════════════════════════════════════════════════
// REACT HOOKS (convenience wrappers)
// ═══════════════════════════════════════════════════════════════════════════════

// These hooks use Zustand's useStore with selectors for automatic re-renders

export const useTodayTodos = () => useGremlyStore(selectTodosDueToday);
export const useTodayHabits = () => useGremlyStore(selectHabitsDueToday);
export const useLockedItems = () => useGremlyStore(selectTodayLockedItems);
export const useActiveItems = () => useGremlyStore(selectTodayActiveItems);
export const useCompletedToday = () => useGremlyStore(selectTodayCompletedItems);
export const useTodayProgress = () => useGremlyStore(selectTodayProgress);

export const useSweepCandidates = () => useGremlyStore(selectSweepCandidates);
export const useSweepCount = () => useGremlyStore(selectSweepCandidateCount);
export const useSweepCandidatesUnified = () => useGremlyStore(selectSweepCandidatesUnified);
export const useSweepCountUnified = () => useGremlyStore(selectSweepCandidateCountUnified);

export const useRecentDrops = () => useGremlyStore(selectRecentDrops);
export const useForgottenTodos = () => useGremlyStore(selectForgottenTodos);
export const useYourNotes = () => useGremlyStore(selectYourNotes);
export const useRecentJournals = () => useGremlyStore(selectRecentJournals);

export const useActiveSpaces = () => useGremlyStore(selectActiveSpaces);
export const useSpacesWithCounts = () => useGremlyStore(selectSpacesWithCounts);
export const usePopularTags = () => useGremlyStore(selectPopularTags);

export const useArchivedItems = () => useGremlyStore(selectAllArchivedItems);

export const useOverdueTodos = () => useGremlyStore(selectOverdueTodos);
export const useTodayLogsCount = () => useGremlyStore(selectTodayLogsCount);
export const useHabitsCompletedToday = () => useGremlyStore(selectHabitsCompletedToday);

// Parameterized hooks (renamed to avoid conflict with legacy hooks)
export const useSpaceTodosFromStore = (spaceId: string) =>
  useGremlyStore((state) => selectTodosBySpace(state, spaceId));
export const useSpaceHabitsFromStore = (spaceId: string) =>
  useGremlyStore((state) => selectHabitsBySpace(state, spaceId));
export const useSpaceNotesFromStore = (spaceId: string) =>
  useGremlyStore((state) => selectNotesBySpace(state, spaceId));

/** Grouped items by type for Space detail view */
export interface GroupedByType {
  habits: Habit[];
  todos: Todo[];
  notes: Note[];
}

/** Select items grouped by type for a space, with optional tag filtering */
export const selectSpaceItemsGrouped = (
  state: GremlyState,
  spaceId: string,
  tagNames?: string[],
): GroupedByType => {
  const todos = selectTodosBySpace(state, spaceId);
  const habits = selectHabitsBySpace(state, spaceId);
  const notes = selectNotesBySpace(state, spaceId);

  // Apply tag filtering if specified
  if (tagNames && tagNames.length > 0) {
    const filterByTags = <T extends { tags?: string[] | null }>(items: T[]): T[] =>
      items.filter((item) => {
        const itemTags = item.tags ?? [];
        return tagNames.some((tag) => itemTags.includes(tag));
      });

    return {
      habits: filterByTags(habits),
      todos: filterByTags(todos),
      notes: filterByTags(notes),
    };
  }

  return { habits, todos, notes };
};

export const useSpaceItemsGrouped = (spaceId: string, tagNames?: string[]) =>
  useGremlyStore((state) => selectSpaceItemsGrouped(state, spaceId, tagNames));

// Loading state
export const useIsLoading = () => useGremlyStore(selectIsLoading);
export const useIsInitialized = () => useGremlyStore(selectIsInitialized);

// Hub hooks
export const useHubTodos = () => useGremlyStore(selectHubTodos);
export const useHubHabits = () => useGremlyStore(selectHubHabits);
export const useHubJournals = () => useGremlyStore(selectHubJournals);
export const useHubNotes = () => useGremlyStore(selectHubNotes);
export const useDiscoveredPeople = () => useGremlyStore(selectDiscoveredPeople);
export const useDiscoveredLists = () => useGremlyStore(selectDiscoveredLists);
export const useUnsortedItems = () => useGremlyStore(selectUnsortedItems);
export const useAllActiveItemsHub = () => useGremlyStore(selectAllActiveItems);

// ═══════════════════════════════════════════════════════════════════════════════
// SPACE AGGREGATE SELECTORS (for SpaceHomeScreen)
// ═══════════════════════════════════════════════════════════════════════════════

/** Select a specific space by ID */
export const selectSpaceById = createSelector(
  [selectSpaces, (_state: GremlyState, spaceId: string) => spaceId],
  (spaces, spaceId): Space | null => spaces.find((s) => s.id === spaceId) ?? null,
);

/** Select all items for a space as AppRecord-compatible objects */
export const selectSpaceItems = createSelector(
  [
    selectTodosBySpace,
    selectHabitsBySpace,
    selectNotesBySpace,
    (_state: GremlyState, spaceId: string) => spaceId,
  ],
  (todos, habits, notes): (Todo | Habit | Note)[] => [...todos, ...habits, ...notes],
);

/** Select open (incomplete) todo count for a space */
export const selectSpaceOpenTodosCount = createSelector(
  [selectTodosBySpace],
  (todos): number => todos.filter((t) => !t.completed_at).length,
);

/** Select journal notes for a space */
export const selectSpaceJournals = createSelector([selectNotesBySpace], (notes): Note[] =>
  notes.filter((n) => n.subtype === 'journal'),
);

/** Select logs (non-journal, non-list notes) for a space */
export const selectSpaceLogs = createSelector([selectNotesBySpace], (notes): Note[] =>
  notes.filter((n) => n.subtype !== 'list' && n.subtype !== 'journal'),
);

/** Select lists for a space */
export const selectSpaceLists = createSelector([selectNotesBySpace], (notes): Note[] =>
  notes.filter((n) => n.subtype === 'list'),
);

// Space hooks
export const useSpaceById = (spaceId: string) =>
  useGremlyStore((state) => selectSpaceById(state, spaceId));
export const useSpaceItems = (spaceId: string) =>
  useGremlyStore((state) => selectSpaceItems(state, spaceId));
export const useSpaceOpenTodosCount = (spaceId: string) =>
  useGremlyStore((state) => selectSpaceOpenTodosCount(state, spaceId));
export const useSpaceJournals = (spaceId: string) =>
  useGremlyStore((state) => selectSpaceJournals(state, spaceId));
export const useSpaceLogs = (spaceId: string) =>
  useGremlyStore((state) => selectSpaceLogs(state, spaceId));
export const useSpaceLists = (spaceId: string) =>
  useGremlyStore((state) => selectSpaceLists(state, spaceId));

// ═══════════════════════════════════════════════════════════════════════════════
// ADDITIONAL SPACE SELECTORS (for full SpaceHomeScreen migration)
// ═══════════════════════════════════════════════════════════════════════════════

/** Pinned items in a space */
export const selectSpacePinnedItems = createSelector(
  [selectTodos, selectHabits, selectNotes, (_state: GremlyState, spaceId: string) => spaceId],
  (todos, habits, notes, spaceId) => {
    const pinnedTodos = todos.filter(
      (t) => t.space_id === spaceId && t.is_pinned && !t.archived_at,
    );
    const pinnedHabits = habits.filter((h) => h.space_id === spaceId && h.is_pinned && !h.archived);
    const pinnedNotes = notes.filter(
      (n) => n.space_id === spaceId && n.is_pinned && !n.archived_at,
    );
    return {
      todos: pinnedTodos,
      habits: pinnedHabits,
      notes: pinnedNotes,
      count: pinnedTodos.length + pinnedHabits.length + pinnedNotes.length,
    };
  },
);

export const useSpacePinnedItems = (spaceId: string) =>
  useGremlyStore((state) => selectSpacePinnedItems(state, spaceId));

/** Space notes count (active, not archived) */
export const selectSpaceNotesCount = createSelector(
  [selectNotes, (_state: GremlyState, spaceId: string) => spaceId],
  (notes, spaceId) => notes.filter((n) => n.space_id === spaceId && !n.archived_at).length,
);

export const useSpaceNotesCount = (spaceId: string) =>
  useGremlyStore((state) => selectSpaceNotesCount(state, spaceId));

/** Journal count for a space */
export const selectSpaceJournalCount = createSelector(
  [selectNotesBySpace],
  (notes): number => notes.filter((n) => n.subtype === 'journal').length,
);

export const useSpaceJournalCount = (spaceId: string) =>
  useGremlyStore((state) => selectSpaceJournalCount(state, spaceId));

// ═══════════════════════════════════════════════════════════════════════════════
// SPACE CHAT SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/** Chats for a specific space (active, not archived, sorted by updated_at) */
export const selectChatsForSpace = createSelector(
  [selectSpaceChats, (_state: GremlyState, spaceId: string) => spaceId],
  (chats, spaceId) =>
    chats
      .filter((c) => c.space_id === spaceId && !c.archived_at)
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')),
);

export const useSpaceChats = (spaceId: string) =>
  useGremlyStore((state) => selectChatsForSpace(state, spaceId));

/** Messages for a specific chat (sorted by created_at ascending) */
export const selectMessagesForChat = createSelector(
  [selectSpaceChatMessages, (_state: GremlyState, chatId: string) => chatId],
  (messages, chatId) =>
    messages
      .filter((m) => m.chat_id === chatId)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')),
);

export const useChatMessages = (chatId: string) =>
  useGremlyStore((state) => selectMessagesForChat(state, chatId));

/** Pinned chats for a space */
export const selectPinnedChatsForSpace = createSelector([selectChatsForSpace], (chats) =>
  chats.filter((c) => c.pinned),
);

export const useSpacePinnedChats = (spaceId: string) =>
  useGremlyStore((state) => selectPinnedChatsForSpace(state, spaceId));

// ═══════════════════════════════════════════════════════════════════════════════
// MILESTONE SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/** Active milestone for a space (not completed) */
export const selectSpaceMilestone = createSelector(
  [selectMilestones, (_state: GremlyState, spaceId: string) => spaceId],
  (milestones, spaceId) =>
    milestones.find((m) => m.space_id === spaceId && !m.completed_at && m.is_active) ?? null,
);

export const useSpaceMilestoneFromStore = (spaceId: string) =>
  useGremlyStore((state) => selectSpaceMilestone(state, spaceId));

/** Milestone countdown object with days, formatted date, and isPast flag */
export const selectMilestoneCountdown = createSelector(
  [selectSpaceMilestone],
  (milestone): { days: number | null; dateFormatted: string | null; isPast: boolean } => {
    if (!milestone?.date) {
      return { days: null, dateFormatted: null, isPast: false };
    }
    const target = new Date(milestone.date);
    const now = new Date();
    // Reset time to start of day for accurate day calculation
    target.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diffMs = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const isPast = diffDays < 0;

    // Format date as "Mon DD" or "Mon DD, YYYY" if different year
    const dateFormatted = target.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(target.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    });

    return { days: diffDays, dateFormatted, isPast };
  },
);

export const useMilestoneCountdown = (spaceId: string) =>
  useGremlyStore((state) => selectMilestoneCountdown(state, spaceId));

/** All milestones for a space (including completed) */
export const selectAllMilestonesForSpace = createSelector(
  [selectMilestones, (_state: GremlyState, spaceId: string) => spaceId],
  (milestones, spaceId) =>
    milestones
      .filter((m) => m.space_id === spaceId)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
);

export const useAllSpaceMilestones = (spaceId: string) =>
  useGremlyStore((state) => selectAllMilestonesForSpace(state, spaceId));

// ═══════════════════════════════════════════════════════════════════════════════
// ITEM LOOKUP SELECTORS (for Mind Drop / CatchAllNotepad)
// ═══════════════════════════════════════════════════════════════════════════════

/** Select any item by ID - searches todos, habits, notes */
export const selectItemById = createSelector(
  [selectTodos, selectHabits, selectNotes, (_state: GremlyState, id: string) => id],
  (todos, habits, notes, id): (Todo | Habit | Note) | null => {
    return (
      todos.find((t) => t.id === id) ??
      habits.find((h) => h.id === id) ??
      notes.find((n) => n.id === id) ??
      null
    );
  },
);

export const useItemById = (id: string) => useGremlyStore((state) => selectItemById(state, id));

/** Find note by source_message_id (for deduplication in Mind Drop) */
export const selectNoteBySourceMessageId = createSelector(
  [selectNotes, (_state: GremlyState, sourceMessageId: string) => sourceMessageId],
  (notes, sourceMessageId): Note | null => {
    return (
      notes.find(
        (n) => (n as unknown as Record<string, unknown>).source_message_id === sourceMessageId,
      ) ?? null
    );
  },
);

export const useNoteBySourceMessageId = (sourceMessageId: string) =>
  useGremlyStore((state) => selectNoteBySourceMessageId(state, sourceMessageId));

// ═══════════════════════════════════════════════════════════════════════════════
// RECENT ITEMS SELECTORS (for Mind Drop suggestions)
// ═══════════════════════════════════════════════════════════════════════════════

/** Recent notes (non-archived, sorted by created_at desc) */
export const selectRecentNotes = createSelector(
  [selectNotes, (_state: GremlyState, limit: number) => limit],
  (notes, limit) =>
    notes
      .filter((n) => !n.archived)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, limit),
);

export const useRecentNotes = (limit: number = 50) =>
  useGremlyStore((state) => selectRecentNotes(state, limit));

/** Recent todos (non-archived, sorted by created_at desc) */
export const selectRecentTodos = createSelector(
  [selectTodos, (_state: GremlyState, limit: number) => limit],
  (todos, limit) =>
    todos
      .filter((t) => !t.archived)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, limit),
);

export const useRecentTodos = (limit: number = 50) =>
  useGremlyStore((state) => selectRecentTodos(state, limit));

/** Recent habits (non-archived, sorted by created_at desc) */
export const selectRecentHabits = createSelector(
  [selectHabits, (_state: GremlyState, limit: number) => limit],
  (habits, limit) =>
    habits
      .filter((h) => !h.archived)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, limit),
);

export const useRecentHabits = (limit: number = 50) =>
  useGremlyStore((state) => selectRecentHabits(state, limit));

// ═══════════════════════════════════════════════════════════════════════════════
// SPACE NOTES SELECTOR
// ═══════════════════════════════════════════════════════════════════════════════

/** Notes for a specific space (non-archived, sorted by updated_at desc) */
export const selectSpaceNotes = createSelector(
  [selectNotes, (_state: GremlyState, spaceId: string | null | undefined) => spaceId],
  (notes, spaceId): Note[] => {
    if (!spaceId) return [];
    return notes
      .filter((n) => n.space_id === spaceId && !n.archived)
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  },
);

export const useSpaceNotesSelector = (spaceId: string | null | undefined) =>
  useGremlyStore((state) => selectSpaceNotes(state, spaceId));
