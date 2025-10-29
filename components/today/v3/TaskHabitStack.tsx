import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Box } from '../../../ui';
import { useRepo } from '../../../providers/RepoProvider';
import { eventBus } from '../../../lib/events';
import { useTodayEntries, type TodayMergedEntry } from '../../../lib/today/hooks/useTodayEntries';
import TodayHabitCard from '../TodayHabitCard';
import TodayTodoCard from '../TodayTodoCard';

type Props = {
  onLongPress?: (id: string) => void;
};

export default function TaskHabitStack({ onLongPress }: Props) {
  const repo = useRepo();
  const { items, completed, remaining, loading, error, reload } = useTodayEntries();

  const ordered = useMemo(() => {
    // Simple sort: overdue > nearDue > carry_forward > habits > todos
    const score = (e: TodayMergedEntry) => {
      if (e.type === 'todo') {
        return (e.overdue ? 300 : 0) + (e.nearDue ? 200 : 0) + (e.carry_forward ? 100 : 0) + 10;
      }
      return 5; // habits after urgent tasks
    };
    return [...items].sort((a, b) => score(b) - score(a));
  }, [items]);

  const handleHabitComplete = async (id: string) => {
    // For v3 we log a progress tick (count=1)
    if (typeof repo.logHabitProgress === 'function') {
      await repo.logHabitProgress(id, new Date().toISOString(), 1);
    }
    eventBus.emit('ItemCompleted', { id, type: 'habit' });
    void reload();
  };

  const handleTodoComplete = async (id: string) => {
    await repo.completeTodo(id, new Date().toISOString());
    eventBus.emit('ItemCompleted', { id, type: 'todo' });
    void reload();
  };

  return (
    <View testID="today-v3-stack">
      <Box row style={styles.headerRow}>
        <Text variant="title" style={styles.headerTitle}>
          What's on today
        </Text>
        <View style={styles.progressChip} testID="today-v3-progress-chip">
          <Text style={styles.progressText}>
            {completed} / {completed + remaining} complete
          </Text>
        </View>
      </Box>

      {loading && (
        <Text variant="subtle" style={{ textAlign: 'center', padding: 12 }}>
          Loading...
        </Text>
      )}
      {!loading && error && (
        <Text variant="subtle" style={{ textAlign: 'center', padding: 12 }}>
          {error}
        </Text>
      )}
      {!loading && !error && ordered.length === 0 && (
        <Text variant="subtle" style={{ textAlign: 'center', padding: 16 }}>
          All clear for now - enjoy the space.
        </Text>
      )}

      <Box gap={2}>
        {ordered.map((e) =>
          e.type === 'habit' ? (
            <TodayHabitCard
              key={`habit-${e.id}`}
              id={e.id}
              name={e.name}
              streakCount={undefined}
              tags={e.tags}
              spaceName={undefined}
              onComplete={handleHabitComplete}
              onLongPress={onLongPress}
              reducedMotion={true}
            />
          ) : (
            <TodayTodoCard
              key={`todo-${e.id}`}
              id={e.id}
              title={e.name}
              dueTime={
                e.due_date
                  ? new Date(e.due_date).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : undefined
              }
              tags={e.tags}
              spaceName={undefined}
              overdue={!!e.overdue}
              nearDue={!!e.nearDue}
              grouped={false}
              onComplete={handleTodoComplete}
              onLongPress={onLongPress}
              reducedMotion={true}
            />
          ),
        )}
      </Box>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerTitle: { fontWeight: '600' },
  progressChip: {
    backgroundColor: '#0D3B3A',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  progressText: { color: 'white', fontSize: 12, fontWeight: '600' },
});
