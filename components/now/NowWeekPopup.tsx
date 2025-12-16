/**
 * NowWeekPopup - Shows today's habit progress and weekly summaries with tap-to-complete
 *
 * Uses useTodayStats as single source of truth for today's habits,
 * ensuring the counts match what's shown in the Today cards.
 *
 * Each day dot is tappable to toggle completion for past/current days.
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  View,
} from 'react-native';
import { Box, Text } from '../../ui';
import { HabitWeeklyRow } from '../today/HabitWeeklyRow';
import { useRepo } from '../../providers/RepoProvider';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { useWeeklyHabitStats, type RawHabit } from '../../lib/today/hooks/useWeeklyHabitStats';
import type {
  NowWeeklyHabitSummary,
  NowLockedItem,
  NowActiveItem,
  NowCompletedItem,
} from '../../lib/now/nowTypes';
import type { Habit } from '../../lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens (Harmonic Cortex)
// ─────────────────────────────────────────────────────────────────────────────
const MOSS_GREEN = '#2E5540';
const CHARCOAL_INK = '#222222';
const INK_SUBTLE = 'rgba(34, 34, 34, 0.55)';
const BORDER_SUBTLE = 'rgba(0, 0, 0, 0.08)';

// Shared day header constants - must match HabitWeeklyRow GremlyDot sizing
const DOT_SIZE = 28; // Match GremlyDot size
const DOT_SPACING = 8; // Match HabitWeeklyRow gap

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
  habitsToday: _habitsToday,
  completedHabitsToday: _completedHabitsToday,
  weeklySummaries: _weeklySummaries,
  allHabits,
  onClose,
  onToggleDay,
  onRefresh: _onRefresh,
}: NowWeekPopupProps) {
  const repo = useRepo();
  const overlayController = useUnifiedOverlayController();
  const [enrichedHabits, setEnrichedHabits] = useState<RawHabit[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Open habit in unified overlay (same save path as Today/NOW)
  const openHabitDetail = useCallback(
    async (habitId: string, _habitName: string) => {
      try {
        // Fetch full habit record to ensure all fields are available for editing
        const fullHabit = await repo.getById(habitId);
        if (fullHabit && fullHabit.type === 'habit') {
          // Close this popup first, then open the overlay
          onClose();
          overlayController.openEdit({ record: fullHabit as any });
        } else {
          console.warn('[NowWeekPopup] Habit not found or type mismatch:', habitId);
        }
      } catch (error) {
        console.error('[NowWeekPopup] Failed to fetch habit for editing:', error);
      }
    },
    [repo, overlayController, onClose],
  );

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
    if (!visible) {
      // Reset state when popup closes
      return;
    }

    async function loadHabitProgress() {
      console.log('[NowWeekPopup] Starting load, visible:', visible);
      setIsLoading(true);
      try {
        // Get all habits from repo if not provided
        let habitsToProcess: Habit[];
        if (allHabits && allHabits.length > 0) {
          habitsToProcess = allHabits;
          console.log('[NowWeekPopup] Using provided allHabits:', habitsToProcess.length);
        } else {
          habitsToProcess = (await repo.listByType('habit')) as Habit[];
          console.log('[NowWeekPopup] Fetched from repo:', habitsToProcess.length);
        }

        if (habitsToProcess.length === 0) {
          console.log('[NowWeekPopup] No habits found!');
          setEnrichedHabits([]);
          setIsLoading(false);
          return;
        }

        // Fetch progress dates for each habit
        const enriched: RawHabit[] = await Promise.all(
          habitsToProcess.map(async (habit) => {
            const progressDates = await repo.getHabitProgressDates(
              habit.id,
              weekStartIso,
              weekEndIso,
            );
            // Parse frequency_value as numeric target for x_per_week computation
            const freqVal = (habit as any).frequency_value;
            const numericTarget =
              typeof freqVal === 'number' ? freqVal : ((habit as any).target_per_period ?? 1);

            return {
              id: habit.id,
              name: habit.name,
              frequency: habit.frequency || 'daily',
              frequency_value: numericTarget,
              // Pass through full frequency_value JSON for label derivation
              frequency_json: freqVal,
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
        console.log(
          '[NowWeekPopup] Enriched habits:',
          enriched.length,
          enriched.map((h) => h.name),
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
  console.log(
    '[NowWeekPopup] enrichedHabits:',
    enrichedHabits.length,
    'weeklyStats:',
    weeklyStats.length,
  );
  console.log('[HabitsSheet] layout tightened');

  // Compute summary stats: habits on track vs total
  const summaryStats = useMemo(() => {
    const total = weeklyStats.length;
    const onTrack = weeklyStats.filter(
      (s) => s.status === 'on_track' || s.status === 'done_for_week',
    ).length;
    return { onTrack, total };
  }, [weeklyStats]);

  // Get dynamic day labels from first habit's stats (rolling 7 days)
  // dayLabels is an array of short day names like ['Th', 'Fr', 'Sa', 'Su', 'Mo', 'Tu', 'We']
  const dayLabels = useMemo(() => {
    if (weeklyStats.length > 0 && weeklyStats[0].dayLabels) {
      return weeklyStats[0].dayLabels;
    }
    // Fallback to static Mon-Sun
    return ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  }, [weeklyStats]);

  // Today is always the last day (index 6) in rolling 7-day view
  const todayIndex =
    weeklyStats.length > 0 && weeklyStats[0].todayIndex !== undefined
      ? weeklyStats[0].todayIndex
      : 6;

  // Handle day toggle - optimistic update only, no immediate refresh
  const handleToggleDay = useCallback(
    async (habitId: string, dateISO: string, newState: boolean) => {
      console.log('[HabitsSheet] local toggle only, no global reload', {
        habitId,
        dateISO,
        newState,
      });

      // Optimistically update local state immediately
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
        // Use silent repo methods - they don't emit events, avoiding global reload
        try {
          if (newState) {
            await repo.completeHabitForDateSilent(habitId, dateISO);
          } else {
            await repo.removeHabitCompletionSilent(habitId, dateISO);
          }
          // No refresh needed - local state is already updated
        } catch (error) {
          console.error('[NowWeekPopup] Failed to toggle day:', error);
          // TODO: Could roll back local state here on failure
        }
      }
    },
    [repo, onToggleDay],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={styles.sheet}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <Box style={styles.header}>
            <View>
              <Text style={styles.title}>Habits this week</Text>
              {/* Summary line: "{onTrack}/{total} on track" */}
              {weeklyStats.length > 0 && (
                <Text style={styles.summaryText}>
                  {summaryStats.onTrack}/{summaryStats.total} on track
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </Box>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {/* ─── SHARED DAY HEADER ROW ─── */}
            {/* Dynamic day labels from rolling 7-day view, today highlighted in green */}
            {!isLoading && weeklyStats.length > 0 && (
              <View style={styles.dayHeaderRow}>
                {dayLabels.map((label, index) => (
                  <Text
                    key={`header-${index}`}
                    style={[
                      styles.dayHeaderLabel,
                      index === todayIndex && styles.dayHeaderLabelToday,
                    ]}
                  >
                    {label}
                  </Text>
                ))}
              </View>
            )}

            {/* Habit Cards */}
            {isLoading ? (
              <Box style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={INK_SUBTLE} />
              </Box>
            ) : weeklyStats.length > 0 ? (
              <>
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
                    todayIndex={todayIndex}
                    frequencyLabel={stat.frequencyLabel}
                    onToggleDay={handleToggleDay}
                    onPressHeader={() => openHabitDetail(stat.id, stat.name)}
                    showDivider={index < weeklyStats.length - 1}
                  />
                ))}
              </>
            ) : (
              <Text style={styles.emptyText}>
                {enrichedHabits.length === 0 ? 'No habits to track' : 'Loading weekly data...'}
              </Text>
            )}
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
  // Sheet opens high enough to show 3-4 full habit rows without clipping the bottom row
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    minHeight: 400,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
  },
  title: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    color: CHARCOAL_INK,
  },
  summaryText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: MOSS_GREEN,
    marginTop: 2,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
    color: MOSS_GREEN,
    fontFamily: 'Inter-Medium',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8, // Tighter top padding since header row provides spacing
    paddingBottom: 32, // Extra padding for home indicator and to prevent clipping
  },
  // ─── SHARED DAY HEADER ROW ───
  // Single row of M T W T F S S labels above all habit rows
  // Must use same spacing as HabitWeeklyRow dotsRow for perfect alignment
  dayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    // Align with dots: accent bar (4px) + marginRight (12px) = 16px offset
    marginLeft: 16,
    marginBottom: 10, // Gap before first habit row
    gap: DOT_SPACING, // Must match dot spacing exactly
  },
  dayHeaderLabel: {
    width: DOT_SIZE, // Same width as GremlyDots for column alignment
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: INK_SUBTLE,
    textAlign: 'center',
  },
  dayHeaderLabelToday: {
    fontFamily: 'Inter-Bold',
    color: MOSS_GREEN,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: INK_SUBTLE,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
