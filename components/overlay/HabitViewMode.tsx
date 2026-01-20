/**
 * HabitViewMode - Analytics view for a habit
 *
 * Displays streak, calendar, consistency, and milestone celebrations.
 * Rendered inside UnifiedOverlayV2 when viewing a habit.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  Pressable,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Folder, Flame, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import type { Habit } from '../../lib/types';
import type { HabitProgressRow } from '../../lib/store/useGremlyStore';
import { getHabitStreak, getFrequencyLabel } from '../../lib/sweep/habitHelpers';
import { getDateService } from '../../lib/date';

// Gremly avatar for completed dots
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_AVATAR = require('../../assets/buttonforHP.png');

// Brand colors
const BRAND = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  sageMist: '#BFD8C0',
  charcoalInk: '#222222',
  mutedSageText: '#768879',
  white: '#FFFFFF',
};

// Props interface
interface HabitViewModeProps {
  habit: Habit;
  habitProgress: HabitProgressRow[];
  spaceName?: string | null;
  onLogToday: () => void;
  onLogDate: (dateIso: string) => void;
  onRemoveDate: (dateIso: string) => void;
}

/**
 * Format start date as "Started Jan 3"
 */
function formatStartDate(startDate: string | null | undefined): string | null {
  if (!startDate) return null;
  try {
    const date = parseISO(startDate);
    return `Started ${format(date, 'MMM d')}`;
  } catch {
    return null;
  }
}

/**
 * Calculate the best (longest) streak ever from habit progress history.
 * Iterates through all completions and finds longest consecutive run.
 */
function calculateBestStreak(habitId: string, habitProgress: HabitProgressRow[]): number {
  // Get all completion dates for this habit, sorted ascending
  const completionDates = habitProgress
    .filter((p) => p.habit_id === habitId)
    .map((p) => p.occurred_day)
    .sort((a, b) => a.localeCompare(b));

  if (completionDates.length === 0) return 0;
  if (completionDates.length === 1) return 1;

  let bestStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < completionDates.length; i++) {
    const prevDate = new Date(completionDates[i - 1]);
    const currDate = new Date(completionDates[i]);

    // Calculate difference in days
    const diffTime = currDate.getTime() - prevDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Consecutive day
      currentStreak++;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else if (diffDays > 1) {
      // Gap - reset streak
      currentStreak = 1;
    }
    // diffDays === 0 means duplicate entry, skip
  }

  return bestStreak;
}

/**
 * Calculate average completions per period since habit started.
 * Returns { average: number, periodLabel: string, target: number }
 */
function calculateAverageFrequency(
  habitId: string,
  habitProgress: HabitProgressRow[],
  habit: {
    start_date?: string | null;
    cadence?: string | null;
    target_per_period?: number | null;
  },
): { average: number; periodLabel: string; target: number } {
  const ds = getDateService();
  const today = ds.getCurrentDate();
  const startDate = habit.start_date || today;

  // Count total completions
  const totalCompletions = habitProgress.filter((p) => p.habit_id === habitId).length;

  // Calculate days since start
  const daysSinceStart = Math.max(1, ds.daysBetween(startDate, today) + 1);

  // Normalize cadence
  const cadence = (habit.cadence || 'daily').toLowerCase();
  const target = habit.target_per_period || 1;

  if (cadence === 'daily') {
    // Average per day
    const avgPerDay = totalCompletions / daysSinceStart;
    return {
      average: Math.round(avgPerDay * 10) / 10, // 1 decimal place
      periodLabel: 'day',
      target,
    };
  } else if (cadence === 'weekly') {
    // Average per week
    const weeks = Math.max(1, daysSinceStart / 7);
    const avgPerWeek = totalCompletions / weeks;
    return {
      average: Math.round(avgPerWeek * 10) / 10,
      periodLabel: 'week',
      target,
    };
  } else {
    // Monthly
    const months = Math.max(1, daysSinceStart / 30);
    const avgPerMonth = totalCompletions / months;
    return {
      average: Math.round(avgPerMonth * 10) / 10,
      periodLabel: 'month',
      target,
    };
  }
}

/**
 * Get rolling 7-day completion data (today + 6 days back)
 * Uses centralized DateService for consistent dates across the app.
 */
