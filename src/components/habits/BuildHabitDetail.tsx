/**
 * BuildHabitDetail — Full scrollable content for build/routine habit detail.
 *
 * Rendered inside HabitDetailScreen. Pure layout component — the parent
 * handles navigation, edit overlay, and data loading.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { dateService } from '../../../lib/date/DateService';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { WeeklyDotsRow } from './WeeklyDotsRow';
import { StreakRing } from './StreakRing';
import { MilestoneBar } from './MilestoneBar';
import { CalendarHeatmap } from './CalendarHeatmap';
import { MessageCircle } from 'lucide-react-native';
import MascotIcon from '../../../components/MascotIcon';
import type { Habit } from '../../../lib/types';
import type { DayDot } from '../../../lib/today/hooks/useWeeklyHabitStats';

// ─── Color tokens ────────────────────────────────────────────────────────────
const MOSS_GREEN = BRAND.colors.mossGreen;
const SAGE_MIST = BRAND.colors.sageMist;
const CHARCOAL = BRAND.colors.charcoalInk;
const INK_MUTED = BRAND.colors.inkMuted;
const SURFACE = '#FFFFFF';
const BORDER_SUBTLE = BRAND.colors.borderSubtle;

// ─── Card shadow (iOS) / border (Android) ────────────────────────────────────
const CARD_SHADOW = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 } as { width: number; height: number },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  default: {},
});

// ─── Weekly completion stats (for non-daily habits) ─────────────────────────
export interface WeeksOnTarget {
  weeksHit: number;
  totalWeeks: number;
  totalCompletions: number;
  thisMonthCompletions: number;
  targetPerWeek: number;
}

// ─── Props ───────────────────────────────────────────────────────────────────
export interface BuildHabitDetailProps {
  habit: Habit;
  completedDates: string[];
  currentStreak: number;
  bestStreak: number;
  nextMilestone: number;
  milestoneProgress: number;
  isDaily: boolean;
  weeksOnTarget: WeeksOnTarget | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Pad YYYY-MM-DD from a Date in local timezone */
function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Short day-of-week letter for a Date */
function dayLabel(d: Date): string {
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()];
}

/** Format frequency label from cadence + target */
function formatFrequency(habit: Habit): string {
  const cadence = habit.cadence ?? 'daily';
  const target = habit.target_per_period ?? 1;

  if (cadence === 'daily') return 'Daily';
  if (cadence === 'weekly') {
    if (target === 7) return 'Daily';
    return `${target}× / week`;
  }
  if (cadence === 'monthly') {
    return `${target}× / month`;
  }
  return 'Daily';
}

