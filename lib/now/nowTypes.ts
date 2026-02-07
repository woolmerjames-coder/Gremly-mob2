/**
 * NOW Page Type Definitions
 * Pure TypeScript interfaces for NOW page data structures
 *
 * GREMLY TODO DATE MODEL:
 * - `dueDay` (YYYY-MM-DD) is the canonical field for todo dates
 * - `dueAt` is deprecated and should not be used for filtering
 * - Todos with null dueDay are NOT shown in Today's Focus
 */

import type { Habit, Todo, Note } from '../types';

/**
 * Item locked to NOW - highest priority
 */
export interface NowLockedItem {
  id: string;
  type: 'habit' | 'todo';
  name: string;
  cadenceLabel?: string | null;
  statusText?: string | null;
  locked: true;
  /** @deprecated Use dueDay instead */
  dueAt?: string | null;
  /** Canonical due date in YYYY-MM-DD format */
  dueDay?: string | null;
  cadence?: 'daily' | 'weekly' | 'monthly';
  targetPerPeriod?: number;
  progressToday?: number;
  completedAt?: string | null;
  /** Human-readable frequency like "3 times a week" */
  frequency?: string;
  /** Space ID for this item */
  spaceId?: string | null;
  /** Space name for display */
  spaceName?: string | null;
}

/**
 * Active item for today
 */
export interface NowActiveItem {
  id: string;
  type: 'habit' | 'todo';
  name: string;
  cadenceLabel?: string | null;
  statusText?: string | null;
  locked: false;
  /** @deprecated Use dueDay instead */
  dueAt?: string | null;
  /** Canonical due date in YYYY-MM-DD format */
  dueDay?: string | null;
  dueTime?: string | null;
  cadence?: 'daily' | 'weekly' | 'monthly';
  targetPerPeriod?: number;
  progressToday?: number;
  weeklyStatus?: HabitWeeklyStatus;
  timeWindow?: 'morning' | 'midday' | 'evening' | 'any';
  /** Human-readable frequency like "3 times a week" */
  frequency?: string;
  /** Whether this is a break habit (awareness item, no time estimate) */
  isBreakHabit?: boolean;
  /** Space ID for this item */
  spaceId?: string | null;
  /** Space name for display */
  spaceName?: string | null;
}

/**
 * Future item (tomorrow or later, or flexible habits)
 */
export interface NowFutureItem {
  id: string;
  type: 'habit' | 'todo';
  name: string;
  cadenceLabel?: string | null;
  statusText?: string | null;
  /** @deprecated Use dueDay instead */
  dueAt?: string | null;
  /** Canonical due date in YYYY-MM-DD format */
  dueDay?: string | null;
  cadence?: 'daily' | 'weekly' | 'monthly';
  targetPerPeriod?: number;
  weeklyStatus?: HabitWeeklyStatus;
}

/**
 * Completed item for today
 */
export interface NowCompletedItem {
  id: string;
  type: 'habit' | 'todo';
  name: string;
  completedAt: string;
  progressCount?: number;
}

/**
 * Progress display mode
 */
export type NowProgressMode = 'dots' | 'denseDots' | 'bar';

/**
 * Progress state for today
 */
export interface NowProgressState {
  mode: NowProgressMode;
  percent: number; // 0-100
  completedCount: number;
  totalEligibleCount: number;
  dots?: boolean[]; // Only populated for dot modes
}

/**
 * Weekly status for habits
 */
export type HabitWeeklyStatus = 'week_complete' | 'flexible' | 'on_track_today' | 'last_chance';

export type NowWeekHealth = 'ahead' | 'on_track' | 'behind';

/**
 * Weekly habit summary for progress popup
 */
export interface NowWeeklyHabitSummary {
  habitId: string;
  name: string;
  targetPerWeek: number;
  completionsThisWeek: number;
  status: HabitWeeklyStatus;
}

/**
 * Mind Vault Summary
 */
export interface MindVaultSummary {
  topThree: Array<{
    id: string;
    name: string;
    itemCount: number;
  }>;
  overflowCount: number;
  thisWeekStats: {
    listCount: number;
    journalCount: number;
    ideaCount: number;
    personCount: number;
  };
}

/**
 * Combined entity type for selector inputs
 */
export type NowEntity = Habit | Todo | Note;
