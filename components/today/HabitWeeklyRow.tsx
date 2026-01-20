/**
 * HabitWeeklyRow - A compact row displaying a habit with weekly progress using GremlyDot faces
 *
 * LAYOUT (day labels in shared header in NowWeekPopup):
 * - Left: accent bar (color reflects status) + habit name
 * - Middle: 7 GremlyDot faces for the week (green=done, grey=incomplete)
 * - Right: frequency text + status label stacked
 *
 * Each GremlyDot is tappable for past/current days (not future).
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import { Text } from '../../ui';
import { GremlyDot } from '../ui/GremlyDot';
import { Flame } from 'lucide-react-native';
import type { DayDot, HabitStatus } from '../../lib/today/hooks/useWeeklyHabitStats';

// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens (Harmonic Cortex)
// ─────────────────────────────────────────────────────────────────────────────

const MOSS_GREEN = '#2E5540';
const GOLDEN_PEAR = '#E0C47A';
const SAGE_MIST = '#E8F0EA';
const CHARCOAL_INK = '#222222';
const INK_SUBTLE = 'rgba(34, 34, 34, 0.55)';
const BORDER_SUBTLE = 'rgba(0, 0, 0, 0.08)';

// ─── DOT SIZING ───
// GremlyDot size 28 with gap 8 per spec
const DOT_SIZE = 28;
const DOT_SPACING = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HabitWeeklyRowProps {
  habitId: string;
  name: string;
  weeklyCompleted: number;
  weeklyTarget: number;
  status: HabitStatus;
  dayDots: DayDot[];
  dayDates: string[]; // ISO dates for rolling 7 days (today is last)
  /** Index of today in the rolling window (always 6) */
  todayIndex?: number;
  /** Frequency string like "Daily", "3× per week", "Mon · Wed · Fri" */
  frequencyLabel?: string;
  onToggleDay: (habitId: string, dateISO: string, newState: boolean) => void;
  /** Called when user taps the header area (name/status) to view details */
  onPressHeader?: () => void;
  /** Whether divider should be shown at bottom */
  showDivider?: boolean;
  /** Whether this is a breaking habit (subtype === 'break_habit') */
  isBreakingHabit?: boolean;
  /** Current streak in days (for breaking habits) */
  streakDays?: number;
  /** ISO date string when habit started (YYYY-MM-DD) */
  startDate?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Get accent bar color based on habit status
// ─────────────────────────────────────────────────────────────────────────────

