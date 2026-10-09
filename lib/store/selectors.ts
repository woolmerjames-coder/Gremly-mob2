import { createSelector } from 'reselect';
import { useShallow } from 'zustand/react/shallow';
import { useGremlyStore, type HabitProgressRow } from './useGremlyStore';
import type { Todo, Habit, Note, WeeklySummary } from '../types';
import type {
  SweepCandidate,
  SweepCandidateTodo,
  SweepCandidateNote,
  SweepCandidateHabit,
  SweepCardMeta,
  SweepAttachment,
} from '../sweep/types';
import { computeSweepCardMeta } from '../sweep/computeSweepCardMeta';
import { computeWorldsForEntity } from './worldsSelectors';
import type { NowWeeklyHabitSummary, HabitWeeklyStatus } from '../now/nowTypes';
import { getDateService } from '../date';
import { summaryForDay } from '../weeklySummary/currentSummary';
import { isRelationPending } from '../minddrop/dropRelation';
import { sweepCardAsks } from '../sweep/sweepOrder';
import { quickSweepCards } from '../sweep/quickSweep';
import { dayOfWeek, pausedOn, weekAround } from '../week/habitWeek';
import { filedIndex, stepsOnClosedChapters } from '../worlds/model';
// Which day a todo is on: its planned day, else its deadline (stage 2c, 9 Oct 2026)
import {
  isTodoOn,
  isTodoOnOrBefore,
  isTodoOverdue,
  plannedDayOf,
} from '../../workers/shared/todoDay';

// ═══════════════════════════════════════════════════════════════════════════════
// DATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

// Get DateService singleton - use this for all date operations
const ds = () => getDateService();

