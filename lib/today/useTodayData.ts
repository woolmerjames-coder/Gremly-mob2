/**
 * useTodayData hook - Phase 9: Energy & Momentum
 * Fetches and enriches data for Today v2 screen
 * Step 2: Adds ordering, capping, event bus sync, and real stats
 */

import { useState, useEffect, useCallback } from 'react';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useReducedMotion } from '../../design/animations';
import { eventBus } from '../events';
import type { Habit, Todo } from '../types';
import { getGreeting, getSubline } from './copy';

export type TimeWindow = 'morning' | 'midday' | 'evening';

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

export interface EnrichedSuggestion {
  id: string;
  title: string;
  reason?: string;
  ctaLabel?: string;
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
  suggestions: EnrichedSuggestion[];
  visible: {
    habits: EnrichedHabit[];
    todos: EnrichedTodo[];
    suggestions: EnrichedSuggestion[];
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

const MAX_VISIBLE = 5;

/**
 * Determines time window based on current hour (24h format)
 */
function getTimeWindow(): TimeWindow {
  const hour = new Date().getHours();

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
 */
export function useTodayData() {
  const repo = useRepo();
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();

  const [data, setData] = useState<TodayData>({
    timeWindow: getTimeWindow(),
    header: {
      greeting: getGreeting(getTimeWindow()),
      subline: getSubline(getTimeWindow()),
      streakCount: 0, // TODO: Calculate from habit completion history
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
    reducedMotion: false,
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    if (!user) {
      setData((prev) => ({
        ...prev,
        loading: false,
        error: 'Please sign in to view your items',
      }));
      return;
    }

    try {
      setData((prev) => ({ ...prev, loading: true, error: null }));

      const timeWindow = getTimeWindow();
      const nowIso = new Date().toISOString();

      // Fetch due today items
      const dueItems = await repo.listDueToday(nowIso);

      // Fetch undefined due items for suggestions
      const undefinedDue = await repo.listUndefinedDue();

      // Fetch stats in parallel
      const [plannedCount, completedCount] = await Promise.all([
        repo.countPlannedToday(),
        repo.countCompletedToday(),
      ]);

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

      // Create suggestions from undefined due items (limit to 3)
      const suggestions: EnrichedSuggestion[] = undefinedDue.slice(0, 3).map((todo) => ({
        id: todo.id,
        title: todo.name,
        reason: 'Might be today?',
        ctaLabel: 'Try it',
      }));

      // Order lists
      const orderedHabits = orderHabits(enrichedHabits);
      const orderedTodos = orderTodos(enrichedTodos);
      const orderedSuggestions = suggestions; // Already limited to 3

      // Cap visible items
      const visibleHabits = orderedHabits.slice(0, MAX_VISIBLE);
      const visibleTodos = orderedTodos.slice(0, MAX_VISIBLE);
      const visibleSuggestions = orderedSuggestions.slice(0, MAX_VISIBLE);

      setData({
        timeWindow,
        header: {
          greeting: getGreeting(timeWindow, user.email?.split('@')[0] || 'there'),
          subline: getSubline(timeWindow),
          streakCount: 0, // TODO: Phase 10 - Calculate from habit completion history
          completedToday: completedCount,
          plannedToday: plannedCount,
        },
        habits: orderedHabits,
        todos: orderedTodos,
        suggestions: orderedSuggestions,
        visible: {
          habits: visibleHabits,
          todos: visibleTodos,
          suggestions: visibleSuggestions,
        },
        hidden: {
          habits: Math.max(0, orderedHabits.length - MAX_VISIBLE),
          todos: Math.max(0, orderedTodos.length - MAX_VISIBLE),
          suggestions: Math.max(0, orderedSuggestions.length - MAX_VISIBLE),
        },
        reducedMotion: false, // Will be set from props in components
        loading: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load today data';
      console.error('Failed to load today data:', err);
      setData((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
    }
  }, [repo, user]);

  // Subscribe to event bus for auto-refresh
  useEffect(() => {
    const unsubscribeSaved = eventBus.on('ItemSaved', () => void load());
    const unsubscribeCompleted = eventBus.on('ItemCompleted', () => void load());
    const unsubscribeUpdated = eventBus.on('ItemUpdated', () => void load());

    return () => {
      unsubscribeSaved();
      unsubscribeCompleted();
      unsubscribeUpdated();
    };
  }, [load]);

  // Load on mount and when user changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return {
    ...data,
    reducedMotion, // Return current reducedMotion from hook, not from state
    reload: load,
  };
}
