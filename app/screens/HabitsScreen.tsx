/**
 * HabitsScreen - Full-screen habits page showing weekly summaries with tap-to-complete
 *
 * Converted from NowWeekPopup modal. Uses useTodayStats as single source of truth
 * for today's habits, ensuring the counts match what's shown in the Today cards.
 *
 * Each day dot is tappable to toggle completion for past/current days.
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft } from 'lucide-react-native';
import { Box, Text } from '../../ui';
import { HabitWeeklyRow } from '../../components/today/HabitWeeklyRow';
import { useWeeklyHabitStats, type RawHabit } from '../../lib/today/hooks/useWeeklyHabitStats';
import type { DayDot, HabitStatus } from '../../lib/today/hooks/useWeeklyHabitStats';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { dateService } from '../../lib/date/DateService';
import { BRAND } from '../../design/brand';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { Habit } from '../../lib/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const HABIT_GREMLY = require('../../assets/mascot/habitgremly.png');

// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens (from BRAND)
// ─────────────────────────────────────────────────────────────────────────────

// Shared day header constants - must match HabitWeeklyRow GremlyDot sizing
const DOT_SIZE = 28; // Match GremlyDot size
const DOT_SPACING = 8; // Match HabitWeeklyRow gap

type HabitFilter = 'all' | 'build' | 'break';

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
  const yesterday = dateService.yesterday();
  const cadence = habit.cadence ?? 'daily';

  if (!lastCheckedIn) return 'needs_attention';

  if (cadence === 'daily') {
    return lastCheckedIn >= yesterday ? 'on_track' : 'needs_attention';
  } else {
    const sevenDaysAgo = dateService.daysAgo(7);
    return lastCheckedIn >= sevenDaysAgo ? 'on_track' : 'needs_attention';
  }
}

export default function HabitsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  // Source habits from Zustand store, filter to active only
  const habits = useGremlyStore((s) => s.habits);
  const activeHabits = useMemo(() => habits.filter((h) => !h.archived), [habits]);

  // Use Zustand as single source of truth for habit progress
  const habitProgress = useGremlyStore((s) => s.habitProgress);
  const logHabitCompletionForDate = useGremlyStore((s) => s.logHabitCompletionForDate);
  const removeHabitCompletionForDate = useGremlyStore((s) => s.removeHabitCompletionForDate);
  const checkInHabit = useGremlyStore((s) => s.checkInHabit);
  const [isLoading, setIsLoading] = useState(false);
  // Store the initial sort order to prevent rows from jumping when toggled
  const [sortOrder, setSortOrder] = useState<string[] | null>(null);
  // Track if user has checked in this session
  const [hasCheckedInToday, setHasCheckedInToday] = useState(false);
  // Hide success message after delay
  const [showCheckInBar, setShowCheckInBar] = useState(true);
  // Filter state for build/break pills
  const [filter, setFilter] = useState<HabitFilter>('all');

  // Hide check-in bar after showing success message
  useEffect(() => {
    if (hasCheckedInToday) {
      // Show success message briefly, then hide
      const timer = setTimeout(() => {
        setShowCheckInBar(false);
      }, 2000); // Show "Checked in for today" for 2s before hiding

      return () => clearTimeout(timer);
    }
    // Reset showCheckInBar when hasCheckedInToday becomes false (handled by resetting both together)
  }, [hasCheckedInToday]);

  // Navigate to habit detail screen
  const openHabitDetail = useCallback(
    (habitId: string) => {
      navigation.navigate('HabitDetail', { habitId });
    },
    [navigation],
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
    if (activeHabits.length === 0) return [];

    return activeHabits.map((habit) => {
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
        // days_active is already number[] from DB (0=Sunday, 1=Monday, etc.)
        schedule_days: Array.isArray((habit as any).days_active)
          ? (habit as any).days_active.filter(
              (d: number) => typeof d === 'number' && d >= 0 && d <= 6,
            )
          : undefined,
      };
    });
  }, [activeHabits, habitProgress, weekStartIso, weekEndIso]);

  // Log enriched habits for debugging
  useEffect(() => {
    if (enrichedHabits.length > 0) {
      console.log(
        '[HabitsScreen] habitProgress from Zustand:',
        habitProgress.length,
        'items in range:',
        habitProgress.filter((p) => p.occurred_day >= weekStartIso && p.occurred_day <= weekEndIso)
          .length,
      );
      console.log(
        '[HabitsScreen] Enriched habits with progress:',
        enrichedHabits.map((h) => ({
          name: h.name,
          progressDates: h.habit_progress?.map((p) => p.occurred_day) ?? [],
        })),
      );
    }
  }, [enrichedHabits, habitProgress, weekStartIso, weekEndIso]);

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
      const aIsBreaking = activeHabits.find((h) => h.id === a.id)?.subtype === 'break_habit';
      const bIsBreaking = activeHabits.find((h) => h.id === b.id)?.subtype === 'break_habit';
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
  }, [rawWeeklyStats, sortOrder, activeHabits]);

  // Apply filter to weeklyStats based on build/break selection
  const filteredWeeklyStats = useMemo(() => {
    if (filter === 'all') return weeklyStats;

    return weeklyStats.filter((stat) => {
      const habit = activeHabits.find((h) => h.id === stat.id);
      if (!habit) return false;
      if (filter === 'build') {
        return habit.subtype === 'start_habit' || habit.subtype === 'routine';
      }
      return habit.subtype === 'break_habit';
    });
  }, [weeklyStats, filter, activeHabits]);

  // Compute summary stats: habits up to date vs total (based on check-in dates)
  const summaryStats = useMemo(() => {
    const yesterday = dateService.yesterday();
    const sevenDaysAgo = dateService.daysAgo(7);

    const total = activeHabits.length;

    const upToDate = activeHabits.filter((habit) => {
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
  }, [activeHabits]);

  // Contextual headline based on on-track percentage
  const headline = useMemo(() => {
    if (summaryStats.total === 0) return 'Ready when you are';
    const pct = summaryStats.upToDate / summaryStats.total;
    if (pct > 0.7) return 'Solid week so far';
    if (pct >= 0.4) return 'Building momentum';
    return 'Fresh start territory';
  }, [summaryStats]);

  // Compute building/breaking counts for filter pills
  const buildingCount = useMemo(() => {
    return activeHabits.filter((h) => h.subtype === 'start_habit' || h.subtype === 'routine')
      .length;
  }, [activeHabits]);

  const breakingCount = useMemo(() => {
    return activeHabits.filter((h) => h.subtype === 'break_habit').length;
  }, [activeHabits]);

  // Compute habits needing check-in
  const habitsNeedingCheckIn = useMemo(() => {
    return weeklyStats.filter((stat) => {
      const habit = activeHabits.find((h) => h.id === stat.id);
      return getCheckInStatus(habit) === 'needs_attention';
    });
  }, [weeklyStats, activeHabits]);
  const needsCheckInCount = habitsNeedingCheckIn.length;

  // Handle bulk check-in for all habits needing attention
  const handleCheckInAll = useCallback(async () => {
    for (const stat of habitsNeedingCheckIn) {
      await checkInHabit(stat.id);
    }
    setHasCheckedInToday(true);
  }, [habitsNeedingCheckIn, checkInHabit]);

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
      console.log('[HabitsScreen] toggling via Zustand', {
        habitId,
        dateISO,
        newState,
      });

      // Use Zustand actions - updates habitProgress immediately,
      // which will update both Today's Focus and Habits This Week
      try {
        if (newState) {
          await logHabitCompletionForDate(habitId, dateISO);
        } else {
          await removeHabitCompletionForDate(habitId, dateISO);
        }
      } catch (error) {
        console.error('[HabitsScreen] Failed to toggle day:', error);
      }
    },
    [logHabitCompletionForDate, removeHabitCompletionForDate],
  );

  // Toggle filter pill
  const handleFilterPress = useCallback((pill: 'build' | 'break') => {
    setFilter((current) => (current === pill ? 'all' : pill));
  }, []);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <ChevronLeft size={24} color={BRAND.colors.charcoalInk} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Habits</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Summary Section */}
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryLeft}>
            <Text style={styles.headline}>{headline}</Text>
            <View style={styles.statsLine}>
              <Text style={styles.statsOnTrack}>{summaryStats.upToDate}</Text>
              <Text style={styles.statsLabel}> on track</Text>
              {summaryStats.total - summaryStats.upToDate > 0 && (
                <>
                  <Text style={styles.statsSep}> · </Text>
                  <Text style={styles.statsAttention}>
                    {summaryStats.total - summaryStats.upToDate}
                  </Text>
                  <Text style={styles.statsLabel}> need attention</Text>
                </>
              )}
            </View>
          </View>
          <View style={styles.mascotWrap}>
            {/* TODO: habitgremly.png needs background removed (currently has black bg) */}
            <Image source={HABIT_GREMLY} style={{ width: 64, height: 64 }} resizeMode="contain" />
          </View>
        </View>

        {/* Filter pills */}
        <View style={styles.pillRow}>
          {buildingCount > 0 && (
            <TouchableOpacity
              style={[styles.pill, filter === 'build' && styles.pillBuildSelected]}
              onPress={() => handleFilterPress('build')}
            >
              <Text style={[styles.pillText, filter === 'build' && styles.pillBuildSelectedText]}>
                {buildingCount} building
              </Text>
            </TouchableOpacity>
          )}
          {breakingCount > 0 && (
            <TouchableOpacity
              style={[styles.pill, filter === 'break' && styles.pillBreakSelected]}
              onPress={() => handleFilterPress('break')}
            >
              <Text style={[styles.pillText, filter === 'break' && styles.pillBreakSelectedText]}>
                {breakingCount} breaking
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── FIXED DAY LABELS ROW ─── */}
      {!isLoading && filteredWeeklyStats.length > 0 && (
        <View style={styles.dayHeaderRow}>
          {dayLabels.map((label, index) => (
            <Text
              key={`header-${index}`}
              style={[styles.dayHeaderLabel, index === todayIndex && styles.dayHeaderLabelToday]}
            >
              {label}
            </Text>
          ))}
        </View>
      )}

      <ScrollView
        style={styles.list}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      >
        {/* Habit Cards */}
        {isLoading ? (
          <Box style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={BRAND.colors.inkMuted} />
          </Box>
        ) : filteredWeeklyStats.length > 0 ? (
          <>
            {filteredWeeklyStats.map((stat, index) => {
              const habit = activeHabits.find((h) => h.id === stat.id);
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
                  onPressHeader={() => openHabitDetail(stat.id)}
                  showDivider={index < filteredWeeklyStats.length - 1}
                  isBreakingHabit={habit?.subtype === 'break_habit'}
                  streakDays={computeStreak(stat.dayDots)}
                  startDate={habit?.start_date}
                />
              );
            })}
          </>
        ) : (
          <Text style={styles.emptyText}>
            {enrichedHabits.length === 0
              ? 'No habits to track'
              : filter !== 'all'
                ? `No ${filter === 'build' ? 'building' : 'breaking'} habits`
                : 'Loading weekly data...'}
          </Text>
        )}
      </ScrollView>

      {/* Bottom check-in bar */}
      {showCheckInBar && (needsCheckInCount > 0 || hasCheckedInToday) && (
        <View style={{ paddingBottom: insets.bottom }}>
          {!hasCheckedInToday ? (
            <View style={styles.checkInBar}>
              <Text style={styles.checkInBarText}>
                Check in on {needsCheckInCount} habit{needsCheckInCount > 1 ? 's' : ''}
              </Text>
              <TouchableOpacity style={styles.checkInBarButton} onPress={handleCheckInAll}>
                <Text style={styles.checkInBarButtonText}>All good for now</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.checkInBarSuccess}>
              <Text style={styles.checkInBarSuccessText}>✓ Checked in for today</Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  headerTitle: {
    fontSize: 18,
    ...BRAND.typography.header,
    color: BRAND.colors.charcoalInk,
  },
  summary: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 0,
    backgroundColor: BRAND.colors.linenCream,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLeft: {
    flex: 1,
  },
  headline: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: BRAND.colors.charcoalInk,
  },
  statsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statsOnTrack: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.mossGreen,
  },
  statsLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.inkMuted,
  },
  statsSep: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.inkMuted,
  },
  statsAttention: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#C79E5F',
  },
  mascotWrap: {
    marginLeft: 12,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  pill: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: 12,
    ...BRAND.typography.bodyMedium,
    color: BRAND.colors.inkSubtle,
  },
  pillBuildSelected: {
    backgroundColor: BRAND.colors.sageMist,
    borderColor: BRAND.colors.sageMist,
  },
  pillBuildSelectedText: {
    color: BRAND.colors.mossGreen,
  },
  pillBreakSelected: {
    backgroundColor: 'rgba(224,196,122,0.15)',
    borderColor: 'rgba(224,196,122,0.3)',
  },
  pillBreakSelectedText: {
    color: '#C79E5F',
  },
  list: {
    paddingHorizontal: 16,
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 80,
  },
  // ─── FIXED DAY LABELS ROW ───
  // Sticky row of day letters between summary and scrollable habit list
  // Must align with dots in HabitWeeklyRow: accent bar (4px) + gap (12px) = 16px
  dayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingLeft: 32, // 16 (page padding) + 16 (dot alignment offset)
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
    backgroundColor: BRAND.colors.linenCream,
    gap: DOT_SPACING,
  },
  dayHeaderLabel: {
    width: DOT_SIZE, // Same width as GremlyDots for column alignment
    fontSize: 11,
    ...BRAND.typography.bodyMedium,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
  },
  dayHeaderLabelToday: {
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
    borderBottomWidth: 2,
    borderBottomColor: BRAND.colors.mossGreen,
    paddingBottom: 2,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    ...BRAND.typography.body,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  checkInBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
    backgroundColor: '#FFFDF7',
  },
  checkInBarText: {
    fontSize: 14,
    ...BRAND.typography.bodyMedium,
    color: BRAND.colors.charcoalInk,
  },
  checkInBarButton: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  checkInBarButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: BRAND.colors.surface,
  },
  checkInBarSuccess: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
    alignItems: 'center',
  },
  checkInBarSuccessText: {
    fontSize: 14,
    ...BRAND.typography.bodyMedium,
    color: BRAND.colors.mossGreen,
  },
});
