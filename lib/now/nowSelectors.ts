/**
 * NOW Page Selectors
 * Pure functions for deriving NOW page data from repo entities
 * No UI code - deterministic data transformations only
 *
 * GREMLY TODO DATE MODEL:
 * Uses due_day (YYYY-MM-DD) as the canonical field for todo date comparisons.
 * Today lane filtering uses simple string comparison: todo.due_day === getTodayDayString()
 * This avoids UTC timezone drift issues.
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
import { getTodayDayString } from '../date/computeDueDay';
import {
  jsonToFrequency,
  getFrequencyLabel,
  type FrequencyConfig,
} from '../../components/overlay/frequencyHelpers';
import { getFrequencyLabel as getHabitFrequencyLabel } from '../sweep/habitHelpers';

export interface NowWeeklyCaptureCounts {
  listCount: number;
  journalCount: number;
  ideaCount: number;
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
  // Use centralized frequency label logic
  const baseLabel = getHabitFrequencyLabel(habit);

  // Add progress context for weekly/monthly habits
  if (habit.cadence === 'weekly') {
    const target = habit.target_per_period ?? 1;
    if (typeof progress.thisWeek === 'number') {
      const completed = Math.min(progress.thisWeek, target);
      return `${completed}/${target} this week`;
    }
  }

  if (habit.cadence === 'monthly') {
    const target = habit.target_per_period ?? 1;
    if (typeof progress.thisMonth === 'number') {
      const completed = Math.min(progress.thisMonth, target);
      return `${completed}/${target} this month`;
    }
  }

  return baseLabel;
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

/**
 * Get count of logs created TODAY
 *
 * TODAY LOGIC for logs:
 * - If the note has an explicit `date` field (journal entries), use that
 * - Otherwise, fall back to `created_at` timestamp in local timezone
 * - This handles MindDrop logs which may not have `date` set
 *
 * EXCLUSIONS:
 * - Unsorted/catchall notes are NOT counted as logs
 * - Notes with subtype 'catchall' or unsorted=true are excluded
 * - Only proper logs (journal, idea, list, reference, everything_else, plain) are counted
 *
 * @param logs - Array of notes to filter
 * @param date - Reference date for "today" (defaults to now)
 * @returns Count of logs created today
 */
export function getTodayLogsCount(logs: Note[], date: Date = new Date()): number {
  // Compute today string in local timezone
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  return logs.filter((log) => {
    // Exclude unsorted/catchall items - they are NOT logs
    // They appear in Mind Drop (CatchAllNotepad) until converted
    if (log.subtype === 'catchall') return false;

    // Also exclude items with 'needs_review' or 'catchall' labels
    const labels = log.labels ?? [];
    if (labels.includes('needs_review') || labels.includes('catchall')) return false;

    // First check explicit date field (used by journal entries)
    if (log.date) {
      // date field is already YYYY-MM-DD format
      return log.date === todayStr;
    }

    // Fall back to created_at for MindDrop logs without explicit date
    // Parse created_at (ISO timestamp) and compare in local timezone
    const createdDate = new Date(log.created_at);
    const cYear = createdDate.getFullYear();
    const cMonth = String(createdDate.getMonth() + 1).padStart(2, '0');
    const cDay = String(createdDate.getDate()).padStart(2, '0');
    const createdDateStr = `${cYear}-${cMonth}-${cDay}`;
    return createdDateStr === todayStr;
  }).length;
}

export function getWeeklyCaptureCounts(
  logs: Note[],
  date: Date = new Date(),
): NowWeeklyCaptureCounts {
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

  return {
    listCount,
    journalCount,
    ideaCount,
  };
}

/**
 * Get today's date as YYYY-MM-DD string in local timezone
 * This is the canonical format for day-based comparisons.
 * Uses the central helper from computeDueDay.ts
 */
