import React, { useMemo, useState } from 'react';
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type SessionDone = { id: string; type: 'todo' | 'habit'; title: string };

export default function TaskHabitStack() {
  const repo = useRepo();
  const { items, completed, remaining, loading, /* error */ reload } = useTodayEntries();

  type HabitLoggerRepo = {
    logHabitProgress?: (id: string, occurredAtIso: string, count: number) => Promise<unknown>;
  };
  const repoWithHabitLogging = repo as typeof repo & HabitLoggerRepo;

  const [done, setDone] = useState<SessionDone[]>([]);
  const [doneOpen, setDoneOpen] = useState(false);
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

  const handleHabitComplete = async (id: string, title: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await repoWithHabitLogging.logHabitProgress?.(id, new Date().toISOString(), 1);
    eventBus.emit('ItemCompleted', { id, type: 'habit' });
    setDone((d) => [{ id, type: 'habit', title }, ...d]);
    setDoneOpen(true);
    void reload();
    if (orderedActive.length - 1 <= 0) setConfettiTick((tick) => tick + 1);
  };

  const handleTodoComplete = async (id: string, title: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await repo.completeTodo(id, new Date().toISOString());
    eventBus.emit('ItemCompleted', { id, type: 'todo' });
    setDone((d) => [{ id, type: 'todo', title }, ...d]);
    setDoneOpen(true);
    void reload();
    if (orderedActive.length - 1 <= 0) setConfettiTick((tick) => tick + 1);
  };

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
        {orderedActive.map((entry, idx) => (
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
            />
          </View>
        ))}
      </Box>

      {done.length > 0 && (
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
              <Text variant="subtle">({done.length})</Text>
            </Box>
          </TouchableOpacity>

          {doneOpen && (
            <Box gap={8} style={{ marginTop: 8 }}>
              {done.map((entry, index) => (
                <View
                  key={`${entry.type}-done-${entry.id}-${index}`}
                  style={[styles.doneRow, BRAND.elevation.one]}
                  testID={`done-row-${entry.type}-${entry.id}`}
                >
                  <View style={[styles.doneStripe]} />
                  <Text variant="body" style={{ color: BRAND.colors.charcoalInk }}>
                    {entry.title}
                  </Text>
                </View>
              ))}
            </Box>
          )}
        </View>
      )}

      <Box style={{ alignItems: 'center', marginTop: 8 }}>
        <Button label="Add More" variant="primary" onPress={() => {}} />
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
