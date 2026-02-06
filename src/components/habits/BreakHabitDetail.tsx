/**
 * BreakHabitDetail — Full scrollable content for break_habit detail.
 *
 * Rendered inside HabitDetailScreen. Shares card styles with BuildHabitDetail
 * but has break-specific sections (Your Why, Known Triggers, Replacement,
 * Fresh Start state) and amber color theming.
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
import type { Habit, EntityChatPreset } from '../../../lib/types';
import type { DayDot } from '../../../lib/today/hooks/useWeeklyHabitStats';

// ─── Color tokens ────────────────────────────────────────────────────────────
const MOSS_GREEN = BRAND.colors.mossGreen;
const SAGE_MIST = BRAND.colors.sageMist;
const SAGE_MIST_DARK = '#C8DEC9';
const CHARCOAL = BRAND.colors.charcoalInk;
const INK_MUTED = BRAND.colors.inkMuted;
const INK_SUBTLE = BRAND.colors.inkSubtle;
const SURFACE = '#FFFFFF';
const BORDER_SUBTLE = BRAND.colors.borderSubtle;

// Break-specific sage palette
const BREAK_SAGE = '#6B8F71';
const BREAK_SAGE_LIGHT = 'rgba(191,216,192,0.15)';
const BREAK_SAGE_BORDER = 'rgba(191,216,192,0.3)';

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

// ─── Props ───────────────────────────────────────────────────────────────────
export interface BreakHabitDetailProps {
  habit: Habit;
  completedDates: string[];
  currentStreak: number;
  bestStreak: number;
  nextMilestone: number;
  milestoneProgress: number;
  isDaily: boolean;
  weeksOnTarget: import('./BuildHabitDetail').WeeksOnTarget | null;
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
function dayLetter(d: Date): string {
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
  if (cadence === 'monthly') return `${target}× / month`;
  return 'Daily';
}

/**
 * Compute the previous streak — the consecutive-day run that ended just
 * before the most recent gap. Returns 0 if there's no previous streak.
 */