/** Get day of week (0-6, Sunday = 0) from YYYY-MM-DD string */
function getDayOfWeek(dayString: string): number {
  const [year, month, day] = dayString.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

/** Alias for ds().today() - used throughout selectors */
const getTodayDayString = () => ds().today();

/** Get N days ago as YYYY-MM-DD - alias for backward compatibility */
const getDaysAgoDayString = (days: number) => ds().addDays(ds().today(), -days);

// ═══════════════════════════════════════════════════════════════════════════════
// BASE SELECTORS (access raw store data)
// ═══════════════════════════════════════════════════════════════════════════════

type GremlyState = ReturnType<typeof useGremlyStore.getState>;

const selectTodos = (state: GremlyState) => state.todos;
const selectHabits = (state: GremlyState) => state.habits;
const selectNotes = (state: GremlyState) => state.notes;
const selectWorlds = (state: GremlyState) => state.worlds;
const selectDropWorldLinks = (state: GremlyState) => state.dropWorldLinks;
const selectTags = (state: GremlyState) => state.tags;
const selectHabitProgress = (state: GremlyState) => state.habitProgress;
const selectSpaceChatMessages = (state: GremlyState) => state.spaceChatMessages;
const selectIsLoading = (state: GremlyState) => state.isLoading;
const selectIsInitialized = (state: GremlyState) => state.isInitialized;
const selectHiddenTodayIds = (state: GremlyState) => state.hiddenTodayIds;
const selectHabitAdaptations = (state: GremlyState) => state.habitAdaptations;
// Their weekly day: their week is the seven days that end on it
const selectWeeklyDay = (state: GremlyState) => state.weeklyDay;
// Today as an input, so what is counted by the day is counted again when the day turns over
const selectToday = () => ds().today();

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

/** Map of habitId -> completion count this week (their own week, see weekAround) */
export const selectCompletionsThisWeek = createSelector(
  [selectHabitProgress, selectWeeklyDay, selectToday],
  (progress, weeklyDay, today): Map<string, number> => {
    const weekStart = weekAround(today, weeklyDay).first;
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
  // today is an input so the count turns over with the day, not only with a new log
  [selectHabitProgress, selectToday],
  (progress): Map<string, number> => {
    const now = ds().dayNow();
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

/** Map of habitId -> Set of occurred_day strings this week (their own week, see weekAround) */
export const selectCompletionDaysThisWeek = createSelector(
  [selectHabitProgress, selectWeeklyDay, selectToday],
  (progress, weeklyDay, today): Map<string, Set<string>> => {
    const weekStart = weekAround(today, weeklyDay).first;
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
  // today is an input so yesterday's logs stop counting when the day turns
  [selectHabitProgress, selectToday],
  (progress, today): Set<string> => {
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
 * across all views (Today's Focus, Habits sheet, etc.)
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
    const windowStartStr = ds().addDays(ds().today(), -6); // 7 days including today
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
    const windowStartStr = ds().addDays(ds().today(), -29); // 30 days including today
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
    const todayStr = dateService.today();
    const today = dateService.fromLocalDate(todayStr) ?? ds().now(); // Date at noon local time

    return habits.filter((h) => {
      if (h.archived) return false;
      const cadence = h.cadence ?? 'daily';
      if (cadence === 'daily') return false; // Daily habits handled separately

      const target = h.target_per_period ?? 1;
      const windowDays = cadence === 'weekly' ? 7 : 30;

      // Get completions in current window
      const windowStart = new Date(today);
      windowStart.setDate(today.getDate() - windowDays + 1);
      const windowStartStr = dateService.toLocalDate(windowStart);

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
      const tomorrowWindowStartStr = dateService.toLocalDate(tomorrowWindowStart);

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
 * - Paused habits: left alone on the days they are paused
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
  pausedToday: boolean,
): boolean {
  // Already completed today - not "due" anymore (but may show in completed section)
  if (completedToday) return false;

  // Archived habits don't show
  if (habit.archived) return false;

  // Paused today: they asked to be left alone, so it is off Today's list
  if (pausedToday) return false;

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
        const todayDayOfWeek = ds().dayNow().getDay();
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
    selectHabitAdaptations,
    selectToday,
  ],
  (
    habits,
    weeklyCompletions,
    monthlyCompletions,
    completedTodaySet,
    hiddenIds,
    adaptations,
    today,
  ): Habit[] => {
    return habits.filter((habit) => {
      if (hiddenIds.includes(habit.id)) return false;
      return isHabitDueToday(
        habit,
        weeklyCompletions.get(habit.id) ?? 0,
        monthlyCompletions.get(habit.id) ?? 0,
        completedTodaySet.has(habit.id),
        pausedOn(adaptations, habit.id, today),
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

/**
 * Steps left on a closed Chapter: they stay with it and leave every day list,
 * Today, Sweep and the wrap up (James's call, Worlds round two). Bringing one
 * back from the Chapter's page returns it.
 */
export const selectStepsOnClosedChapters = createSelector(
  [(state: GremlyState) => state.chapters, (state: GremlyState) => state.dropChapterLinks],
  (chapters, links): Set<string> =>
    stepsOnClosedChapters(chapters ?? [], filedIndex([], links ?? [])),
);

/** The todos the day lists read from: active, and not left on a closed Chapter */
export const selectDayTodos = createSelector(
  [selectActiveTodos, selectStepsOnClosedChapters],
  (todos, left): Todo[] => (left.size ? todos.filter((t) => !left.has(t.id)) : todos),
);

/**
 * Todos on Today: the ones due today, and the ones put off (Later) whose day
 * to come back is today. A Later has no day of its own, so its back day is
 * what puts it here. Once that day has gone by it waits in the wrap up's
 * cards, like any todo left from an earlier day. Not completed, not archived,
 * not hidden.
 */
export const selectTodosDueToday = createSelector(
  [selectDayTodos, selectHiddenTodayIds],
  (todos, hiddenIds): Todo[] => {
    const today = getTodayDayString();
    return todos.filter(
      (t) =>
        (isTodoOn(t, today) || (!plannedDayOf(t) && (t as any).resurface_at === today)) &&
        !hiddenIds.includes(t.id),
    );
  },
);

/**
 * Overdue todos: their day has passed, the planned day or, with none, the
 * deadline (workers/shared/todoDay.js). Not completed, not archived.
 */
export const selectOverdueTodos = createSelector([selectDayTodos], (todos): Todo[] => {
  const today = getTodayDayString();
  const result = todos.filter((t) => {
    if (!isTodoOverdue(t, today)) return false;
    // Check if skipped today
    const skippedDay = ds().dayOf(t.skipped_in_sweep_at);
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

/**
 * Unscheduled todos for Mini-Sweep: no planned day and not yet due (a deadline
 * only todo joins Today on its deadline), created in the last 3 days, not
 * skipped today
 */
export const selectUnscheduledTodosForMiniSweep = createSelector(
  [selectDayTodos],
  (todos): Todo[] => {
    const today = getTodayDayString();
    const threeDaysAgo = getDaysAgoDayString(3);
    const result = todos.filter((t) => {
      if (plannedDayOf(t) || isTodoOnOrBefore(t, today)) return false; // Must be unscheduled and not yet due
      const createdDay = ds().dayOf(t.created_at);
      if (!createdDay || createdDay < threeDaysAgo) return false;
      // Check if skipped today
      const skippedDay = ds().dayOf(t.skipped_in_sweep_at);
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

/**
 * Undated todos, for triage: no planned day, and not yet due. A deadline only
 * todo is here until its deadline, then on Today, then overdue
 * (workers/shared/todoDay.js).
 */
export const selectUndatedTodos = createSelector([selectDayTodos], (todos): Todo[] => {
  const today = getTodayDayString();
  return todos.filter((t) => !plannedDayOf(t) && !isTodoOnOrBefore(t, today));
});

/** Recent drops: undated todos created in last 3 days */
export const selectRecentDrops = createSelector([selectUndatedTodos], (todos): Todo[] => {
  const today = getTodayDayString();
  const threeDaysAgo = getDaysAgoDayString(3);
  return todos.filter((t) => {
    const createdDay = ds().dayOf(t.created_at);
    if (!createdDay || createdDay < threeDaysAgo) return false;
    // Exclude if skipped today
    const skippedDay = ds().dayOf(t.skipped_in_sweep_at);
    if (skippedDay === today) return false;
    return true;
  });
});

/** "So You Don't Forget" - undated todos 5+ days old */
export const selectForgottenTodos = createSelector([selectUndatedTodos], (todos): Todo[] => {
  const fiveDaysAgo = getDaysAgoDayString(5);
  return todos.filter((t) => {
    const createdDay = ds().dayOf(t.created_at);
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

/** What is on Today: the todos and habits due today that are not done */
export const selectTodayActiveItems = createSelector(
  [selectTodosDueToday, selectHabitsDueToday],
  (todosDueToday, habitsDueToday): (Todo | Habit)[] => [...todosDueToday, ...habitsDueToday],
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
  [selectTodayActiveItems, selectTodayCompletedItems],
  (active, completed) => {
    const totalEligible = active.length + completed.length;
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
    const createdDay = ds().dayOf(n.created_at);
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
 * 1. Cards with a question
 * 2. Overdue todos
 * 3. Due today todos
 * 4. Unconfirmed habits
 * 5. Everything else by createdAt ascending
 */
export const selectSweepCandidatesUnified = createSelector(
  [selectTodos, selectNotes, selectWorlds, selectDropWorldLinks, selectStepsOnClosedChapters],
  (
    todos,
    notes,
    worlds,
    dropWorldLinks,
    left,
  ): Array<{ candidate: SweepCandidate; meta: SweepCardMeta }> =>
    sweepCandidatesAsOf(todos, notes, worlds, dropWorldLinks, getTodayDayString(), left),
);

/**
 * Sweep's cards as of a day: the same rules, counted from the day given. The
 * evening wrap up asks for the person's day (lib/wrapup/cards.ts), which after
 * midnight is still yesterday until their day ends.
 */
export function sweepCandidatesAsOf(
  todos: ReturnType<typeof selectTodos>,
  notes: ReturnType<typeof selectNotes>,
  worlds: ReturnType<typeof selectWorlds>,
  dropWorldLinks: ReturnType<typeof selectDropWorldLinks>,
  today: string,
  /** Steps left on a closed Chapter, which stay with it (selectStepsOnClosedChapters) */
  left: Set<string> = new Set(),
): Array<{ candidate: SweepCandidate; meta: SweepCardMeta }> {
  {
    const sevenDaysAgo = ds().addDays(today, -7);
    const candidates: SweepCandidate[] = [];

    // Process todos
    for (const todo of todos) {
      if (todo.archived || todo.completed_at || left.has(todo.id)) {
        continue;
      }

      // Check resurface date first - if set for the future, skip entirely
      const resurfaceAt = (todo as any).resurface_at;
      const hasFutureResurface = resurfaceAt && resurfaceAt > today;
      if (hasFutureResurface) {
        continue;
      }

      // On its planned day, else its deadline (workers/shared/todoDay.js). With
      // no planned day it still needs one, so Sweep keeps asking.
      const isOverdue = isTodoOverdue(todo, today);
      const isDueToday = isTodoOn(todo, today);
      const isUndated = !plannedDayOf(todo);
      const isCreatedToday = ds().isTimestampToday(todo.created_at);
      const wasSkipped = !!todo.skipped_in_sweep_at;

      // Check if todo should resurface today (remind me later)
      const shouldResurface = resurfaceAt && resurfaceAt <= today;

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
      // A drop waiting on "is this one you already have?" is asked in Sweep
      // whatever its kind or day, like a split (lib/minddrop/dropRelation.ts)
      const relationPending = isRelationPending(note.views);
      if (note.subtype === 'journal' && !relationPending) continue;

      const resurfaceAt = (note as any).resurface_at;
      const sweptAt = (note as any).swept_at;

      // Skip notes with FUTURE resurface date (not time yet)
      if (resurfaceAt && resurfaceAt > today) {
        continue;
      }

      // Check if note should resurface TODAY (remind me later)
      const shouldResurface = resurfaceAt && resurfaceAt <= today;

      // Skip notes that were swept, UNLESS they should resurface or were skipped
      if (sweptAt && !shouldResurface && !note.skipped_in_sweep_at && !relationPending) {
        continue;
      }

      const createdDay = ds().dayOf(note.created_at);
      const isCreatedToday = createdDay === today;
      const wasSkipped = !!note.skipped_in_sweep_at;

      const isIdea = note.subtype === 'idea';
      const isRecentIdea = isIdea && createdDay && createdDay >= sevenDaysAgo;
      const isEvent = note.subtype === 'event';
      const eventTargetDate = (note as any).target_date as string | null;
      const isEventToday = isEvent && eventTargetDate === today;
      const isEventPassed = isEvent && !!eventTargetDate && eventTargetDate < today;
      const isUpcomingEvent =
        isEvent && !!eventTargetDate && eventTargetDate >= today && !(note as any).external_source;
      const daysUntilEvent =
        isEvent && eventTargetDate
          ? Math.ceil(
              (new Date(eventTargetDate).getTime() - new Date(today).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;

      if (isEvent && isEventPassed && !(note as any).external_source && !relationPending) {
        continue;
      }

      // Include catchall, list, reference subtypes created today
      // Note: 'general' LogSubtype maps to 'catchall' in the database
      const isOtherSubtype =
        note.subtype === 'catchall' || note.subtype === 'list' || note.subtype === 'reference';
      const isTodayOther = isOtherSubtype && isCreatedToday;

      if (
        relationPending ||
        isRecentIdea ||
        isTodayOther ||
        isUpcomingEvent ||
        wasSkipped ||
        shouldResurface
      ) {
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
          isEventToday,
          isEventPassed,
          daysUntilEvent,
          raw: note as any,
          attachments,
        } satisfies SweepCandidateNote);
      }
    }

    // Compute meta for each candidate
    const withMeta = candidates.map((candidate) => ({
      candidate,
      meta: computeSweepCardMeta(
        candidate,
        computeWorldsForEntity(worlds, dropWorldLinks, candidate.id),
      ),
    }));

    // Sort: questions → overdue → due today → other todos → notes
    // Within each group, sort by createdAt ascending (oldest first)
    withMeta.sort((a, b) => {
      const aKind = a.candidate.kind;
      const bKind = b.candidate.kind;

      // 0. Cards with a question first: the answers can change other cards
      //    (lib/sweep/sweepOrder.ts)
      const asks = { relation: 0, clarify: 1 } as const;
      const aAsks = sweepCardAsks(a.candidate);
      const bAsks = sweepCardAsks(b.candidate);
      if (aAsks || bAsks) {
        if (!bAsks) return -1;
        if (!aAsks) return 1;
        if (aAsks !== bAsks) return asks[aAsks] - asks[bAsks];
      }

      // 2. Overdue todos first
      if (a.candidate.isOverdue && !b.candidate.isOverdue) return -1;
      if (!a.candidate.isOverdue && b.candidate.isOverdue) return 1;

      // 3. Due today todos next
      if (a.candidate.isDueToday && !b.candidate.isDueToday) return -1;
      if (!a.candidate.isDueToday && b.candidate.isDueToday) return 1;

      // 4. Group by kind: todos → notes
      const kindOrder: Record<string, number> = { todo: 0, note: 1 };
      const aOrder = kindOrder[aKind] ?? 2;
      const bOrder = kindOrder[bKind] ?? 2;
      if (aOrder !== bOrder) return aOrder - bOrder;

      // 5. Within same kind, sort by createdAt ascending (oldest first)
      return (a.candidate.createdAt ?? '').localeCompare(b.candidate.createdAt ?? '');
    });

    return withMeta;
  }
}

/**
 * Tonight's wrap up, counted from the person's day: Sweep's cards, every one
 * of them a swipe card. A todo that was due today and did not happen is a
 * card like any other, with every choice a card has.
 */
export const selectWrapUp = createSelector(
  [
    selectTodos,
    selectNotes,
    selectWorlds,
    selectDropWorldLinks,
    // the person's day as the store has it, so the cards are worked out again when it rolls over
    (state: GremlyState) => state.currentDate,
    selectStepsOnClosedChapters,
  ],
  (todos, notes, worlds, dropWorldLinks, _day, left) => {
    const day = ds().ritualDay();
    return { cards: sweepCandidatesAsOf(todos, notes, worlds, dropWorldLinks, day, left) };
  },
);

/** How many cards tonight's wrap up has: the number the home card, the chip and Gremly's line say. */
export const selectWrapUpCount = createSelector([selectWrapUp], (w): number => w.cards.length);

/** Count of unified sweep candidates */
export const selectSweepCandidateCountUnified = createSelector(
  [selectSweepCandidatesUnified],
  (candidates): number => candidates.length,
);

/** The quick sweep's cards (lib/sweep/quickSweep.ts): only what still needs a decision. */
export const selectQuickSweepCandidates = createSelector(
  [selectSweepCandidatesUnified],
  (candidates) => quickSweepCards(candidates, getTodayDayString()),
);

export const selectQuickSweepCount = createSelector(
  [selectQuickSweepCandidates],
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
      const createdDay = ds().dayOf(j.created_at);
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
    const createdDay = ds().dayOf(i.created_at);
    return createdDay && createdDay < sevenDaysAgo;
  });
});

/** Your Notes for Today page - all notes from past 7 days except catchall */
export const selectYourNotes = createSelector([selectActiveNotes], (notes): Note[] => {
  const sevenDaysAgo = getDaysAgoDayString(7);

  return notes.filter((n) => {
    const createdDay = ds().dayOf(n.created_at) ?? '';
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
export const createSearchSelector = (query: string, filters?: { type?: string; tag?: string }) =>
  createSelector(
    [selectTodos, selectHabits, selectNotes],
    (todos, habits, notes): (Todo | Habit | Note)[] => {
      const lowerQuery = query.toLowerCase().trim();
      if (!lowerQuery && !filters?.type && !filters?.tag) {
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

      const matchesFilters = (item: { type: string; tags?: string[] | null }) => {
        if (filters?.type && item.type !== filters.type) return false;
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
function computeHabitWeeklyStatus(
  habit: Habit,
  completionsThisWeek: number,
  today: string,
  weeklyDay: number,
): HabitWeeklyStatus {
  const cadence = habit.cadence ?? 'daily';
  const target = habit.target_per_period ?? (cadence === 'daily' ? 7 : 1);
  // days left in their week including today: 7 on its first day, 1 on their weekly day
  const daysRemaining = 8 - dayOfWeek(today, weeklyDay);

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
  [selectHubHabits, selectCompletionsThisWeek, selectWeeklyDay, selectToday],
  (habits, completionsMap, weeklyDay, today): NowWeeklyHabitSummary[] => {
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
        status: computeHabitWeeklyStatus(habit, completionsThisWeek, today, weeklyDay),
      };
    });
  },
);

/** Count of habits that are "up to date" (checked in within their cadence window) */
export const selectHabitsUpToDateCount = createSelector(
  [selectHubHabits, selectHabitAdaptations, selectToday],
  (habits, eases, today): { upToDate: number; total: number } => {
    const yesterday = getDaysAgoDayString(1);
    const sevenDaysAgo = getDaysAgoDayString(7);

    const upToDate = habits.filter((habit) => {
      // paused today, it is left alone: there is nothing to be behind on
      if (pausedOn(eases, habit.id, today)) return true;
      const lastCheckedIn = ds().dayOf(habit.last_checked_in_at);
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

/** Unsorted items - ai_placed = true */
export const selectUnsortedItems = createSelector([selectAllItems], (items) =>
  items.filter((item) => item.ai_placed === true && !item.archived),
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
export const useActiveItems = () => useGremlyStore(selectTodayActiveItems);
export const useCompletedToday = () => useGremlyStore(selectTodayCompletedItems);
export const useTodayProgress = () => useGremlyStore(selectTodayProgress);

export const useSweepCandidates = () => useGremlyStore(selectSweepCandidates);
export const useSweepCount = () => useGremlyStore(selectSweepCandidateCount);
export const useSweepCandidatesUnified = () => useGremlyStore(selectSweepCandidatesUnified);
export const useSweepCountUnified = () => useGremlyStore(selectSweepCandidateCountUnified);

export const WEEKLY_SKIP_BUDGET = 3;

export const useSkipBudget = () => {
  // Subscribe to a single primitive — stable reference, no snapshot loop.
  const used = useGremlyStore((state) => state.skipsUsedLast7Days);

  // Derive everything else outside the store subscription. Cheap, no memo needed.
  const total = WEEKLY_SKIP_BUDGET;
  const remaining = Math.max(0, total - used);
  const canSkip = remaining > 0;

  return { used, remaining, total, canSkip };
};

export const useRecentDrops = () => useGremlyStore(selectRecentDrops);
export const useForgottenTodos = () => useGremlyStore(selectForgottenTodos);
export const useYourNotes = () => useGremlyStore(selectYourNotes);
export const useRecentJournals = () => useGremlyStore(selectRecentJournals);

export const usePopularTags = () => useGremlyStore(selectPopularTags);

export const useArchivedItems = () => useGremlyStore(selectAllArchivedItems);

export const useOverdueTodos = () => useGremlyStore(selectOverdueTodos);
export const useRolledOverTodos = () => useGremlyStore(selectRolledOverTodos);
export const useUnscheduledTodosForMiniSweep = () =>
  useGremlyStore(selectUnscheduledTodosForMiniSweep);
export const useTodayLogsCount = () => useGremlyStore(selectTodayLogsCount);
export const useHabitsCompletedToday = () => useGremlyStore(selectHabitsCompletedToday);
export const useWeeklyHabitSummaries = () => useGremlyStore(selectWeeklyHabitSummaries);

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
// CHAT MESSAGE SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT NOTE SELECTORS (Key Dates feature)
// ═══════════════════════════════════════════════════════════════════════════════

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
    if (item.origin === 'catchall' && item.ai_placed === false) return true;
    return false;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PENDING DROPS SELECTORS (optimistic UI for quick-add)
// ═══════════════════════════════════════════════════════════════════════════════

import type { QueuedDrop } from '../minddrop/dropQueue';

/**
 * Get pending drops for Today's Focus (source: 'today')
 * Shows optimistic loading cards while drops are processing
 * Uses useShallow to prevent infinite re-renders from new array references
 */
export function useTodayPendingDrops(): QueuedDrop[] {
  return useGremlyStore(
    useShallow((state) => {
      return state.queueItems.filter(
        (d) => d.source === 'today' && d.phase !== 'complete' && d.phase !== 'failed',
      );
    }),
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY LOOKUP BY IDS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Entity union type for selectEntitiesByIds
 */
export type DropEntity = (Todo | Note | Habit) & { _type: 'todo' | 'note' | 'habit' };

/**
 * Get entities (todos, notes, habits) by an array of IDs
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
      .filter((n) => {
        if (n.target_date === dateStr) return true;
        // Multi-day events: include if dateStr falls within target_date..end_date
        if (n.target_date && n.end_date) {
          return dateStr >= n.target_date && dateStr <= n.end_date;
        }
        return false;
      })
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
    eventNotes.filter((n) => {
      if (n.target_date == null) return false;
      // Event starts within the range
      if (n.target_date >= startDate && n.target_date <= endDate) return true;
      // Multi-day event that started before range but extends into it
      if (n.end_date && n.target_date < startDate && n.end_date >= startDate) return true;
      return false;
    }),
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
      .filter((n) => {
        if (n.target_date == null) return false;
        // Event starts within the range
        if (n.target_date >= today && n.target_date <= endDate) return true;
        // Multi-day event that started before today but extends into range
        if (n.end_date && n.target_date < today && n.end_date >= today) return true;
        return false;
      })
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

/**
 * The summary for the week they are in: the one whose seven days include
 * today (lib/weeklySummary/currentSummary.ts). A summary covers the seven days
 * that end on their weekly day, so for a Monday to Sunday week this is the
 * summary that starts this Monday, as it always was.
 */
export const selectCurrentWeekSummary = createSelector(
  [selectWeeklySummaries],
  (summaries): WeeklySummary | undefined => summaryForDay(summaries, ds().today()),
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

// ═══════════════════════════════════════════════════════════════════
// DCO SELECTORS
// ═══════════════════════════════════════════════════════════════════

/** The full DCO object for today (or null if not generated yet) */
export const selectDco = (state: ReturnType<typeof useGremlyStore.getState>) => state.dco;

/** The brief_headline string for Gremly speech bubble and notifications */
export const selectBriefHeadline = (state: ReturnType<typeof useGremlyStore.getState>) =>
  state.dco?.brief_headline ?? null;

/** The DCO tone signal — consumed by sweep, notifications, and chat */
export const selectDcoTone = (state: ReturnType<typeof useGremlyStore.getState>) =>
  state.dco?.tone ?? null;

/** Today's focus priorities (populated after Morning Brief) */
export const selectTodayFocus = (state: ReturnType<typeof useGremlyStore.getState>) =>
  state.dco?.today_focus ?? null;

/** Named anchors (people, trips, projects) from the DCO */
export const selectNamedAnchors = (state: ReturnType<typeof useGremlyStore.getState>) =>
  state.dco?.named_anchors ?? [];

/** Whether the DCO is currently loading */
export const selectDcoLoading = (state: ReturnType<typeof useGremlyStore.getState>) =>
  state.dcoLoading;

/** The life moment string */
export const selectLifeMoment = (state: ReturnType<typeof useGremlyStore.getState>) =>
  state.dco?.life_moment ?? null;