function getTodayString(date: Date = new Date()): string {
  // For compatibility with existing code that passes a specific date,
  // compute the string in local timezone
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a todo is due today using ONLY due_day (canonical field)
 * GREMLY TODO DATE MODEL:
 * - Uses ONLY due_day (YYYY-MM-DD) for filtering
 * - Todos with null/undefined due_day are NOT shown in Today
 * - No fallback to due_date or due_at timestamps (avoids timezone drift)
 * @param todo - The todo to check
 * @param todayStr - Today's date as YYYY-MM-DD string
 */
function isTodoDueToday(todo: Todo, todayStr: string): boolean {
  // ONLY use due_day - no fallbacks to avoid timezone issues
  // Todos without due_day are NOT shown in Today's Focus
  if (!todo.due_day) {
    return false;
  }
  return todo.due_day === todayStr;
}

/**
 * Check if a todo is in the future (due after today)
 * GREMLY TODO DATE MODEL: Uses ONLY due_day for comparison
 * @param todo - The todo to check
 * @param todayStr - Today's date as YYYY-MM-DD string
 */
function isTodoDueFuture(todo: Todo, todayStr: string): boolean {
  // ONLY use due_day - no fallbacks
  if (!todo.due_day) {
    return false;
  }
  return todo.due_day > todayStr;
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

  const todayStr = getTodayString(date);

  // ONLY use due_day for status text
  if (todo.due_day) {
    if (isTodoDueToday(todo, todayStr)) {
      return 'Due today';
    }
    if (isTodoDueFuture(todo, todayStr)) {
      const dueDate = parseDateString(todo.due_day);
      return `Due ${dueDate.toLocaleDateString(undefined, { weekday: 'short' })}`;
    }
    return 'Overdue';
  }

  // No due date set
  return 'No due date';
}

/**
 * Check if a habit is needed today
 *
 * Per GREMLY_MASTER_SPECIFICATION.md Section 4.2:
 * - Daily habits: Always shown
 * - Weekly habits with 0 done: Shows every day
 * - Weekly habits with some done (flexible): Shows dimmed as "X more this week"
 * - Weekly habits with target hit (week_complete): Hidden
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
  // Show if on_track_today, last_chance, OR flexible (shown dimmed)
  // Only hide if week_complete (target already hit)
  const status = getHabitWeeklyStatus(habit, completionsThisWeek, date);
  return status === 'on_track_today' || status === 'last_chance' || status === 'flexible';
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
    // Check if entity has commitment flag (locked-in for today)
    // The database field is 'commitment', UI uses 'locked' terminology
    const isLocked = (entity as any).commitment === true;
    if (!isLocked) continue;

    // Skip completed or archived items
    // Check both status field and archived boolean (sweep sets archived=true without status change)
    const status = (entity as any).status;
    const isArchived = (entity as any).archived === true;
    if (status === 'completed' || status === 'archived' || isArchived) continue;

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
      const todayStr = getTodayString(date);

      // Only include todos due TODAY using due_day (canonical)
      // Todos with null due_day are NOT shown
      if (isTodoDueToday(todo, todayStr)) {
        locked.push({
          id: todo.id,
          type: 'todo',
          name: todo.name,
          statusText: formatTodoStatusText(todo, date),
          locked: true,
          dueDay: todo.due_day, // Canonical field
          dueAt: todo.due_day, // Deprecated but kept for backwards compat
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

    // Skip completed or archived items
    // Check both status field and archived boolean (sweep sets archived=true without status change)
    const status = (entity as any).status;
    const isArchived = (entity as any).archived === true;
    if (status === 'completed' || status === 'archived' || isArchived) continue;

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
      const todayStr = getTodayString(date);

      // Only include todos due TODAY using due_day (canonical)
      // Todos with null due_day are NOT shown
      if (isTodoDueToday(todo, todayStr)) {
        active.push({
          id: todo.id,
          type: 'todo',
          name: todo.name,
          statusText: formatTodoStatusText(todo, date),
          locked: false,
          dueDay: todo.due_day, // Canonical field
          dueAt: todo.due_day, // Deprecated but kept for backwards compat
          dueTime: (todo as any).due_time || null,
          timeWindow: (todo as any).time_window || 'any',
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

    // Skip completed or archived items
    // Check both status field and archived boolean (sweep sets archived=true without status change)
    const status = (entity as any).status;
    const isArchived = (entity as any).archived === true;
    if (status === 'completed' || status === 'archived' || isArchived) continue;

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
    }
    // Note: Todos are NOT included in Future lane
    // The Now page only shows items due TODAY to keep the experience simple
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
      const todayStr = getTodayString(date);

      // Only include todos due TODAY using due_day (canonical)
      // Todos with null due_day are NOT eligible for progress
      if (isTodoDueToday(todo, todayStr)) {
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
  weeklyCaptureCounts?: NowWeeklyCaptureCounts,
): MindVaultSummary {
  const { listCount, journalCount, ideaCount } =
    weeklyCaptureCounts ?? getWeeklyCaptureCounts(logs, date);
  const personCount = 0; // Person is not a valid NoteSubtype, would need separate tracking

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
