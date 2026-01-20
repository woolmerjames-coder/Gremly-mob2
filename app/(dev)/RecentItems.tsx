/**
 * DEV-ONLY: Habits Weekly Screen
 *
 * Shows all habits with weekly progress using the new weekly habit system.
 * Displays: habit name, frequency, weekly progress dots, status, fraction
 *
 * Access via DEV floating button.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRepo } from '../../providers/RepoProvider';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type { Habit } from '../../lib/types';
import { Text } from '../../ui/Text';
import { Box } from '../../ui/Box';
import {
  useWeeklyHabitStats,
  getWeeklySummary,
  type RawHabit,
  type WeeklyHabitStats,
} from '../../lib/today/hooks/useWeeklyHabitStats';
import { HabitWeeklyRow } from '../../components/habits/HabitWeeklyRow';
import { HabitDetailModal } from '../../components/habits/HabitDetailModal';

export default function RecentItems() {
  const repo = useRepo();
  const storeHabits = useGremlyStore((s) => s.habits);
  const [habits, setHabits] = useState<RawHabit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compute weekly stats from habits
  const stats = useWeeklyHabitStats(habits);
  const summary = getWeeklySummary(stats);

  // Modal state
  const [selectedHabit, setSelectedHabit] = useState<WeeklyHabitStats | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const openHabitDetail = useCallback((habit: WeeklyHabitStats) => {
    setSelectedHabit(habit);
    setModalVisible(true);
  }, []);

  const closeHabitDetail = useCallback(() => {
    setModalVisible(false);
    setSelectedHabit(null);
  }, []);

  useEffect(() => {
    loadHabits();
  }, []);

  const loadHabits = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use habits from Zustand store
      const allHabits = storeHabits as Habit[];

      // Get week date range for fetching progress
      const today = new Date();
      const weekStart = getWeekStart(today);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekStartIso = toDateString(weekStart);
      const weekEndIso = toDateString(weekEnd);

      // Fetch progress dates for each habit and enrich (still uses repo for progress dates)
      const enrichedHabits: RawHabit[] = await Promise.all(
        allHabits.map(async (habit) => {
          const progressDates = await repo.getHabitProgressDates(
            habit.id,
            weekStartIso,
            weekEndIso,
          );
          return {
            id: habit.id,
            name: habit.name,
            frequency: habit.frequency || 'daily',
            frequency_value:
              (habit as any).frequency_value ?? (habit as any).target_per_period ?? 1,
            labels: habit.labels,
            type: habit.type,
            habit_progress: progressDates.map((d: string) => ({ occurred_day: d })),
            // days_active is already number[] from DB (0=Sunday, 1=Monday, etc.)
            schedule_days: Array.isArray((habit as any).days_active)
              ? (habit as any).days_active.filter(
                  (d: number) => typeof d === 'number' && d >= 0 && d <= 6,
                )
              : undefined,
          };
        }),
      );

      setHabits(enrichedHabits);
    } catch (err) {
      console.error('[RecentItems] Failed to load habits:', err);
      setError(err instanceof Error ? err.message : 'Failed to load habits');
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item, index }: { item: WeeklyHabitStats; index: number }) => (
    <Pressable onPress={() => openHabitDetail(item)}>
      <HabitWeeklyRow habit={item} showDivider={index < stats.length - 1} />
    </Pressable>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Box style={styles.centerBox}>
          <ActivityIndicator size="large" />
          <Text variant="body" style={styles.centerText}>
            Loading habits...
          </Text>
        </Box>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <Box style={styles.centerBox}>
          <Text variant="title" style={styles.errorText}>
            Error
          </Text>
          <Text variant="body" style={styles.centerText}>
            {error}
          </Text>
        </Box>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {/* Header */}
      <Box style={styles.header}>
        <Box style={styles.headerTop}>
          <Text variant="title" style={styles.title}>
            Habits
          </Text>
          <Text variant="subtle" style={styles.thisWeek}>
            This week
          </Text>
        </Box>
        <Text variant="subtle" style={styles.summary}>
          {summary.onTrackCount} of {summary.totalHabits} on track
        </Text>
      </Box>

      {/* List */}
      <FlatList
        data={stats}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Box style={styles.emptyBox}>
            <Text variant="subtle" style={styles.emptyText}>
              No habits found
            </Text>
          </Box>
        }
      />

      {/* Habit Detail Modal */}
      <HabitDetailModal
        visible={modalVisible}
        habitId={selectedHabit?.id ?? null}
        habitName={selectedHabit?.name}
        onClose={closeHabitDetail}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerText: {
    textAlign: 'center',
    marginTop: 8,
  },
  errorText: {
    color: '#dc2626',
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
  },
  thisWeek: {
    fontSize: 14,
    color: '#757575',
  },
  summary: {
    fontSize: 14,
    color: '#9E9E9E',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  emptyBox: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#9E9E9E',
  },
});
