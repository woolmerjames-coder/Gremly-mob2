/**
 * NOW Page Selectors
 * Pure functions for deriving NOW page data from repo entities
 * No UI code - deterministic data transformations only
 */

import type { Habit, Todo, Note } from '../types';
import type {
  NowEntity,
  NowLockedItem,
  NowActiveItem,
  NowFutureItem,
  NowCompletedItem,
  NowProgressState,
  NowProgressMode,
  HabitWeeklyStatus,
  MindVaultSummary,
  NowWeeklyHabitSummary,
  NowWeekHealth,
} from './nowTypes';

export interface NowWeeklyLogCounts {
  listCount: number;
  journalCount: number;
  ideaCount: number;
  personCount: number;
}

const HABIT_STATUS_LABELS: Record<HabitWeeklyStatus, string> = {
  week_complete: 'Week complete ✓',
  flexible: 'Flexible this week',
  on_track_today: 'On track',
  last_chance: 'Last chance today',
};

type HabitProgressSnapshot = {
  today?: number;
  thisWeek?: number;
  thisMonth?: number;
};

function clampProgress(value: number, target: number): number {
  if (typeof target !== 'number' || target <= 0) {
    return Math.max(0, value);
  }
  return Math.max(0, Math.min(value, target));
}

function buildCadenceLabelForHabit(
  habit: Habit,
  progress: HabitProgressSnapshot,
): string | undefined {
  const cadence = habit.cadence ?? 'daily';

  if (cadence === 'daily') {
    const targetPerDay = habit.target_per_day ?? 1;
    if (targetPerDay <= 1) {
      return 'Daily';
    }
    if (typeof progress.today === 'number') {
      const completed = clampProgress(progress.today, targetPerDay);
      return `${completed}/${targetPerDay} today`;
    }
    // TODO: Daily cadence labels for multi-per-day habits require progress_today to be hydrated.
    return undefined;
  }

  if (cadence === 'weekly') {
    const targetPerWeek = habit.target_per_period ?? 0;
    if (targetPerWeek > 0 && typeof progress.thisWeek === 'number') {
      const completed = clampProgress(progress.thisWeek, targetPerWeek);
      return `${completed}/${targetPerWeek} this week`;
    }
    return undefined;
  }

  if (cadence === 'monthly') {
    const targetPerMonth = habit.target_per_period;
    if (typeof targetPerMonth === 'number' && typeof progress.thisMonth === 'number') {
      const completed = clampProgress(progress.thisMonth, targetPerMonth);
      return `${completed}/${targetPerMonth} this month`;
    }
    // TODO: Monthly cadence label requires monthly aggregation from habit_progress.
    return undefined;
  }

  return undefined;
}

function getHabitProgressSnapshot(
  habit: Habit,
  completionsThisWeek: number,
): HabitProgressSnapshot {
  const progressToday =
    typeof (habit as any).progress_today === 'number' ? (habit as any).progress_today : undefined;

  return {
    today: progressToday,
    thisWeek: completionsThisWeek,
    // TODO: Populate thisMonth when backend exposes monthly progress counts.
  };
}

/**
 * Get the current day number (0=Sunday, 6=Saturday)
 */
function getCurrentDayNumber(date: Date): number {
  return date.getDay();
}

/**
 * Get start of week (Sunday) for a given date
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

export function getWeeklyLogCounts(logs: Note[], date: Date = new Date()): NowWeeklyLogCounts {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const thisWeekLogs = logs.filter((log) => {
    const logDate = new Date(log.created_at);
    return logDate >= weekStart && logDate < weekEnd;
  });

  const listCount = thisWeekLogs.filter((log) => log.subtype === 'list').length;
  const journalCount = thisWeekLogs.filter((log) => log.subtype === 'journal').length;
  const ideaCount = thisWeekLogs.filter((log) => log.subtype === 'idea').length;
  const personCount = thisWeekLogs.filter((log) => (log as any).subtype === 'person').length;

  return {
    listCount,
    journalCount,
    ideaCount,
    personCount,
  };
}

/**
 * Check if a date is today
 */
function isToday(date: Date, checkDate: Date | string): boolean {
  const check = typeof checkDate === 'string' ? parseDateString(checkDate) : checkDate;
  return (
    date.getUTCFullYear() === check.getUTCFullYear() &&
    date.getUTCMonth() === check.getUTCMonth() &&
    date.getUTCDate() === check.getUTCDate()
  );
}

/**
 * Parse YYYY-MM-DD date string to Date object at midnight UTC
 */
function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Check if a date is in the future (tomorrow or later)
 */
function isFuture(date: Date, checkDate: Date | string): boolean {
  const check = typeof checkDate === 'string' ? parseDateString(checkDate) : new Date(checkDate);
  const today = new Date(date);
  today.setUTCHours(0, 0, 0, 0);
  check.setUTCHours(0, 0, 0, 0);
  return check > today;
}

