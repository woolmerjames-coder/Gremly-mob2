// components/worlds/sections/RecurringHabitsModule.tsx

import { View, Pressable, StyleSheet } from 'react-native';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import {
  useActiveHabitsForWorld,
  useHabitLastActivity,
  type HabitLastActivity,
} from '../../../lib/store/worldsSelectors';
import type { Habit } from '../../../lib/types';

interface RecurringHabitsModuleProps {
  worldId: string;
  onPressHabit?: (habitId: string) => void;
}

export function RecurringHabitsModule({ worldId, onPressHabit }: RecurringHabitsModuleProps) {
  const habits = useActiveHabitsForWorld(worldId);
  if (habits.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>RECURRING</Text>
      {habits.map((habit, idx) => {
        const isLast = idx === habits.length - 1;
        return (
          <HabitRow
            key={habit.id}
            habit={habit}
            isLast={isLast}
            onPress={() => onPressHabit?.(habit.id)}
          />
        );
      })}
    </View>
  );
}

interface HabitRowProps {
  habit: Habit;
  isLast: boolean;
  onPress: () => void;
}

function HabitRow({ habit, isLast, onPress }: HabitRowProps) {
  const activity = useHabitLastActivity(habit.id);
  const statusColor = resolveStatusColor(activity);
  const statusText = activity?.text ?? '\u2014';

  return (
    <Pressable
      style={[styles.row, !isLast && styles.rowDivider]}
      onPress={onPress}
      testID={`recurring-habit-${habit.id}`}
    >
      <Text style={styles.habitName} numberOfLines={1}>
        {habit.name || '(untitled)'}
      </Text>
      <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
    </Pressable>
  );
}

function resolveStatusColor(activity: HabitLastActivity | null): string {
  if (!activity) return lightTokens.colors.warmGrey;
  switch (activity.status) {
    case 'on':
    case 'done':
    case 'paid':
      return lightTokens.colors.mossGreen;
    case 'pending':
      return lightTokens.colors.warmGrey;
    default:
      return lightTokens.colors.warmGrey;
  }
}

const styles = StyleSheet.create({
  container: { marginBottom: 26, paddingHorizontal: 16 },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  habitName: {
    flex: 1,
    marginRight: 12,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 19,
    color: lightTokens.colors.worldsInk,
  },
  statusText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
  },
});
