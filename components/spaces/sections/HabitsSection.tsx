/**
 * HabitsSection - Compact habit list with streak indicators
 *
 * Features:
 * - Left-aligned progress indicator
 * - Flame icon + streak count on right
 * - Shows all habits (typically 2-4)
 * - Section hides when empty
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Circle, CheckCircle2, Flame, Pin } from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import type { Habit } from '../../../lib/types';

interface HabitProgress {
  done: number;
  target: number;
}

interface HabitsSectionProps {
  habits: Habit[];
  progressMap: Map<string, HabitProgress>;
  streakMap: Map<string, number>;
  onHabitPress: (habit: Habit) => void;
  onHabitLog: (habit: Habit) => void;
  onHabitLongPress?: (habit: Habit) => void;
}

export function HabitsSection({
  habits,
  progressMap,
  streakMap,
  onHabitPress,
  onHabitLog,
  onHabitLongPress,
}: HabitsSectionProps) {
  const count = habits.length;

  // Hide section if no habits
  if (count === 0) {
    return null;
  }

  return (
    <View style={styles.container} testID="habits-section">
      {/* Section Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>
          Habits <Text style={styles.headerCount}>({count})</Text>
        </Text>
      </View>

      {/* Habit Rows */}
      <View style={styles.list}>
        {habits.map((habit) => {
          const progress = progressMap.get(habit.id);
          const streak = streakMap.get(habit.id) ?? 0;
          return (
            <HabitRow
              key={habit.id}
              habit={habit}
              progress={progress}
              streak={streak}
              onPress={() => onHabitPress(habit)}
              onLog={() => onHabitLog(habit)}
              onLongPress={onHabitLongPress ? () => onHabitLongPress(habit) : undefined}
            />
          );
        })}
      </View>
    </View>
  );
}

interface HabitRowProps {
  habit: Habit;
  progress?: HabitProgress;
  streak: number;
  onPress: () => void;
  onLog: () => void;
  onLongPress?: () => void;
}

function HabitRow({ habit, progress, streak, onPress, onLog, onLongPress }: HabitRowProps) {
  // Show checkmark if any progress logged today (done > 0), not just when target met
  const isDoneToday = progress ? progress.done > 0 : false;

  // Debug: log what HabitRow is rendering
  console.log(
    '[HabitRow]',
    habit.id,
    habit.name,
    'progress:',
    progress,
    'isDoneToday:',
    isDoneToday,
  );

  return (
    <View style={styles.row}>
      {/* Left: Checkbox - toggle like todos */}
      <Pressable
        onPress={() => {
          console.log('[HabitRow] Checkbox pressed for:', habit.id, habit.name);
          onLog();
        }}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        style={styles.checkbox}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDoneToday }}
        accessibilityLabel={`Mark ${habit.name} as ${isDoneToday ? 'not done' : 'done'}`}
        testID={`habit-checkbox-${habit.id}`}
      >
        {isDoneToday ? (
          <CheckCircle2 size={22} color={BRAND.colors.mossGreen} />
        ) : (
          <Circle size={22} color={BRAND.colors.inkMuted} />
        )}
      </Pressable>

      {/* Middle: Habit name - with strikethrough when done */}
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={500}
        style={({ pressed }) => [styles.rowContent, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${habit.name}. Long press to pin.`}
        testID={`habit-row-${habit.id}`}
      >
        <Text style={[styles.rowText, isDoneToday && styles.rowTextCompleted]} numberOfLines={1}>
          {habit.name}
        </Text>
        {habit.is_pinned && (
          <Pin size={14} color={BRAND.colors.mossGreen} style={{ marginLeft: 6 }} />
        )}
      </Pressable>

      {/* Right: Streak indicator */}
      {streak > 0 && (
        <View style={styles.streakContainer}>
          <Flame size={16} color="#E07C3E" />
          <Text style={styles.streakText}>{streak}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // No marginBottom - parent gap handles spacing
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  headerCount: {
    fontWeight: '400',
  },
  list: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
  },
  checkbox: {
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowText: {
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
  },
  rowTextCompleted: {
    textDecorationLine: 'line-through',
    color: BRAND.colors.inkMuted,
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
  },
  streakText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E07C3E',
  },
});

export default React.memo(HabitsSection);
