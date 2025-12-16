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
import type { DayDot, HabitStatus } from '../../lib/today/hooks/useWeeklyHabitStats';

// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens (Harmonic Cortex)
// ─────────────────────────────────────────────────────────────────────────────

const MOSS_GREEN = '#2E5540';
const GOLDEN_PEAR = '#E0C47A';
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
          {dayDots.map((dotState, index) => {
            const dateISO = dayDates[index];
            const optimistic = optimisticDots[dateISO];
            const effectiveState = optimistic ?? dotState;
            const isCompleted = effectiveState === 'done';
            const isToday = index === todayIndex;
            const isFuture = dotState === 'future';

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
  // GremlyDot faces aligned with shared header labels in NowWeekPopup
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: DOT_SPACING,
    marginTop: 8, // Gap between name and GremlyDot row
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
