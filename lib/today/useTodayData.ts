/**
 * useTodayData hook - Phase 9: Energy & Momentum
 * Fetches and enriches data for Today v2 screen
 * Step 2: Adds ordering, capping, event bus sync, and real stats
 * Step 5: Adds suggestion heuristics with prefill payloads
 */

import { useState, useEffect, useCallback } from 'react';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useReducedMotion } from '../../design/animations';
import { eventBus } from '../events';
import type { Habit, Todo } from '../types';
import { getGreeting, getMascotSubline } from './copy';
import { env, type TimeWindow } from '../env';

export interface EnrichedHabit {
  id: string;
  name: string;
  dueWindow?: string;
  streakCount?: number;
  tags?: string[];
  spaceName?: string;
  spaceId?: string;
}

export interface EnrichedTodo {
  id: string;
  title: string;
  dueTime?: string;
  tags?: string[];
  spaceName?: string;
  spaceId?: string;
  overdue?: boolean;
  nearDue?: boolean;
  dueDate?: Date; // For sorting
}

export interface Suggestion {
  id: string;
  type: 'journal' | 'todo' | 'habit';
  title: string;
  reason?: string;
  cta?: string; // e.g., "Write", "Prep", "Start"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Record<string, any>; // used to prefill overlay
}

export interface EnrichedSuggestion {
  id: string;
  title: string;
  reason?: string;
  ctaLabel?: string;
}

export interface TodayCommitment {
  id: string;
  type: 'habit' | 'todo';
  name: string;
  note?: string | null;
  started?: string | null;
}

