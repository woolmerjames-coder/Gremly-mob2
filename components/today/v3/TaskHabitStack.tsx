import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  LayoutAnimation,
  UIManager,
  Platform,
  TouchableOpacity,
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

export default function TaskHabitStack() {
  const repo = useRepo();
  const { items, doneItems, completed, remaining, loading, /* error */ reload } = useTodayEntries();
  const overlay = useGlobalOverlay();

  type HabitLoggerRepo = {
    logHabitProgress?: (id: string, occurredAtIso: string, count: number) => Promise<unknown>;
  };
  const repoWithHabitLogging = repo as typeof repo & HabitLoggerRepo;

  const [sessionDone, setSessionDone] = useState<SessionDone[]>([]);
  const [manualDoneOpen, setManualDoneOpen] = useState(false);
  const [userCollapsedDone, setUserCollapsedDone] = useState(false);
  const [confettiTick, setConfettiTick] = useState(0);

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
    const nextHidden = new Set(sessionDone.map((entry) => entry.id));
    nextHidden.add(id);
    const remainingAfterComplete = orderedActive.filter(
      (entry) => !nextHidden.has(entry.id),
    ).length;
    if (remainingAfterComplete <= 0) {
      setConfettiTick((tick) => tick + 1);
    }
    setSessionDone((d) => [{ id, type: entryType, title, completedAt: completedAtIso }, ...d]);
    setManualDoneOpen(true);
  };

  const handleHabitComplete = async (id: string, title: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    recordCompletion(id, 'habit', title);
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

        const spaceId = (record as any)?.space_id ?? undefined;
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

  const hasRemoteDone = remoteDone.length > 0;
  const doneOpen = hasRemoteDone ? !userCollapsedDone : manualDoneOpen;

  const total = completed + remaining;

  return (
    <View testID="today-v3-stack">
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

      <Box gap={0}>
        {visibleActive.map((entry, idx) => (
          <View key={`${entry.type}-${entry.id}`} style={{ marginBottom: idx % 2 ? 16 : 8 }}>
            <TodayRow
              id={entry.id}
              type={entry.type}
              title={entry.name}
              dueTime={
                entry.type === 'todo' && entry.due_date
                  ? new Date(entry.due_date).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : undefined
              }
              habitProgress={
                entry.type === 'habit'
                  ? {
                      done: entry.progress_today ?? 0,
                      target: Math.max(1, entry.target_count ?? 1),
                    }
                  : null
              }
              onComplete={(idStr) =>
                entry.type === 'habit'
                  ? handleHabitComplete(idStr, entry.name)
                  : handleTodoComplete(idStr, entry.name)
              }
              onPress={() => void handleEntryPress(entry)}
            />
          </View>
        ))}
      </Box>

      {allDone.length > 0 && (
        <View style={{ marginTop: 8, position: 'relative' }}>
          <ConfettiBurst trigger={confettiTick} />
          <TouchableOpacity
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              if (hasRemoteDone) {
                setUserCollapsedDone((collapsed) => !collapsed);
              } else {
                setManualDoneOpen((open) => !open);
              }
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
            <Box gap={8} style={{ marginTop: 8 }}>
              {allDone.map((entry, index) => (
                <TouchableOpacity
                  key={`${entry.type}-done-${entry.id}-${index}`}
                  style={[styles.doneRow, BRAND.elevation.one]}
                  onPress={() => void handleEntryPress(entry)}
                  testID={`done-row-${entry.type}-${entry.id}`}
                >
                  <View style={[styles.doneStripe]} />
                  <Text variant="body" style={{ color: BRAND.colors.charcoalInk }}>
                    {entry.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </Box>
          )}
        </View>
      )}

      <Box style={{ alignItems: 'center', marginTop: 8 }}>
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
  doneHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(224,196,122,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  doneRow: {
    backgroundColor: 'rgba(224,196,122,0.12)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  doneStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: BRAND.colors.goldenPear,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
});