function getAccentColor(status: HabitStatus): string {
  switch (status) {
    case 'on_track':
    case 'done_for_week':
      return MOSS_GREEN;
    case 'needs_attention':
      return GOLDEN_PEAR;
    default:
      return MOSS_GREEN;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Get status label text based on habit status
// ─────────────────────────────────────────────────────────────────────────────

function getStatusLabel(status: HabitStatus): { text: string; color: string } {
  switch (status) {
    case 'on_track':
    case 'done_for_week':
      return { text: 'Up to date', color: MOSS_GREEN };
    case 'needs_attention':
      return { text: 'Needs check-in', color: GOLDEN_PEAR };
    default:
      return { text: 'Up to date', color: MOSS_GREEN };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Breaking habit checkmark dot
// ─────────────────────────────────────────────────────────────────────────────

function BreakingDot({
  isCompleted,
  isToday,
  isFuture,
  onPress,
  size = DOT_SIZE,
}: {
  isCompleted: boolean;
  isToday: boolean;
  isFuture: boolean;
  onPress: () => void;
  size?: number;
}) {
  // Use slightly smaller inner size to account for border (match GremlyDot visual size)
  const innerSize = size - 4; // 2px border on each side

  return (
    <Pressable
      onPress={isFuture ? undefined : onPress}
      style={{
        width: size,
        height: size,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: isFuture ? 0.4 : 1,
      }}
      disabled={isFuture}
    >
      <View
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize / 2,
          borderWidth: 2,
          borderColor: isCompleted ? MOSS_GREEN : isToday ? MOSS_GREEN : '#D0D0D0',
          backgroundColor: isCompleted ? MOSS_GREEN : 'transparent',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {isCompleted && (
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: innerSize * 0.5,
              fontWeight: '700',
              lineHeight: innerSize * 0.5,
              textAlign: 'center',
            }}
          >
            ✓
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HabitWeeklyRow Component
// ─────────────────────────────────────────────────────────────────────────────

export const HabitWeeklyRow = React.memo(function HabitWeeklyRow({
  habitId,
  name,
  weeklyCompleted: _weeklyCompleted,
  weeklyTarget,
  status,
  dayDots,
  dayDates,
  todayIndex = 6,
  frequencyLabel,
  onToggleDay,
  onPressHeader,
  showDivider = true,
  isBreakingHabit = false,
  streakDays,
  startDate,
}: HabitWeeklyRowProps) {
  // Track optimistic state for each day
  const [optimisticDots, setOptimisticDots] = useState<Record<string, DayDot>>({});

  const handleDotPress = useCallback(
    (dateISO: string, newState: boolean) => {
      // Optimistically update UI
      setOptimisticDots((prev) => ({
        ...prev,
        [dateISO]: newState ? 'done' : 'missed',
      }));

      // Call parent handler
      onToggleDay(habitId, dateISO, newState);

      // Clear optimistic state after a short delay (parent will have updated by then)
      setTimeout(() => {
        setOptimisticDots((prev) => {
          const next = { ...prev };
          delete next[dateISO];
          return next;
        });
      }, 500);
    },
    [habitId, onToggleDay],
  );

  // Derive frequency label from weeklyTarget if not provided
  const displayFrequency =
    frequencyLabel ??
    (weeklyTarget === 7
      ? 'Daily'
      : weeklyTarget === 1
        ? '1× per week'
        : `${weeklyTarget}× per week`);

  // Get status label text and color
  const statusInfo = getStatusLabel(status);
  // Override status when no start_date is set
  const displayStatus = !startDate ? { text: 'Set up needed', color: GOLDEN_PEAR } : statusInfo;

  return (
    <View style={styles.row}>
      {/* Left accent bar - color reflects habit status */}
      <View
        style={[
          styles.accentBar,
          { backgroundColor: !startDate ? GOLDEN_PEAR : getAccentColor(status) },
        ]}
      />

      {/* Content */}
      <View style={styles.content}>
        {/* ─── TOP ROW: Name + Right Column ─── */}
        <Pressable onPress={onPressHeader} disabled={!onPressHeader} style={styles.topRow}>
          {/* Left: Habit name + started date */}
          <View style={styles.leftColumn}>
            <Text style={styles.habitName} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.metaRow}>
              {startDate && dayDates.includes(startDate) && (
                <Text style={styles.startedLabel}>
                  Started{' '}
                  {new Date(startDate + 'T12:00:00').toLocaleDateString('en-US', {
                    month: 'numeric',
                    day: 'numeric',
                  })}
                </Text>
              )}
              {streakDays !== undefined && streakDays > 0 && (
                <View style={styles.streakContainer}>
                  <Flame size={12} color={GOLDEN_PEAR} />
                  <Text style={styles.streakText}>
                    {isBreakingHabit ? `${streakDays} days strong` : `${streakDays} day streak`}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Right: Frequency + Status stacked */}
          <View style={styles.rightColumn}>
            <Text style={styles.frequency}>{displayFrequency}</Text>
            <Text style={[styles.statusLabel, { color: displayStatus.color }]}>
              {displayStatus.text}
            </Text>
          </View>
        </Pressable>

        {/* ─── DOTS ROW ONLY ─── */}
        {/* Day labels removed - now in shared header in NowWeekPopup */}
        {!startDate ? (
          // No start date - show banner prompting user to set one
          <Pressable style={styles.pickStartDateBanner} onPress={onPressHeader}>
            <Text style={styles.pickStartDateText}>Tap to pick a start date</Text>
          </Pressable>
        ) : (
          // Has start date - show dots row
          <View style={styles.dotsRow}>
            {dayDots.map((dotState, index) => {
              const dateISO = dayDates[index];
              const optimistic = optimisticDots[dateISO];
              const effectiveState = optimistic ?? dotState;
              const isCompleted = effectiveState === 'done';
              const isToday = index === todayIndex;
              const isFuture = dotState === 'future';

              // Check if this day is before habit started
              const isBeforeStart = startDate && dateISO < startDate;

              if (isBeforeStart) {
                // Show empty placeholder to maintain spacing
                return <View key={dateISO} style={{ width: DOT_SIZE, height: DOT_SIZE }} />;
              }

              if (isBreakingHabit) {
                return (
                  <BreakingDot
                    key={dateISO}
                    isCompleted={isCompleted}
                    isToday={isToday}
                    isFuture={isFuture}
                    onPress={() => handleDotPress(dateISO, !isCompleted)}
                    size={DOT_SIZE}
                  />
                );
              }

              return (
                <GremlyDot
                  key={dateISO}
                  isCompleted={isCompleted}
                  isToday={isToday}
                  isFuture={isFuture}
                  onPress={() => handleDotPress(dateISO, !isCompleted)}
                  size={DOT_SIZE}
                />
              );
            })}
          </View>
        )}
      </View>

      {/* Divider */}
      {showDivider && <View style={styles.divider} />}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ─── OUTER ROW ───
  // 76px minHeight with vertical padding to fit GremlyDot faces
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingRight: 4,
    minHeight: 76,
  },
  // Left accent bar - color set dynamically based on status
  accentBar: {
    width: 4,
    borderRadius: 2,
    marginRight: 12,
  },
  // Content container
  content: {
    flex: 1,
  },
  // ─── TOP ROW: Name + Right Column ───
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start', // Align to top for stacked right column
  },
  // Left column: name + started label
  leftColumn: {
    flex: 1,
    marginRight: 8,
  },
  // Habit name - left side
  habitName: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: CHARCOAL_INK,
    lineHeight: 20,
  },
  // ─── RIGHT COLUMN: Frequency + Status stacked ───
  rightColumn: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  // Frequency text (e.g. "Daily", "1× per week")
  frequency: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: INK_SUBTLE,
    lineHeight: 14,
  },
  // Status label (e.g. "On track", "Needs attention")
  statusLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    lineHeight: 14,
    marginTop: 1, // Tiny gap between frequency and status
  },
  // ─── DOTS ROW ───
  // GremlyDot faces aligned with shared header labels in NowWeekPopup
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: DOT_SPACING,
    marginTop: 8, // Gap between name and GremlyDot row
  },
  // Meta row for started label and streak
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 8,
  },
  // Streak container
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  streakText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: GOLDEN_PEAR,
  },
  // Started label for new habits
  startedLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: INK_SUBTLE,
  },
  // Pick start date banner for habits without start_date
  pickStartDateBanner: {
    backgroundColor: SAGE_MIST,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  pickStartDateText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: MOSS_GREEN,
  },
  // Bottom divider between rows
  divider: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: BORDER_SUBTLE,
  },
});