/** Short month names for "SINCE" label */
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatSinceDate(habit: Habit): string {
  const raw = habit.start_date || habit.created_at;
  if (!raw) return '';
  const d = new Date(raw);
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BuildHabitDetail({
  habit,
  completedDates,
  currentStreak,
  bestStreak,
  nextMilestone,
  milestoneProgress,
  isDaily,
  weeksOnTarget,
}: BuildHabitDetailProps) {
  // Zustand actions for dot toggling
  const logHabitCompletionForDate = useGremlyStore((s) => s.logHabitCompletionForDate);
  const removeHabitCompletionForDate = useGremlyStore((s) => s.removeHabitCompletionForDate);

  const today = useMemo(() => new Date(), []);
  const todayISO = useMemo(() => toLocalISO(today), [today]);
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // ── Calendar month navigation ──
  const [calMonth, setCalMonth] = useState(currentMonth);
  const [calYear, setCalYear] = useState(currentYear);
  const calendarCanGoForward = calMonth !== currentMonth || calYear !== currentYear;

  const handleMonthChange = useCallback((newMonth: number, newYear: number) => {
    setCalMonth(newMonth);
    setCalYear(newYear);
  }, []);

  // ── Rolling 7-day window ──
  const weekData = useMemo(() => {
    const completedSet = new Set(completedDates);
    const days: Date[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push(d);
    }

    const dayDates = days.map(toLocalISO);
    const dayLabels = days.map(dayLabel);
    const todayIndex = 6;

    const dayDots: DayDot[] = dayDates.map((iso, idx) => {
      if (completedSet.has(iso)) return 'done';
      if (idx > todayIndex) return 'future';
      if (iso > todayISO) return 'future';
      return 'missed';
    });

    const doneCount = dayDots.filter((d) => d === 'done').length;

    // Weekly target from cadence
    const cadence = habit.cadence ?? 'daily';
    const target = habit.target_per_period ?? (cadence === 'daily' ? 7 : 1);
    const weeklyTarget = cadence === 'daily' ? 7 : target;

    // Completed count scoped to this week
    const weeklyCompleted = doneCount;

    return { dayDots, dayDates, dayLabels, todayIndex, doneCount, weeklyTarget, weeklyCompleted };
  }, [today, todayISO, completedDates, habit.cadence, habit.target_per_period]);

  // ── Day toggle handler ──
  const handleToggleDay = useCallback(
    async (dateISO: string, newState: boolean) => {
      try {
        if (newState) {
          await logHabitCompletionForDate(habit.id, dateISO);
        } else {
          await removeHabitCompletionForDate(habit.id, dateISO);
        }
      } catch (error) {
        console.error('[BuildHabitDetail] Toggle failed:', error);
      }
    },
    [habit.id, logHabitCompletionForDate, removeHabitCompletionForDate],
  );

  // ── Streak comparison text ──
  const streakComparisonText = useMemo(() => {
    if (currentStreak >= bestStreak && bestStreak > 0) return 'New personal best!';
    const gap = bestStreak - currentStreak;
    return `${gap} more to beat your record!`;
  }, [currentStreak, bestStreak]);

  const frequencyLabel = formatFrequency(habit);
  const spaceLabel = habit.labels?.[0] ?? null;

  // ── Mascot pose based on progress ──
  const mascotPose = useMemo(() => {
    if (isDaily) {
      if (currentStreak > 7) return 'celebrate' as const;
      if (currentStreak > 0) return 'default' as const;
      return 'think' as const;
    }
    if (weeksOnTarget && weeksOnTarget.weeksHit > 3) return 'celebrate' as const;
    return 'default' as const;
  }, [isDaily, currentStreak, weeksOnTarget]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── 1. TITLE SECTION ─── */}
      <View style={styles.titleSection}>
        <View style={styles.mascotFloat}>
          <MascotIcon size={58} pose={mascotPose} animate={false} />
        </View>
        <View style={styles.titleRow}>
          <View style={styles.accentBar} />
          <View style={styles.titleCol}>
            <Text style={styles.habitName}>{habit.name}</Text>
            <View style={styles.metaRow}>
              <View style={styles.freqPill}>
                <Text style={styles.freqPillText}>{frequencyLabel}</Text>
              </View>
              {spaceLabel && <Text style={styles.spaceLabel}>{spaceLabel}</Text>}
            </View>
          </View>
        </View>
      </View>

      {/* ─── 2. STREAK / COMPLETION CARD ─── */}
      <View style={[styles.streakCard, CARD_SHADOW]}>
        <View style={styles.streakRow}>
          {isDaily || !weeksOnTarget ? (
            /* Daily habit: streak ring + milestone */
            <>
              <StreakRing
                count={currentStreak}
                label="day streak"
                progress={milestoneProgress}
                color="green"
              />
              <View style={styles.streakRight}>
                <Text style={styles.bestStreakText}>Best: {bestStreak} days</Text>
                <Text style={styles.streakCompare}>{streakComparisonText}</Text>
                <Text style={styles.milestoneLabel}>NEXT MILESTONE · {nextMilestone} DAYS</Text>
                <MilestoneBar current={currentStreak} target={nextMilestone} color="green" />
              </View>
            </>
          ) : (
            /* Non-daily habit: weeks on target + cumulative stats */
            <>
              <StreakRing
                count={weeksOnTarget.weeksHit}
                label="weeks on target"
                progress={weeksOnTarget.weeksHit / weeksOnTarget.totalWeeks}
                color="green"
              />
              <View style={styles.streakRight}>
                <Text style={styles.bestStreakText}>
                  {weeksOnTarget.totalCompletions} total completions
                </Text>
                <Text style={styles.streakCompare}>
                  {weeksOnTarget.thisMonthCompletions} this month
                </Text>
                <Text style={styles.sinceLabel}>SINCE {formatSinceDate(habit).toUpperCase()}</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* ─── 3. THIS WEEK ─── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>THIS WEEK</Text>
          <Text style={styles.sectionMeta}>
            {weekData.doneCount} of 7 · {weekData.weeklyCompleted}/{weekData.weeklyTarget} this week
          </Text>
        </View>
        <View style={[styles.weekCard, CARD_SHADOW]}>
          <WeeklyDotsRow
            dayDots={weekData.dayDots}
            dayDates={weekData.dayDates}
            todayIndex={weekData.todayIndex}
            onToggleDay={handleToggleDay}
            isBreakingHabit={false}
            startDate={habit.start_date}
            dotSize={32}
            dotSpacing={10}
          />
          <Text style={styles.weekSummary}>
            {weekData.doneCount} of 7 days · {weekData.weeklyCompleted}/{weekData.weeklyTarget} this
            week
          </Text>
        </View>
      </View>

      {/* ─── 4. CONSISTENCY CALENDAR ─── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>CONSISTENCY</Text>
        </View>
        <View style={[styles.calendarCard, CARD_SHADOW]}>
          <CalendarHeatmap
            completedDates={completedDates}
            month={calMonth}
            year={calYear}
            todayDate={todayISO}
            onMonthChange={handleMonthChange}
            canGoForward={calendarCanGoForward}
            onToggleDate={handleToggleDay}
            habitId={habit.id}
          />
        </View>
      </View>

      {/* ─── 5. NOTES ─── */}
      {!!habit.notes && habit.notes.trim().length > 0 && (
        <View style={styles.notesSection}>
          <View style={styles.notesContainer}>
            <Text style={styles.notesLabel}>NOTES</Text>
            <Text style={styles.notesText}>{habit.notes}</Text>
          </View>
        </View>
      )}

      {/* ─── 6. TALK TO GREMLY ─── */}
      <View style={styles.gremlySection}>
        <TouchableOpacity
          style={styles.gremlyButton}
          onPress={() => console.log('[BuildHabitDetail] TODO: open entity chat', habit.id)}
        >
          <MessageCircle size={18} color={MOSS_GREEN} />
          <Text style={styles.gremlyButtonText}>Talk to Gremly about this habit</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // ── 1. Title ──
  titleSection: {
    paddingHorizontal: 24,
    paddingTop: 8,
    position: 'relative' as const,
  },
  mascotFloat: {
    position: 'absolute' as const,
    right: 24,
    top: 10,
    zIndex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingRight: 70,
  },
  accentBar: {
    width: 4,
    borderRadius: 2,
    alignSelf: 'stretch',
    backgroundColor: MOSS_GREEN,
  },
  titleCol: {
    flex: 1,
  },
  habitName: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
    color: CHARCOAL,
    letterSpacing: -0.5,
    lineHeight: 32,
    includeFontPadding: false,
    paddingTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  freqPill: {
    backgroundColor: SAGE_MIST,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 99,
  },
  freqPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: MOSS_GREEN,
  },
  spaceLabel: {
    fontSize: 12,
    color: INK_MUTED,
  },

  // ── 2. Streak Card ──
  streakCard: {
    marginHorizontal: 20,
    marginTop: 24,
    padding: 22,
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: Platform.OS === 'android' ? 1 : 0,
    borderColor: BORDER_SUBTLE,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
  },
  streakRight: {
    flex: 1,
  },
  bestStreakText: {
    fontSize: 13,
    fontWeight: '700',
    color: CHARCOAL,
  },
  streakCompare: {
    fontSize: 13,
    fontWeight: '600',
    color: MOSS_GREEN,
    marginBottom: 16,
  },
  milestoneLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: INK_MUTED,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  sinceLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: INK_MUTED,
    letterSpacing: 0.5,
  },

  // ── 3. This Week ──
  section: {
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: INK_MUTED,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sectionMeta: {
    fontSize: 12,
    color: INK_MUTED,
  },
  weekCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    padding: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: Platform.OS === 'android' ? 1 : 0,
    borderColor: BORDER_SUBTLE,
  },
  weekSummary: {
    fontSize: 12,
    color: INK_MUTED,
    textAlign: 'center',
    marginTop: 14,
  },

  // ── 4. Consistency Calendar ──
  calendarCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    padding: 18,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderWidth: Platform.OS === 'android' ? 1 : 0,
    borderColor: BORDER_SUBTLE,
  },

  // ── 5. Notes ──
  notesSection: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  notesContainer: {
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 14,
    padding: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
  },
  notesLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: INK_MUTED,
    letterSpacing: 1,
  },
  notesText: {
    fontSize: 13.5,
    color: CHARCOAL,
    lineHeight: 22,
    marginTop: 6,
  },

  // ── 6. Talk to Gremly ──
  gremlySection: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  gremlyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 15,
    backgroundColor: 'rgba(46,85,64,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(46,85,64,0.15)',
  },
  gremlyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: MOSS_GREEN,
  },
});
