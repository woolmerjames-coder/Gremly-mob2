import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  LayoutAnimation,
  UIManager,
  Platform,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { Text, Box, Button } from '../../../ui';
import { useRepo } from '../../../providers/RepoProvider';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import {
  selectItemById,
  useTodayTodos,
  useTodayHabits,
  useCompletedToday,
  useTodayProgress,
  useOverdueTodos,
} from '../../../lib/store/selectors';
import { eventBus } from '../../../lib/events';
import { BRAND } from '../../../design/brand';
import TodayRow from './TodayRow';
import ConfettiBurst from './ConfettiBurst';
import { useGlobalOverlay } from '../../../contexts/OverlayContext';
import { useHabitMetadata } from '../../../lib/today/hooks/useHabitMetadata';
import type { Todo, Habit } from '../../../lib/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type SessionDone = {
  id: string;
  type: 'todo' | 'habit';
  title: string;
  completedAt?: string | null;
};

type HabitTickPayload = {
  id: string;
  title: string;
  done: number;
  target: number;
};

/**
 * Wrapper component for habit rows that uses the useHabitMetadata hook.
 * This is needed because hooks cannot be called inside loops.
 */
function HabitTodayRow({
  habit,
  progressToday,
  targetCount,
  onComplete,
  onPress,
}: {
  habit: Habit;
  progressToday: number;
  targetCount: number;
  onComplete: (payload: HabitTickPayload) => Promise<void> | void;
  onPress: () => void;
}) {
  const metadata = useHabitMetadata(habit);

  return (
    <TodayRow
      id={habit.id}
      lane="habit"
      title={habit.name}
      habitProgress={{ done: progressToday, target: targetCount }}
      habitMetadata={{
        icon: metadata.icon,
        label: metadata.label,
        periodLabel: metadata.periodLabel,
        frequencyLabel: metadata.frequencyLabel,
      }}
      onComplete={() =>
        onComplete({
          id: habit.id,
          title: habit.name,
          done: progressToday,
          target: targetCount,
        })
      }
      onPress={onPress}
      testID={`row-habit-${habit.id}`}
    />
  );
}

