/**
 * NowWeekPopup - Shows today's habit progress and weekly summaries with tap-to-complete
 *
 * Uses useTodayStats as single source of truth for today's habits,
 * ensuring the counts match what's shown in the Today cards.
 *
 * Each day dot is tappable to toggle completion for past/current days.
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Modal, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Box, Text } from '../../ui';
import { HabitWeeklyRow } from '../today/HabitWeeklyRow';
import { useRepo } from '../../providers/RepoProvider';
import {
  useWeeklyHabitStats,
  type RawHabit,
  type HabitStatus,
} from '../../lib/today/hooks/useWeeklyHabitStats';
import type {
  NowWeeklyHabitSummary,
  NowLockedItem,
  NowActiveItem,
  NowCompletedItem,
} from '../../lib/now/nowTypes';
import type { Habit } from '../../lib/types';

interface NowWeekPopupProps {
  visible: boolean;
  /** Today's habits from useTodayStats (locked + active) */
  habitsToday: Array<NowLockedItem | NowActiveItem>;
  /** Today's completed habits from useTodayStats */
  completedHabitsToday: NowCompletedItem[];
  /** Weekly summaries for habit tracking (legacy - kept for backwards compat) */
  weeklySummaries: NowWeeklyHabitSummary[];
  /** All habits for weekly stats computation */
  allHabits?: Habit[];
  onClose: () => void;
  /** Called when a day dot is toggled */
  onToggleDay?: (habitId: string, dateISO: string, newState: boolean) => void;
  /** Called to refresh data after toggle */
  onRefresh?: () => void;
}

function getStatusLabel(status: HabitStatus): string {
  switch (status) {
    case 'done_for_week':
      return '✓ Completed for the week';
    case 'on_track':
      return 'Do today to stay on track';
    case 'needs_attention':
      return 'Needs attention';
    default:
      return '';
  }
}

/**
 * Get the Monday of the current week
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format date to ISO date string (YYYY-MM-DD)
 */
