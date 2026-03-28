/**
 * HabitViewMode - Analytics view for a habit
 *
 * Displays streak, calendar, consistency, and milestone celebrations.
 * Rendered inside UnifiedOverlayV2 when viewing a habit.
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  Pressable,
  Image,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Folder, Flame, ChevronLeft, ChevronRight, Leaf } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import type { Habit } from '../../lib/types';
import type { HabitProgressRow } from '../../lib/store/useGremlyStore';
import { getHabitStreak, getFrequencyLabel } from '../../lib/sweep/habitHelpers';
import { getDateService } from '../../lib/date';
import { HabitHeatmap } from '../habit/HabitHeatmap';
import { LinearGradient } from 'expo-linear-gradient';

// Gremly avatar for completed dots
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_AVATAR = require('../../assets/buttonforHP.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../../assets/mascot/gremly-mascot.png');

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
  onUpdateWhy?: (why: string) => void;
  onChatWithGremly?: () => void;
  onLogSlip?: () => void;
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
  const today = ds.today();
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
 * Format a day count into detailed duration text.
 * e.g., 45 days -> "1 month, 15 days"
 */
function formatDurationDetailed(days: number): string {
  if (days <= 0) return 'Just started';
  if (days < 7) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    const weekStr = `${weeks} week${weeks === 1 ? '' : 's'}`;
    return remainingDays > 0
      ? `${weekStr}, ${remainingDays} day${remainingDays === 1 ? '' : 's'}`
      : weekStr;
  }
  const months = Math.floor(days / 30);
  const remainingDays = days % 30;
  const monthStr = `${months} month${months === 1 ? '' : 's'}`;
  return remainingDays > 0
    ? `${monthStr}, ${remainingDays} day${remainingDays === 1 ? '' : 's'}`
    : monthStr;
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
  const today = ds.today(); // YYYY-MM-DD
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
    const dateObj = ds.fromLocalDate(dateIso);
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
  const todayIso = ds.today();

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
    const dateIso = ds.toLocalDate(date);

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
  const todayIso = ds.today();

  // First day of target month
  const monthStart = new Date(year, month, 1);
  const monthStartIso = ds.toLocalDate(monthStart);

  // Last day of target month
  const monthEnd = new Date(year, month + 1, 0);
  const monthEndIso = ds.toLocalDate(monthEnd);

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
  const totalDays = getDateService().daysBetween(effectiveStart, effectiveEnd) + 1;

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

/**
 * Generate contextual Gremly message based on habit progress
 * Template-based (no API call) but feels personal
 */
function generateGremlyMessage(
  isBreakHabit: boolean,
  currentStreak: number,
  bestStreak: number,
  adherence: number,
  trend: number, // positive = improving
): string {
  if (isBreakHabit) {
    // BREAK habit messages
    if (currentStreak === 0) {
      return "Every journey starts with day one. I'm here with you.";
    }
    if (currentStreak === 1) {
      return "Day one down. You're already proving something to yourself.";
    }
    if (currentStreak < 3) {
      return "The first few days are the hardest. You're doing great.";
    }
    if (currentStreak === 7) {
      return 'One week! Your body is already starting to thank you.';
    }
    if (currentStreak === 14) {
      return 'Two weeks strong. The hardest part is behind you.';
    }
    if (currentStreak === 21) {
      return 'Three weeks — they say this is when habits really change.';
    }
    if (currentStreak === 30) {
      return "A whole month! You've proven you can do this.";
    }
    if (currentStreak > 30) {
      return "You've built something real. Keep protecting it.";
    }
    if (currentStreak >= 7) {
      return "You're building something powerful. Keep going.";
    }
    return "Every hour counts. You're stronger than you think.";
  }

  // BUILD habit messages
  if (currentStreak === 0 && adherence === 0) {
    return 'Ready to start building? One day at a time.';
  }
  if (currentStreak === 0 && adherence > 0) {
    return "Streak reset, but you've shown up before. Fresh start?";
  }
  if (currentStreak === 1) {
    return 'Day one! The hardest step is the first one.';
  }
  if (currentStreak > 0 && currentStreak === bestStreak) {
    return "You're at your personal best. Keep the momentum!";
  }
  if (currentStreak > 0 && bestStreak - currentStreak <= 3) {
    return `${bestStreak - currentStreak} more days ties your best. You've got this.`;
  }
  if (trend > 10) {
    return 'Your consistency is improving. Keep building.';
  }
  if (trend < -10 && adherence < 50) {
    return "It's okay to have off weeks. Want to talk about it?";
  }
  if (adherence >= 80) {
    return "You're crushing it. This is becoming second nature.";
  }
  if (adherence >= 50) {
    return 'Solid consistency. Every check-in counts.';
  }
  if (currentStreak >= 7) {
    return "A full week! You're building real momentum.";
  }
  if (currentStreak >= 3) {
    return 'Three days strong. Keep stacking them up.';
  }
  return 'Small steps lead to big changes. Keep going.';
}

