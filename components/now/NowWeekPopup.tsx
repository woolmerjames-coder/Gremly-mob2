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
import type { DayDot, HabitStatus } from '../../lib/today/hooks/useWeeklyHabitStats';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
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
 * Get rolling 7 days ending today (matches useWeeklyHabitStats)
 * Returns: { startDate: Date, endDate: Date }
 */
function getRolling7DayRange(today: Date): { startDate: Date; endDate: Date } {
  const endDate = new Date(today);
  endDate.setHours(23, 59, 59, 999);

  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 6);
  startDate.setHours(0, 0, 0, 0);

  return { startDate, endDate };
}

/**
 * Format date to local ISO date string (YYYY-MM-DD)
 * Uses local timezone, not UTC, to match user's day boundaries
 */
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Compute streak from dayDots - count consecutive 'done' days from the end
 */
function computeStreak(dayDots: DayDot[]): number {
  let streak = 0;
  for (let i = dayDots.length - 1; i >= 0; i--) {
    if (dayDots[i] === 'done') {
      streak++;
    } else if (dayDots[i] !== 'future') {
      break; // Stop at first non-done, non-future day
    }
  }
  return streak;
}

/**
 * Determine check-in status based on last_checked_in_at instead of completions.
 * For daily habits: up to date if checked in today or yesterday.
 * For weekly habits: up to date if checked in within last 7 days.
 */