/**
 * Get habit weekly status based on completion progress
 */
export function getHabitWeeklyStatus(
  habit: Habit,
  completionsThisWeek: number,
  date: Date = new Date(),
): HabitWeeklyStatus {
  const cadence = habit.cadence || 'daily';
  const targetPerWeek = habit.target_per_period || 7;

  // Daily habits are always on track today if not completed yet
  if (cadence === 'daily') {
    return 'on_track_today';
  }

  // For weekly habits
  if (cadence === 'weekly') {
    const currentDayNumber = getCurrentDayNumber(date); // 0=Sun, 6=Sat
    const daysLeft = 7 - currentDayNumber;
    const remaining = targetPerWeek - completionsThisWeek;

    // Already hit target for the week
    if (remaining <= 0) {
      return 'week_complete';
    }

    // More days left than needed - flexible
    if (daysLeft > remaining) {
      return 'flexible';
    }

    // Exactly right or last chance
    if (daysLeft === remaining) {
      return 'on_track_today';
    }

    // Behind schedule - last chance
    return 'last_chance';
  }

  // Monthly habits - treat as flexible
  return 'flexible';
}

function formatHabitStatusText(
  habit: Habit,
  weeklyStatus: HabitWeeklyStatus,
  completionsThisWeek: number,
): string {
  if (weeklyStatus && weeklyStatus !== 'on_track_today') {
    return HABIT_STATUS_LABELS[weeklyStatus];
  }

  if (habit.cadence === 'weekly' && typeof habit.target_per_period === 'number') {
    const target = habit.target_per_period > 0 ? habit.target_per_period : 0;
    if (target > 0) {
      const clamped = Math.min(completionsThisWeek, target);
      return `${clamped}/${target} this week`;
    }
  }

  if (habit.cadence === 'daily') {
    return HABIT_STATUS_LABELS.on_track_today;
  }

  return HABIT_STATUS_LABELS[weeklyStatus] ?? HABIT_STATUS_LABELS.on_track_today;
}

function formatTodoStatusText(todo: Todo, date: Date = new Date()): string {
  const dueTime = (todo as any).due_time;
  if (dueTime) {
    return dueTime;
  }

  if (todo.due_date) {
    if (isToday(date, todo.due_date)) {
      return 'Due today';
    }
    if (isFuture(date, todo.due_date)) {
      const dueDate = parseDateString(todo.due_date);
      return `Due ${dueDate.toLocaleDateString(undefined, { weekday: 'short' })}`;
    }
    return 'Overdue';
  }

  return 'On track';
}

/**
 * Check if a habit is needed today
 */
export function isHabitNeededToday(
  habit: Habit,
  completionsThisWeek: number,
  date: Date = new Date(),
): boolean {
  const cadence = habit.cadence || 'daily';

  // Daily habits are always needed
  if (cadence === 'daily') {
    return true;
  }

  // Weekly habits - check status
  const status = getHabitWeeklyStatus(habit, completionsThisWeek, date);
  return status === 'on_track_today' || status === 'last_chance';
}

/**
 * Get locked items for NOW
 */
export function getLockedItems(
  allEntities: NowEntity[],
  completionHistory: Map<string, number>, // habitId -> completions this week
  date: Date = new Date(),
): NowLockedItem[] {
  const locked: NowLockedItem[] = [];

  for (const entity of allEntities) {
    // Check if entity has locked flag
    const isLocked = (entity as any).locked === true;
    if (!isLocked) continue;

    if (entity.type === 'habit') {
      const habit = entity as Habit;
      const completionsThisWeek = completionHistory.get(habit.id) || 0;
      const needed = isHabitNeededToday(habit, completionsThisWeek, date);

      if (needed) {
        const weeklyStatus = getHabitWeeklyStatus(habit, completionsThisWeek, date);
        const progressSnapshot = getHabitProgressSnapshot(habit, completionsThisWeek);
        locked.push({
          id: habit.id,
          type: 'habit',
          name: habit.name,
          cadenceLabel: buildCadenceLabelForHabit(habit, progressSnapshot),
          statusText: formatHabitStatusText(habit, weeklyStatus, completionsThisWeek),
          locked: true,
          cadence: habit.cadence,
          targetPerPeriod: habit.target_per_period,
          progressToday: (habit as any).progress_today || 0,
        });
      }
    } else if (entity.type === 'todo') {
      const todo = entity as Todo;

      // Include if due today or overdue
      if (
        todo.due_date &&
        (isToday(date, todo.due_date) || isFuture(date, todo.due_date) === false)
      ) {
        locked.push({
          id: todo.id,
          type: 'todo',
          name: todo.name,
          statusText: formatTodoStatusText(todo, date),
          locked: true,
          dueAt: todo.due_date,
        });
      }
    }
  }

  return locked;
}