function computePreviousStreak(sortedDates: string[]): number {
  if (sortedDates.length < 2) return 0;

  // Walk backwards to find the gap
  let i = sortedDates.length - 1;

  // First, skip the current streak (consecutive from the end)
  while (i > 0) {
    const curr = new Date(sortedDates[i] + 'T00:00:00');
    const prev = new Date(sortedDates[i - 1] + 'T00:00:00');
    const diff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > 1) break; // Found the gap
    i--;
  }

  // Now count the streak before this gap
  if (i <= 0) return 0;
  let streak = 1;
  for (let j = i - 1; j > 0; j--) {
    const curr = new Date(sortedDates[j] + 'T00:00:00');
    const prev = new Date(sortedDates[j - 1] + 'T00:00:00');
    const diff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
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

export function BreakHabitDetail({
  habit,
  completedDates,
  currentStreak,
  bestStreak,
  nextMilestone,
  milestoneProgress,
  isDaily,
  weeksOnTarget,
}: BreakHabitDetailProps) {
  // Zustand actions for dot toggling
  const logHabitCompletionForDate = useGremlyStore((s) => s.logHabitCompletionForDate);
  const removeHabitCompletionForDate = useGremlyStore((s) => s.removeHabitCompletionForDate);
  const updateHabit = useGremlyStore((s) => s.updateHabit);

  // ── Inline why editing ──
  const [isEditingWhy, setIsEditingWhy] = useState(false);
  const [whyDraft, setWhyDraft] = useState(habit.why_string || habit.notes || '');

  // Sync draft when habit changes externally (e.g. from Edit overlay)
  useEffect(() => {
    setWhyDraft(habit.why_string || habit.notes || '');
  }, [habit.why_string, habit.notes]);

  const handleSaveWhy = useCallback(async () => {
    setIsEditingWhy(false);
    const trimmed = whyDraft.trim();
    const current = habit.why_string || habit.notes || '';
    if (trimmed !== current) {
      try {
        await updateHabit(habit.id, { why_string: trimmed });
      } catch (error) {
        console.error('[BreakHabitDetail] Failed to save why:', error);
      }
    }
  }, [whyDraft, habit.id, habit.why_string, habit.notes, updateHabit]);

  const today = useMemo(() => new Date(), []);
  const todayISO = useMemo(() => toLocalISO(today), [today]);
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // ── Calendar month navigation ──
  const [calMonth, setCalMonth] = useState(currentMonth);
  const [calYear, setCalYear] = useState(currentYear);
  const [showEntityChat, setShowEntityChat] = useState(false);
  const [chatPreset, setChatPreset] = useState<EntityChatPreset | undefined>(undefined);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const calendarCanGoForward = calMonth !== currentMonth || calYear !== currentYear;

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
    const dayLabels = days.map(dayLetter);
    const todayIdx = dayDates.indexOf(todayISO);
    const todayIndex = todayIdx >= 0 ? todayIdx : weekOffset < 0 ? 7 : -1;

    const dayDots: DayDot[] = dayDates.map((iso) => {
      if (completedSet.has(iso)) return 'done';
      if (iso > todayISO) return 'future';
      return 'missed';
    });

    const doneCount = dayDots.filter((d) => d === 'done').length;
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
            console.error('[BreakHabitDetail] Failed to set start date:', error);
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
      console.error('[BreakHabitDetail] Failed to set start date:', error);
    }
  }, [habit.id, tempDate, updateHabit]);

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
        console.error('[BreakHabitDetail] Toggle failed:', error);
      }
    },
    [habit.id, logHabitCompletionForDate, removeHabitCompletionForDate],
  );

  // ── Derived values ──
  const frequencyLabel = formatFrequency(habit);
  const startDateRaw = habit.start_date || habit.created_at;
  const whyText = habit.why_string || habit.notes || null;
  const hasWhy = !!whyText && whyText.trim().length > 0;
  const triggers = habit.triggers;
  const hasTriggers = Array.isArray(triggers) && triggers.length > 0;
  const replacementText = habit.replacement_text;
  const hasReplacement = !!replacementText && replacementText.trim().length > 0;
  const previousStreak = useMemo(() => computePreviousStreak(completedDates), [completedDates]);

  // ── Streak comparison text ──
  const streakComparisonText = useMemo(() => {
    if (currentStreak >= bestStreak && bestStreak > 0) return 'New personal best!';
    const gap = bestStreak - currentStreak;
    return `${gap} more to beat your record!`;
  }, [currentStreak, bestStreak]);

  const isFreshStart = currentStreak === 0;

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
              </View>
            </View>
          </View>
        </View>

        {/* ─── 2. YOUR WHY ─── */}
        <View style={styles.whySection}>
          {isEditingWhy ? (
            <View style={[styles.whyContainer, styles.whyContainerEditing]}>
              <Text style={styles.whyLabel}>YOUR WHY</Text>
              <View style={styles.whyRow}>
                <View style={styles.whyLeft}>
                  <TextInput
                    style={styles.whyInput}
                    value={whyDraft}
                    onChangeText={setWhyDraft}
                    multiline
                    autoFocus
                    placeholder="What's your reason for breaking this habit?"
                    placeholderTextColor={`${BREAK_SAGE}66`}
                    onBlur={handleSaveWhy}
                    maxLength={200}
                  />
                </View>
                <TouchableOpacity onPress={handleSaveWhy} hitSlop={8}>
                  <Text style={styles.whyEditLink}>save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.whyContainer}
              activeOpacity={0.7}
              onPress={() => setIsEditingWhy(true)}
            >
              <Text style={styles.whyLabel}>YOUR WHY</Text>
              <View style={styles.whyRow}>
                <View style={styles.whyLeft}>
                  <Text style={[styles.whyText, !hasWhy && styles.whyPlaceholder]}>
                    {hasWhy ? whyText : "What's your reason? Tap to add..."}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setIsEditingWhy(true)} hitSlop={8}>
                  <Text style={styles.whyEditLink}>edit</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ─── 3. STREAK CARD ─── */}
        {isFreshStart ? (
          /* STATE B: Fresh start */
          <View style={[styles.freshStartCard, CARD_SHADOW]}>
            <Text style={styles.freshStartTitle}>Fresh start</Text>
            <Text style={styles.freshStartBody}>
              {"Today's a new day. You've done this before."}
            </Text>
            <View style={styles.freshStartDivider}>
              <Text style={styles.freshStartStats}>
                {previousStreak > 0
                  ? `Previous: ${previousStreak} days · Best ever: ${bestStreak} days`
                  : `Best ever: ${bestStreak} days`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.reflectionButton}
              onPress={() => {
                setChatPreset('why_skipping');
                setShowEntityChat(true);
              }}
            >
              <Text style={styles.reflectionButtonText}>Want to talk about what happened? →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* STATE A: Active streak */
          <View style={[styles.streakCard, CARD_SHADOW]}>
            <View style={styles.streakRow}>
              {isDaily || !weeksOnTarget ? (
                /* Daily habit: streak ring + milestone */
                <>
                  <StreakRing
                    count={currentStreak}
                    label="days strong"
                    progress={milestoneProgress}
                    color="amber"
                  />
                  <View style={styles.streakRight}>
                    <Text style={styles.bestStreakText}>Best: {bestStreak} days</Text>
                    <Text style={styles.streakCompare}>{streakComparisonText}</Text>
                    <Text style={styles.milestoneLabel}>NEXT MILESTONE · {nextMilestone} DAYS</Text>
                    <MilestoneBar current={currentStreak} target={nextMilestone} color="amber" />
                  </View>
                </>
              ) : (
                /* Non-daily habit: weeks on target + cumulative stats */
                <>
                  <StreakRing
                    count={weeksOnTarget.weeksHit}
                    label="weeks on target"
                    progress={weeksOnTarget.weeksHit / weeksOnTarget.totalWeeks}
                    color="amber"
                  />
                  <View style={styles.streakRight}>
                    <Text style={styles.bestStreakText}>
                      {weeksOnTarget.totalCompletions} total completions
                    </Text>
                    <Text style={styles.streakCompare}>
                      {weeksOnTarget.thisMonthCompletions} this month
                    </Text>
                    <Text style={styles.sinceLabel}>
                      SINCE {formatSinceDate(habit).toUpperCase()}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {/* ─── 4. KNOWN TRIGGERS ─── */}
        {hasTriggers && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>KNOWN TRIGGERS</Text>
            <View style={styles.chipsRow}>
              {triggers!.map((trigger, idx) => (
                <View key={`trigger-${idx}`} style={styles.triggerChip}>
                  <Text style={styles.triggerChipText}>{trigger}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ─── 5. REPLACEMENT SUGGESTION ─── */}
        {hasReplacement && (
          <View style={styles.replacementSection}>
            <View style={styles.replacementContainer}>
              <Text style={styles.replacementLabel}>INSTEAD, TRY</Text>
              <Text style={styles.replacementText}>{replacementText}</Text>
            </View>
          </View>
        )}

        {/* ─── 6. THIS WEEK ─── */}
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
              isBreakingHabit={true}
              startDate={habit.start_date}
              dotSize={32}
              dotSpacing={10}
              onPressPickStartDate={handleSetStartDate}
            />
            <Text style={styles.weekSummary}>
              {weekData.doneCount} of {weekData.weeklyTarget} days
            </Text>
          </View>
        </View>

        {/* ─── 7. CONSISTENCY CALENDAR ─── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>CONSISTENCY</Text>
          </View>
          <View style={[styles.calendarCard, CARD_SHADOW]}>
            <CalendarHeatmap
              completedDates={completedDates}
              month={calMonth}
              year={calYear}
              isBreak={true}
              todayDate={todayISO}
              onMonthChange={handleMonthChange}
              canGoForward={calendarCanGoForward}
              onToggleDate={handleToggleDay}
              habitId={habit.id}
            />
          </View>
        </View>

        {/* ─── 8. TALK TO GREMLY ─── */}
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
          initialPreset={chatPreset}
          onClose={() => {
            setShowEntityChat(false);
            setChatPreset(undefined);
          }}
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
    backgroundColor: SAGE_MIST,
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
    backgroundColor: BREAK_SAGE_LIGHT,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: BREAK_SAGE_BORDER,
  },
  freqPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: BREAK_SAGE,
  },

  // ── 2. Your Why ──
  whySection: {
    paddingHorizontal: 24,
    marginTop: 16,
  },
  whyContainer: {
    padding: 14,
    paddingHorizontal: 18,
    backgroundColor: BREAK_SAGE_LIGHT,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BREAK_SAGE_BORDER,
  },
  whyContainerEditing: {
    borderColor: BREAK_SAGE,
    borderWidth: 1.5,
  },
  whyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  whyLeft: {
    flex: 1,
    marginRight: 12,
  },
  whyInput: {
    fontSize: 14,
    color: BREAK_SAGE,
    fontStyle: 'italic',
    fontFamily: 'PlusJakartaSans-MediumItalic',
    lineHeight: 20,
    padding: 0,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  whyLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: BREAK_SAGE,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  whyText: {
    fontSize: 14,
    color: BREAK_SAGE,
    fontStyle: 'italic',
    fontFamily: 'PlusJakartaSans-MediumItalic',
    lineHeight: 20,
  },
  whyPlaceholder: {
    opacity: 0.6,
  },
  whyEditLink: {
    fontSize: 11,
    fontWeight: '600',
    color: BREAK_SAGE,
    opacity: 0.7,
  },

  // ── 3A. Streak Card (active) ──
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
    color: BREAK_SAGE,
    marginBottom: 16,
  },
  milestoneLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: INK_MUTED,
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  // ── 3B. Fresh Start ──
  freshStartCard: {
    marginHorizontal: 20,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 24,
    backgroundColor: SURFACE,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: Platform.OS === 'android' ? 1 : 0,
    borderColor: BORDER_SUBTLE,
  },
  freshStartTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
    color: MOSS_GREEN,
    marginTop: 24,
  },
  freshStartBody: {
    fontSize: 14,
    color: INK_SUBTLE,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 260,
    marginTop: 8,
  },
  freshStartDivider: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
    width: '100%',
    alignItems: 'center',
  },
  freshStartStats: {
    fontSize: 12,
    color: INK_MUTED,
  },
  reflectionButton: {
    marginTop: 14,
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 99,
    borderWidth: 1.5,
    borderColor: 'rgba(46,85,64,0.18)',
  },
  reflectionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: MOSS_GREEN,
  },

  // ── 4. Known Triggers ──
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 10,
  },
  triggerChip: {
    backgroundColor: BREAK_SAGE_LIGHT,
    borderWidth: 1,
    borderColor: BREAK_SAGE_BORDER,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 99,
  },
  triggerChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: BREAK_SAGE,
  },

  // ── 5. Replacement Suggestion ──
  replacementSection: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  replacementContainer: {
    padding: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: SAGE_MIST,
    borderWidth: 1,
    borderColor: SAGE_MIST_DARK,
  },
  replacementLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: MOSS_GREEN,
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  replacementText: {
    fontSize: 14,
    fontWeight: '500',
    color: MOSS_GREEN,
    lineHeight: 20,
  },

  // ── 6. This Week / Shared sections ──
  section: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sinceLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: INK_MUTED,
    letterSpacing: 0.5,
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

  // ── 7. Consistency Calendar ──
  calendarCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    padding: 18,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderWidth: Platform.OS === 'android' ? 1 : 0,
    borderColor: BORDER_SUBTLE,
  },

  // ── 8. Talk to Gremly ──
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
