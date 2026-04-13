import { createSelector } from 'reselect';
import { useShallow } from 'zustand/react/shallow';
import { useGremlyStore, isHabitLockedIn, type HabitProgressRow } from './useGremlyStore';
import type { Todo, Habit, Note, Space, SpaceSuggestion, WeeklySummary } from '../types';
import type {
  SweepCandidate,
  SweepCandidateTodo,
  SweepCandidateNote,
  SweepCandidateHabit,
  SweepCardMeta,
  SweepAttachment,
} from '../sweep/types';
import type { SweepIntroItem, SweepIntroStats } from '../sweep/introStats';
import { computeSweepCardMeta } from '../sweep/computeSweepCardMeta';
import type { NowWeeklyHabitSummary, HabitWeeklyStatus } from '../now/nowTypes';
import { getDateService } from '../date';

// ═══════════════════════════════════════════════════════════════════════════════
// DATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

// Get DateService singleton - use this for all date operations
const ds = () => getDateService();

/** Get start of current week (Sunday) as YYYY-MM-DD */
function getWeekStartDayString(): string {
  const today = ds().getCurrentDate();
  const date = ds().fromDateString(today);
  if (!date) return today;
  const dayOfWeek = date.getDay(); // 0 = Sunday
  return ds().addDays(today, -dayOfWeek);
}