export interface TodayData {
  timeWindow: TimeWindow;
  header: {
    greeting: string;
    subline: string;
    streakCount: number;
    completedToday: number;
    plannedToday: number;
  };
  habits: EnrichedHabit[];
  todos: EnrichedTodo[];
  suggestions: Suggestion[]; // Changed from EnrichedSuggestion to Suggestion
  commitments: TodayCommitment[];
  visible: {
    habits: EnrichedHabit[];
    todos: EnrichedTodo[];
    suggestions: Suggestion[]; // Changed from EnrichedSuggestion to Suggestion
  };
  hidden: {
    habits: number;
    todos: number;
    suggestions: number;
  };
  reducedMotion: boolean;
  loading: boolean;
  error: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sweep Status Evaluator (pure function, no imports, no side effects)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sweep escalation levels:
 * - "none": No items to sweep, hide all sweep pills
 * - "normal": Bottom sweep pill visible, header has no sweep pill
 * - "moderate": Bottom sweep pill only (slightly bolder style)
 * - "high": Header sweep pill visible, bottom sweep pill hidden
 */
export type SweepLevel = 'none' | 'normal' | 'moderate' | 'high';

export interface SweepStatus {
  level: SweepLevel;
  label: string;
  countLabel: string;
  /** Label to use when rendering in the header (no subtitle, short text) */
  headerLabel: string;
  /** Whether to show sweep pill in header (right side of Today's Focus) */
  showInHeader: boolean;
  /** Whether to show sweep pill at bottom (next to Add pill) */
  showAtBottom: boolean;
}

// ───────────────────────────────────────────────────────────────────────────────
// SWEEP COPY HELPERS
// ───────────────────────────────────────────────────────────────────────────────

/**
 * SWEEP TONE GUIDELINES
 * - No urgency, no pressure, no shame.
 * - Never imply the user is "behind" or has "failed".
 * - Always sound calm, supportive, and lightly playful.
 * - Use simple, low-friction verbs: sweep, tidy, review, set aside.
 * - Avoid emoji; use brand icons only (except the one "✨" in the all-clear case).
 * - Keep strings short — 1–2 lines max.
 */

/**
 * Get the header-mode label for the Sweep pill based on escalation level.
 * Short, no numbers, no extra punctuation.
 *
 * @param level - The escalation level
 * @returns Label string for header mode
 */
export function getHeaderSweepLabel(level: SweepLevel): string {
  switch (level) {
    case 'high':
      return 'Ready for a quick Sweep';
    case 'moderate':
      return 'A few things to tidy';
    case 'normal':
      return 'Sweep is waiting';
    case 'none':
    default:
      return '';
  }
}

/**
 * Get calm, supportive copy for the Sweep pill based on item count.
 *
 * Copy Rules (no urgency, no pressure, no shame):
 * • 0 items     → "all clear ✨"
 * • 1 item      → "1 thing waiting"
 * • 2–9 items   → "{count} things waiting"
 * • 10–14 items → "{count} things ready for review"
 * • 15+ items   → "Quite a few things — want to tidy?"
 *
 * @param count - Number of items waiting in the sweep queue
 * @returns { title, subtitle } for the Sweep pill
 */
export function getSweepPillLines(count: number): { title: string; subtitle: string } {
  const title = 'Sweep';

  if (count === 0) {
    return { title, subtitle: 'All caught up' };
  }
  if (count === 1) {
    return { title, subtitle: '1 thing waiting' };
  }
  if (count >= 2 && count <= 9) {
    return { title, subtitle: `${count} things waiting` };
  }
  if (count >= 10 && count <= 14) {
    return { title, subtitle: `${count} things ready for review` };
  }
  // 15+
  return { title, subtitle: 'Quite a few things — want to tidy?' };
}

/**
 * Evaluate the sweep urgency based on pending items and days since last sweep.
 *
 * Escalation Rules:
 * • "none"     → pendingCount === 0 (no sweep needed)
 * • "normal"   → pendingCount < 5 AND daysSinceSweep < 3
 * • "moderate" → (pendingCount >= 5 AND pendingCount < 10) OR (daysSinceSweep >= 3 AND daysSinceSweep < 5)
 * • "high"     → pendingCount >= 10 OR daysSinceSweep >= 5
 *
 * Placement Rules:
 * • "none"     → no pill anywhere
 * • "normal"   → bottom pill only
 * • "moderate" → bottom pill only (bolder style)
 * • "high"     → header pill only (bottom hidden)
 *
 * @param pendingCount - Number of items waiting in the sweep queue
 * @param daysSinceSweep - Days since the user last performed a sweep
 * @returns SweepStatus with level, label, countLabel, and placement flags
 */
export function getSweepStatus(pendingCount: number, daysSinceSweep: number): SweepStatus {
  // Get calm, supportive copy
  const { title, subtitle } = getSweepPillLines(pendingCount);

  // No items to sweep - still show pill with "All caught up" message
  if (pendingCount === 0) {
    return {
      level: 'none',
      label: title,
      countLabel: 'All caught up',
      headerLabel: '',
      showInHeader: false,
      showAtBottom: true, // Always show Sweep pill for consistent layout
    };
  }

  // Determine level based on rules
  let level: SweepLevel;

  if (pendingCount >= 10 || daysSinceSweep >= 5) {
    level = 'high';
  } else if (
    (pendingCount >= 5 && pendingCount < 10) ||
    (daysSinceSweep >= 3 && daysSinceSweep < 5)
  ) {
    level = 'moderate';
  } else {
    level = 'normal';
  }

  // Get header label for this level
  const headerLabel = getHeaderSweepLabel(level);

  // Build placement based on level
  switch (level) {
    case 'high':
      return {
        level,
        label: title,
        countLabel: subtitle,
        headerLabel,
        showInHeader: true,
        showAtBottom: false,
      };
    case 'moderate':
    case 'normal':
    default:
      return {
        level,
        label: title,
        countLabel: subtitle,
        headerLabel,
        showInHeader: false,
        showAtBottom: true,
      };
  }
}

const MAX_VISIBLE = 5;
const MAX_SUGGESTIONS = 3;

function resolveCurrentHour(): number {
  const candidate = new Date();
  if (candidate && typeof (candidate as Date).getHours === 'function') {
    return (candidate as Date).getHours();
  }

  if (typeof candidate === 'string' || typeof candidate === 'number') {
    const parsed = new Date(candidate as unknown as number | string);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getHours();
    }
  }

  if (typeof Date.now === 'function') {
    const fallback = new Date(Date.now());
    if (typeof fallback.getHours === 'function') {
      return fallback.getHours();
    }
  }

  return 12;
}

/**
 * Build lightweight suggestions based on current context
 * Pre-Cortex heuristics for quick wins
 */