export default function HabitViewMode({
  habit,
  habitProgress,
  spaceName,
  onLogToday,
  onLogDate,
  onRemoveDate,
  onUpdateWhy,
  onChatWithGremly,
  onLogSlip,
}: HabitViewModeProps) {
  const ds = getDateService();
  const habitName = habit.name || (habit as any).title || 'Untitled Habit';
  const frequencyLabel = getFrequencyLabel(habit);
  const startDateLabel = formatStartDate(habit.start_date);

  // State for editing "Your Why"
  const [isEditingWhy, setIsEditingWhy] = useState(false);
  const [whyText, setWhyText] = useState(habit.why_string || '');

  // Button scale animation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const buttonScale = useSharedValue(1);
  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handleCheckIn = useCallback(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    buttonScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withSpring(1, { damping: 10, stiffness: 400 }),
    );
    onLogToday();
  }, [onLogToday, buttonScale]);

  // Get current date info from DateService (must be first - used by other calculations)
  const todayIso = ds.today();

  // Detect if this is a break habit
  const isBreakHabit = habit.subtype === 'break_habit';

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

  // For break habits: calculate days clean (since last slip)
  const daysClean = useMemo(() => {
    if (!isBreakHabit) return 0;
    const sortedProgress = habitProgress
      .filter((p) => p.habit_id === habit.id)
      .map((p) => p.occurred_day)
      .sort((a, b) => b.localeCompare(a)); // Most recent first
    if (sortedProgress.length === 0) {
      // No slips recorded - clean since start
      if (habit.start_date) {
        return getDateService().daysBetween(habit.start_date, todayIso);
      }
      return 0;
    }
    const lastSlipDate = sortedProgress[0];
    return getDateService().daysBetween(lastSlipDate, todayIso);
  }, [isBreakHabit, habitProgress, habit.id, habit.start_date, todayIso]);

  // Calculate average frequency
  const avgFrequency = calculateAverageFrequency(habit.id, habitProgress, habit);

  // Calculate rolling 7-day data
  const rolling7Days = useMemo(
    () => getRolling7Days(habit.id, habitProgress),
    [habit.id, habitProgress],
  );
  const completedCount = rolling7Days.filter((d) => d.isCompleted).length;
  const todayDate = ds.fromLocalDate(todayIso);
  const currentYear = todayDate?.getFullYear() ?? getDateService().now().getFullYear();
  const currentMonth = todayDate?.getMonth() ?? getDateService().now().getMonth();

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

  // Generate contextual Gremly message
  const gremlyMessage = useMemo(
    () =>
      generateGremlyMessage(
        isBreakHabit,
        currentStreak,
        bestStreak,
        currentMonthAdherence,
        adherenceTrend,
      ),
    [isBreakHabit, currentStreak, bestStreak, currentMonthAdherence, adherenceTrend],
  );

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
      {/* Header Section with subtle gradient */}
      <LinearGradient
        colors={['rgba(191, 216, 192, 0.4)', 'rgba(249, 246, 241, 0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.headerGradient}
      >
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
      </LinearGradient>

      {/* This Week Section */}
      <Animated.View style={styles.section} entering={FadeIn.delay(100).duration(300)}>
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
      </Animated.View>

      {/* Hero Section - Different for BUILD vs BREAK */}
      {isBreakHabit ? (
        /* BREAK HABIT: Calm green "days clean" hero */
        <Animated.View style={styles.heroSection} entering={FadeInUp.duration(400).springify()}>
          <View style={styles.cleanCircle}>
            <Leaf size={28} color={BRAND.mossGreen} />
            <Text style={styles.cleanDaysNumber}>{daysClean}</Text>
            <Text style={styles.cleanDaysLabel}>days clean</Text>
          </View>
          <Text style={styles.cleanDuration}>{formatDurationDetailed(daysClean)}</Text>
          <Text style={styles.heroSubtext}>Every day is a victory</Text>
        </Animated.View>
      ) : (
        /* BUILD HABIT: Golden fire-themed streak hero */
        <Animated.View style={styles.heroSection} entering={FadeInUp.duration(400).springify()}>
          <View style={styles.streakCircle}>
            <Flame size={28} color="#FF6B35" />
            <Text style={styles.streakNumber}>{currentStreak}</Text>
            <Text style={styles.streakLabel}>day streak</Text>
          </View>
          <Text style={styles.heroSubtext}>Best: {bestStreak} days</Text>
        </Animated.View>
      )}

      {/* Your Why Section - BREAK habits only */}
      {isBreakHabit && (
        <View style={styles.whySection}>
          <View style={styles.whySectionHeader}>
            <Text style={styles.whySectionTitle}>YOUR WHY</Text>
            <TouchableOpacity onPress={() => setIsEditingWhy(true)}>
              <Text style={styles.whyEditLink}>edit</Text>
            </TouchableOpacity>
          </View>

          {habit.why_string ? (
            <Text style={styles.whyText}>"{habit.why_string}"</Text>
          ) : (
            <TouchableOpacity onPress={() => setIsEditingWhy(true)}>
              <Text style={styles.whyPlaceholder}>Tap to add your reason for quitting...</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Heatmap Section - BUILD habits only */}
      {!isBreakHabit && (
        <Animated.View style={styles.section} entering={FadeIn.delay(200).duration(300)}>
          <HabitHeatmap
            habitId={habit.id}
            completedDates={completedDatesSet}
            adherencePercent={currentMonthAdherence}
          />
        </Animated.View>
      )}

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

      {/* Gremly Message */}
      <Animated.View style={styles.messageSection} entering={FadeIn.delay(300).duration(300)}>
        <Text style={styles.messageQuote}>💬</Text>
        <Text style={styles.messageText}>"{gremlyMessage}"</Text>
      </Animated.View>

      {/* Chat with Gremly Button */}
      {onChatWithGremly && (
        <TouchableOpacity style={styles.chatButton} onPress={onChatWithGremly} activeOpacity={0.8}>
          <Image source={GREMLY_AVATAR} style={styles.chatButtonIcon} />
          <Text style={styles.chatButtonText}>Chat with Gremly</Text>
        </TouchableOpacity>
      )}

      {/* Footer with Action + Mascot */}
      <View style={styles.footerSection}>
        {/* Main Action Button */}
        <Animated.View style={animatedButtonStyle}>
          <Pressable
            onPress={handleCheckIn}
            disabled={isCompletedToday}
            style={({ pressed }) => [
              styles.actionButton,
              isCompletedToday && styles.actionButtonCompleted,
              pressed && !isCompletedToday && styles.actionButtonPressed,
            ]}
          >
            <Text
              style={[
                styles.actionButtonText,
                isCompletedToday && styles.actionButtonTextCompleted,
              ]}
            >
              {isCompletedToday
                ? isBreakHabit
                  ? '✓ Going Strong'
                  : '✓ Checked In'
                : isBreakHabit
                  ? 'Still Going Strong'
                  : 'Check In Today'}
            </Text>
          </Pressable>
        </Animated.View>

        {/* Slip link for break habits */}
        {isBreakHabit && !isCompletedToday && onLogSlip && (
          <TouchableOpacity style={styles.slipLink} onPress={onLogSlip}>
            <Text style={styles.slipLinkText}>Had a slip? Log it — no shame</Text>
          </TouchableOpacity>
        )}

        {/* Gremly mascot */}
        <Image source={GREMLY_MASCOT} style={styles.footerMascot} resizeMode="contain" />
      </View>

      {/* Why Edit Modal */}
      <Modal visible={isEditingWhy} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.whyModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.whyModalContent}>
            <Text style={styles.whyModalTitle}>Why are you doing this?</Text>
            <Text style={styles.whyModalSubtitle}>This will remind you on hard days</Text>
            <TextInput
              style={styles.whyInput}
              value={whyText}
              onChangeText={setWhyText}
              placeholder="e.g., I want to be healthy for my kids"
              placeholderTextColor={BRAND.mutedSageText}
              multiline
              maxLength={200}
              autoFocus
            />
            <View style={styles.whyModalActions}>
              <TouchableOpacity
                style={styles.whyModalCancel}
                onPress={() => {
                  setWhyText(habit.why_string || '');
                  setIsEditingWhy(false);
                }}
              >
                <Text style={styles.whyModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.whyModalSave}
                onPress={() => {
                  onUpdateWhy?.(whyText.trim());
                  setIsEditingWhy(false);
                }}
              >
                <Text style={styles.whyModalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    paddingTop: 0,
    paddingBottom: 32,
  },
  headerGradient: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    marginBottom: 8,
  },
  header: {
    // No marginBottom needed - gradient handles spacing
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

  // Hero section (replaces stats cards)
  heroSection: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  streakCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
    borderWidth: 3,
    borderColor: 'rgba(255, 107, 53, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  streakNumber: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FF6B35',
    marginTop: 4,
  },
  streakLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.mutedSageText,
    marginTop: -2,
  },
  cleanCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(46, 85, 64, 0.08)',
    borderWidth: 3,
    borderColor: 'rgba(46, 85, 64, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cleanDaysNumber: {
    fontSize: 36,
    fontWeight: '700',
    color: BRAND.mossGreen,
    marginTop: 4,
  },
  cleanDaysLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.mutedSageText,
    marginTop: -2,
  },
  cleanDuration: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.mossGreen,
    marginBottom: 4,
  },
  heroSubtext: {
    fontSize: 13,
    color: BRAND.mutedSageText,
    fontStyle: 'italic',
  },

  // Stats section (legacy - kept for reference)
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

  // Message section
  messageSection: {
    backgroundColor: 'rgba(191, 216, 192, 0.2)',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  messageQuote: {
    fontSize: 16,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    color: BRAND.charcoalInk,
    lineHeight: 22,
    fontStyle: 'italic',
  },

  // Your Why section (BREAK habits)
  whySection: {
    backgroundColor: 'rgba(191, 216, 192, 0.15)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  whySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  whySectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.mutedSageText,
    letterSpacing: 0.5,
  },
  whyEditLink: {
    fontSize: 13,
    color: BRAND.mossGreen,
  },
  whyText: {
    fontSize: 15,
    color: BRAND.charcoalInk,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  whyPlaceholder: {
    fontSize: 14,
    color: BRAND.mutedSageText,
    fontStyle: 'italic',
  },
  whyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  whyModalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
  },
  whyModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.charcoalInk,
    textAlign: 'center',
  },
  whyModalSubtitle: {
    fontSize: 14,
    color: BRAND.mutedSageText,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  whyInput: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    color: BRAND.charcoalInk,
  },
  whyModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  whyModalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
  },
  whyModalCancelText: {
    fontSize: 16,
    color: BRAND.mutedSageText,
    fontWeight: '500',
  },
  whyModalSave: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: BRAND.mossGreen,
    alignItems: 'center',
  },
  whyModalSaveText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },

  // Chat button
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.sageMist,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 12,
    gap: 10,
  },
  chatButtonIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  chatButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.mossGreen,
  },

  // Footer section with mascot
  footerSection: {
    marginTop: 24,
    position: 'relative',
    paddingBottom: 60,
  },
  actionButton: {
    backgroundColor: BRAND.mossGreen,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonCompleted: {
    backgroundColor: BRAND.sageMist,
  },
  actionButtonPressed: {
    opacity: 0.9,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtonTextCompleted: {
    color: BRAND.mossGreen,
  },
  slipLink: {
    alignItems: 'center',
    marginTop: 12,
  },
  slipLinkText: {
    fontSize: 14,
    color: BRAND.mutedSageText,
  },
  footerMascot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 50,
    height: 50,
    opacity: 0.9,
  },
  actionButtonBreak: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  actionButtonTextBreak: {
    color: '#DC2626',
  },
});
