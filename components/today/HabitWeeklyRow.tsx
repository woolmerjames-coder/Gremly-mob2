/**
 * HabitWeeklyRow - A row displaying a habit with weekly progress dots
 *
 * Each day dot is tappable for past/current days (not future).
 * Tapping toggles completion for that specific date.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import { Box, Text } from '../../ui';
import type { DayDot, HabitStatus } from '../../lib/today/hooks/useWeeklyHabitStats';

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
  statusLabel: string;
  onToggleDay: (habitId: string, dateISO: string, newState: boolean) => void;
  /** Whether divider should be shown at bottom */
  showDivider?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MOSS_GREEN = '#2E5540';
const DOT_SIZE = 20;

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// ─────────────────────────────────────────────────────────────────────────────
// DayDotButton Component
// ─────────────────────────────────────────────────────────────────────────────

interface DayDotButtonProps {
  state: DayDot;
  dateISO: string;
  dayLabel: string;
  onPress: (dateISO: string, newState: boolean) => void;
  /** Optimistic state override for immediate feedback */
  optimisticState?: DayDot;
}

function DayDotButton({ state, dateISO, dayLabel, onPress, optimisticState }: DayDotButtonProps) {
  const displayState = optimisticState ?? state;
  const isFuture = displayState === 'future';
  const isDone = displayState === 'done';

  const handlePress = useCallback(() => {
    if (isFuture) return;
    // Toggle state
    onPress(dateISO, !isDone);
  }, [isFuture, isDone, dateISO, onPress]);

  return (
    <View style={styles.dotContainer}>
      <Text style={styles.dayLabel}>{dayLabel}</Text>
      <Pressable
        onPress={handlePress}
        disabled={isFuture}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        style={({ pressed }) => [
          styles.dot,
          isDone && styles.dotDone,
          displayState === 'missed' && styles.dotMissed,
          isFuture && styles.dotFuture,
          pressed && !isFuture && styles.dotPressed,
        ]}
      >
        {isDone && <Text style={styles.dotCheck}>✓</Text>}
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HabitWeeklyRow Component
// ─────────────────────────────────────────────────────────────────────────────

export function HabitWeeklyRow({
  habitId,
  name,
  weeklyCompleted,
  weeklyTarget,
  status: _status,
  dayDots,
  dayDates,
  statusLabel,
  onToggleDay,
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

  return (
    <Box style={[styles.row, showDivider && styles.rowWithDivider]}>
      <Box style={styles.info}>
        <Text style={styles.habitName}>{name}</Text>
        <Box style={styles.meta}>
          <Text style={styles.progress}>
            {weeklyCompleted}/{weeklyTarget}
          </Text>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </Box>
      </Box>

      <Box style={styles.dotsRow}>
        {dayDots.map((dotState, index) => (
          <DayDotButton
            key={dayDates[index]}
            state={dotState}
            dateISO={dayDates[index]}
            dayLabel={DAY_LABELS[index]}
            onPress={handleDotPress}
            optimisticState={optimisticDots[dayDates[index]]}
          />
        ))}
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  rowWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  info: {
    marginBottom: 10,
  },
  habitName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progress: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
  },
  statusText: {
    fontSize: 14,
    color: '#757575',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  dotContainer: {
    alignItems: 'center',
    gap: 4,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9E9E9E',
    textTransform: 'uppercase',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: {
    backgroundColor: MOSS_GREEN,
  },
  dotMissed: {
    backgroundColor: '#FFCDD2', // Soft red
    borderWidth: 1,
    borderColor: '#EF9A9A',
  },
  dotFuture: {
    backgroundColor: '#F5F5F5',
    opacity: 0.5,
  },
  dotPressed: {
    transform: [{ scale: 0.9 }],
    opacity: 0.8,
  },
  dotCheck: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
