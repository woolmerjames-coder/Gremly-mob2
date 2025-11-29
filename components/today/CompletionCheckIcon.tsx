/**
 * CompletionCheckIcon - Green circle with white checkmark
 *
 * Displays completion progress indicator:
 * - Green circle with white check when completed > 0
 * - Grey circle with grey check when completed = 0
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const MOSS_GREEN = '#2E5540';

export interface CompletionCheckIconProps {
  /** Whether there is any progress (completedCount > 0) */
  completed: boolean;
  /** Icon size in pixels (default 16) */
  size?: number;
}

export function CompletionCheckIcon({ completed, size = 16 }: CompletionCheckIconProps) {
  const circleColor = completed ? MOSS_GREEN : MOSS_GREEN;
  const checkColor = '#FFFFFF';
  const opacity = completed ? 1 : 0.25;

  // Check path scaled for the icon size
  // Standard checkmark path for a 16x16 viewBox, centered
  const checkPath = 'M4.5 8.5L7 11L11.5 5.5';

  return (
    <View style={[styles.container, { width: size, height: size, opacity }]}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: circleColor,
          },
        ]}
      />
      <Svg width={size} height={size} viewBox="0 0 16 16" style={styles.check}>
        <Path
          d={checkPath}
          stroke={checkColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circle: {
    position: 'absolute',
  },
  check: {
    position: 'absolute',
  },
});

export default CompletionCheckIcon;
