/**
 * @deprecated Use HabitsScreen instead.
 *
 * HabitsThisWeekSheet - Bottom sheet showing all habits with rolling 7-day view
 *
 * Features:
 * - Rolling 7 days ending today (not calendar M-S)
 * - Gremly faces as completion indicators (grey = not done, green = done)
 * - Sort by status: "Needs attention" habits float to top
 * - Tap Gremly to toggle completion
 * - Tap row to deep-dive (future)
 */

import React, { useCallback, useMemo } from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text } from '../../ui';
import { HabitWeeklyRowV2 } from './HabitWeeklyRowV2';
import { useRolling7DayHabitStats } from '../../lib/today/hooks/useRolling7DayHabitStats';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { BRAND } from '../../design/brand';

interface HabitsThisWeekSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function HabitsThisWeekSheet({ visible, onClose }: HabitsThisWeekSheetProps) {
  const habits = useGremlyStore((s) => s.habits);
  const logHabitCompletionForDate = useGremlyStore((s) => s.logHabitCompletionForDate);
  const removeHabitCompletionForDate = useGremlyStore((s) => s.removeHabitCompletionForDate);
  const stats = useRolling7DayHabitStats(habits);

  // Summary counts
  const onTrackCount = useMemo(
    () => stats.filter((s) => s.status === 'on_track' || s.status === 'done_for_period').length,
    [stats],
  );
  const totalCount = stats.length;

  // Day labels from first habit (all habits share same rolling 7 days)
  const dayLabels = useMemo(
    () =>
      stats[0]?.days.map((d) => ({
        label: d.dayLabel,
        isToday: d.isToday,
      })) ?? [],
    [stats],
  );

  const handleToggleDay = useCallback(
    async (habitId: string, date: string, newState: boolean) => {
      if (newState) {
        await logHabitCompletionForDate(habitId, date);
      } else {
        await removeHabitCompletionForDate(habitId, date);
      }
    },
    [logHabitCompletionForDate, removeHabitCompletionForDate],
  );

  const handlePressRow = useCallback(
    (_habitId: string) => {
      // TODO: Navigate to habit deep-dive
      onClose();
    },
    [onClose],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Habits this week</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          {/* Summary line */}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>
              {onTrackCount}/{totalCount} on track
            </Text>
          </View>

          {/* Day labels header */}
          {dayLabels.length > 0 && (
            <View style={styles.dayLabelsRow}>
              <View style={styles.dayLabelsOffset} />
              <View style={styles.dayLabelsContainer}>
                {dayLabels.map((day, i) => (
                  <Text key={i} style={[styles.dayLabel, day.isToday && styles.dayLabelToday]}>
                    {day.label}
                  </Text>
                ))}
              </View>
              <View style={styles.statusPlaceholder} />
            </View>
          )}

          {/* Habit rows */}
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {stats.map((stat, index) => (
              <HabitWeeklyRowV2
                key={stat.id}
                habitId={stat.id}
                name={stat.name}
                metadataLabel={stat.metadataLabel}
                metadataIcon={stat.metadataIcon}
                status={stat.status}
                days={stat.days}
                onToggleDay={(date, newState) => handleToggleDay(stat.id, date, newState)}
                onPressRow={() => handlePressRow(stat.id)}
                showDivider={index < stats.length - 1}
              />
            ))}

            {stats.length === 0 && <Text style={styles.emptyText}>No habits to track</Text>}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    minHeight: 400,
    paddingBottom: 32, // Safe area
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  title: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    color: BRAND.colors.charcoalInk,
  },
  closeText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.mossGreen,
  },
  summaryRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.inkSubtle,
  },
  dayLabelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  dayLabelsOffset: {
    width: 16, // Accent bar + margin
  },
  dayLabelsContainer: {
    flexDirection: 'row',
    gap: 8, // Match Gremly gap
  },
  dayLabel: {
    width: 28, // Match Gremly size
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
  },
  dayLabelToday: {
    color: BRAND.colors.mossGreen,
    fontFamily: 'Inter-Bold',
  },
  statusPlaceholder: {
    flex: 1, // Takes remaining space where status label goes
  },
  list: {
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
