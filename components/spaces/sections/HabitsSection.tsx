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
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import {
  Circle,
  CheckCircle2,
  Flame,
  Pin,
  RotateCcw,
  RefreshCw,
  Calendar,
} from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import type { Habit } from '../../../lib/types';
import { useHabitMetadata, HabitMetadata } from '../../../lib/today/hooks/useHabitMetadata';

// Icon map for metadata display - matches NowFocusRow
const MetadataIconMap = {
  Flame,
  RotateCcw,
  RefreshCw,
  Calendar,
} as const;

interface HabitsSectionProps {
  habits: Habit[];
  // REMOVED: progressMap and streakMap - now computed per-habit via useHabitMetadata hook
  onHabitPress: (habit: Habit) => void;
  onHabitLog: (habit: Habit) => void;
  onHabitLongPress?: (habit: Habit) => void;
}

export function HabitsSection({
  habits,
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
        {habits.map((habit) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            onPress={() => onHabitPress(habit)}
            onLog={() => onHabitLog(habit)}
            onLongPress={onHabitLongPress ? () => onHabitLongPress(habit) : undefined}
          />
        ))}
      </View>
    </View>
  );
}

interface HabitRowProps {
  habit: Habit;
  onPress: () => void;
  onLog: () => void;
  onLongPress?: () => void;
}

function HabitRow({ habit, onPress, onLog, onLongPress }: HabitRowProps) {
  // Use the SAME hook as NowFocusRow for consistency
  const metadata = useHabitMetadata(habit);
  const MetadataIcon = MetadataIconMap[metadata.icon];

  // Done today = streak type with value > 0, OR days_since with value === 0, OR rolling_progress with value > 0
  const isDoneToday =
    (metadata.type === 'streak' && metadata.value > 0) ||
    (metadata.type === 'days_since' && metadata.value === 0) ||
    (metadata.type === 'rolling_progress' && metadata.value > 0);

  // Debug: log what HabitRow is rendering (compare with NowFocusRow)
  const habitProgressFromStore = useGremlyStore
    .getState()
    .habitProgress.filter((p) => p.habit_id === habit.id);
  console.log('[HabitRow] SpaceHome metadata:', {
    habitId: habit.id,
    habitName: habit.name,
    metadata,
    isDoneToday,
    habitProgress: habitProgressFromStore,
    habitRaw: {
      target_per_period: habit.target_per_period,
      frequency: habit.frequency,
    },
  });

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

      {/* Right: Metadata (streak/progress) - matches NowFocusRow exactly */}
      <View style={styles.metadataContainer}>
        <MetadataIcon
          size={metadata.type === 'streak' ? 16 : 14}
          color={metadata.icon === 'Flame' ? '#E07C3E' : BRAND.colors.inkMuted}
        />
        <Text style={[styles.metadataText, metadata.icon === 'Flame' && styles.streakText]}>
          {metadata.label}
          {metadata.periodLabel ? ` ${metadata.periodLabel}` : ''}
        </Text>
      </View>
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
    // No strikethrough on SpaceHome - it's a dashboard, not a check-off screen
    // The green checkmark icon shows "done today" status
    // Metadata (streak, rolling progress) tells the health story
    color: BRAND.colors.charcoalInk, // Keep normal color, no opacity reduction
  },
  metadataContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
  },
  metadataText: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
  streakText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E07C3E',
  },
});

export default React.memo(HabitsSection);