/**
 * Get active items for today (excluding locked)
 */
export function getActiveTodayItems(
  allEntities: NowEntity[],
  completionHistory: Map<string, number>,
  date: Date = new Date(),
): NowActiveItem[] {
  const active: NowActiveItem[] = [];
  const lockedIds = new Set(
    getLockedItems(allEntities, completionHistory, date).map((item) => item.id),
  );

  for (const entity of allEntities) {
    // Skip locked items
    if (lockedIds.has(entity.id)) continue;

    // Skip completed items
    if ((entity as any).status === 'completed') continue;

    if (entity.type === 'habit') {
      const habit = entity as Habit;
      const completionsThisWeek = completionHistory.get(habit.id) || 0;
      const needed = isHabitNeededToday(habit, completionsThisWeek, date);

      if (needed) {
        const weeklyStatus = getHabitWeeklyStatus(habit, completionsThisWeek, date);
        const progressSnapshot = getHabitProgressSnapshot(habit, completionsThisWeek);
        active.push({
          id: habit.id,
          type: 'habit',
          name: habit.name,
          cadenceLabel: buildCadenceLabelForHabit(habit, progressSnapshot),
          statusText: formatHabitStatusText(habit, weeklyStatus, completionsThisWeek),
          locked: false,
          cadence: habit.cadence,
          targetPerPeriod: habit.target_per_period,
          progressToday: (habit as any).progress_today || 0,
          weeklyStatus,
          timeWindow: (habit as any).time_window || 'any',
        });
      }
    } else if (entity.type === 'todo') {
      const todo = entity as Todo;

      // Include if due today
      if (todo.due_date && isToday(date, todo.due_date)) {
        active.push({
          id: todo.id,
          type: 'todo',
          name: todo.name,
          statusText: formatTodoStatusText(todo, date),
          locked: false,
          dueAt: todo.due_date,
          dueTime: (todo as any).due_time || null,
        });
      }
    }
  }

  return active;
}

/**
 * Get future items (tomorrow+, flexible habits)
 */
export function getFutureItems(
  allEntities: NowEntity[],
  completionHistory: Map<string, number>,
  date: Date = new Date(),
): NowFutureItem[] {
  const future: NowFutureItem[] = [];
  const todayIds = new Set([
    ...getLockedItems(allEntities, completionHistory, date).map((item) => item.id),
    ...getActiveTodayItems(allEntities, completionHistory, date).map((item) => item.id),
  ]);

  for (const entity of allEntities) {
    // Skip items already in today/locked
    if (todayIds.has(entity.id)) continue;

    // Skip completed items
    if ((entity as any).status === 'completed') continue;

    if (entity.type === 'habit') {
      const habit = entity as Habit;
      const completionsThisWeek = completionHistory.get(habit.id) || 0;

      const weeklyStatus = getHabitWeeklyStatus(habit, completionsThisWeek, date);
      const progressSnapshot = getHabitProgressSnapshot(habit, completionsThisWeek);
      future.push({
        id: habit.id,
        type: 'habit',
        name: habit.name,
        cadenceLabel: buildCadenceLabelForHabit(habit, progressSnapshot),
        statusText: formatHabitStatusText(habit, weeklyStatus, completionsThisWeek),
        cadence: habit.cadence,
        targetPerPeriod: habit.target_per_period,
        weeklyStatus,
      });
    } else if (entity.type === 'todo') {
      const todo = entity as Todo;

      // Include if due in future
      if (todo.due_date && isFuture(date, todo.due_date)) {
        future.push({
          id: todo.id,
          type: 'todo',
          name: todo.name,
          statusText: formatTodoStatusText(todo, date),
          dueAt: todo.due_date,
        });
      }
    }
  }

  return future;
}

/**
 * Get progress-eligible items for today
 */
export function getProgressEligibleItems(
  allEntities: NowEntity[],
  completionHistory: Map<string, number>,
  date: Date = new Date(),
): Array<{ id: string; type: 'habit' | 'todo' }> {
  const eligible: Array<{ id: string; type: 'habit' | 'todo' }> = [];

  for (const entity of allEntities) {
    if (entity.type === 'habit') {
      const habit = entity as Habit;
      const cadence = habit.cadence || 'daily';
      const completionsThisWeek = completionHistory.get(habit.id) || 0;
      const status = getHabitWeeklyStatus(habit, completionsThisWeek, date);

      // Include daily habits and weekly habits needing today
      // Exclude flexible and week_complete
      if (
        cadence === 'daily' ||
        status === 'on_track_today' ||
        status === 'last_chance' ||
        (habit as any).locked === true
      ) {
        eligible.push({ id: habit.id, type: 'habit' });
      }
    } else if (entity.type === 'todo') {
      const todo = entity as Todo;

      // Include todos due today (including time-specific ones)
      if (todo.due_date && isToday(date, todo.due_date)) {
        eligible.push({ id: todo.id, type: 'todo' });
      }
    }
  }

  return eligible;
}

