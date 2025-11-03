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
import { eventBus } from '../../../lib/events';
import { useTodayEntries, type TodayMergedEntry } from '../../../lib/today/hooks/useTodayEntries';
import { BRAND } from '../../../design/brand';
import TodayRow from './TodayRow';
import ConfettiBurst from './ConfettiBurst';
import { useGlobalOverlay } from '../../../contexts/OverlayContext';

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

export default function TaskHabitStack() {
  const repo = useRepo();
  const overlay = useGlobalOverlay();
  const { width } = useWindowDimensions();
  const { items, doneItems, completed, remaining, loading, /* error */ reload } = useTodayEntries();

  type HabitLoggerRepo = {
    logHabitProgress?: (id: string, occurredAtIso: string, count: number) => Promise<unknown>;
  };
  const repoWithHabitLogging = repo as typeof repo & HabitLoggerRepo;

  const [sessionDone, setSessionDone] = useState<SessionDone[]>([]);
  const [doneOpen, setDoneOpen] = useState(true);
  const [confettiTick, setConfettiTick] = useState(0);

  const total = completed + remaining;
  const narrow = width < 480;

  const orderedActive = useMemo(() => {
    const score = (entry: TodayMergedEntry) => {
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
    void reload();
  };

  const handleTodoComplete = async (id: string, title: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    recordCompletion(id, 'todo', title);
    await repo.completeTodo(id, new Date().toISOString());
    eventBus.emit('ItemCompleted', { id, type: 'todo' });
    void reload();
  };

  const handleEntryPress = useCallback(
    async (entry: TodayMergedEntry | SessionDone) => {
      try {
        const record = await repo.getById(entry.id);
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
    [overlay, repo],
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

  const todoEntries = useMemo(
    () => visibleActive.filter((entry) => entry.type === 'todo'),
    [visibleActive],
  );

  const remoteDone = useMemo<SessionDone[]>(
    () =>
      doneItems.map((entry) => ({
        id: entry.id,
        type: entry.type,
        title: entry.name,
        completedAt: 'completed_at' in entry ? (entry.completed_at ?? null) : null,
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

      {loading && (
        <Text variant="subtle" style={{ textAlign: 'center', padding: 12 }}>
          Loading…
        </Text>
      )}

      {!loading && orderedActive.length === 0 && (
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
                const done = entry.progress_today ?? 0;
                const target = Math.max(1, entry.target_count ?? 1);
                return (
                  <TodayRow
                    key={`habit-${entry.id}`}
                    id={entry.id}
                    lane="habit"
                    title={entry.name}
                    habitProgress={{ done, target }}
                    onComplete={(rowId) =>
                      handleHabitComplete({ id: rowId, title: entry.name, done, target })
                    }
                    onPress={() => void handleEntryPress(entry)}
                    testID={`row-habit-${entry.id}`}
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
