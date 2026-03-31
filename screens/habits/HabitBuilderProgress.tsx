// DEPRECATED: Replaced by HabitSummaryCard in V2. Safe to delete.
/**
 * HabitBuilderProgress — Progress dots for Habit Builder chat
 *
 * Shows 5 milestone dots (one per required field: name, type, cadence, target, start_date).
 * Dots fill as the server-side extraction resolves fields. A subtle phase label
 * underneath shifts: "Exploring..." → "Shaping..." → "Almost there..." → "Ready to lock in"
 *
 * Design principle: the user sees momentum building without knowing what each dot represents.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { Text } from '../../ui/Text';
import { lightTokens } from '../../design/tokens';
import type { HabitBuilderResolvedFields } from '../../lib/types';

interface HabitBuilderProgressProps {
  resolved: HabitBuilderResolvedFields;
}

const TOTAL_DOTS = 5;

function getPhaseLabel(count: number): string {
  if (count === 0) return 'Exploring...';
  if (count <= 2) return 'Shaping...';
  if (count <= 4) return 'Almost there...';
  return 'Ready to lock in';
}

export function HabitBuilderProgress({ resolved }: HabitBuilderProgressProps) {
  const count = resolved.required_count;
  const label = getPhaseLabel(count);

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(400).delay(200)}>
      <View style={styles.track}>
        {Array.from({ length: TOTAL_DOTS }).map((_, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={[styles.line, i < count && styles.lineFilled]} />}
            <Animated.View
              layout={Layout.springify()}
              style={[styles.dot, i < count && styles.dotFilled]}
            />
          </React.Fragment>
        ))}
      </View>
      <Animated.View key={label} entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)}>
        <Text style={styles.label}>{label}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 1.5,
    borderColor: 'rgba(92, 107, 90, 0.3)',
  },
  dotFilled: {
    backgroundColor: '#5C6B5A',
    borderColor: '#5C6B5A',
  },
  line: {
    width: 28,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 2,
  },
  lineFilled: {
    backgroundColor: '#5C6B5A',
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: lightTokens.typography.fontFamily.medium,
    color: '#5C6B5A',
    letterSpacing: 0.3,
  },
});
