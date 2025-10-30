import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Box } from '../../../ui';
import { useRepo } from '../../../providers/RepoProvider';
import { eventBus } from '../../../lib/events';
import { useTodayEntries, type TodayMergedEntry } from '../../../lib/today/hooks/useTodayEntries';
import TodayHabitCard from '../TodayHabitCard';
import TodayTodoCard from '../TodayTodoCard';
import { BRAND } from '../../../design/brand';

type Props = {
  onLongPress?: (id: string) => void;
};

export default function TaskHabitStack({ onLongPress }: Props) {
  const repo = useRepo();
  const { items, completed, remaining, loading, error, reload } = useTodayEntries();

  const ordered = useMemo(() => {
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

  const handleHabitComplete = async (id: string) => {
    await (repo as any).logHabitProgress?.(id, new Date().toISOString(), 1);
    eventBus.emit('ItemCompleted', { id, type: 'habit' });
    void reload();
  };

  const handleTodoComplete = async (id: string) => {
    await repo.completeTodo(id, new Date().toISOString());
    eventBus.emit('ItemCompleted', { id, type: 'todo' });
    void reload();
  };

  const total = completed + remaining;

  return (
    <View testID="today-v3-stack">
      <Box row style={styles.headerRow}>
        <Text variant="title" style={styles.headerTitle}>
          What's on today
        </Text>
        <View style={styles.progressChip} testID="today-v3-progress-chip">
          <Text style={styles.progressText}>
            {completed} / {total} complete
          </Text>
        </View>
      </Box>

      {loading && (
        <Text variant="subtle" style={styles.placeholder}>
          Loading...
        </Text>
      )}
      {!loading && error && (
        <Text variant="subtle" style={styles.placeholder}>
          {error}
        </Text>
      )}
      {!loading && !error && ordered.length === 0 && (
        <Text variant="subtle" style={styles.placeholder}>
          All clear for now — enjoy the space.
        </Text>
      )}

      <Box gap={2}>
        {ordered.map((entry) =>
          entry.type === 'habit' ? (
            <TodayHabitCard
              key={`habit-${entry.id}`}
              id={entry.id}
              name={entry.name}
              streakCount={undefined}
              tags={entry.tags}
              spaceName={undefined}
              onComplete={handleHabitComplete}
              onLongPress={onLongPress}
              reducedMotion
            />
          ) : (
            <TodayTodoCard
              key={`todo-${entry.id}`}
              id={entry.id}
              title={entry.name}
              dueTime={
                entry.due_date
                  ? new Date(entry.due_date).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : undefined
              }
              tags={entry.tags}
              spaceName={undefined}
              overdue={!!entry.overdue}
              nearDue={!!entry.nearDue}
              grouped={false}
              onComplete={handleTodoComplete}
              onLongPress={onLongPress}
              reducedMotion
            />
          ),
        )}
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
  placeholder: {
    textAlign: 'center',
    padding: 12,
  },
});
