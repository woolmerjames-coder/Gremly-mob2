/**
 * WeeklyDotsRow - 7 tappable GremlyDot faces for a habit's weekly progress
 *
 * Extracted from HabitWeeklyRow for reuse in HabitDetailScreen.
 * Includes optimistic state, toggle logic, and the "Tap to pick a start date" banner.
 *
 * All habits (build and break) use the same GremlyDot face circles.
 */

import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../ui';
import { GremlyDot } from '../../../components/ui/GremlyDot';
import type { DayDot } from '../../../lib/today/hooks/useWeeklyHabitStats';

// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens
// ─────────────────────────────────────────────────────────────────────────────

const MOSS_GREEN = '#2E5540';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WeeklyDotsRowProps {
  /** 7 dot states for the rolling week */
  dayDots: DayDot[];
  /** ISO date strings (YYYY-MM-DD) for each of the 7 days */
  dayDates: string[];
  /** Index of today in the rolling window (default 6) */
  todayIndex?: number;
  /** Called when a dot is toggled */
  onToggleDay: (dateISO: string, newState: boolean) => void;
  /** Whether this is a breaking habit (renders checkmark dots instead of GremlyDot) */
  isBreakingHabit?: boolean;
  /** ISO date string when habit started (YYYY-MM-DD). When null/undefined, shows the "pick a start date" banner instead of dots. */
  startDate?: string | null;
  /** Dot diameter in px (default 28) */
  dotSize?: number;
  /** Gap between dots in px (default 8) */
  dotSpacing?: number;
  /** Show single-letter day labels (M, T, W…) above each circle */
  showDayLabels?: boolean;
  /** Called when the "Tap to pick a start date" banner is pressed */
  onPressPickStartDate?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// WeeklyDotsRow Component
// ─────────────────────────────────────────────────────────────────────────────

export function WeeklyDotsRow({
  dayDots,
  dayDates,
  todayIndex = 6,
  onToggleDay,
  isBreakingHabit = false,
  startDate,
  dotSize = 28,
  dotSpacing = 8,
  showDayLabels = false,
  onPressPickStartDate,
}: WeeklyDotsRowProps) {
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
      onToggleDay(dateISO, newState);

      // Clear optimistic state after a short delay (parent will have updated by then)
      setTimeout(() => {
        setOptimisticDots((prev) => {
          const next = { ...prev };
          delete next[dateISO];
          return next;
        });
      }, 500);
    },
    [onToggleDay],
  );

  // No start date — show inline link prompting user to set one
  if (!startDate) {
    return (
      <Pressable onPress={onPressPickStartDate}>
        <Text style={styles.pickStartDateLink}>Set start date →</Text>
      </Pressable>
    );
  }

  // Derive single-letter day initials from ISO dates
  const getDayInitial = (dateISO: string): string => {
    const d = new Date(dateISO + 'T12:00:00');
    return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()];
  };

  // Has start date — render dots row
  return (
    <View style={[styles.dotsRow, { gap: dotSpacing }]}>
      {dayDots.map((dotState, index) => {
        const dateISO = dayDates[index];
        const optimistic = optimisticDots[dateISO];
        const effectiveState = optimistic ?? dotState;
        const isCompleted = effectiveState === 'done';
        const isToday = index === todayIndex;
        const isFuture = dotState === 'future';

        // Check if this day is before habit started
        const isBeforeStart = startDate && dateISO < startDate;

        return (
          <View key={dateISO} style={{ alignItems: 'center', width: dotSize }}>
            {showDayLabels && (
              <Text style={[styles.dayLabel, { width: dotSize }, isToday && styles.dayLabelToday]}>
                {getDayInitial(dateISO)}
              </Text>
            )}
            {isBeforeStart ? (
              <View style={{ width: dotSize, height: dotSize }} />
            ) : (
              <GremlyDot
                isCompleted={isCompleted}
                isToday={isToday}
                isFuture={isFuture}
                onPress={() => handleDotPress(dateISO, !isCompleted)}
                size={dotSize}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 8, // Gap between name and GremlyDot row
  },
  dayLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#8B7E74',
    textAlign: 'center',
    marginBottom: 4,
  },
  dayLabelToday: {
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: MOSS_GREEN,
  },
  pickStartDateLink: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: MOSS_GREEN,
    marginTop: 6,
  },
});
