/**
 * BuildHabitDetail — Full scrollable content for build/routine habit detail.
 *
 * Rendered inside HabitDetailScreen. Pure layout component — the parent
 * handles navigation, edit overlay, and data loading.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { dateService } from '../../../lib/date/DateService';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { WeeklyDotsRow } from './WeeklyDotsRow';
import { StreakRing } from './StreakRing';
import { MilestoneBar } from './MilestoneBar';
import { CalendarHeatmap } from './CalendarHeatmap';
import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react-native';
import { EntityChatScreen } from '../../../components/chat/EntityChatScreen';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const HABIT_FOCUS_GREMLY = require('../../../assets/mascot/habitfocusgremly.png');
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

/** Human-friendly date: "Jan 15" or "Jan 15, 2025" (if not current year) */
const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
};

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
  const [showEntityChat, setShowEntityChat] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const updateHabit = useGremlyStore((s) => s.updateHabit);
  const calendarCanGoForward = calMonth !== currentMonth || calYear !== currentYear;

  // ── Inline notes editing ──
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(habit.notes || '');

  // Sync with external changes (e.g. from Edit overlay)
  useEffect(() => {
    setNotesText(habit.notes || '');
  }, [habit.notes]);

  const handleSaveNotes = useCallback(async () => {
    setIsEditingNotes(false);
    if (notesText.trim() !== (habit.notes || '')) {
      try {
        await updateHabit(habit.id, { notes: notesText.trim() });
      } catch (error) {
        console.error('[BuildHabitDetail] Failed to save notes:', error);
      }
    }
  }, [notesText, habit.id, habit.notes, updateHabit]);

  // ── Week navigation ──
  const [weekOffset, setWeekOffset] = useState(0);

  const handleMonthChange = useCallback((newMonth: number, newYear: number) => {
    setCalMonth(newMonth);
    setCalYear(newYear);
  }, []);

  // ── Week window (navigable via weekOffset) ──
  const weekData = useMemo(() => {
    const completedSet = new Set(completedDates);

    // Compute Monday-based week start for the given offset
    const anchor = new Date(today);
    const dayOfWeek = anchor.getDay();
    const mondayDiff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(anchor);
    weekStart.setDate(anchor.getDate() + mondayDiff + weekOffset * 7);

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      days.push(d);
    }

    const dayDates = days.map(toLocalISO);
    const dayLabels = days.map(dayLabel);
    const todayIdx = dayDates.indexOf(todayISO);
    const todayIndex = todayIdx >= 0 ? todayIdx : weekOffset < 0 ? 7 : -1;

    const dayDots: DayDot[] = dayDates.map((iso) => {
      if (completedSet.has(iso)) return 'done';
      if (iso > todayISO) return 'future';
      return 'missed';
    });

    const doneCount = dayDots.filter((d) => d === 'done').length;

    // Weekly target from cadence
    const cadence = habit.cadence ?? 'daily';
    const target = habit.target_per_period ?? (cadence === 'daily' ? 7 : 1);
    const weeklyTarget = cadence === 'daily' ? 7 : target;

    const weeklyCompleted = doneCount;

    return {
      dayDots,
      dayDates,
      dayLabels,
      todayIndex,
      doneCount,
      weeklyTarget,
      weeklyCompleted,
      weekStartDate: weekStart,
    };
  }, [today, todayISO, completedDates, habit.cadence, habit.target_per_period, weekOffset]);

  // Week header label
  const weekLabel = useMemo(() => {
    if (weekOffset === 0) return 'THIS WEEK';
    return `WEEK OF ${weekData.weekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}`;
  }, [weekOffset, weekData.weekStartDate]);

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

  // ── Start date picker ──
  const handleSetStartDate = useCallback(() => {
    Alert.alert('When do you want to start?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Start today',
        onPress: async () => {
          const today = dateService.today();
          try {
            await updateHabit(habit.id, { start_date: today, start_date_confirmed: true });
          } catch (error) {
            console.error('[BuildHabitDetail] Failed to set start date:', error);
          }
        },
      },
      {
        text: 'Pick a date',
        onPress: () => {
          setTempDate(new Date());
          setDatePickerVisible(true);
        },
      },
    ]);
  }, [habit.id, updateHabit]);

  const handleConfirmStartDate = useCallback(async () => {
    setDatePickerVisible(false);
    const dateStr = dateService.toLocalDate(tempDate);
    try {
      await updateHabit(habit.id, { start_date: dateStr, start_date_confirmed: true });
    } catch (error) {
      console.error('[BuildHabitDetail] Failed to set start date:', error);
    }
  }, [habit.id, tempDate, updateHabit]);

  // ── Streak comparison text ──
  const streakComparisonText = useMemo(() => {
    if (currentStreak >= bestStreak && bestStreak > 0) return 'New personal best!';
    const gap = bestStreak - currentStreak;
    return `${gap} more to beat your record!`;
  }, [currentStreak, bestStreak]);

  // ── Average completions per week ──
  const weeksActive = useMemo(() => {
    const startRaw = habit.start_date || habit.created_at;
    if (!startRaw) return 1;
    return Math.max(
      1,
      Math.ceil((today.getTime() - new Date(startRaw).getTime()) / (7 * 24 * 60 * 60 * 1000)),
    );
  }, [habit.start_date, habit.created_at, today]);

  const totalCompletions = completedDates.length;
  const avgPerWeek = (totalCompletions / weeksActive).toFixed(1);

  const targetPerWeek = useMemo(() => {
    const cadence = habit.cadence || 'daily';
    const target = habit.target_per_period || 1;
    if (cadence === 'daily') return 7;
    if (cadence === 'weekly') return target;
    if (cadence === 'monthly') return Math.round(target / 4.3);
    return 7;
  }, [habit.cadence, habit.target_per_period]);

  const frequencyLabel = formatFrequency(habit);
  const spaceLabel = habit.labels?.[0] ?? null;
  const startDateRaw = habit.start_date || habit.created_at;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── 1. TITLE SECTION ─── */}
        <View style={styles.titleSection}>
          <View style={styles.mascotFloat}>
            <Image
              source={HABIT_FOCUS_GREMLY}
              style={{ width: 64, height: 64 }}
              resizeMode="contain"
            />
          </View>
          <View style={styles.titleRow}>
            <View style={styles.accentBar} />
            <View style={styles.titleCol}>
              <Text style={styles.habitName}>{habit.name}</Text>
              {startDateRaw && (
                <Text style={{ fontSize: 13, color: '#8A8A7A', marginTop: 4 }}>
                  {`Started ${formatDate(startDateRaw)}`}
                  {habit.end_date ? ` → ${formatDate(habit.end_date)}` : ''}
                </Text>
              )}
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
                  {weeksActive > 1 && (
                    <Text style={{ fontSize: 13, color: '#8A8A7A', marginTop: 4 }}>
                      {`Avg: ${avgPerWeek}/${targetPerWeek} per week`}
                    </Text>
                  )}
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
                  {weeksActive > 1 && (
                    <Text style={{ fontSize: 13, color: '#8A8A7A', marginTop: 4 }}>
                      {`Avg: ${avgPerWeek}/${targetPerWeek} per week`}
                    </Text>
                  )}
                  <Text style={styles.sinceLabel}>
                    SINCE {formatSinceDate(habit).toUpperCase()}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* ─── 3. THIS WEEK ─── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity onPress={() => setWeekOffset((w) => w - 1)} hitSlop={8}>
                <ChevronLeft size={18} color="#8A8A7A" />
              </TouchableOpacity>
              <Text style={styles.sectionLabel}>{weekLabel}</Text>
              {weekOffset < 0 && (
                <TouchableOpacity onPress={() => setWeekOffset((w) => w + 1)} hitSlop={8}>
                  <ChevronRight size={18} color="#8A8A7A" />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.sectionMeta}>
              {weekData.doneCount} of {weekData.weeklyTarget}
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
              dotSize={40}
              dotSpacing={7}
              showDayLabels
              onPressPickStartDate={handleSetStartDate}
            />
            <Text style={styles.weekSummary}>
              {weekData.doneCount} of {weekData.weeklyTarget} days
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
        <View style={styles.notesSection}>
          {isEditingNotes ? (
            <View
              style={[
                styles.notesContainer,
                { borderColor: 'rgba(46,85,64,0.3)', borderWidth: 1.5 },
              ]}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={styles.notesLabel}>NOTES</Text>
                <TouchableOpacity onPress={handleSaveNotes} hitSlop={8}>
                  <Text style={{ fontSize: 11, color: '#2E5540', fontWeight: '600' }}>save</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                value={notesText}
                onChangeText={setNotesText}
                multiline
                autoFocus
                placeholder="Add notes about this habit..."
                placeholderTextColor="rgba(34,34,34,0.3)"
                onBlur={handleSaveNotes}
                style={{
                  fontSize: 13.5,
                  color: CHARCOAL,
                  lineHeight: 22,
                  minHeight: 60,
                  textAlignVertical: 'top',
                  padding: 0,
                  marginTop: 6,
                }}
              />
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setIsEditingNotes(true)}
              style={styles.notesContainer}
              activeOpacity={0.7}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={styles.notesLabel}>NOTES</Text>
                <Text style={{ fontSize: 11, color: '#8A8A7A', fontWeight: '500' }}>edit</Text>
              </View>
              <Text style={[styles.notesText, !notesText.trim() && { opacity: 0.5 }]}>
                {notesText.trim() || 'Tap to add notes...'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ─── 6. TALK TO GREMLY ─── */}
        <View style={styles.gremlySection}>
          <TouchableOpacity style={styles.gremlyButton} onPress={() => setShowEntityChat(true)}>
            <MessageCircle size={18} color={MOSS_GREEN} />
            <Text style={styles.gremlyButtonText}>Talk to Gremly about this habit</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={showEntityChat}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowEntityChat(false)}
      >
        <EntityChatScreen
          entityId={habit.id}
          entityType="habit"
          onClose={() => setShowEntityChat(false)}
        />
      </Modal>

      {/* Date picker modal for setting start date */}
      {datePickerVisible && Platform.OS === 'ios' && (
        <Modal visible={datePickerVisible} transparent animationType="slide">
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
            <View
              style={{
                backgroundColor: 'white',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                paddingBottom: 34,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  padding: 16,
                }}
              >
                <TouchableOpacity onPress={() => setDatePickerVisible(false)}>
                  <Text style={{ fontSize: 16, color: '#8A8A7A' }}>Cancel</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>Start date</Text>
                <TouchableOpacity onPress={handleConfirmStartDate}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#2E5540' }}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_event, date) => {
                  if (date) setTempDate(date);
                }}
              />
            </View>
          </View>
        </Modal>
      )}
    </>
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