/** Get day of week (0-6, Sunday = 0) from YYYY-MM-DD string */
function getDayOfWeek(dayString: string): number {
  const [year, month, day] = dayString.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

/** Alias for ds().getCurrentDate() - used throughout selectors */
const getTodayDayString = () => ds().getCurrentDate();

/** Get N days ago as YYYY-MM-DD - alias for backward compatibility */
const getDaysAgoDayString = (days: number) => ds().addDays(ds().getCurrentDate(), -days);

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
const selectSpaceSuggestions = (state: GremlyState) => state.spaceSuggestions;
const selectHiddenTodayIds = (state: GremlyState) => state.hiddenTodayIds;

// Morning Brief capacity gate selectors
const selectBriefSelectedIds = (state: GremlyState) => state.briefSelectedIds;
const selectBriefLockedIds = (state: GremlyState) => state.briefLockedIds;
const selectBriefSelectionDate = (state: GremlyState) => state.briefSelectionDate;

/** Returns brief selections for a given date, with staleness check */
export const selectBriefSelectionsForDate = (date: string) =>
  createSelector(
    [selectBriefSelectedIds, selectBriefLockedIds, selectBriefSelectionDate],
    (
      selectedIds,
      lockedIds,
      selectionDate,
    ): {
      selectedIds: Set<string>;
      lockedIds: Set<string>;
      isStale: boolean;
    } => ({
      selectedIds: new Set(selectedIds),
      lockedIds: new Set(lockedIds),
      isStale: selectionDate !== date,
    }),
  );

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

/** Map of habitId -> most recent occurred_day string (for "last done" display) */
export const selectHabitLastCompletionDate = createSelector(
  [selectHabitProgress],
  (progress): Map<string, string> => {
    const map = new Map<string, string>();

    for (const row of progress) {
      const existing = map.get(row.habit_id);
      if (!existing || row.occurred_day > existing) {
        map.set(row.habit_id, row.occurred_day);
      }
    }
    return map;
  },
);

/** Check if habit was completed today */
export const selectHabitCompletedToday = createSelector(
  [selectHabitProgress],
  (progress): Set<string> => {
    const today = ds().getCurrentDate();
    const set = new Set<string>();

    for (const row of progress) {
      if (row.occurred_day === today) {
        set.add(row.habit_id);
      }
    }
    return set;
  },
);

/**
 * Selector: Is this specific habit completed TODAY?
 * Checks habitProgress array for an entry with today's date.
 *
 * This is the source of truth for checkbox state - ensures consistency
 * across all views (SpaceHome, Today's Focus, Habits sheet, etc.)
 *
 * @param state - Store state (or partial state with habitProgress)
 * @param habitId - The habit ID to check
 * @returns true if habit has a completion logged for today
 */
export const selectIsHabitDoneToday = (
  state: { habitProgress: Array<{ habit_id: string; occurred_day: string }> },
  habitId: string,
): boolean => {
  const todayDate = getTodayDayString();
  return state.habitProgress.some((p) => p.habit_id === habitId && p.occurred_day === todayDate);
};

/**
 * Hook version for components that need reactive updates.
 * Use this in components instead of calling selectIsHabitDoneToday directly.
 */
export const useIsHabitDoneToday = (habitId: string): boolean => {
  return useGremlyStore((state) => selectIsHabitDoneToday(state, habitId));
};

/**
 * Rolling 7-day completion counts (not calendar week)
 * Counts unique days with completions per habit in the last 7 days including today
 */
export const selectCompletionsInRolling7Days = createSelector(
  [selectHabitProgress],
  (progress): Map<string, number> => {
    const windowStartStr = ds().addDays(ds().getCurrentDate(), -6); // 7 days including today
    const seenDays = new Map<string, Set<string>>(); // Track unique days per habit

    for (const row of progress) {
      if (row.occurred_day >= windowStartStr) {
        const key = row.habit_id;
        if (!seenDays.has(key)) seenDays.set(key, new Set());
        seenDays.get(key)!.add(row.occurred_day);
      }
    }

    // Convert to count map
    const map = new Map<string, number>();
    for (const [habitId, days] of seenDays) {
      map.set(habitId, days.size);
    }

    return map;
  },
);

/**
 * Rolling 30-day completion counts
 * Counts unique days with completions per habit in the last 30 days including today
 */
export const selectCompletionsInRolling30Days = createSelector(
  [selectHabitProgress],
  (progress): Map<string, number> => {
    const windowStartStr = ds().addDays(ds().getCurrentDate(), -29); // 30 days including today
    const seenDays = new Map<string, Set<string>>();

    for (const row of progress) {
      if (row.occurred_day >= windowStartStr) {
        const key = row.habit_id;
        if (!seenDays.has(key)) seenDays.set(key, new Set());
        seenDays.get(key)!.add(row.occurred_day);
      }
    }

    const map = new Map<string, number>();
    for (const [habitId, days] of seenDays) {
      map.set(habitId, days.size);
    }

    return map;
  },
);

/**
 * Frequency habits available to add to Today
 * These are weekly/monthly habits that aren't already shown in due-today
 * Includes habits both at-goal and below-goal (user might want to get ahead)
 */
export const selectAvailableFrequencyHabits = createSelector(
  [
    selectHabits,
    selectCompletionsInRolling7Days,
    selectCompletionsInRolling30Days,
    selectHabitCompletedToday,
  ],
  (
    habits,
    rolling7,
    rolling30,
    completedTodaySet,
  ): Array<{
    habit: Habit;
    completions: number;
    target: number;
    periodLabel: string;
    isAtGoal: boolean;
  }> => {
    return habits
      .filter((h) => {
        if (h.archived) return false;
        // Already completed today - don't show in available section
        if (completedTodaySet.has(h.id)) return false;
        const cadence = h.cadence ?? 'daily';
        // Only frequency habits (not daily)
        return cadence === 'weekly' || cadence === 'monthly';
      })
      .map((h) => {
        const cadence = h.cadence ?? 'weekly';
        const target = h.target_per_period ?? 1;
        const completions =
          cadence === 'weekly' ? (rolling7.get(h.id) ?? 0) : (rolling30.get(h.id) ?? 0);
        const periodLabel = cadence === 'weekly' ? 'past 7d' : 'past 30d';

        return {
          habit: h,
          completions,
          target,
          periodLabel,
          isAtGoal: completions >= target,
        };
      });
  },
);

/**
 * Frequency habits that need urgent attention
 * Criteria: completions < target AND oldest completion rolls off tomorrow
 * These should auto-promote to Today's Focus
 */
export const selectUrgentFrequencyHabits = createSelector(
  [selectHabits, selectHabitProgress],
  (habits, progress): Habit[] => {
    const dateService = ds();
    const todayStr = dateService.getCurrentDate();
    const today = dateService.fromDateString(todayStr) ?? new Date(); // Date at noon local time

    return habits.filter((h) => {
      if (h.archived) return false;
      const cadence = h.cadence ?? 'daily';
      if (cadence === 'daily') return false; // Daily habits handled separately

      const target = h.target_per_period ?? 1;
      const windowDays = cadence === 'weekly' ? 7 : 30;

      // Get completions in current window
      const windowStart = new Date(today);
      windowStart.setDate(today.getDate() - windowDays + 1);
      const windowStartStr = dateService.toDateString(windowStart);

      const completions = progress.filter(
        (p) =>
          p.habit_id === h.id && p.occurred_day >= windowStartStr && p.occurred_day <= todayStr,
      );

      const uniqueDays = new Set(completions.map((c) => c.occurred_day)).size;

      // Not behind? Not urgent.
      if (uniqueDays >= target) return false;

      // Check if oldest completion rolls off tomorrow
      const sortedDays = [...new Set(completions.map((c) => c.occurred_day))].sort();
      if (sortedDays.length === 0) return true; // No completions and behind = urgent

      const oldestCompletion = sortedDays[0];
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const tomorrowWindowStart = new Date(tomorrow);
      tomorrowWindowStart.setDate(tomorrow.getDate() - windowDays + 1);
      const tomorrowWindowStartStr = dateService.toDateString(tomorrowWindowStart);

      // If oldest completion would be outside tomorrow's window, it's urgent
      return oldestCompletion < tomorrowWindowStartStr;
    });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// HABIT DUE TODAY LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine if a habit is "due" or "available" today.
 *
 * Philosophy (calm by design):
 * - Scheduled habits: specific days_active array defines when it shows
 * - Flexible habits: show as available anytime they haven't hit weekly/monthly target
 * - No "overdue" shame - just "available to log"
 *
 * Requirements:
 * - Must have start_date set (habits without start_date should only appear in Sweep)
 * - start_date must be today or in the past
 * - end_date (if set) must be today or in the future
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

  // Must have a start_date to appear on Today page
  // Habits without start_date should only appear in Sweep to prompt user to set one
  if (!habit.start_date) return false;

  const today = getTodayDayString();

  // start_date must be today or in the past
  if (habit.start_date > today) return false;

  // end_date (if set) must be today or in the future
  if (habit.end_date && habit.end_date < today) return false;

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
          // Legacy string support (should not occur with new data)
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
            return dayNames[todayDayOfWeek]?.toLowerCase() === (day as string).toLowerCase();
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

/** All habits that are due/available today (not completed today, not archived, not hidden) */
export const selectHabitsDueToday = createSelector(
  [
    selectHabits,
    selectCompletionsThisWeek,
    selectCompletionsThisMonth,
    selectHabitCompletedToday,
    selectHiddenTodayIds,
  ],
  (habits, weeklyCompletions, monthlyCompletions, completedTodaySet, hiddenIds): Habit[] => {
    return habits.filter((habit) => {
      if (hiddenIds.includes(habit.id)) return false;
      return isHabitDueToday(
        habit,
        weeklyCompletions.get(habit.id) ?? 0,
        monthlyCompletions.get(habit.id) ?? 0,
        completedTodaySet.has(habit.id),
      );
    });
  },
);

/** All habits completed today */
export const selectHabitsCompletedToday = createSelector(
  [selectHabits, selectHabitCompletedToday],
  (habits, completedTodaySet): Habit[] => {
    return habits.filter((habit) => completedTodaySet.has(habit.id) && !habit.archived);
  },
);

/**
 * Habits that need start date confirmation in Sweep.
 * An unconfirmed habit is one where:
 * - archived !== true
 * - start_date is not set (null/undefined)
 * - start_date_confirmed !== true (either false, null, or undefined)
 */
export const selectUnconfirmedHabits = createSelector([selectHabits], (habits): Habit[] =>
  habits.filter((h) => !h.archived && !h.start_date && h.start_date_confirmed !== true),
);

// ═══════════════════════════════════════════════════════════════════════════════
// TODO SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/** Active (non-archived, non-completed) todos */
export const selectActiveTodos = createSelector([selectTodos], (todos): Todo[] =>
  todos.filter((t) => !t.archived && !t.completed_at),
);

/** Todos due today (due_day = today, not completed, not archived, not hidden) */
export const selectTodosDueToday = createSelector(
  [selectActiveTodos, selectHiddenTodayIds],
  (todos, hiddenIds): Todo[] => {
    const today = getTodayDayString();
    return todos.filter((t) => t.due_day === today && !hiddenIds.includes(t.id));
  },
);

/** Overdue todos (due_day < today, not completed, not archived) */
export const selectOverdueTodos = createSelector([selectActiveTodos], (todos): Todo[] => {
  const today = getTodayDayString();
  const result = todos.filter((t) => {
    if (!t.due_day || t.due_day >= today) return false;
    // Check if skipped today
    const skippedDay = ds().extractDateFromIso(t.skipped_in_sweep_at);
    if (skippedDay === today) {
      console.log(
        '[selectOverdueTodos] Excluding skipped item:',
        t.name,
        'skipped_in_sweep_at:',
        t.skipped_in_sweep_at,
      );
      return false;
    }
    return true;
  });
  console.log('[selectOverdueTodos] Returning', result.length, 'items. Today:', today);
  return result;
});

/** Rolled over todos - alias for overdue (for Mini-Sweep clarity) */
export const selectRolledOverTodos = selectOverdueTodos;

/** Unscheduled todos for Mini-Sweep: no due_day, created in last 3 days, not skipped today */
export const selectUnscheduledTodosForMiniSweep = createSelector(
  [selectActiveTodos],
  (todos): Todo[] => {
    const today = getTodayDayString();
    const threeDaysAgo = getDaysAgoDayString(3);
    const result = todos.filter((t) => {
      if (t.due_day) return false; // Must be unscheduled
      const createdDay = ds().extractDateFromIso(t.created_at);
      if (!createdDay || createdDay < threeDaysAgo) return false;
      // Check if skipped today
      const skippedDay = ds().extractDateFromIso(t.skipped_in_sweep_at);
      if (skippedDay === today) {
        console.log(
          '[selectUnscheduledTodosForMiniSweep] Excluding skipped item:',
          t.name,
          'skipped_in_sweep_at:',
          t.skipped_in_sweep_at,
        );
        return false;
      }
      return true;
    });
    console.log(
      '[selectUnscheduledTodosForMiniSweep] Returning',
      result.length,
      'items. Today:',
      today,
    );
    return result;
  },
);

/** Todos completed today */
export const selectTodosCompletedToday = createSelector([selectTodos], (todos): Todo[] => {
  return todos.filter((t) => t.completed_at && ds().isTimestampToday(t.completed_at));
});

/** Todos with commitment = true (locked in) AND due today - excludes completed and hidden */
export const selectLockedTodos = createSelector(
  [selectActiveTodos, selectHiddenTodayIds],
  (todos, hiddenIds): Todo[] => {
    const today = getTodayDayString();
    return todos.filter(
      (t) => t.commitment === true && t.due_day === today && !hiddenIds.includes(t.id),
    );
  },
);

/** Todos with commitment = true (locked in) AND due today - includes completed for sweep celebration */
export const selectLockedTodosIncludingCompleted = createSelector(
  [selectTodos],
  (todos): Todo[] => {
    const today = getTodayDayString();
    return todos.filter((t) => t.commitment === true && !t.archived && t.due_day === today);
  },
);

/** Undated todos (no due_day, for triage) */
export const selectUndatedTodos = createSelector([selectActiveTodos], (todos): Todo[] =>
  todos.filter((t) => !t.due_day),
);

/** Recent drops: undated todos created in last 3 days */
export const selectRecentDrops = createSelector([selectUndatedTodos], (todos): Todo[] => {
  const today = getTodayDayString();
  const threeDaysAgo = getDaysAgoDayString(3);
  return todos.filter((t) => {
    const createdDay = ds().extractDateFromIso(t.created_at);
    if (!createdDay || createdDay < threeDaysAgo) return false;
    // Exclude if skipped today
    const skippedDay = ds().extractDateFromIso(t.skipped_in_sweep_at);
    if (skippedDay === today) return false;
    return true;
  });
});

/** "So You Don't Forget" - undated todos 5+ days old */
export const selectForgottenTodos = createSelector([selectUndatedTodos], (todos): Todo[] => {
  const fiveDaysAgo = getDaysAgoDayString(5);
  return todos.filter((t) => {
    const createdDay = ds().extractDateFromIso(t.created_at);
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

/** Locked items for Today (todos with commitment = true, habits with valid commitment_until) - excludes completed */
export const selectTodayLockedItems = createSelector(
  [selectLockedTodos, selectHabitsDueToday],
  (lockedTodos, habitsDueToday): (Todo | Habit)[] => {
    const lockedHabits = habitsDueToday.filter((h) => isHabitLockedIn(h));
    return [...lockedTodos, ...lockedHabits];
  },
);

/** Locked items including completed - for Sweep celebration (todos with commitment = true, habits with valid commitment_until) */
export const selectTodayLockedItemsIncludingCompleted = createSelector(
  [selectLockedTodosIncludingCompleted, selectHabits],
  (lockedTodos, habits): (Todo | Habit)[] => {
    // Include locked habits that are active (not archived), even if completed today
    const lockedHabits = habits.filter((h) => isHabitLockedIn(h) && !h.archived);
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
    const activeHabits = habitsDueToday.filter((h) => !isHabitLockedIn(h));

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
  return notes.filter((n) => {
    const createdDay = ds().extractDateFromIso(n.created_at);
    return n.subtype === 'idea' && !n.archived && createdDay && createdDay >= sevenDaysAgo;
  });
});

/** General logs for sweep (notes with subtype='catchall', created today) */
export const selectSweepGeneralLogs = createSelector([selectNotes], (notes): Note[] => {
  return notes.filter(
    (n) => n.subtype === 'catchall' && !n.archived && ds().isTimestampToday(n.created_at),
  );
});

/**
 * Unified sweep candidates with pre-computed display metadata.
 * Includes todos (overdue, due today, undated), notes (ideas, general),
 * and habits that need start date confirmation.
 *
 * Sort order:
 * 1. Locked-in items first (todos: commitment = true, habits: valid commitment_until)
 * 2. Overdue todos
 * 3. Due today todos
 * 4. Unconfirmed habits
 * 5. Everything else by createdAt ascending
 */
export const selectSweepCandidatesUnified = createSelector(
  [selectTodos, selectNotes, selectUnconfirmedHabits, selectSpaces],
  (
    todos,
    notes,
    unconfirmedHabits,
    spaces,
  ): Array<{ candidate: SweepCandidate; meta: SweepCardMeta }> => {
    console.log('[SweepSelector] Running selectSweepCandidatesUnified');
    const today = getTodayDayString();
    const sevenDaysAgo = getDaysAgoDayString(7);
    const candidates: SweepCandidate[] = [];

    // Process todos
    for (const todo of todos) {
      // Skip locked-in items - handled in Lock-In Checkpoint
      if (todo.commitment === true) {
        console.log('[SweepSelector] Filtered out locked-in todo:', {
          id: todo.id.slice(0, 8),
          name: todo.name?.slice(0, 20),
        });
        continue;
      }

      if (todo.archived || todo.completed_at) {
        console.log('[SweepSelector] Filtered out todo:', {
          id: todo.id.slice(0, 8),
          name: todo.name?.slice(0, 20),
          archived: todo.archived,
          completed_at: !!todo.completed_at,
        });
        continue;
      }

      // Check resurface date first - if set for the future, skip entirely
      const resurfaceAt = (todo as any).resurface_at;
      const hasFutureResurface = resurfaceAt && resurfaceAt > today;
      if (hasFutureResurface) {
        console.log('[SweepSelector] Filtered out todo with future resurface:', {
          id: todo.id.slice(0, 8),
          name: todo.name?.slice(0, 20),
          resurface_at: resurfaceAt,
        });
        continue;
      }

      const dueDay = todo.due_day;
      const isOverdue = dueDay ? dueDay < today : false;
      const isDueToday = dueDay === today;
      const isUndated = !dueDay;
      const isCreatedToday = ds().isTimestampToday(todo.created_at);
      const wasSkipped = !!todo.skipped_in_sweep_at;

      // Check if todo should resurface today (remind me later)
      const shouldResurface = resurfaceAt && resurfaceAt <= today;

      if (shouldResurface) {
        console.log('[SweepSelector] Including resurfacing todo:', {
          id: todo.id.slice(0, 8),
          name: todo.name,
          resurface_at: resurfaceAt,
        });
      }

      if (isOverdue || isDueToday || isUndated || wasSkipped || shouldResurface) {
        candidates.push({
          id: todo.id,
          kind: 'todo',
          createdAt: todo.created_at,
          dropId: todo.drop_id ?? null,
          skippedInSweepAt: todo.skipped_in_sweep_at ?? null,
          isOverdue,
          isDueToday,
          isCreatedToday,
          raw: todo as any,
        } satisfies SweepCandidateTodo);
      }
    }

    // Process notes
    for (const note of notes) {
      if (note.archived) continue;
      if (note.subtype === 'journal') continue;

      const resurfaceAt = (note as any).resurface_at;
      const sweptAt = (note as any).swept_at;

      // Skip notes with FUTURE resurface date (not time yet)
      if (resurfaceAt && resurfaceAt > today) {
        console.log('[SweepSelector] Filtered out note with future resurface:', {
          id: note.id.slice(0, 8),
          title: note.title?.slice(0, 20),
          resurface_at: resurfaceAt,
        });
        continue;
      }

      // Check if note should resurface TODAY (remind me later)
      const shouldResurface = resurfaceAt && resurfaceAt <= today;

      // Skip notes that were swept, UNLESS they should resurface or were skipped
      if (sweptAt && !shouldResurface && !note.skipped_in_sweep_at) {
        console.log('[SweepSelector] Filtered out swept note:', {
          id: note.id.slice(0, 8),
          title: note.title?.slice(0, 20),
          swept_at: sweptAt,
        });
        continue;
      }

      const createdDay = ds().extractDateFromIso(note.created_at);
      const isCreatedToday = createdDay === today;
      const wasSkipped = !!note.skipped_in_sweep_at;

      const isIdea = note.subtype === 'idea';
      const isRecentIdea = isIdea && createdDay && createdDay >= sevenDaysAgo;

      // Include catchall, list, reference subtypes created today
      // Note: 'general' LogSubtype maps to 'catchall' in the database
      const isOtherSubtype =
        note.subtype === 'catchall' || note.subtype === 'list' || note.subtype === 'reference';
      const isTodayOther = isOtherSubtype && isCreatedToday;

      if (isRecentIdea || isTodayOther || wasSkipped || shouldResurface) {
        // Extract log_photos from note (joined in useGremlyStore.initialize)
        const logPhotos = (note as any).log_photos;
        const attachments: SweepAttachment[] = Array.isArray(logPhotos)
          ? logPhotos.map((p: any) => ({ id: p.id, url: p.url, position: p.position }))
          : [];

        candidates.push({
          id: note.id,
          kind: 'note',
          createdAt: note.created_at,
          dropId: note.drop_id ?? null,
          skippedInSweepAt: note.skipped_in_sweep_at ?? null,
          isOverdue: false,
          isDueToday: false,
          isCreatedToday,
          isEventToday: false,
          isEventPassed: false,
          daysUntilEvent: null,
          raw: note as any,
          attachments,
        } satisfies SweepCandidateNote);
      }
    }

    // Process unconfirmed habits
    for (const habit of unconfirmedHabits) {
      // Skip locked-in habits - handled in Lock-In Checkpoint
      if (isHabitLockedIn(habit)) {
        console.log('[SweepSelector] Filtered out locked-in habit:', {
          id: habit.id.slice(0, 8),
          name: habit.name?.slice(0, 20),
        });
        continue;
      }

      const isCreatedToday = ds().isTimestampToday(habit.created_at);
      candidates.push({
        id: habit.id,
        kind: 'habit',
        createdAt: habit.created_at ?? '',
        dropId: null,
        skippedInSweepAt: null,
        isOverdue: false,
        isDueToday: false,
        isCreatedToday,
        raw: habit as any,
      } satisfies SweepCandidateHabit);
    }

    // Compute meta for each candidate
    const withMeta = candidates.map((candidate) => ({
      candidate,
      meta: computeSweepCardMeta(candidate, spaces),
    }));

    // Sort: overdue → due today → other todos → habits → notes
    // Within each group, sort by createdAt ascending (oldest first)
    withMeta.sort((a, b) => {
      const aKind = a.candidate.kind;
      const bKind = b.candidate.kind;

      // 1. Locked-in items surface first (within their type)
      if (a.meta.isLockedIn && !b.meta.isLockedIn) return -1;
      if (!a.meta.isLockedIn && b.meta.isLockedIn) return 1;

      // 2. Overdue todos first
      if (a.candidate.isOverdue && !b.candidate.isOverdue) return -1;
      if (!a.candidate.isOverdue && b.candidate.isOverdue) return 1;

      // 3. Due today todos next
      if (a.candidate.isDueToday && !b.candidate.isDueToday) return -1;
      if (!a.candidate.isDueToday && b.candidate.isDueToday) return 1;

      // 4. Group by kind: todos → habits → notes
      const kindOrder = { todo: 0, habit: 1, note: 2 };
      const aOrder = kindOrder[aKind] ?? 2;
      const bOrder = kindOrder[bKind] ?? 2;
      if (aOrder !== bOrder) return aOrder - bOrder;

      // 5. Within same kind, sort by createdAt ascending (oldest first)
      return (a.candidate.createdAt ?? '').localeCompare(b.candidate.createdAt ?? '');
    });

    return withMeta;
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
    .filter((j) => {
      const createdDay = ds().extractDateFromIso(j.created_at);
      return createdDay && createdDay >= sevenDaysAgo;
    })
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
    const createdDay = ds().extractDateFromIso(i.created_at);
    return createdDay && createdDay < sevenDaysAgo;
  });
});

/** Your Notes for Today page - all notes from past 7 days except catchall */
export const selectYourNotes = createSelector([selectActiveNotes], (notes): Note[] => {
  const sevenDaysAgo = getDaysAgoDayString(7);

  return notes.filter((n) => {
    const createdDay = ds().extractDateFromIso(n.created_at) ?? '';
    const isRecent = createdDay >= sevenDaysAgo;
    const isNotCatchall = n.subtype !== 'catchall';
    return isRecent && isNotCatchall;
  });
});

/** Archived notes */
export const selectArchivedNotes = createSelector([selectNotes], (notes): Note[] =>
  notes.filter((n) => n.archived === true),
);

/** Logs count for today (journals, ideas, general notes created today) */
export const selectTodayLogsCount = createSelector([selectActiveNotes], (notes): number => {
  return notes.filter(
    (n) =>
      ['journal', 'idea', 'general', 'catchall'].includes(n.subtype) &&
      ds().isTimestampToday(n.created_at),
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

/** Get COMPLETED todos for a specific space (for CompletedInSpaceOverlay) */
export const selectSpaceCompletedTodos = createSelector(
  [selectTodos, (_state: GremlyState, spaceId: string) => spaceId],
  (todos, spaceId): Todo[] =>
    todos
      .filter((t) => t.space_id === spaceId && t.completed_at && !t.archived)
      .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
);

/** Get INCOMPLETE todos for a specific space */
export const selectSpaceIncompleteTodos = createSelector(
  [selectTodos, (_state: GremlyState, spaceId: string) => spaceId],
  (todos, spaceId): Todo[] =>
    todos.filter((t) => t.space_id === spaceId && !t.completed_at && !t.archived),
);

/** Get ALL todos for a specific space (both complete and incomplete) */
export const selectAllTodosForSpace = createSelector(
  [selectTodos, (_state: GremlyState, spaceId: string) => spaceId],
  (todos, spaceId): Todo[] => todos.filter((t) => t.space_id === spaceId && !t.archived),
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

/** Discovered people from views.people field on items (Phase 2 enrichment) */
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
      // People names live in views.people as string[] (from Phase 2 enrichment)
      const views = (item as { views?: { people?: string[]; [key: string]: any } }).views;
      const peopleNames = views?.people;
      if (!peopleNames || !Array.isArray(peopleNames)) continue;

      for (const personName of peopleNames) {
        if (!personName || typeof personName !== 'string') continue;
        const key = personName.toLowerCase().trim();
        const existing = peopleMap.get(key);
        if (existing) {
          existing.itemCount++;
        } else {
          peopleMap.set(key, { id: key, name: personName, itemCount: 1 });
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

/**
 * Compute habit weekly status for NowWeeklyHabitSummary
 * Logic from nowSelectors.ts getHabitWeeklyStatus
 */
function computeHabitWeeklyStatus(habit: Habit, completionsThisWeek: number): HabitWeeklyStatus {
  const cadence = habit.cadence ?? 'daily';
  const target = habit.target_per_period ?? (cadence === 'daily' ? 7 : 1);
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday
  const daysRemaining = 7 - dayOfWeek; // days left including today

  // Weekly target for status calculation
  const weeklyTarget = cadence === 'daily' ? 7 : cadence === 'weekly' ? target : 0;

  // Already hit weekly target
  if (completionsThisWeek >= weeklyTarget) {
    return 'week_complete';
  }

  // How many more needed this week
  const remaining = weeklyTarget - completionsThisWeek;

  // Last chance: need to complete every remaining day
  if (remaining >= daysRemaining) {
    return 'last_chance';
  }

  // Flexible: have extra days to complete
  if (remaining < daysRemaining - 1) {
    return 'flexible';
  }

  return 'on_track_today';
}

/** Weekly habit summaries for NowHeader Habits card */
export const selectWeeklyHabitSummaries = createSelector(
  [selectHubHabits, selectCompletionsThisWeek],
  (habits, completionsMap): NowWeeklyHabitSummary[] => {
    return habits.map((habit) => {
      const completionsThisWeek = completionsMap.get(habit.id) ?? 0;
      const cadence = habit.cadence ?? 'daily';
      const targetPerWeek =
        cadence === 'daily' ? 7 : cadence === 'weekly' ? (habit.target_per_period ?? 1) : 0;

      return {
        habitId: habit.id,
        name: habit.name || 'Untitled Habit',
        targetPerWeek,
        completionsThisWeek,
        status: computeHabitWeeklyStatus(habit, completionsThisWeek),
      };
    });
  },
);

/** Count of habits that are "up to date" (checked in within their cadence window) */
export const selectHabitsUpToDateCount = createSelector(
  [selectHubHabits],
  (habits): { upToDate: number; total: number } => {
    const yesterday = getDaysAgoDayString(1);
    const sevenDaysAgo = getDaysAgoDayString(7);

    const upToDate = habits.filter((habit) => {
      const lastCheckedIn = ds().extractDateFromIso(habit.last_checked_in_at);
      const cadence = habit.cadence ?? 'daily';

      if (!lastCheckedIn) return false; // Never checked in

      if (cadence === 'daily') {
        // Daily: checked in yesterday or today = up to date
        return lastCheckedIn >= yesterday;
      } else if (cadence === 'weekly') {
        // Weekly: checked in within last 7 days = up to date
        return lastCheckedIn >= sevenDaysAgo;
      } else {
        // Monthly or other: checked in within last 7 days
        return lastCheckedIn >= sevenDaysAgo;
      }
    }).length;

    return {
      upToDate,
      total: habits.length,
    };
  },
);

/** Hook for habits up to date count */
export const useHabitsUpToDateCount = () => useGremlyStore(selectHabitsUpToDateCount);

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
export const useRolledOverTodos = () => useGremlyStore(selectRolledOverTodos);
export const useUnscheduledTodosForMiniSweep = () =>
  useGremlyStore(selectUnscheduledTodosForMiniSweep);
export const useTodayLogsCount = () => useGremlyStore(selectTodayLogsCount);
export const useHabitsCompletedToday = () => useGremlyStore(selectHabitsCompletedToday);
export const useWeeklyHabitSummaries = () => useGremlyStore(selectWeeklyHabitSummaries);

// Parameterized hooks (renamed to avoid conflict with legacy hooks)
export const useSpaceTodosFromStore = (spaceId: string) =>
  useGremlyStore((state) => selectTodosBySpace(state, spaceId));
export const useSpaceHabitsFromStore = (spaceId: string) =>
  useGremlyStore((state) => selectHabitsBySpace(state, spaceId));
export const useSpaceNotesFromStore = (spaceId: string) =>
  useGremlyStore((state) => selectNotesBySpace(state, spaceId));

// Space todos hooks (completed, incomplete, all)
export const useSpaceCompletedTodos = (spaceId: string) =>
  useGremlyStore((state) => selectSpaceCompletedTodos(state, spaceId));

export const useSpaceIncompleteTodos = (spaceId: string) =>
  useGremlyStore((state) => selectSpaceIncompleteTodos(state, spaceId));

export const useAllTodosForSpace = (spaceId: string) =>
  useGremlyStore((state) => selectAllTodosForSpace(state, spaceId));

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

/** All milestones for a space (including completed), sorted by date ascending */
export const selectAllMilestonesForSpace = createSelector(
  [selectMilestones, (_state: GremlyState, spaceId: string) => spaceId],
  (milestones, spaceId) =>
    milestones
      .filter((m) => m.space_id === spaceId)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '')),
);

export const useAllSpaceMilestones = (spaceId: string) =>
  useGremlyStore((state) => selectAllMilestonesForSpace(state, spaceId));

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT NOTE SELECTORS (Key Dates feature)
// ═══════════════════════════════════════════════════════════════════════════════

/** Events (notes with subtype='event') for a space, excluding goals (goals shown in header), sorted by date then dateless at bottom */
export const selectEventsForSpace = createSelector(
  [selectNotes, (_state: GremlyState, spaceId: string) => spaceId],
  (notes, spaceId) =>
    notes
      .filter((n) => n.subtype === 'event' && n.space_id === spaceId && !n.archived && !n.is_goal)
      .sort((a, b) => {
        // 1. Dateless events go to the bottom
        if (a.target_date && !b.target_date) return -1;
        if (!a.target_date && b.target_date) return 1;

        // 2. Both have dates (or both dateless) - sort by date ascending
        const dateA = a.target_date || '';
        const dateB = b.target_date || '';
        return dateA.localeCompare(dateB);
      }),
);

export const useEventsForSpace = (spaceId: string) =>
  useGremlyStore((state) => selectEventsForSpace(state, spaceId));

/** Goal event for a space (is_goal = true) - returns first goal by created_at (primary goal) */
export const selectGoalForSpace = createSelector(
  [selectNotes, (_state: GremlyState, spaceId: string) => spaceId],
  (notes, spaceId) =>
    notes.find(
      (n) => n.subtype === 'event' && n.is_goal === true && n.space_id === spaceId && !n.archived,
    ) || null,
);

export const useGoalForSpace = (spaceId: string) =>
  useGremlyStore((state) => selectGoalForSpace(state, spaceId));

/** All goal events for a space (is_goal = true), max 3, sorted by created_at ascending */
export const selectGoalsForSpace = createSelector(
  [selectNotes, (_state: GremlyState, spaceId: string) => spaceId],
  (notes, spaceId) =>
    notes
      .filter(
        (n) => n.subtype === 'event' && n.is_goal === true && n.space_id === spaceId && !n.archived,
      )
      .sort((a, b) => {
        const aDate = a.created_at || '';
        const bDate = b.created_at || '';
        return aDate.localeCompare(bDate);
      })
      .slice(0, 3),
);

export const useGoalsForSpace = (spaceId: string) =>
  useGremlyStore((state) => selectGoalsForSpace(state, spaceId));

/** Featured goal for a space: goal with views.featured_goal === true, else first by created_at */
export const selectFeaturedGoalForSpace = createSelector(
  [selectNotes, (_state: GremlyState, spaceId: string) => spaceId],
  (notes, spaceId) => {
    const goals = notes.filter(
      (n) => n.subtype === 'event' && n.is_goal === true && n.space_id === spaceId && !n.archived,
    );
    if (goals.length === 0) return null;
    // Prefer the explicitly-featured goal
    const featured = goals.find((g) => (g as any).views?.featured_goal === true);
    if (featured) return featured;
    // Fallback: first by created_at ascending
    return goals.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))[0] || null;
  },
);

export const useFeaturedGoalForSpace = (spaceId: string) =>
  useGremlyStore((state) => selectFeaturedGoalForSpace(state, spaceId));

/** Journal check-ins related to a goal (by origin, views.goal_checkin, title match, or tag) */
export const selectCheckInsForGoal = createSelector(
  [
    selectNotes,
    (_state: GremlyState, goalTitle: string) => goalTitle,
    (_state: GremlyState, _goalTitle: string, spaceId: string) => spaceId,
  ],
  (notes, goalTitle, spaceId) => {
    const goalTitleLower = goalTitle.toLowerCase();
    const goalWords = goalTitleLower.split(/\s+/).filter((w) => w.length > 2);

    const journalsInSpace = notes.filter(
      (n) => n.subtype === 'journal' && n.space_id === spaceId && !n.archived,
    );

    console.log('[selectCheckInsForGoal] Searching for:', { goalTitle, spaceId });
    console.log('[selectCheckInsForGoal] Journals in space:', journalsInSpace.length);

    const matches = journalsInSpace.filter((n) => {
      // Check 1: origin is goal_checkin AND views.goal_checkin matches
      const hasGoalCheckinOrigin = n.origin === 'goal_checkin';
      const goalCheckinData = (n as any).views?.goal_checkin;
      const matchesGoalCheckinView = goalCheckinData?.goal_name?.toLowerCase() === goalTitleLower;

      // Check 2: title contains goal-related words
      const noteTitle = (n.title || '').toLowerCase();
      const hasGoalInTitle = goalWords.some((word) => noteTitle.includes(word));

      // Check 3: tags include goal name
      const hasTags =
        Array.isArray(n.tags) &&
        n.tags.some(
          (tag) =>
            tag.toLowerCase().includes(goalTitleLower) ||
            goalTitleLower.includes(tag.toLowerCase()),
        );

      const isMatch = (hasGoalCheckinOrigin && matchesGoalCheckinView) || hasGoalInTitle || hasTags;

      if (journalsInSpace.length < 20) {
        // Only log if not too many journals to avoid noise
        console.log('[selectCheckInsForGoal] Checking note:', {
          id: n.id,
          title: n.title,
          origin: n.origin,
          hasGoalCheckinOrigin,
          goalCheckinData,
          matchesGoalCheckinView,
          tags: n.tags,
          hasGoalInTitle,
          hasTags,
          isMatch,
        });
      }

      return isMatch;
    });

    console.log('[selectCheckInsForGoal] Found matches:', matches.length);
    return matches.sort((a, b) => {
      const aDate = a.created_at || '';
      const bDate = b.created_at || '';
      return bDate.localeCompare(aDate); // Most recent first
    });
  },
);

export const useCheckInsForGoal = (goalTitle: string, spaceId: string) =>
  useGremlyStore((state) => selectCheckInsForGoal(state, goalTitle, spaceId));

/** All items (todos, notes, habits) linked to a specific event */
export const selectItemsLinkedToEvent = createSelector(
  [selectTodos, selectNotes, selectHabits, (_state: GremlyState, eventId: string) => eventId],
  (todos, notes, habits, eventId) => ({
    todos: todos.filter((t) => t.linked_event_id === eventId && !t.archived && !t.completed_at),
    notes: notes.filter((n) => n.linked_event_id === eventId && !n.archived),
    habits: habits.filter((h) => h.linked_event_id === eventId && !h.archived),
  }),
);

export const useItemsLinkedToEvent = (eventId: string) =>
  useGremlyStore((state) => selectItemsLinkedToEvent(state, eventId));

/** Whether a space has any events */
export const selectSpaceHasEvents = createSelector(
  [selectEventsForSpace],
  (events) => events.length > 0,
);

export const useSpaceHasEvents = (spaceId: string) =>
  useGremlyStore((state) => selectSpaceHasEvents(state, spaceId));

/** Upcoming events for a space (target_date >= today) */
export const selectUpcomingEventsForSpace = createSelector([selectEventsForSpace], (events) => {
  const today = getTodayDayString();
  return events.filter((e) => e.target_date && e.target_date >= today);
});

export const useUpcomingEventsForSpace = (spaceId: string) =>
  useGremlyStore((state) => selectUpcomingEventsForSpace(state, spaceId));

/** Events occurring on a specific date (single-day or multi-day spanning that date) */
export const selectEventsForDate = createSelector(
  [selectNotes, (_state: GremlyState, date: string) => date],
  (notes, date) =>
    notes.filter((n) => {
      if (n.subtype !== 'event' || n.archived) return false;

      // Single day event: target_date matches
      if (n.target_date === date) return true;

      // Multi-day event: date falls within range
      if (n.target_date && n.end_date) {
        return date >= n.target_date && date <= n.end_date;
      }

      return false;
    }),
);

export const useEventsForDate = (date: string) =>
  useGremlyStore((state) => selectEventsForDate(state, date));

// ═══════════════════════════════════════════════════════════════════════════════
// ITEM LOOKUP SELECTORS (for Mind Drop / CatchAllNotepad)
// ═══════════════════════════════════════════════════════════════════════════════

/** Select any item by ID - searches todos, habits, notes
 * IMPORTANT: Adds the `type` field since the database doesn't store it
 */
export const selectItemById = createSelector(
  [selectTodos, selectHabits, selectNotes, (_state: GremlyState, id: string) => id],
  (todos, habits, notes, id): (Todo | Habit | Note) | null => {
    const todo = todos.find((t) => t.id === id);
    if (todo) return { ...todo, type: 'todo' as const };

    const habit = habits.find((h) => h.id === id);
    if (habit) return { ...habit, type: 'habit' as const };

    const note = notes.find((n) => n.id === id);
    if (note) return { ...note, type: 'note' as const };

    return null;
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
      .filter((n) => {
        // Exclude archived notes
        if (n.archived) return false;
        // Exclude calendar-synced event notes — these were auto-imported,
        // not user-dropped, and don't belong in the MindDrop inbox.
        // Native Gremly events (external_source == null) still appear.
        if (n.subtype === 'event' && n.external_source != null) return false;
        return true;
      })
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

// ═══════════════════════════════════════════════════════════════════════════════
// SPACE TIMELINE SELECTOR (for weekly habit progress)
// ═══════════════════════════════════════════════════════════════════════════════

export type TimelineItem = {
  id: string;
  type: 'habit' | 'todo' | 'note';
  title: string;
  dueAt?: string | null;
  done?: boolean;
};

export type TimelineDay = {
  dateISO: string; // YYYY-MM-DD
  items: TimelineItem[];
};

/** Get current week's date range (Sunday to Saturday) */
function getWeekDateRange(): string[] {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

/** Timeline for a specific space - groups items by day for the current week */
export const selectSpaceTimeline = createSelector(
  [
    selectHabits,
    selectTodos,
    selectNotes,
    selectHabitProgress,
    (_state: GremlyState, spaceId: string | null | undefined) => spaceId,
  ],
  (habits, todos, notes, habitProgress, spaceId): TimelineDay[] => {
    if (!spaceId) return [];

    const weekDays = getWeekDateRange();
    const dayMap = new Map<string, TimelineItem[]>();
    for (const iso of weekDays) dayMap.set(iso, []);

    // Build habit progress lookup: habitId -> Set of occurred_day strings
    const habitProgressMap = new Map<string, Set<string>>();
    for (const p of habitProgress) {
      if (!habitProgressMap.has(p.habit_id)) {
        habitProgressMap.set(p.habit_id, new Set());
      }
      if (p.occurred_day) {
        habitProgressMap.get(p.habit_id)!.add(p.occurred_day);
      }
    }

    // Add habits for each day (showing completion status)
    const spaceHabits = habits.filter((h) => h.space_id === spaceId && !h.archived);
    for (const h of spaceHabits) {
      const habitDays = habitProgressMap.get(h.id) || new Set<string>();
      for (const iso of weekDays) {
        const done = habitDays.has(iso);
        dayMap.get(iso)!.push({
          id: h.id,
          type: 'habit',
          title: (h as any).name || (h as any).title || 'Habit',
          done,
        });
      }
    }

    // Add todos with due dates in this week
    const spaceTodos = todos.filter((t) => t.space_id === spaceId && !t.archived);
    for (const t of spaceTodos) {
      // Use due_day as source of truth (timezone-safe YYYY-MM-DD)
      const dueDay = (t as any).due_day;
      if (dueDay && dayMap.has(dueDay)) {
        const dueAt = (t as any).due_time ? `${dueDay}T${(t as any).due_time}:00` : dueDay;
        dayMap.get(dueDay)!.push({
          id: t.id,
          type: 'todo',
          title: (t as any).name || (t as any).title || 'To-do',
          dueAt,
          done: !!(t as any).completed_at,
        });
      }
    }

    // Add notes with date in this week
    const spaceNotes = notes.filter((n) => n.space_id === spaceId && !n.archived);
    for (const n of spaceNotes) {
      const noteDate = (n as any).date || (n as any).created_at?.slice(0, 10);
      if (noteDate && dayMap.has(noteDate)) {
        dayMap.get(noteDate)!.push({
          id: n.id,
          type: 'note',
          title: (n as any).title || (n as any).body?.split('\n')[0]?.slice(0, 80) || 'Note',
        });
      }
    }

    return weekDays.map((iso) => ({
      dateISO: iso,
      items: dayMap.get(iso)!,
    }));
  },
);

export const useSpaceTimelineFromStore = (spaceId: string | null | undefined) =>
  useGremlyStore((state) => selectSpaceTimeline(state, spaceId));

// ═══════════════════════════════════════════════════════════════════════════════
// UNSORTED FOR REVIEW (for Hub filtering)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Filter items that need user review/confirmation.
 * This is a pure utility function (not a Zustand selector) for filtering
 * already-scoped items in Hub views.
 *
 * Includes:
 * - Items with ai_placed = true (AI-placed items awaiting confirmation)
 * - Items from catchall that haven't been properly classified/moved
 */
export function filterUnsortedForReview(items: (Todo | Habit | Note)[]): (Todo | Habit | Note)[] {
  return items.filter((item) => {
    // AI-placed items awaiting confirmation
    if (item.ai_placed === true) return true;
    // Items from catchall that haven't been moved (still in catch-all limbo)
    if (item.origin === 'catchall' && item.ai_placed === false && !item.space_id) return true;
    return false;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SWEEP INTRO STATS (computed from store data)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute sweep intro stats from store data.
 * This avoids Supabase queries by using data already loaded in Zustand.
 *
 * @param state - The Gremly store state
 * @param lastSweepCompletedAt - The timestamp of the last sweep (null for first sweep)
 * @returns Stats showing completed and dropped items since last sweep
 */
export const selectSweepIntroStats = (
  state: GremlyState,
  lastSweepCompletedAt: string | null,
): SweepIntroStats => {
  const cutoffTimestamp =
    lastSweepCompletedAt || new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Completed todos (has completed_at > cutoff)
  const completedTodos: SweepIntroItem[] = state.todos
    .filter((t) => t.completed_at && t.completed_at > cutoffTimestamp)
    .map((t) => ({ id: t.id, name: t.name || 'Untitled', type: 'todo' as const }));

  // Completed habits (from habitProgress where occurred_at > cutoff)
  const completedHabitIds = new Set(
    state.habitProgress.filter((p) => p.occurred_at > cutoffTimestamp).map((p) => p.habit_id),
  );
  const completedHabits: SweepIntroItem[] = state.habits
    .filter((h) => completedHabitIds.has(h.id))
    .map((h) => ({ id: h.id, name: h.name || 'Untitled', type: 'habit' as const }));

  // Dropped items (created since cutoff, not archived, not completed)
  const droppedTodos: SweepIntroItem[] = state.todos
    .filter((t) => t.created_at > cutoffTimestamp && !t.archived && !t.completed_at)
    .map((t) => ({ id: t.id, name: t.name || 'Untitled', type: 'todo' as const }));

  const droppedHabits: SweepIntroItem[] = state.habits
    .filter((h) => h.created_at > cutoffTimestamp && !h.archived)
    .map((h) => ({ id: h.id, name: h.name || 'Untitled', type: 'habit' as const }));

  const droppedNotes: SweepIntroItem[] = state.notes
    .filter((n) => n.created_at > cutoffTimestamp && !n.archived)
    .map((n) => ({ id: n.id, name: n.title || 'Untitled', type: 'note' as const }));

  return {
    completed: { todos: completedTodos, habits: completedHabits },
    dropped: { todos: droppedTodos, habits: droppedHabits, notes: droppedNotes },
    isFirstSweep: !lastSweepCompletedAt,
    cutoffTimestamp,
    totalSweepCount: state.totalSweepCount,
    sweepStreak: state.sweepStreak,
  };
};

/** Hook to get sweep intro stats from store */
export const useSweepIntroStatsFromStore = (lastSweepCompletedAt: string | null) =>
  useGremlyStore((state) => selectSweepIntroStats(state, lastSweepCompletedAt));

// ═══════════════════════════════════════════════════════════════════════════════
// PENDING DROPS SELECTORS (optimistic UI for quick-add)
// ═══════════════════════════════════════════════════════════════════════════════

import type { PendingDrop } from './useGremlyStore';

/**
 * Get pending drops for Today's Focus (source: 'today')
 * Shows optimistic loading cards while drops are processing
 * Uses useShallow to prevent infinite re-renders from new array references
 */
export function useTodayPendingDrops(): PendingDrop[] {
  return useGremlyStore(
    useShallow((state) => {
      const drops: PendingDrop[] = [];
      state.pendingDrops.forEach((drop) => {
        if (drop.source === 'today') {
          drops.push(drop);
        }
      });
      return drops;
    }),
  );
}

/**
 * Get pending drops for a specific space
 * Shows optimistic loading cards while drops are processing
 * Uses useShallow to prevent infinite re-renders from new array references
 */
export function useSpacePendingDrops(spaceId: string | null): PendingDrop[] {
  return useGremlyStore(
    useShallow((state) => {
      if (!spaceId) return [];
      const drops: PendingDrop[] = [];
      state.pendingDrops.forEach((drop) => {
        if (drop.spaceId === spaceId) {
          drops.push(drop);
        }
      });
      return drops;
    }),
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPACE SUGGESTIONS SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all pending "new_space" suggestions
 * These are suggestions to create a new space from unassigned drops
 */
export const selectNewSpaceSuggestions = createSelector(
  [selectSpaceSuggestions],
  (suggestions): SpaceSuggestion[] => {
    return suggestions.filter((s) => s.suggestion_type === 'new_space' && s.status === 'pending');
  },
);

/**
 * Hook to get new space suggestions from store
 */
export function useNewSpaceSuggestions(): SpaceSuggestion[] {
  return useGremlyStore(useShallow((state) => selectNewSpaceSuggestions(state)));
}

/**
 * Get pending "assign_to_space" suggestions for a specific space
 * These are suggestions to assign unassigned drops to an existing space
 */
export const selectAssignmentSuggestionsForSpace = createSelector(
  [selectSpaceSuggestions, (_state: GremlyState, spaceId: string) => spaceId],
  (suggestions, spaceId): SpaceSuggestion[] => {
    return suggestions.filter(
      (s) =>
        s.suggestion_type === 'assign_to_space' && s.space_id === spaceId && s.status === 'pending',
    );
  },
);

/**
 * Hook to get assignment suggestions for a specific space
 */
export function useAssignmentSuggestionsForSpace(spaceId: string): SpaceSuggestion[] {
  return useGremlyStore(useShallow((state) => selectAssignmentSuggestionsForSpace(state, spaceId)));
}

/**
 * Entity union type for selectEntitiesByIds
 */
export type DropEntity = (Todo | Note | Habit) & { _type: 'todo' | 'note' | 'habit' };

/**
 * Get entities (todos, notes, habits) by an array of IDs
 * Useful for resolving drop_ids from a SpaceSuggestion
 */
export const selectEntitiesByIds = createSelector(
  [selectTodos, selectNotes, selectHabits, (_state: GremlyState, dropIds: string[]) => dropIds],
  (todos, notes, habits, dropIds): DropEntity[] => {
    const idSet = new Set(dropIds);
    const entities: DropEntity[] = [];

    for (const todo of todos) {
      if (idSet.has(todo.id)) {
        entities.push({ ...todo, _type: 'todo' });
      }
    }
    for (const note of notes) {
      if (idSet.has(note.id)) {
        entities.push({ ...note, _type: 'note' });
      }
    }
    for (const habit of habits) {
      if (idSet.has(habit.id)) {
        entities.push({ ...habit, _type: 'habit' });
      }
    }

    return entities;
  },
);

/**
 * Hook to get entities by IDs
 */
export function useEntitiesByIds(dropIds: string[]): DropEntity[] {
  return useGremlyStore(useShallow((state) => selectEntitiesByIds(state, dropIds)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT NOTE SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All non-archived event notes (subtype === 'event').
 * This is the base selector for all event-note derived selectors.
 */
export const selectEventNotes = createSelector([selectNotes], (notes): Note[] =>
  notes.filter(
    (n): n is Note => n.type === 'note' && (n as Note).subtype === 'event' && !n.archived,
  ),
);

/**
 * Event notes for a specific date, sorted by event_time (all-day first, then by time).
 */
export const selectEventNotesForDate = createSelector(
  [selectEventNotes, (_state: GremlyState, dateStr: string) => dateStr],
  (eventNotes, dateStr): Note[] =>
    eventNotes
      .filter((n) => n.target_date === dateStr)
      .sort((a, b) => {
        // All-day events first (null event_time), then ascending by time
        if (!a.event_time && b.event_time) return -1;
        if (a.event_time && !b.event_time) return 1;
        if (a.event_time && b.event_time) return a.event_time.localeCompare(b.event_time);
        return 0;
      }),
);

/**
 * Event notes within a date range (inclusive on both ends).
 */
export const selectEventNotesForRange = createSelector(
  [
    selectEventNotes,
    (_state: GremlyState, startDate: string) => startDate,
    (_state: GremlyState, _startDate: string, endDate: string) => endDate,
  ],
  (eventNotes, startDate, endDate): Note[] =>
    eventNotes.filter(
      (n) => n.target_date != null && n.target_date >= startDate && n.target_date <= endDate,
    ),
);

/**
 * Event notes coming up in the next N days (default 7).
 */
export const selectUpcomingEventNotes = createSelector(
  [selectEventNotes, (_state: GremlyState, days: number = 7) => days],
  (eventNotes, days): Note[] => {
    const today = getTodayDayString();
    const endDate = ds().addDays(today, days);
    return eventNotes
      .filter((n) => n.target_date != null && n.target_date >= today && n.target_date <= endDate)
      .sort((a, b) => {
        // Sort by date first, then by time
        const dateCmp = (a.target_date ?? '').localeCompare(b.target_date ?? '');
        if (dateCmp !== 0) return dateCmp;
        if (!a.event_time && b.event_time) return -1;
        if (a.event_time && !b.event_time) return 1;
        if (a.event_time && b.event_time) return a.event_time.localeCompare(b.event_time);
        return 0;
      });
  },
);

/**
 * Event notes that were synced from an external calendar provider.
 */
export const selectExternalEventNotes = createSelector([selectEventNotes], (eventNotes): Note[] =>
  eventNotes.filter((n) => n.external_source != null),
);

/**
 * Event notes created natively in Gremly (no external_source).
 */
export const selectNativeEventNotes = createSelector([selectEventNotes], (eventNotes): Note[] =>
  eventNotes.filter((n) => n.external_source == null),
);

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT NOTE HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook: event notes for a single date, sorted by time (all-day first).
 * Single source of truth for date-based event rendering.
 */
export function useEventNotesForDate(dateStr: string): Note[] {
  return useGremlyStore(useShallow((state) => selectEventNotesForDate(state, dateStr)));
}

/**
 * Hook: upcoming event notes within the next N days (default 7).
 * Single source of truth for upcoming-events widgets.
 */
export function useUpcomingEventNotes(days: number = 7): Note[] {
  return useGremlyStore(useShallow((state) => selectUpcomingEventNotes(state, days)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEEKLY SUMMARY SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

const selectWeeklySummaries = (state: GremlyState) => state.weeklySummaries;
const selectWeeklySummaryLoading = (state: GremlyState) => state.weeklySummaryLoading;

/** Get Monday of the current week as YYYY-MM-DD */
function getMondayDayString(): string {
  const today = ds().getCurrentDate();
  const date = ds().fromDateString(today);
  if (!date) return today;
  const dayOfWeek = date.getDay(); // 0 = Sunday
  // Monday offset: Sunday(0) -> -6, Mon(1) -> 0, Tue(2) -> -1 ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return ds().addDays(today, mondayOffset);
}

/** Current week's summary (matches on week_start_date = this Monday) */
export const selectCurrentWeekSummary = createSelector(
  [selectWeeklySummaries],
  (summaries): WeeklySummary | undefined => {
    const monday = getMondayDayString();
    return summaries.find((s) => s.week_start_date === monday);
  },
);

/** All summaries, newest first (includes current week) */
export const selectAllSummaries = createSelector(
  [selectWeeklySummaries],
  (summaries): WeeklySummary[] => {
    return [...summaries].sort((a, b) => b.week_start_date.localeCompare(a.week_start_date));
  },
);

/** @deprecated Use selectAllSummaries — kept as alias for backward compatibility */
export const selectPastSummaries = selectAllSummaries;

/**
 * Should the weekly summary banner be shown?
 * True when: current week summary exists, not yet viewed, banner not dismissed.
 */
export const selectShouldShowSummaryBanner = createSelector(
  [selectCurrentWeekSummary],
  (summary): boolean => {
    if (!summary) return false;
    return !summary.viewed && !summary.banner_dismissed;
  },
);

/** Find a summary by week_start_date */
export function selectSummaryByWeek(
  state: GremlyState,
  weekStartDate: string,
): WeeklySummary | undefined {
  return state.weeklySummaries.find((s) => s.week_start_date === weekStartDate);
}

/** Compressed summary content for chat context injection */
export const selectWeeklySummaryForChatContext = createSelector(
  [selectCurrentWeekSummary],
  (summary): string | null => {
    if (!summary?.content) return null;

    const c = summary.content;
    const parts: string[] = [];

    if (c.weeklyCommentary) parts.push(c.weeklyCommentary);

    if (c.highlightMoment) {
      parts.push(`Highlight: ${c.highlightMoment.title} — ${c.highlightMoment.reason}`);
    }

    if (c.insights?.length) {
      parts.push('Insights: ' + c.insights.map((i) => i.headline).join('; '));
    }

    if (c.keyThemes?.length) {
      parts.push('Themes: ' + c.keyThemes.join(', '));
    }

    if (c.weekAhead?.highlights?.length) {
      parts.push(
        'Week ahead: ' + c.weekAhead.highlights.map((h) => `${h.eventTitle} (${h.day})`).join(', '),
      );
    }

    return parts.length > 0 ? parts.join(' | ') : null;
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// WEEKLY SUMMARY HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useCurrentWeekSummary(): WeeklySummary | undefined {
  return useGremlyStore((state) => selectCurrentWeekSummary(state));
}

export function usePastSummaries(): WeeklySummary[] {
  return useGremlyStore(useShallow((state) => selectPastSummaries(state)));
}

export function useShouldShowSummaryBanner(): boolean {
  return useGremlyStore((state) => selectShouldShowSummaryBanner(state));
}

export function useWeeklySummaryForChatContext(): string | null {
  return useGremlyStore((state) => selectWeeklySummaryForChatContext(state));
}
