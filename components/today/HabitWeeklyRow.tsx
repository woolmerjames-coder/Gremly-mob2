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

import React from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import { Text } from '../../ui';
import { WeeklyDotsRow } from '../../src/components/habits/WeeklyDotsRow';
import { Flame } from 'lucide-react-native';
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
  const displayStatus = !startDate ? { text: 'Set up needed', color: INK_SUBTLE } : statusInfo;

  return (
    <View style={styles.row}>
      {/* Left accent bar - color reflects habit status */}
      <View
        style={[
          styles.accentBar,
          { backgroundColor: !startDate ? 'rgba(0,0,0,0.1)' : getAccentColor(status) },
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
        <WeeklyDotsRow
          dayDots={dayDots}
          dayDates={dayDates}
          todayIndex={todayIndex}
          onToggleDay={(dateISO, newState) => onToggleDay(habitId, dateISO, newState)}
          isBreakingHabit={isBreakingHabit}
          startDate={startDate}
          dotSize={DOT_SIZE}
          dotSpacing={DOT_SPACING}
          onPressPickStartDate={onPressHeader}
        />
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