/**
 * Calculate progress state for today
 */
export function getProgressState(
  eligibleItems: Array<{ id: string; type: 'habit' | 'todo' }>,
  completedItemsToday: Set<string>,
): NowProgressState {
  const totalEligibleCount = eligibleItems.length;
  const completedCount = eligibleItems.filter((item) => completedItemsToday.has(item.id)).length;

  const percent = totalEligibleCount > 0 ? (completedCount / totalEligibleCount) * 100 : 0;

  // Determine mode
  let mode: NowProgressMode = 'bar';
  let dots: boolean[] | undefined;

  if (totalEligibleCount <= 15) {
    mode = 'dots';
    dots = eligibleItems.map((item) => completedItemsToday.has(item.id));
  } else if (totalEligibleCount <= 30) {
    mode = 'denseDots';
    dots = eligibleItems.map((item) => completedItemsToday.has(item.id));
  }

  return {
    mode,
    percent: Math.round(percent),
    completedCount,
    totalEligibleCount,
    dots,
  };
}

/**
 * Get completed items for today
 */
export function getCompletedTodayItems(
  allEntities: NowEntity[],
  date: Date = new Date(),
): NowCompletedItem[] {
  const completed: NowCompletedItem[] = [];

  for (const entity of allEntities) {
    if (entity.type === 'habit') {
      const habit = entity as Habit;
      const completedAt = habit.last_completed_at;

      if (completedAt && isToday(date, new Date(completedAt))) {
        completed.push({
          id: habit.id,
          type: 'habit',
          name: habit.name,
          completedAt,
          progressCount: (habit as any).progress_today || 0,
        });
      }
    } else if (entity.type === 'todo') {
      const todo = entity as Todo;
      const completedAt = (todo as any).completed_at;

      if (completedAt && isToday(date, new Date(completedAt))) {
        completed.push({
          id: todo.id,
          type: 'todo',
          name: todo.name,
          completedAt,
        });
      }
    }
  }

  // Sort by completion time (most recent first)
  return completed.sort((a, b) => {
    return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
  });
}

/**
 * Get Mind Vault summary from logs
 */
export function getMindVaultSummary(
  logs: Note[],
  date: Date = new Date(),
  weeklyLogCounts?: NowWeeklyLogCounts,
): MindVaultSummary {
  const { listCount, journalCount, ideaCount, personCount } =
    weeklyLogCounts ?? getWeeklyLogCounts(logs, date);

  // Identify list logs and count items
  const listLogs = logs.filter((log) => log.subtype === 'list');
  const listsWithCounts = listLogs.map((log) => ({
    id: log.id,
    name: log.title || 'Untitled List',
    itemCount: (log as any).item_count || 0,
  }));

  // Sort by item count and take top 3
  listsWithCounts.sort((a, b) => b.itemCount - a.itemCount);
  const topThree = listsWithCounts.slice(0, 3);
  const overflowCount = Math.max(0, listsWithCounts.length - 3);

  return {
    topThree,
    overflowCount,
    thisWeekStats: {
      listCount,
      journalCount,
      ideaCount,
      personCount,
    },
  };
}

export function computeWeekHealth(summaries: NowWeeklyHabitSummary[]): NowWeekHealth {
  if (!summaries || summaries.length === 0) {
    return 'on_track';
  }

  let hasBehind = false;
  let hasAhead = false;

  for (const summary of summaries) {
    if (summary.status === 'last_chance') {
      hasBehind = true;
    }
    if (summary.status === 'week_complete' || summary.status === 'flexible') {
      hasAhead = true;
    }
  }

  if (hasBehind) {
    return 'behind';
  }
  if (hasAhead) {
    return 'ahead';
  }
  return 'on_track';
}

/**
 * Get weekly habit summaries for progress/week popup
 */
export function getWeeklyHabitSummaries(
  allHabits: Habit[],
  completionHistory: Map<string, number>,
  date: Date = new Date(),
): NowWeeklyHabitSummary[] {
  return allHabits.map((habit) => {
    const completionsThisWeek = completionHistory.get(habit.id) || 0;
    const cadence = habit.cadence || 'daily';
    const targetPerWeek =
      cadence === 'daily' ? 7 : cadence === 'weekly' ? habit.target_per_period || 1 : 0;
    const status = getHabitWeeklyStatus(habit, completionsThisWeek, date);

    return {
      habitId: habit.id,
      name: habit.name || 'Untitled Habit',
      targetPerWeek,
      completionsThisWeek,
      status,
    };
  });
}

// All functions already exported inline above