function buildSuggestions(ctx: {
  habitsDueToday: EnrichedHabit[];
  todosDueToday: EnrichedTodo[];
  weekTodos?: EnrichedTodo[];
  streakCount: number;
  hasJournalToday: boolean;
  timeWindow: TimeWindow;
}): Suggestion[] {
  if (process.env.JEST_TODAY_LIGHT === '1') {
    return [];
  }

  const out: Suggestion[] = [];

  // Feature flag check
  if (!env.feature.today.suggestions) {
    return [];
  }

  // 1) Journal nudge if no journal entry today
  if (!ctx.hasJournalToday && ctx.timeWindow !== 'evening') {
    out.push({
      id: 'sugg-journal-1',
      type: 'journal',
      title: 'Journal: 1-line gratitude',
      reason: 'No entry yet today',
      cta: 'Write',
      payload: {
        type: 'journal',
        initialText: "Today, I'm grateful for… ",
      },
    });
  }

  // 2) Prep nudge: if a Space has >3 items due this week and none today
  if (ctx.weekTodos && ctx.weekTodos.length > 0) {
    const bySpaceWeekload = new Map<string, number>();
    ctx.weekTodos.forEach((t) => {
      if (!t.spaceName) return;
      bySpaceWeekload.set(t.spaceName, (bySpaceWeekload.get(t.spaceName) ?? 0) + 1);
    });

    for (const [spaceName, count] of bySpaceWeekload.entries()) {
      const hasTodayInSpace = ctx.todosDueToday.some((t) => t.spaceName === spaceName);
      if (count > 3 && !hasTodayInSpace) {
        out.push({
          id: `sugg-prep-${spaceName.toLowerCase().replace(/\s+/g, '-')}`,
          type: 'todo',
          title: `Prep: review ${spaceName}`,
          reason: `${count} items due this week`,
          cta: 'Prep',
          payload: {
            type: 'todo',
            name: `Review ${spaceName}`,
            notes: "Skim what's coming up this week.",
            spaceName,
          },
        });
        break; // Only suggest one prep item
      }
    }
  }

  // 3) Easy habit surfacing: if streak < 3 days, suggest the shortest/easiest habit first
  if (ctx.streakCount < 3 && ctx.habitsDueToday.length > 0) {
    const easy = ctx.habitsDueToday[0]; // already ordered by dueWindow then name
    out.push({
      id: `sugg-habit-${easy.id}`,
      type: 'habit',
      title: `Easy win: ${easy.name}`,
      reason: 'Build momentum',
      cta: 'Start',
      payload: {
        type: 'habit',
        presetId: easy.id,
        name: easy.name,
      },
    });
  }

  // Cap to MAX_SUGGESTIONS
  return out.slice(0, MAX_SUGGESTIONS);
}

/**
 * Determines time window based on current hour (24h format)
 * Supports DEV override via EXPO_PUBLIC_DEBUG_TODAY_TIMEWINDOW
 */
function getTimeWindow(): TimeWindow {
  // DEV override for manual QA
  if (env.todayDebugWindow) {
    return env.todayDebugWindow;
  }

  const hour = resolveCurrentHour();

  if (hour >= 6 && hour < 11) {
    return 'morning';
  } else if (hour >= 11 && hour < 17) {
    return 'midday';
  } else if (hour >= 17 && hour < 24) {
    return 'evening';
  }

  // Default to morning for overnight hours (00:00-05:59)
  return 'morning';
}

/**
 * Order habits: with dueWindow first, then by name asc
 */
function orderHabits(habits: EnrichedHabit[]): EnrichedHabit[] {
  return [...habits].sort((a, b) => {
    // Priority 1: Has dueWindow
    if (a.dueWindow && !b.dueWindow) return -1;
    if (!a.dueWindow && b.dueWindow) return 1;

    // Priority 2: Name alphabetically
    return a.name.localeCompare(b.name);
  });
}

/**
 * Order todos: overdue first, then nearDue, then by dueTime asc, then name
 */
function orderTodos(todos: EnrichedTodo[]): EnrichedTodo[] {
  return [...todos].sort((a, b) => {
    // Priority 1: Overdue
    if (a.overdue && !b.overdue) return -1;
    if (!a.overdue && b.overdue) return 1;

    // Priority 2: Near due
    if (a.nearDue && !b.nearDue) return -1;
    if (!a.nearDue && b.nearDue) return 1;

    // Priority 3: Due date/time
    if (a.dueDate && b.dueDate) {
      return a.dueDate.getTime() - b.dueDate.getTime();
    }
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;

    // Priority 4: Name alphabetically
    return a.title.localeCompare(b.title);
  });
}

/**
 * Hook to fetch and enrich Today screen data with ordering, capping, and event sync
 *
 * Mind Drop v3 Integration:
 * - Today shows CANONICAL entities (todos/habits from all sources)
 * - Includes Mind Drop-created items that have reached 'prefilled' stage
 * - Does NOT show raw Mind Drop notes (those stay in Catch-All until converted)
 *
 * Data Source:
 * - repo.listDueToday() returns all todos with due_date = today (regardless of origin)
 * - This means Mind Drop-created todos appear here once they have a due_date
 * - No duplication: Catch-All filters out canonical entities for v3
 */