function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function NowWeekPopup({
  visible,
  habitsToday,
  completedHabitsToday,
  weeklySummaries,
  allHabits,
  onClose,
  onToggleDay,
  onRefresh,
}: NowWeekPopupProps) {
  const repo = useRepo();
  const [enrichedHabits, setEnrichedHabits] = useState<RawHabit[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Week date range
  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => getWeekStart(today), [today]);
  const weekStartIso = useMemo(() => toDateString(weekStart), [weekStart]);
  const weekEndDate = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 6);
    return end;
  }, [weekStart]);
  const weekEndIso = useMemo(() => toDateString(weekEndDate), [weekEndDate]);

  // Fetch habit progress dates when popup opens
  useEffect(() => {
    if (!visible) return;

    async function loadHabitProgress() {
      setIsLoading(true);
      try {
        // Get all habits from repo if not provided
        const habitsToProcess = allHabits || ((await repo.listByType('habit')) as Habit[]);

        // Fetch progress dates for each habit
        const enriched: RawHabit[] = await Promise.all(
          habitsToProcess.map(async (habit) => {
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
              schedule_days: (habit as any).days_active?.map((d: string) => {
                const dayMap: Record<string, number> = {
                  sun: 0,
                  mon: 1,
                  tue: 2,
                  wed: 3,
                  thu: 4,
                  fri: 5,
                  sat: 6,
                };
                return dayMap[d.toLowerCase()] ?? parseInt(d, 10);
              }),
            };
          }),
        );
        setEnrichedHabits(enriched);
      } catch (error) {
        console.error('[NowWeekPopup] Failed to load habit progress:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadHabitProgress();
  }, [visible, allHabits, repo, weekStartIso, weekEndIso]);

  // Compute weekly stats from enriched habits
  const weeklyStats = useWeeklyHabitStats(enrichedHabits);

  // Today's habit counts - derived from useTodayStats
  const totalHabitsToday = habitsToday.length;
  const completedHabitsCount = completedHabitsToday.length;
  const allHabitsCompletedToday = totalHabitsToday > 0 && completedHabitsCount >= totalHabitsToday;

  // Weekly totals - use new stats if available, fall back to legacy summaries
  const weeklyCompleted =
    weeklyStats.length > 0
      ? weeklyStats.reduce((sum, s) => sum + s.weeklyCompleted, 0)
      : weeklySummaries.reduce((sum, s) => sum + s.completionsThisWeek, 0);
  const weeklyTarget =
    weeklyStats.length > 0
      ? weeklyStats.reduce((sum, s) => sum + s.weeklyTarget, 0)
      : weeklySummaries.reduce((sum, s) => sum + s.targetPerWeek, 0);

  // Determine today's status message
  let todayStatusMessage: string;
  let todayStatusStyle: object;

  if (totalHabitsToday === 0) {
    todayStatusMessage = 'No habits scheduled for today';
    todayStatusStyle = styles.todayStatusNeutral;
  } else if (allHabitsCompletedToday) {
    todayStatusMessage = '✓ All habits done for today!';
    todayStatusStyle = styles.todayStatusComplete;
  } else {
    todayStatusMessage = `${completedHabitsCount} of ${totalHabitsToday} habits done today`;
    todayStatusStyle = styles.todayStatusInProgress;
  }

  // Handle day toggle
  const handleToggleDay = useCallback(
    async (habitId: string, dateISO: string, newState: boolean) => {
      // Optimistically update local state
      setEnrichedHabits((prev) =>
        prev.map((habit) => {
          if (habit.id !== habitId) return habit;
          const progress = habit.habit_progress || [];
          if (newState) {
            // Add date if not present
            if (!progress.some((p) => p.occurred_day === dateISO)) {
              return {
                ...habit,
                habit_progress: [...progress, { occurred_day: dateISO }],
              };
            }
          } else {
            // Remove date
            return {
              ...habit,
              habit_progress: progress.filter((p) => p.occurred_day !== dateISO),
            };
          }
          return habit;
        }),
      );

      // Call parent handler if provided
      if (onToggleDay) {
        onToggleDay(habitId, dateISO, newState);
      } else {
        // Default implementation using repo
        try {
          if (newState) {
            await repo.completeHabitForDate(habitId, dateISO);
          } else {
            await repo.removeHabitCompletion(habitId, dateISO);
          }
          // Refresh parent data
          onRefresh?.();
        } catch (error) {
          console.error('[NowWeekPopup] Failed to toggle day:', error);
        }
      }
    },
    [repo, onToggleDay, onRefresh],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={styles.sheet}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <Box style={styles.header}>
            <Text style={styles.title}>Habits</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </Box>

          <ScrollView style={styles.list}>
            {/* Today's Status Banner */}
            <Box style={styles.todayBanner}>
              <Text style={styles.todayLabel}>TODAY</Text>
              <Text style={[styles.todayStatus, todayStatusStyle]}>{todayStatusMessage}</Text>
            </Box>

            {/* Weekly Summary Section with tappable dots */}
            {isLoading ? (
              <Box style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#757575" />
              </Box>
            ) : weeklyStats.length > 0 ? (
              <>
                <Box style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>This Week</Text>
                </Box>

                {weeklyStats.map((stat, index) => (
                  <HabitWeeklyRow
                    key={stat.id}
                    habitId={stat.id}
                    name={stat.name}
                    weeklyCompleted={stat.weeklyCompleted}
                    weeklyTarget={stat.weeklyTarget}
                    status={stat.status}
                    dayDots={stat.dayDots}
                    dayDates={stat.dayDates}
                    statusLabel={getStatusLabel(stat.status)}
                    onToggleDay={handleToggleDay}
                    showDivider={index < weeklyStats.length - 1}
                  />
                ))}

                <Box style={styles.overall}>
                  <Text style={styles.overallText}>
                    Weekly: {weeklyCompleted}/{weeklyTarget} completed
                  </Text>
                </Box>
              </>
            ) : totalHabitsToday === 0 ? (
              <Text style={styles.emptyText}>No habits to track</Text>
            ) : null}
          </ScrollView>
        </TouchableOpacity>
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
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
    color: '#1976D2',
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  // Today's status banner
  todayBanner: {
    backgroundColor: '#F5F3EE',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  todayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 4,
    letterSpacing: 1,
  },
  todayStatus: {
    fontSize: 16,
    fontWeight: '600',
  },
  todayStatusComplete: {
    color: '#2E5540', // mossGreen
  },
  todayStatusInProgress: {
    color: '#424242',
  },
  todayStatusNeutral: {
    color: '#757575',
  },
  // Weekly section
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  overall: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: '#E0E0E0',
  },
  overallText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    paddingVertical: 24,
  },
});
