/**
 * WeeklyDotsRow - 7 tappable day dots (GremlyDot or BreakingDot) for a habit's weekly progress
 *
 * Extracted from HabitWeeklyRow for reuse in HabitDetailScreen.
 * Includes optimistic state, toggle logic, and the "Tap to pick a start date" banner.
 *
 * GremlyDot is left completely untouched.
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
  /** Called when the "Tap to pick a start date" banner is pressed */
  onPressPickStartDate?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// BreakingDot — checkmark circle for "break habit" entries
// ─────────────────────────────────────────────────────────────────────────────

function BreakingDot({
  isCompleted,
  isToday,
  isFuture,
  onPress,
  size = 28,
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

        if (isBeforeStart) {
          // Show empty placeholder to maintain spacing
          return <View key={dateISO} style={{ width: dotSize, height: dotSize }} />;
        }

        if (isBreakingHabit) {
          return (
            <BreakingDot
              key={dateISO}
              isCompleted={isCompleted}
              isToday={isToday}
              isFuture={isFuture}
              onPress={() => handleDotPress(dateISO, !isCompleted)}
              size={dotSize}
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
            size={dotSize}
          />
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
  pickStartDateLink: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: MOSS_GREEN,
    marginTop: 6,
  },
});
