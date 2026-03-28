/**
 * HabitDetailScreen — Container screen for viewing a single habit's detail.
 *
 * Reads habitId from route params, loads habit + progress from Zustand,
 * computes derived stats (streak, milestones), and renders the appropriate
 * Build or Break detail view.
 */

import React, { useCallback, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '../../ui';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { BRAND } from '../../design/brand';
import { useRepo } from '../../providers/RepoProvider';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { BuildHabitDetail } from '../../src/components/habits/BuildHabitDetail';
import { BreakHabitDetail } from '../../src/components/habits/BreakHabitDetail';
import { computeCurrentStreak, computeBestStreak } from '../../lib/habits/streakUtils';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getDateService } from '../../lib/date';

// ─── Milestone ladder ────────────────────────────────────────────────────────
const MILESTONES = [7, 14, 30, 60, 90] as const;

/** Pad YYYY-MM-DD from a Date in local timezone */
function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function HabitDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'HabitDetail'>>();
  const { habitId } = route.params;

  const repo = useRepo();
  const overlayController = useUnifiedOverlayController();

  // ── Habit from Zustand ──
  const habits = useGremlyStore((s) => s.habits);
  const habit = useMemo(() => habits.find((h) => h.id === habitId), [habits, habitId]);

  // ── Progress entries for this habit ──
  const habitProgress = useGremlyStore((s) => s.habitProgress);
  const thisHabitProgress = useMemo(
    () => habitProgress.filter((p) => p.habit_id === habitId),
    [habitProgress, habitId],
  );

  // ── Derived data ──
  const completedDates = useMemo(
    () => thisHabitProgress.map((p) => p.occurred_day).sort(),
    [thisHabitProgress],
  );

  const currentStreak = useMemo(() => computeCurrentStreak(completedDates), [completedDates]);

  const bestStreak = useMemo(() => computeBestStreak(completedDates), [completedDates]);

  const nextMilestone = useMemo(
    () => MILESTONES.find((m) => m > currentStreak) ?? MILESTONES[MILESTONES.length - 1],
    [currentStreak],
  );

  const milestoneProgress = useMemo(
    () => (nextMilestone > 0 ? Math.min(currentStreak / nextMilestone, 1) : 0),
    [currentStreak, nextMilestone],
  );

  const isBreak = habit?.subtype === 'break_habit';

  const isDaily = habit?.cadence === 'daily' || habit?.frequency === 'daily';

  // For non-daily habits, compute "weeks on target" instead of streak
  const weeksOnTarget = useMemo(() => {
    if (isDaily || !habit) return null;

    const targetPerWeek = habit.target_per_period ?? 1;
    const startDateStr = habit.start_date || habit.created_at;
    if (!startDateStr) return null;

    const start = new Date(startDateStr);
    const now = getDateService().now();

    // Count completed weeks (weeks where user hit their target)
    let weeksHit = 0;
    let totalWeeks = 0;

    // Walk backward week by week from current week
    const currentWeekStart = new Date(now);
    currentWeekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
    currentWeekStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(currentWeekStart);
    while (weekStart >= start && totalWeeks < 52) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekEndStr = toLocalISO(weekEnd);
      const weekStartStr = toLocalISO(weekStart);

      const completionsThisWeek = completedDates.filter(
        (d) => d >= weekStartStr && d <= weekEndStr,
      ).length;

      if (completionsThisWeek >= targetPerWeek) {
        weeksHit++;
      }
      totalWeeks++;
      weekStart.setDate(weekStart.getDate() - 7);
    }

    // Total completions since start
    const startISO = toLocalISO(start);
    const totalCompletions = completedDates.filter((d) => d >= startISO).length;

    // This month completions
    const monthStart = toLocalISO(new Date(now.getFullYear(), now.getMonth(), 1));
    const thisMonthCompletions = completedDates.filter((d) => d >= monthStart).length;

    return {
      weeksHit,
      totalWeeks: Math.max(totalWeeks, 1),
      totalCompletions,
      thisMonthCompletions,
      targetPerWeek,
    };
  }, [isDaily, habit, completedDates]);

  // ── Edit handler: open overlay ──
  const handleEdit = useCallback(async () => {
    try {
      const fullHabit = await repo.getById(habitId);
      if (fullHabit && fullHabit.type === 'habit') {
        overlayController.openEdit({ record: fullHabit as any });
      }
    } catch (error) {
      console.error('[HabitDetailScreen] Failed to open edit:', error);
    }
  }, [repo, overlayController, habitId]);

  // ── Not found guard ──
  if (!habit) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <ChevronLeft size={24} color={BRAND.colors.charcoalInk} />
          </TouchableOpacity>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Habit not found</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.notFoundButton}>
            <Text style={styles.notFoundButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ──
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <ChevronLeft size={24} color={BRAND.colors.charcoalInk} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
      </View>

      {/* Detail content */}
      {isBreak ? (
        <BreakHabitDetail
          habit={habit}
          completedDates={completedDates}
          currentStreak={currentStreak}
          bestStreak={bestStreak}
          nextMilestone={nextMilestone}
          milestoneProgress={milestoneProgress}
          isDaily={isDaily}
          weeksOnTarget={weeksOnTarget}
        />
      ) : (
        <BuildHabitDetail
          habit={habit}
          completedDates={completedDates}
          currentStreak={currentStreak}
          bestStreak={bestStreak}
          nextMilestone={nextMilestone}
          milestoneProgress={milestoneProgress}
          isDaily={isDaily}
          weeksOnTarget={weeksOnTarget}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
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
  },
  editButton: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 99,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  notFoundText: {
    fontSize: 16,
    ...BRAND.typography.body,
    color: BRAND.colors.inkMuted,
    marginBottom: 16,
  },
  notFoundButton: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  notFoundButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: BRAND.colors.surface,
  },
});
