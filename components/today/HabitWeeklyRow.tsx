/**
 * HabitWeeklyRow - A compact row displaying a habit with weekly progress dots
 *
 * LAYOUT (day labels in shared header in NowWeekPopup):
 * - Left: accent bar (color reflects status) + habit name
 * - Middle: 7 dots for the week
 * - Right: frequency text + status label stacked
 *
 * Each day dot is tappable for past/current days (not future).
 */

import React, { useCallback, useState, memo } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import { Box, Text } from '../../ui';
import type { DayDot, HabitStatus } from '../../lib/today/hooks/useWeeklyHabitStats';

// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens (Harmonic Cortex)
// ─────────────────────────────────────────────────────────────────────────────

const MOSS_GREEN = '#2E5540';
const GOLDEN_PEAR = '#E0C47A';
const SAGE_MIST = '#DCDCD6';
const CHARCOAL_INK = '#222222';
const INK_SUBTLE = 'rgba(34, 34, 34, 0.55)';
const BORDER_SUBTLE = 'rgba(0, 0, 0, 0.08)';
// Neutral grey for hollow "missed" dots - matches unselected UI elements
const NEUTRAL_GREY = 'rgba(34, 34, 34, 0.25)';

// ─── DOT SIZING ───
// Reduced from 20px to 14px for lighter visual weight
// Must match NowWeekPopup shared header spacing
const DOT_SIZE = 14;
const DOT_SPACING = 12;

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
  dayDates: string[]; // ISO dates for Monday → Sunday
  /** Frequency string like "Daily", "3× per week", "Mon · Wed · Fri" */
  frequencyLabel?: string;
  onToggleDay: (habitId: string, dateISO: string, newState: boolean) => void;
  /** Called when user taps the header area (name/status) to view details */
  onPressHeader?: () => void;
  /** Whether divider should be shown at bottom */
  showDivider?: boolean;
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
      return { text: 'On track', color: MOSS_GREEN };
    case 'needs_attention':
      return { text: 'Needs attention', color: GOLDEN_PEAR };
    default:
      return { text: 'On track', color: MOSS_GREEN };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DayDotButton Component
// ─────────────────────────────────────────────────────────────────────────────

interface DayDotButtonProps {
  state: DayDot;
  dateISO: string;
  onPress: (dateISO: string, newState: boolean) => void;
  /** Optimistic state override for immediate feedback */
  optimisticState?: DayDot;
}

const DayDotButton = React.memo(function DayDotButton({
  state,
  dateISO,
  onPress,
  optimisticState,
}: DayDotButtonProps) {
  const displayState = optimisticState ?? state;
  // 'future' is disabled, but 'pending' (x_per_week past days) is tappable
  const isFuture = displayState === 'future';
  const isDone = displayState === 'done';
  // ─── MISSED = HOLLOW DOT ───
  // Past days not completed render as neutral hollow grey circle (not red)
  const isMissed = displayState === 'missed';

  const handlePress = useCallback(() => {
    console.log('[HabitsSheet] dot tapped', { dateISO, isFuture, isDone, willBe: !isDone });
    if (isFuture) return;
    onPress(dateISO, !isDone);
  }, [isFuture, isDone, dateISO, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={isFuture}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      style={({ pressed }) => [
        styles.dot,
        // ─── DOT STYLING BY STATE ───
        // Done: filled green | Missed: hollow grey | Future/Pending: filled light grey
        isDone && styles.dotDone,
        isMissed && styles.dotMissed,
        !isDone && !isMissed && styles.dotDefault,
        isFuture && styles.dotFuture,
        pressed && !isFuture && styles.dotPressed,
      ]}
    />
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// HabitWeeklyRow Component
// ─────────────────────────────────────────────────────────────────────────────

export const HabitWeeklyRow = React.memo(function HabitWeeklyRow({
  habitId,
  name,
  weeklyCompleted,
  weeklyTarget,
  status,
  dayDots,
  dayDates,
  frequencyLabel,
  onToggleDay,
  onPressHeader,
  showDivider = true,
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

  return (
    <View style={styles.row}>
      {/* Left accent bar - color reflects habit status */}
      <View style={[styles.accentBar, { backgroundColor: getAccentColor(status) }]} />

      {/* Content */}
      <View style={styles.content}>
        {/* ─── TOP ROW: Name + Right Column ─── */}
        <Pressable onPress={onPressHeader} disabled={!onPressHeader} style={styles.topRow}>
          {/* Left: Habit name */}
          <Text style={styles.habitName} numberOfLines={1}>
            {name}
          </Text>

          {/* Right: Frequency + Status stacked */}
          <View style={styles.rightColumn}>
            <Text style={styles.frequency}>{displayFrequency}</Text>
            <Text style={[styles.statusLabel, { color: statusInfo.color }]}>{statusInfo.text}</Text>
          </View>
        </Pressable>

        {/* ─── DOTS ROW ONLY ─── */}
        {/* Day labels removed - now in shared header in NowWeekPopup */}
        <View style={styles.dotsRow}>
          {dayDots.map((dotState, index) => (
            <DayDotButton
              key={dayDates[index]}
              state={dotState}
              dateISO={dayDates[index]}
              onPress={handleDotPress}
              optimisticState={optimisticDots[dayDates[index]]}
            />
          ))}
        </View>
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
  // Compact vertical padding, maintains ~44-48px touch target height
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingRight: 4,
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
  // Habit name - left side
  habitName: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: CHARCOAL_INK,
    flex: 1,
    marginRight: 8,
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
  // Aligns with shared header labels in NowWeekPopup
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: DOT_SPACING,
    marginTop: 6, // Small gap between name and dots
  },
  // Base dot style - size only, colors set by state-specific styles
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  // ─── DOT STATE STYLES ───
  // Done: filled green
  dotDone: {
    backgroundColor: MOSS_GREEN,
  },
  // Missed: hollow grey circle (neutral, not harsh red)
  dotMissed: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: NEUTRAL_GREY,
  },
  // Default (future/pending): filled light grey
  dotDefault: {
    backgroundColor: SAGE_MIST,
  },
  dotFuture: {
    opacity: 0.4,
  },
  dotPressed: {
    transform: [{ scale: 0.85 }],
    opacity: 0.8,
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