function getCheckInStatus(habit: Habit | undefined): HabitStatus {
  if (!habit) return 'needs_attention';

  const lastCheckedIn = habit.last_checked_in_at?.split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const cadence = habit.cadence ?? 'daily';

  if (!lastCheckedIn) return 'needs_attention';

  if (cadence === 'daily') {
    return lastCheckedIn >= yesterday ? 'on_track' : 'needs_attention';
  } else {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    return lastCheckedIn >= sevenDaysAgo ? 'on_track' : 'needs_attention';
  }
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
  // Use Zustand as single source of truth for habit progress
  const habitProgress = useGremlyStore((s) => s.habitProgress);
  const logHabitCompletionForDate = useGremlyStore((s) => s.logHabitCompletionForDate);
  const removeHabitCompletionForDate = useGremlyStore((s) => s.removeHabitCompletionForDate);
  const checkInHabit = useGremlyStore((s) => s.checkInHabit);
  const [isLoading, setIsLoading] = useState(false);
  // Store the initial sort order to prevent rows from jumping when toggled
  const [sortOrder, setSortOrder] = useState<string[] | null>(null);

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

  // Handle check-in button press
  const handleCheckIn = useCallback(
    async (habitId: string) => {
      await checkInHabit(habitId);
    },
    [checkInHabit],
  );

  // Week date range - rolling 7 days ending today (matches useWeeklyHabitStats)
  const today = useMemo(() => new Date(), []);
  const { startDate: weekStart, endDate: weekEnd } = useMemo(
    () => getRolling7DayRange(today),
    [today],
  );
  const weekStartIso = useMemo(() => toDateString(weekStart), [weekStart]);
  const weekEndIso = useMemo(() => toDateString(weekEnd), [weekEnd]);

  // Build enriched habits from Zustand habitProgress (single source of truth)
  const enrichedHabits = useMemo<RawHabit[]>(() => {
    if (!allHabits || allHabits.length === 0) return [];

    return allHabits.map((habit) => {
      // Filter habitProgress for this habit within the week range
      const progressDates = habitProgress
        .filter(
          (p) =>
            p.habit_id === habit.id &&
            p.occurred_day >= weekStartIso &&
            p.occurred_day <= weekEndIso,
        )
        .map((p) => p.occurred_day);

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
        // Pass through cadence and target_per_period for frequency label
        cadence: (habit as any).cadence as 'daily' | 'weekly' | 'monthly' | undefined,
        target_per_period: (habit as any).target_per_period as number | undefined,
        labels: habit.labels,
        type: habit.type,
        subtype: habit.subtype, // For breaking habit detection
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
    });
  }, [allHabits, habitProgress, weekStartIso, weekEndIso]);

  // Reset sort order when popup opens
  useEffect(() => {
    if (!visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSortOrder(null); // Clear sort order so it re-sorts on next open
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false); // No async loading needed - data comes from Zustand
    }
  }, [visible]);

  // Log enriched habits for debugging
  useEffect(() => {
    if (visible && enrichedHabits.length > 0) {
      console.log(
        '[NowWeekPopup] habitProgress from Zustand:',
        habitProgress.length,
        'items in range:',
        habitProgress.filter((p) => p.occurred_day >= weekStartIso && p.occurred_day <= weekEndIso)
          .length,
      );
      console.log(
        '[NowWeekPopup] Enriched habits with progress:',
        enrichedHabits.map((h) => ({
          name: h.name,
          progressDates: h.habit_progress?.map((p) => p.occurred_day) ?? [],
        })),
      );
    }
  }, [visible, enrichedHabits, habitProgress, weekStartIso, weekEndIso]);

  // Compute weekly stats from enriched habits
  const rawWeeklyStats = useWeeklyHabitStats(enrichedHabits);

  // Capture sort order on first render (via effect, not during render)
  useEffect(() => {
    if (rawWeeklyStats.length > 0 && sortOrder == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSortOrder(rawWeeklyStats.map((s) => s.id));
    }
  }, [rawWeeklyStats, sortOrder]);

  // Apply stable sort order to prevent row jumping on toggle
  // Breaking habits are always sorted to the top
  const weeklyStats = useMemo(() => {
    if (rawWeeklyStats.length === 0) return rawWeeklyStats;

    return [...rawWeeklyStats].sort((a, b) => {
      // First: breaking habits at top
      const aIsBreaking = allHabits?.find((h) => h.id === a.id)?.subtype === 'break_habit';
      const bIsBreaking = allHabits?.find((h) => h.id === b.id)?.subtype === 'break_habit';
      if (aIsBreaking && !bIsBreaking) return -1;
      if (!aIsBreaking && bIsBreaking) return 1;

      // Then: maintain original sort order
      if (sortOrder == null) return 0;
      const aIdx = sortOrder.indexOf(a.id);
      const bIdx = sortOrder.indexOf(b.id);
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }, [rawWeeklyStats, sortOrder, allHabits]);

  console.log(
    '[NowWeekPopup] enrichedHabits:',
    enrichedHabits.length,
    'weeklyStats:',
    weeklyStats.length,
  );
  console.log('[HabitsSheet] layout tightened');

  // Compute summary stats: habits up to date vs total (based on check-in dates)
  // Use a function to compute this to avoid Date.now() purity issues
  const computeSummaryStats = useCallback(() => {
    if (!allHabits) return { upToDate: 0, total: 0 };

    const now = Date.now();
    const yesterday = new Date(now - 86400000).toISOString().split('T')[0];
    const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString().split('T')[0];

    const total = allHabits.filter((h) => !h.archived).length;

    const upToDate = allHabits.filter((habit) => {
      if (habit.archived) return false;

      const lastCheckedIn = habit.last_checked_in_at?.split('T')[0];
      const cadence = habit.cadence ?? 'daily';

      if (!lastCheckedIn) return false;

      if (cadence === 'daily') {
        return lastCheckedIn >= yesterday;
      } else {
        return lastCheckedIn >= sevenDaysAgo;
      }
    }).length;

    return { upToDate, total };
  }, [allHabits]);

  // Compute stats when visible
  const summaryStats = visible ? computeSummaryStats() : { upToDate: 0, total: 0 };

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

  // Handle day toggle - use Zustand actions for single source of truth
  const handleToggleDay = useCallback(
    async (habitId: string, dateISO: string, newState: boolean) => {
      console.log('[HabitsSheet] toggling via Zustand', {
        habitId,
        dateISO,
        newState,
      });

      // Call parent handler if provided (for backwards compat)
      if (onToggleDay) {
        onToggleDay(habitId, dateISO, newState);
      }

      // Use Zustand actions - updates habitProgress immediately,
      // which will update both Today's Focus and Habits This Week
      try {
        if (newState) {
          await logHabitCompletionForDate(habitId, dateISO);
        } else {
          await removeHabitCompletionForDate(habitId, dateISO);
        }
      } catch (error) {
        console.error('[NowWeekPopup] Failed to toggle day:', error);
      }
    },
    [onToggleDay, logHabitCompletionForDate, removeHabitCompletionForDate],
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
                  {summaryStats.upToDate}/{summaryStats.total} up to date
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </Box>

          {/* Helper text */}
          <Text style={styles.helperText}>Tap circles to log · Confirm to mark reviewed</Text>

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
                {weeklyStats.map((stat, index) => {
                  const habit = allHabits?.find((h) => h.id === stat.id);
                  const checkInStatus = getCheckInStatus(habit);
                  return (
                    <HabitWeeklyRow
                      key={stat.id}
                      habitId={stat.id}
                      name={stat.name}
                      weeklyCompleted={stat.weeklyCompleted}
                      weeklyTarget={stat.weeklyTarget}
                      status={checkInStatus}
                      dayDots={stat.dayDots}
                      dayDates={stat.dayDates}
                      todayIndex={todayIndex}
                      frequencyLabel={stat.frequencyLabel}
                      onToggleDay={handleToggleDay}
                      onPressHeader={() => openHabitDetail(stat.id, stat.name)}
                      showDivider={index < weeklyStats.length - 1}
                      isBreakingHabit={habit?.subtype === 'break_habit'}
                      streakDays={computeStreak(stat.dayDots)}
                      onCheckIn={handleCheckIn}
                      startDate={habit?.start_date}
                    />
                  );
                })}
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
    fontWeight: '700',
    color: MOSS_GREEN,
    borderBottomWidth: 2,
    borderBottomColor: MOSS_GREEN,
    paddingBottom: 2,
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
  helperText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: INK_SUBTLE,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
});