export default function TaskHabitStack() {
  const repo = useRepo(); // Kept for logHabitProgress (not in store yet)
  const completeTodo = useGremlyStore((s) => s.completeTodo);
  const getItemById = useGremlyStore((s) => (id: string) => selectItemById(s, id));
  const habitProgress = useGremlyStore((s) => s.habitProgress);
  const overlay = useGlobalOverlay();
  const { width } = useWindowDimensions();

  // Store selectors for today's items
  const todayTodos = useTodayTodos();
  const todayHabits = useTodayHabits();
  const overdueTodos = useOverdueTodos();
  const completedItems = useCompletedToday();
  const progress = useTodayProgress();
  const isLoading = useGremlyStore((s) => s.isLoading);

  // Compute today's habit progress counts
  const habitProgressToday = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const map = new Map<string, number>();
    for (const row of habitProgress) {
      if (row.occurred_day === today) {
        map.set(row.habit_id, (map.get(row.habit_id) ?? 0) + row.count);
      }
    }
    return map;
  }, [habitProgress]);

  type HabitLoggerRepo = {
    logHabitProgress?: (id: string, occurredAtIso: string, count: number) => Promise<unknown>;
  };
  const repoWithHabitLogging = repo as typeof repo & HabitLoggerRepo;

  const [sessionDone, setSessionDone] = useState<SessionDone[]>([]);
  const [doneOpen, setDoneOpen] = useState(true);
  const [confettiTick, setConfettiTick] = useState(0);

  const { completedCount: completed, totalEligible: total } = progress;
  const remaining = total - completed;
  const narrow = width < 480;

  // Build merged item list from store data
  type MergedEntry = {
    type: 'todo' | 'habit';
    id: string;
    name: string;
    due_date?: string | null;
    due_day?: string | null;
    space_id?: string | null;
    tags?: string[] | null;
    status?: string;
    carry_forward?: boolean;
    overdue?: boolean;
    nearDue?: boolean;
    completed_at?: string | null;
    commitment?: boolean;
    progress_today?: number;
    target_count?: number;
  };

  const items = useMemo((): MergedEntry[] => {
    const overdueIds = new Set(overdueTodos.map((t) => t.id));

    const todoEntries: MergedEntry[] = todayTodos.map((t) => ({
      type: 'todo' as const,
      id: t.id,
      name: t.name,
      due_date: t.due_date,
      due_day: t.due_day,
      space_id: t.space_id,
      tags: t.tags,
      carry_forward: (t as any).carry_forward,
      overdue: overdueIds.has(t.id),
      nearDue: false, // Simplified - could compute if needed
      completed_at: t.completed_at,
      commitment: t.commitment,
    }));

    const habitEntries: MergedEntry[] = todayHabits.map((h) => ({
      type: 'habit' as const,
      id: h.id,
      name: h.name,
      space_id: h.space_id,
      tags: h.tags,
      commitment: h.commitment,
      progress_today: habitProgressToday.get(h.id) ?? 0,
      target_count: h.target_per_day ?? 1,
    }));

    return [...todoEntries, ...habitEntries];
  }, [todayTodos, todayHabits, overdueTodos, habitProgressToday]);

  // Build done items list from completed items
  const doneItems = useMemo((): MergedEntry[] => {
    return completedItems.map((item) => ({
      type: item.type as 'todo' | 'habit',
      id: item.id,
      name: item.type === 'todo' ? (item as Todo).name : (item as Habit).name,
      completed_at: item.type === 'todo' ? (item as Todo).completed_at : undefined,
    }));
  }, [completedItems]);

  const orderedActive = useMemo(() => {
    const score = (entry: MergedEntry) => {
      if (entry.type === 'todo') {
        return (
          (entry.overdue ? 300 : 0) +
          (entry.nearDue ? 200 : 0) +
          (entry.carry_forward ? 100 : 0) +
          10
        );
      }
      return 5;
    };

    return [...items].sort((a, b) => score(b) - score(a));
  }, [items]);

  const recordCompletion = (id: string, entryType: 'todo' | 'habit', title: string) => {
    const completedAtIso = new Date().toISOString();
    setSessionDone((current) => {
      if (current.some((entry) => entry.id === id && entry.type === entryType)) {
        return current;
      }
      const next = [{ id, type: entryType, title, completedAt: completedAtIso }, ...current];
      const hiddenIds = new Set(next.map((entry) => entry.id));
      const remainingAfterComplete = orderedActive.filter(
        (entry) => !hiddenIds.has(entry.id),
      ).length;
      if (remainingAfterComplete <= 0) {
        setConfettiTick((tick) => tick + 1);
      }
      return next;
    });
    setDoneOpen(true);
  };

  const handleHabitComplete = async ({ id, title, done, target }: HabitTickPayload) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (done + 1 >= target) {
      recordCompletion(id, 'habit', title);
    }
    await repoWithHabitLogging.logHabitProgress?.(id, new Date().toISOString(), 1);
    eventBus.emit('ItemCompleted', { id, type: 'habit' });
    // Store auto-updates, no reload needed
  };

  const handleTodoComplete = async (id: string, title: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    recordCompletion(id, 'todo', title);
    await completeTodo(id);
    eventBus.emit('ItemCompleted', { id, type: 'todo' });
    // Store auto-updates, no reload needed
  };

  const handleEntryPress = useCallback(
    (entry: MergedEntry | SessionDone) => {
      try {
        const record = getItemById(entry.id);
        if (!record) {
          console.warn('[TaskHabitStack] Unable to load record for overlay:', entry);
          return;
        }

        if (record.type !== entry.type) {
          console.warn(
            '[TaskHabitStack] Record type mismatch when opening overlay:',
            entry,
            record.type,
          );
        }

        const spaceId = 'space_id' in record ? (record.space_id ?? undefined) : undefined;
        overlay.openEdit({ record, spaceId });
      } catch (error) {
        console.error('[TaskHabitStack] Failed to open overlay for entry:', entry, error);
      }
    },
    [overlay, getItemById],
  );

  const sessionHiddenIds = useMemo(
    () => new Set(sessionDone.map((entry) => entry.id)),
    [sessionDone],
  );

  const visibleActive = useMemo(
    () => orderedActive.filter((entry) => !sessionHiddenIds.has(entry.id)),
    [orderedActive, sessionHiddenIds],
  );

  const habitEntries = useMemo(
    () => visibleActive.filter((entry) => entry.type === 'habit'),
    [visibleActive],
  );

  // Map of habit IDs to Habit objects for HabitTodayRow
  const habitsById = useMemo(() => {
    const map = new Map<string, Habit>();
    for (const h of todayHabits) {
      map.set(h.id, h);
    }
    return map;
  }, [todayHabits]);

  const todoEntries = useMemo(
    () => visibleActive.filter((entry) => entry.type === 'todo'),
    [visibleActive],
  );

  const remoteDone = useMemo<SessionDone[]>(
    () =>
      doneItems.map((entry) => ({
        id: entry.id,
        type: entry.type,
        title: entry.name || 'Untitled',
        completedAt: entry.completed_at ?? null,
      })),
    [doneItems],
  );

  const allDone = useMemo(() => {
    const combined = new Map<string, SessionDone>();
    sessionDone.forEach((entry) => {
      const key = `${entry.type}-${entry.id}`;
      combined.set(key, entry);
    });
    remoteDone.forEach((entry) => {
      const key = `${entry.type}-${entry.id}`;
      if (!combined.has(key)) {
        combined.set(key, entry);
      } else {
        const existing = combined.get(key)!;
        if (!existing.completedAt && entry.completedAt) {
          combined.set(key, { ...existing, completedAt: entry.completedAt });
        }
      }
    });
    return Array.from(combined.values()).sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [sessionDone, remoteDone]);

  return (
    <View testID="today-v3-stack" style={styles.container}>
      <Box row style={styles.headerRow}>
        <Text variant="title" style={styles.headerTitle}>
          What’s on today
        </Text>

        {total > 0 ? (
          <View
            style={styles.progressChip}
            testID="today-v3-progress-chip"
            accessibilityLabel={`${completed} of ${total} complete`}
          >
            <Text style={styles.progressText}>
              {completed} / {total} complete
            </Text>
          </View>
        ) : null}
      </Box>

      {isLoading && (
        <Text variant="subtle" style={{ textAlign: 'center', padding: 12 }}>
          Loading…
        </Text>
      )}

      {!isLoading && orderedActive.length === 0 && (
        <Text variant="subtle" style={{ textAlign: 'center', padding: 16 }}>
          Nothing planned — add something when you’re ready.
        </Text>
      )}

      <Box row={!narrow} gap={narrow ? 12 : 16} style={!narrow ? styles.lanesWide : undefined}>
        <View style={[styles.lane, !narrow && styles.laneHalf]}>
          <Text style={styles.laneHeader}>Habits</Text>
          <Box gap={8}>
            {habitEntries.length === 0 ? (
              <Text variant="subtle" style={styles.emptyCopy}>
                No habits queued.
              </Text>
            ) : (
              habitEntries.map((entry) => {
                const habit = habitsById.get(entry.id);
                if (!habit) return null;
                const done = entry.progress_today ?? 0;
                const target = Math.max(1, entry.target_count ?? 1);
                return (
                  <HabitTodayRow
                    key={`habit-${entry.id}`}
                    habit={habit}
                    progressToday={done}
                    targetCount={target}
                    onComplete={handleHabitComplete}
                    onPress={() => void handleEntryPress(entry)}
                  />
                );
              })
            )}
          </Box>
        </View>

        <View style={[styles.lane, !narrow && styles.laneHalf]}>
          <Text style={styles.laneHeader}>To-dos</Text>
          <Box gap={8}>
            {todoEntries.length === 0 ? (
              <Text variant="subtle" style={styles.emptyCopy}>
                No tasks yet.
              </Text>
            ) : (
              todoEntries.map((entry) => (
                <TodayRow
                  key={`todo-${entry.id}`}
                  id={entry.id}
                  lane="todo"
                  title={entry.name}
                  dueTime={
                    entry.due_date
                      ? new Date(entry.due_date).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : undefined
                  }
                  onComplete={(rowId) => handleTodoComplete(rowId, entry.name)}
                  onPress={() => void handleEntryPress(entry)}
                  testID={`row-todo-${entry.id}`}
                />
              ))
            )}
          </Box>
        </View>
      </Box>

      {allDone.length > 0 && (
        <View style={{ marginTop: 8, position: 'relative' }}>
          <ConfettiBurst trigger={confettiTick} />
          <TouchableOpacity
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setDoneOpen((open) => !open);
            }}
            accessibilityRole="button"
            accessibilityLabel="Toggle done today"
          >
            <Box row style={styles.doneHeader}>
              <Text variant="subtle" style={{ fontWeight: '600' }}>
                Done Today
              </Text>
              <Text variant="subtle">({allDone.length})</Text>
            </Box>
          </TouchableOpacity>

          {doneOpen && (
            <Box gap={8} style={styles.doneList}>
              {allDone.map((entry, index) => (
                <TouchableOpacity
                  key={`${entry.type}-done-${entry.id}-${index}`}
                  style={styles.doneRow}
                  onPress={() => void handleEntryPress(entry)}
                  testID={`done-row-${entry.type}-${entry.id}`}
                >
                  <Text variant="body" style={styles.doneLabel}>
                    {entry.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </Box>
          )}
        </View>
      )}

      <Box style={{ alignItems: 'center', marginTop: 16 }}>
        <Button
          label="Add More"
          variant="primary"
          onPress={() => overlay.openCreate()}
          accessibilityLabel="Add a new item"
        />
      </Box>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
  },
  headerRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTitle: { fontWeight: '600' },
  progressChip: {
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  progressText: {
    color: BRAND.colors.linenCream,
    fontSize: 12,
    fontWeight: '600',
  },
  lanesWide: {
    alignItems: 'flex-start',
  },
  lane: {
    backgroundColor: 'rgba(236,241,237,0.6)',
    borderRadius: 12,
    padding: 12,
  },
  laneHalf: {
    flex: 1,
  },
  laneHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  emptyCopy: {
    textAlign: 'center',
    color: BRAND.colors.inkMuted,
  },
  doneHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(224,196,122,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  doneList: {
    marginTop: 8,
  },
  doneRow: {
    backgroundColor: '#DCEADF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  doneLabel: {
    color: BRAND.colors.mossGreen,
    fontWeight: '600',
  },
});