function getRolling7Days(
  habitId: string,
  habitProgress: HabitProgressRow[],
): Array<{
  dateIso: string;
  dayLabel: string; // "M", "T", "W", etc.
  isCompleted: boolean;
  isToday: boolean;
  isFuture: boolean;
}> {
  const ds = getDateService();
  const today = ds.getCurrentDate(); // YYYY-MM-DD
  const days: Array<{
    dateIso: string;
    dayLabel: string;
    isCompleted: boolean;
    isToday: boolean;
    isFuture: boolean;
  }> = [];

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const completedSet = new Set(
    habitProgress.filter((p) => p.habit_id === habitId).map((p) => p.occurred_day),
  );

  for (let i = 6; i >= 0; i--) {
    const dateIso = ds.addDays(today, -i);
    const dateObj = ds.fromDateString(dateIso);
    const dayOfWeek = dateObj?.getDay() ?? 0;

    days.push({
      dateIso,
      dayLabel: dayLabels[dayOfWeek],
      isCompleted: completedSet.has(dateIso),
      isToday: dateIso === today,
      isFuture: dateIso > today,
    });
  }

  return days;
}

/**
 * Generate calendar grid for a given month.
 * Returns 6 weeks (42 days) to ensure consistent grid height.
 * Uses centralized DateService for consistent dates.
 */
function getCalendarDays(
  year: number,
  month: number,
): Array<{
  dateIso: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isPast: boolean;
  isToday: boolean;
  isFuture: boolean;
}> {
  const ds = getDateService();
  const todayIso = ds.getCurrentDate();

  // First day of the month
  const firstDay = new Date(year, month, 1);
  // Day of week (0 = Sunday)
  const startDayOfWeek = firstDay.getDay();

  // Start from the Sunday of the week containing the 1st
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() - startDayOfWeek);

  const days: Array<{
    dateIso: string;
    dayOfMonth: number;
    isCurrentMonth: boolean;
    isPast: boolean;
    isToday: boolean;
    isFuture: boolean;
  }> = [];

  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + i);
    const dateIso = ds.toDateString(date);

    days.push({
      dateIso,
      dayOfMonth: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
      isPast: dateIso < todayIso,
      isToday: dateIso === todayIso,
      isFuture: dateIso > todayIso,
    });
  }

  return days;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Calculate adherence percentage for a given month.
 * Adherence = (days completed / days elapsed in month) * 100
 * Only counts days from habit start_date (if set) to today (or end of month if past).
 * Uses centralized DateService for consistent dates.
 */
function calculateMonthlyAdherence(
  habitId: string,
  habitProgress: HabitProgressRow[],
  year: number,
  month: number,
  habitStartDate?: string | null,
): number {
  const ds = getDateService();
  const todayIso = ds.getCurrentDate();

  // First day of target month
  const monthStart = new Date(year, month, 1);
  const monthStartIso = ds.toDateString(monthStart);

  // Last day of target month
  const monthEnd = new Date(year, month + 1, 0);
  const monthEndIso = ds.toDateString(monthEnd);

  // Effective start: later of month start or habit start
  let effectiveStart = monthStartIso;
  if (habitStartDate && habitStartDate > monthStartIso) {
    effectiveStart = habitStartDate;
  }

  // Effective end: earlier of month end or today
  let effectiveEnd = monthEndIso;
  if (todayIso < monthEndIso) {
    effectiveEnd = todayIso;
  }

  // If effective start is after effective end, no valid range
  if (effectiveStart > effectiveEnd) {
    return 0;
  }

  // Count days in range
  const startDate = new Date(effectiveStart);
  const endDate = new Date(effectiveEnd);
  const totalDays =
    Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  if (totalDays <= 0) return 0;

  // Count completions in range
  const completions = habitProgress.filter(
    (p) =>
      p.habit_id === habitId && p.occurred_day >= effectiveStart && p.occurred_day <= effectiveEnd,
  ).length;

  return Math.round((completions / totalDays) * 100);
}

function getPrevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 0) {
    return { year: year - 1, month: 11 };
  }
  return { year, month: month - 1 };
}

