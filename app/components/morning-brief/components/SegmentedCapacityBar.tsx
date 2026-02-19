/**
 * SegmentedCapacityBar
 *
 * Multi-segment bar showing how the day breaks down across
 * events, todos, and habits with animated width transitions.
 */

import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Text } from '../../../../ui';
import { BRAND } from '../../../../design/brand';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface SegmentedCapacityBarProps {
  eventMinutes: number;
  todoMinutes: number;
  habitMinutes: number;
  totalDayMinutes: number;
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function SegmentedCapacityBar({
  eventMinutes,
  todoMinutes,
  habitMinutes,
  totalDayMinutes,
}: SegmentedCapacityBarProps) {
  const total = Math.max(totalDayMinutes, 1);

  // Compute raw percentages
  const rawEventPct = (eventMinutes / total) * 100;
  const rawTodoPct = (todoMinutes / total) * 100;
  const rawHabitPct = (habitMinutes / total) * 100;
  const rawTotal = rawEventPct + rawTodoPct + rawHabitPct;

  // Clamp so segments never exceed 100% combined
  const scale = rawTotal > 100 ? 100 / rawTotal : 1;
  const eventPct = rawEventPct * scale;
  const todoPct = rawTodoPct * scale;
  const habitPct = rawHabitPct * scale;

  // Animated values
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const eventWidth = useMemo(() => new Animated.Value(eventPct), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todoWidth = useMemo(() => new Animated.Value(todoPct), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const habitWidth = useMemo(() => new Animated.Value(habitPct), []);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(eventWidth, {
        toValue: eventPct,
        friction: 12,
        tension: 60,
        useNativeDriver: false,
      }),
      Animated.spring(todoWidth, {
        toValue: todoPct,
        friction: 12,
        tension: 60,
        useNativeDriver: false,
      }),
      Animated.spring(habitWidth, {
        toValue: habitPct,
        friction: 12,
        tension: 60,
        useNativeDriver: false,
      }),
    ]).start();
  }, [eventPct, todoPct, habitPct, eventWidth, todoWidth, habitWidth]);

  // Interpolate left positions
  const eventLeft = 0;
  const todoLeft = Animated.add(eventWidth, 0);
  const habitLeft = Animated.add(eventWidth, todoWidth);

  return (
    <View style={styles.container}>
      {/* Bar track */}
      <View style={styles.track}>
        {/* Events segment */}
        {eventMinutes > 0 && (
          <Animated.View
            style={[
              styles.segment,
              styles.segmentEvents,
              {
                left: eventLeft,
                width: eventWidth.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        )}
        {/* Todos segment */}
        {todoMinutes > 0 && (
          <Animated.View
            style={[
              styles.segment,
              styles.segmentTodos,
              {
                left: todoLeft.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
                width: todoWidth.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        )}
        {/* Habits segment */}
        {habitMinutes > 0 && (
          <Animated.View
            style={[
              styles.segment,
              styles.segmentHabits,
              {
                left: habitLeft.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
                width: habitWidth.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        )}
      </View>

      {/* Labels */}
      <Text style={styles.labels}>
        {fmt(eventMinutes)} events · {fmt(todoMinutes)} todos · {fmt(habitMinutes)} habits
      </Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E8E4DD',
    overflow: 'hidden',
  },
  segment: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  segmentEvents: {
    backgroundColor: '#D4A574',
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  segmentTodos: {
    backgroundColor: BRAND.colors.mossGreen,
  },
  segmentHabits: {
    backgroundColor: BRAND.colors.periwinkleSmoke,
  },
  labels: {
    marginTop: 4,
    fontSize: 10,
    color: BRAND.colors.inkMuted,
    fontVariant: ['tabular-nums'],
  },
});