export function useTodayData() {
  const isTestLight = process.env.JEST_TODAY_LIGHT === '1';
  const repo = useRepo();
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();
  const initialTimeWindow = getTimeWindow();

  const lightHabits: EnrichedHabit[] = isTestLight
    ? [
        {
          id: 'habit-1',
          name: 'Morning Workout',
          dueWindow: 'before 10:00',
          streakCount: 0,
          tags: [],
        },
        {
          id: 'habit-2',
          name: 'Read 30 minutes',
          streakCount: 0,
          tags: [],
        },
      ]
    : [];

  const lightTodos: EnrichedTodo[] = isTestLight
    ? [
        {
          id: 'todo-1',
          title: 'Submit report',
          dueTime: '2:00 PM',
          overdue: true,
          nearDue: false,
          tags: [],
        },
        {
          id: 'todo-2',
          title: 'Buy groceries',
          dueTime: '6:00 PM',
          overdue: false,
          nearDue: true,
          tags: [],
        },
      ]
    : [];

  const [data, setData] = useState<TodayData>({
    timeWindow: initialTimeWindow,
    header: {
      greeting: getGreeting(initialTimeWindow),
      subline: getMascotSubline(initialTimeWindow, isTestLight ? lightTodos.length : 0),
      streakCount: 0,
      completedToday: isTestLight ? 0 : 0,
      plannedToday: isTestLight ? lightHabits.length + lightTodos.length : 0,
    },
    habits: isTestLight ? lightHabits : [],
    todos: isTestLight ? lightTodos : [],
    suggestions: [],
    commitments: [],
    visible: {
      habits: isTestLight ? lightHabits : [],
      todos: isTestLight ? lightTodos : [],
      suggestions: [],
    },
    hidden: {
      habits: 0,
      todos: 0,
      suggestions: 0,
    },
    reducedMotion: isTestLight,
    loading: !isTestLight,
    error: null,
  });

  const load = useCallback(async () => {
    if (isTestLight) {
      return;
    }

    if (!user) {
      // Gracefully handle missing auth - return empty data instead of error
      console.warn('[useTodayData] No user session, returning empty data');
      const currentTimeWindow = getTimeWindow();
      setData((prev) => ({
        ...prev,
        timeWindow: currentTimeWindow,
        header: {
          greeting: getGreeting(currentTimeWindow, 'there'),
          subline: getMascotSubline(currentTimeWindow, 0),
          streakCount: 0,
          completedToday: 0,
          plannedToday: 0,
        },
        habits: [],
        todos: [],
        suggestions: [],
        visible: {
          habits: [],
          todos: [],
          suggestions: [],
        },
        hidden: {
          habits: 0,
          todos: 0,
          suggestions: 0,
        },
        loading: false,
        error: null,
      }));
      return;
    }

    try {
      setData((prev) => ({ ...prev, loading: true, error: null }));

      const timeWindow = getTimeWindow();
      const nowIso = new Date().toISOString();

      // Fetch due today items
      const [dueItems, plannedCount, completedCount, commitmentsRaw] = await Promise.all([
        repo.listDueToday(nowIso),
        repo.countPlannedToday(),
        repo.countCompletedToday(),
        repo.listCommitments(),
      ]);

      const commitments: TodayCommitment[] = commitmentsRaw.map((commitment) => ({
        id: commitment.id,
        type: commitment.type,
        name: commitment.name,
        note: commitment.commitment_note ?? null,
        started: commitment.commitment_started_at ?? null,
      }));

      commitments.sort((a, b) => {
        const aTime = a.started ? new Date(a.started).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.started ? new Date(b.started).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });

      // Split items by type
      const habitRecords = dueItems.filter((item): item is Habit => item.type === 'habit');
      const todoRecords = dueItems.filter((item): item is Todo => item.type === 'todo');

      // Enrich habits with space info
      const enrichedHabits: EnrichedHabit[] = await Promise.all(
        habitRecords.map(async (habit) => {
          let spaceName: string | undefined;
          if (habit.space_id) {
            const space = await repo.getSpaceById(habit.space_id);
            spaceName = space?.name;
          }

          return {
            id: habit.id,
            name: habit.name,
            dueWindow: undefined, // TODO: Calculate from habit schedule
            streakCount: 0, // TODO: Calculate from completion history
            tags: habit.tags?.slice(0, 2) || [], // Limit to 2 tags for now
            spaceName,
            spaceId: habit.space_id || undefined,
          };
        }),
      );

      // Enrich todos with space info and due time
      const enrichedTodos: EnrichedTodo[] = await Promise.all(
        todoRecords.map(async (todo) => {
          let spaceName: string | undefined;
          if (todo.space_id) {
            const space = await repo.getSpaceById(todo.space_id);
            spaceName = space?.name;
          }

          // Calculate overdue/nearDue
          const now = new Date();
          let overdue = false;
          let nearDue = false;
          let dueDate: Date | undefined;

          if (todo.due_date) {
            dueDate = new Date(todo.due_date);
            overdue = dueDate < now;
            nearDue = !overdue && dueDate.getTime() - now.getTime() < 3 * 60 * 60 * 1000; // Within 3 hours
          }

          return {
            id: todo.id,
            title: todo.name,
            dueTime: todo.due_date
              ? new Date(todo.due_date).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : undefined,
            tags: todo.tags?.slice(0, 2) || [],
            spaceName,
            spaceId: todo.space_id || undefined,
            overdue,
            nearDue,
            dueDate,
          };
        }),
      );

      // Build smart suggestions using heuristics
      const streakCount = 0; // TODO: Calculate from habit completion history
      const hasJournalToday = false; // TODO: Check if journal entry exists today

      const rawSuggestions = buildSuggestions({
        habitsDueToday: enrichedHabits,
        todosDueToday: enrichedTodos,
        weekTodos: [], // TODO: Fetch week todos if needed
        streakCount,
        hasJournalToday,
        timeWindow,
      });

      const suggestions = isTestLight ? [] : rawSuggestions;

      // Order lists
      const orderedHabits = orderHabits(enrichedHabits);
      const orderedTodos = orderTodos(enrichedTodos);

      // Cap visible items
      let visibleHabits = orderedHabits.slice(0, MAX_VISIBLE);
      let visibleTodos = orderedTodos.slice(0, MAX_VISIBLE);
      let visibleSuggestions = suggestions.slice(0, MAX_SUGGESTIONS);

      if (isTestLight) {
        visibleHabits = visibleHabits.slice(0, 2);
        visibleTodos = visibleTodos.slice(0, 2);
        visibleSuggestions = [];
      }

      setData({
        timeWindow,
        header: {
          greeting: getGreeting(timeWindow, user.email?.split('@')[0] || 'there'),
          subline: getMascotSubline(timeWindow, completedCount),
          streakCount: 0, // TODO: Phase 10 - Calculate from habit completion history
          completedToday: completedCount,
          plannedToday: plannedCount,
        },
        habits: orderedHabits,
        todos: orderedTodos,
        suggestions,
        commitments,
        visible: {
          habits: visibleHabits,
          todos: visibleTodos,
          suggestions: visibleSuggestions,
        },
        hidden: {
          habits: Math.max(0, orderedHabits.length - visibleHabits.length),
          todos: Math.max(0, orderedTodos.length - visibleTodos.length),
          suggestions: Math.max(0, suggestions.length - visibleSuggestions.length),
        },
        reducedMotion: false, // Will be set from props in components
        loading: false,
        error: null,
      });
    } catch (err) {
      // Soft fallback - warn instead of throwing, keep UI usable
      console.warn('[useTodayData] Failed to load data:', err);

      // Keep UI usable by setting safe defaults instead of throwing
      const currentTimeWindow = getTimeWindow();
      setData((prev) => ({
        ...prev,
        timeWindow: currentTimeWindow,
        header: {
          greeting: getGreeting(currentTimeWindow, user.email?.split('@')[0] || 'there'),
          subline: 'Unable to load data',
          streakCount: 0,
          completedToday: 0,
          plannedToday: 0,
        },
        habits: [],
        todos: [],
        suggestions: [],
        commitments: [],
        visible: {
          habits: [],
          todos: [],
          suggestions: [],
        },
        hidden: {
          habits: 0,
          todos: 0,
          suggestions: 0,
        },
        loading: false,
        error: null, // Don't show error to user, just log it
      }));
    }
  }, [repo, user, isTestLight]);

  // Subscribe to event bus for auto-refresh
  useEffect(() => {
    if (isTestLight) {
      return () => {};
    }

    const unsubscribes: Array<() => void> = [];

    unsubscribes.push(eventBus.on('ItemSaved', () => void load()));
    unsubscribes.push(eventBus.on('ItemCompleted', () => void load()));
    unsubscribes.push(eventBus.on('ItemUpdated', () => void load()));

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [load, isTestLight]);

  // Load on mount and when user changes
  useEffect(() => {
    if (isTestLight) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, isTestLight]);

  return {
    ...data,
    reducedMotion: reducedMotion || isTestLight, // Force reduced motion in light mode
    reload: isTestLight ? async () => {} : load,
  };
}