export default function HabitViewMode({
  habit,
  habitProgress,
  spaceName,
  onLogToday,
  onLogDate,
  onRemoveDate,
}: HabitViewModeProps) {
  const ds = getDateService();
  const habitName = habit.name || (habit as any).title || 'Untitled Habit';
  const frequencyLabel = getFrequencyLabel(habit);
  const startDateLabel = formatStartDate(habit.start_date);

  // Calculate streak data
  const currentStreak = useMemo(
    () => getHabitStreak(habit.id, habitProgress),
    [habit.id, habitProgress],
  );
  const bestStreak = useMemo(
    () => calculateBestStreak(habit.id, habitProgress),
    [habit.id, habitProgress],
  );
  const _isNewBest = currentStreak > 0 && currentStreak >= bestStreak;

  // Calculate average frequency
  const avgFrequency = calculateAverageFrequency(habit.id, habitProgress, habit);

  // Calculate rolling 7-day data
  const rolling7Days = useMemo(
    () => getRolling7Days(habit.id, habitProgress),
    [habit.id, habitProgress],
  );
  const completedCount = rolling7Days.filter((d) => d.isCompleted).length;

  // Get current date info from DateService
  const todayIso = ds.getCurrentDate();
  const todayDate = ds.fromDateString(todayIso);
  const currentYear = todayDate?.getFullYear() ?? new Date().getFullYear();
  const currentMonth = todayDate?.getMonth() ?? new Date().getMonth();

  // Calculate monthly adherence
  const currentMonthAdherence = useMemo(
    () =>
      calculateMonthlyAdherence(
        habit.id,
        habitProgress,
        currentYear,
        currentMonth,
        habit.start_date,
      ),
    [habit.id, habitProgress, habit.start_date, currentYear, currentMonth],
  );

  const prevMonthData = useMemo(
    () => getPrevMonth(currentYear, currentMonth),
    [currentYear, currentMonth],
  );
  const prevMonthAdherence = useMemo(
    () =>
      calculateMonthlyAdherence(
        habit.id,
        habitProgress,
        prevMonthData.year,
        prevMonthData.month,
        habit.start_date,
      ),
    [habit.id, habitProgress, prevMonthData, habit.start_date],
  );

  const adherenceTrend = currentMonthAdherence - prevMonthAdherence;

  // Completed dates set for O(1) lookup
  const completedDatesSet = useMemo(() => {
    return new Set(habitProgress.filter((p) => p.habit_id === habit.id).map((p) => p.occurred_day));
  }, [habitProgress, habit.id]);

  // Check if today is completed
  const isCompletedToday = completedDatesSet.has(todayIso);

  // Calendar month navigation state
  const [calendarMonth, setCalendarMonth] = useState(() => {
    return { year: currentYear, month: currentMonth };
  });

  // Generate calendar days for current view
  const calendarDays = useMemo(
    () => getCalendarDays(calendarMonth.year, calendarMonth.month),
    [calendarMonth.year, calendarMonth.month],
  );

  // Month navigation
  const goToPrevMonth = () => {
    setCalendarMonth((prev) => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const goToNextMonth = () => {
    // Don't allow navigating past current month
    if (calendarMonth.year === currentYear && calendarMonth.month === currentMonth) {
      return;
    }

    setCalendarMonth((prev) => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  // Check if we're on the current month (to disable next button)
  const isCurrentMonthView =
    calendarMonth.year === currentYear && calendarMonth.month === currentMonth;

  // Handle tapping a calendar day
  const handleCalendarDayPress = (day: {
    dateIso: string;
    isPast: boolean;
    isToday: boolean;
    isFuture: boolean;
  }) => {
    // Only allow tapping past days
    if (day.isFuture || day.isToday) return;

    // Check if already completed
    const isCompleted = completedDatesSet.has(day.dateIso);

    if (isCompleted) {
      onRemoveDate(day.dateIso);
    } else {
      onLogDate(day.dateIso);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={true}
      bounces={true}
    >
      {/* Header Section */}
      <View style={styles.header}>
        {/* Habit Name */}
        <Text style={styles.habitName} numberOfLines={2}>
          {habitName}
        </Text>

        {/* Frequency + Start Date */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{frequencyLabel}</Text>
          {startDateLabel && (
            <>
              <Text style={styles.metaSeparator}>·</Text>
              <Text style={styles.metaText}>{startDateLabel}</Text>
            </>
          )}
        </View>

        {/* Space badge (if has space) */}
        {spaceName && (
          <View style={styles.spaceBadge}>
            <Folder size={12} color={BRAND.mutedSageText} />
            <Text style={styles.spaceBadgeText}>{spaceName}</Text>
          </View>
        )}
      </View>

      {/* This Week Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>THIS WEEK</Text>
        <View style={styles.weekDotsContainer}>
          {rolling7Days.map((day) => (
            <TouchableOpacity
              key={day.dateIso}
              style={styles.dayColumn}
              onPress={() => {
                if (day.isFuture) return;
                if (day.isCompleted) {
                  onRemoveDate(day.dateIso);
                } else {
                  if (day.isToday) {
                    onLogToday();
                  } else {
                    onLogDate(day.dateIso);
                  }
                }
              }}
              activeOpacity={day.isFuture ? 1 : 0.7}
            >
              <Text style={styles.dayLabel}>{day.dayLabel}</Text>
              <View
                style={[
                  styles.dayDot,
                  !day.isCompleted && styles.dayDotIncomplete,
                  day.isToday && !day.isCompleted && styles.dayDotToday,
                ]}
              >
                {day.isCompleted && (
                  <Image source={GREMLY_AVATAR} style={styles.avatarDot} resizeMode="cover" />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.weekSummary}>{completedCount} of 7 days</Text>
      </View>

      {/* Stats Section */}
      <View style={styles.statsRow}>
        {/* Streak Card - Combined current + best */}
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>STREAK</Text>
          <View style={styles.statValueRow}>
            <Flame size={18} color="#FF6B35" />
            <Text style={styles.statValue}>{currentStreak} days</Text>
          </View>
          <Text style={styles.statSubtext}>Best: {bestStreak} days</Text>
        </View>

        {/* Average Frequency Card */}
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>AVG FREQUENCY</Text>
          <Text style={styles.statValue}>
            {avgFrequency.average}x / {avgFrequency.periodLabel}
          </Text>
          <Text style={styles.statSubtext}>Target: {avgFrequency.target}x</Text>
        </View>
      </View>

      {/* Calendar Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>CALENDAR</Text>

        {/* Month navigation header */}
        <View style={styles.calendarHeader}>
          <Pressable
            onPress={goToPrevMonth}
            style={({ pressed }) => [
              styles.calendarNavButton,
              pressed && styles.calendarNavPressed,
            ]}
            accessibilityLabel="Previous month"
          >
            <ChevronLeft size={20} color={BRAND.charcoalInk} />
          </Pressable>

          <Text style={styles.calendarMonthLabel}>
            {MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}
          </Text>

          <Pressable
            onPress={goToNextMonth}
            style={({ pressed }) => [
              styles.calendarNavButton,
              pressed && styles.calendarNavPressed,
              isCurrentMonthView && styles.calendarNavDisabled,
            ]}
            accessibilityLabel="Next month"
            disabled={isCurrentMonthView}
          >
            <ChevronRight
              size={20}
              color={isCurrentMonthView ? BRAND.sageMist : BRAND.charcoalInk}
            />
          </Pressable>
        </View>

        {/* Day of week headers */}
        <View style={styles.calendarWeekHeader}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
            <Text key={i} style={styles.calendarWeekDay}>
              {day}
            </Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.calendarGrid}>
          {calendarDays.map((day) => {
            const isCompleted = completedDatesSet.has(day.dateIso);
            const isTappable = day.isPast && day.isCurrentMonth;

            return (
              <Pressable
                key={day.dateIso}
                onPress={() => handleCalendarDayPress(day)}
                disabled={!isTappable}
                style={({ pressed }) => [
                  styles.calendarDay,
                  day.isToday && styles.calendarDayToday,
                  pressed && isTappable && styles.calendarDayPressed,
                ]}
              >
                <Text
                  style={[
                    styles.calendarDayText,
                    !day.isCurrentMonth && styles.calendarDayTextMuted,
                    day.isFuture && day.isCurrentMonth && styles.calendarDayTextFuture,
                    day.isToday && styles.calendarDayTextToday,
                  ]}
                >
                  {day.dayOfMonth}
                </Text>
                {isCompleted && <View style={styles.calendarDayDot} />}
              </Pressable>
            );
          })}
        </View>

        {/* Hint text */}
        <Text style={styles.calendarHint}>Tap past days to log</Text>
      </View>

      {/* Consistency Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>CONSISTENCY</Text>
        <View style={styles.consistencyCard}>
          <Text style={styles.consistencyValue}>{currentMonthAdherence}%</Text>
          <Text style={styles.consistencyLabel}>of days completed</Text>
          {prevMonthAdherence > 0 && (
            <View style={styles.consistencyTrend}>
              <Text
                style={[
                  styles.trendArrow,
                  adherenceTrend > 0 && styles.trendUp,
                  adherenceTrend < 0 && styles.trendDown,
                  adherenceTrend === 0 && styles.trendNeutral,
                ]}
              >
                {adherenceTrend > 0 ? '↑' : adherenceTrend < 0 ? '↓' : '→'}
              </Text>
              <Text style={styles.trendText}>from {prevMonthAdherence}% last month</Text>
            </View>
          )}
        </View>
      </View>

      {/* Actions Section */}
      <View style={styles.section}>
        <Pressable
          onPress={onLogToday}
          disabled={isCompletedToday}
          style={({ pressed }) => [
            styles.actionButton,
            isCompletedToday && styles.actionButtonCompleted,
            pressed && !isCompletedToday && styles.actionButtonPressed,
          ]}
        >
          <Text
            style={[styles.actionButtonText, isCompletedToday && styles.actionButtonTextCompleted]}
          >
            {isCompletedToday ? '✓ Completed' : 'Log Today'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.linenCream,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
  },
  habitName: {
    fontSize: 24,
    fontWeight: '600',
    color: BRAND.charcoalInk,
    fontFamily: Platform.OS === 'ios' ? 'System' : undefined,
    marginBottom: 8,
    lineHeight: 30,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  metaText: {
    fontSize: 14,
    color: BRAND.mutedSageText,
    fontWeight: '500',
  },
  metaSeparator: {
    fontSize: 14,
    color: BRAND.mutedSageText,
  },
  spaceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(46, 85, 64, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  spaceBadgeText: {
    fontSize: 12,
    color: BRAND.mutedSageText,
    fontWeight: '500',
  },

  // Section styling
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.mutedSageText,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  // This Week section
  weekDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  dayColumn: {
    alignItems: 'center',
    gap: 6,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.mutedSageText,
  },
  dayDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  dayDotCompleted: {
    backgroundColor: BRAND.mossGreen,
  },
  dayDotIncomplete: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: BRAND.sageMist,
  },
  dayDotToday: {
    borderWidth: 2,
    borderColor: BRAND.mossGreen,
    shadowColor: BRAND.mossGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  weekSummary: {
    fontSize: 13,
    color: BRAND.mutedSageText,
    textAlign: 'center',
  },

  // Stats section
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: BRAND.white,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.mutedSageText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND.charcoalInk,
  },
  statSubtext: {
    fontSize: 11,
    color: BRAND.mutedSageText,
    marginTop: 2,
  },

  // Calendar section
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calendarNavButton: {
    padding: 8,
    borderRadius: 8,
  },
  calendarNavPressed: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  calendarNavDisabled: {
    opacity: 0.4,
  },
  calendarMonthLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.charcoalInk,
  },
  calendarWeekHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  calendarWeekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.mutedSageText,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayToday: {
    borderWidth: 1.5,
    borderColor: BRAND.mossGreen,
    borderRadius: 8,
  },
  calendarDayPressed: {
    backgroundColor: 'rgba(46, 85, 64, 0.1)',
    borderRadius: 8,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.charcoalInk,
  },
  calendarDayTextMuted: {
    color: 'rgba(118, 136, 121, 0.4)',
  },
  calendarDayTextFuture: {
    color: BRAND.mutedSageText,
  },
  calendarDayTextToday: {
    fontWeight: '700',
    color: BRAND.mossGreen,
  },
  calendarDayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BRAND.mossGreen,
    marginTop: 2,
  },
  calendarHint: {
    fontSize: 13,
    color: BRAND.mutedSageText,
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 0,
    fontStyle: 'italic',
  },

  // Consistency section
  consistencyCard: {
    backgroundColor: BRAND.white,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  consistencyValue: {
    fontSize: 28,
    fontWeight: '700',
    color: BRAND.mossGreen,
  },
  consistencyLabel: {
    fontSize: 12,
    color: BRAND.mutedSageText,
    marginTop: 2,
  },
  consistencyTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  trendArrow: {
    fontSize: 16,
    fontWeight: '600',
  },
  trendUp: {
    color: '#22C55E',
  },
  trendDown: {
    color: '#EF4444',
  },
  trendNeutral: {
    color: BRAND.mutedSageText,
  },
  trendText: {
    fontSize: 13,
    color: BRAND.mutedSageText,
  },

  // Actions section
  actionButton: {
    backgroundColor: BRAND.sageMist,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonCompleted: {
    backgroundColor: 'rgba(180, 200, 185, 0.5)',
  },
  actionButtonPressed: {
    opacity: 0.8,
  },
  actionButtonText: {
    color: BRAND.mossGreen,
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtonTextCompleted: {
    color: BRAND.mutedSageText,
  },
});
