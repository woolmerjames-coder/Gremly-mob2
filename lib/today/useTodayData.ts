/**
 * useTodayData hook - Phase 9: Energy & Momentum
 * Fetches and enriches data for Today v2 screen
 */

import { useState, useEffect, useCallback } from 'react';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useReducedMotion } from '../../design/animations';
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
  reducedMotion: boolean;
  loading: boolean;
  error: string | null;
}

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
 * Hook to fetch and enrich Today screen data
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
      completedToday: 0, // TODO: Calculate from today's completions
      plannedToday: 0,
    },
    habits: [],
    todos: [],
    suggestions: [],
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
          if (todo.due_date) {
            const dueDate = new Date(todo.due_date);
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

      // Calculate stats
      const plannedToday = enrichedHabits.length + enrichedTodos.length;
      // TODO: Calculate completedToday from completion records
      // TODO: Calculate streakCount from habit history

      setData({
        timeWindow,
        header: {
          greeting: getGreeting(timeWindow, user.email?.split('@')[0] || 'there'),
          subline: getSubline(timeWindow),
          streakCount: 0, // TODO: Phase 9 step 2
          completedToday: 0, // TODO: Phase 9 step 2
          plannedToday,
        },
        habits: enrichedHabits,
        todos: enrichedTodos,
        suggestions,
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
  }, [repo, user]); // Removed reducedMotion from dependencies

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
