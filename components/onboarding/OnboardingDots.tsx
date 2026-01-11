/**
 * OnboardingDots Component
 *
 * Simple dot indicator for multi-step onboarding flows.
 * Shows current progress with active/inactive dot states.
 */

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { BRAND } from '../../design/brand';

interface OnboardingDotsProps {
  /** Total number of steps */
  totalSteps: number;
  /** Current active step (0-indexed) */
  currentStep: number;
  /** Optional callback when a dot is pressed */
  onDotPress?: (step: number) => void;
}

const ACTIVE_SIZE = 10;
const INACTIVE_SIZE = 8;
const DOT_GAP = 8;

export default function OnboardingDots({
  totalSteps,
  currentStep,
  onDotPress,
}: OnboardingDotsProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }).map((_, index) => {
        const isActive = index === currentStep;

        const dotContent = (
          <View style={[styles.dot, isActive ? styles.dotActive : styles.dotInactive]} />
        );

        if (onDotPress) {
          return (
            <Pressable
              key={index}
              onPress={() => onDotPress(index)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`Go to step ${index + 1}`}
              accessibilityState={{ selected: isActive }}
            >
              {dotContent}
            </Pressable>
          );
        }

        return <View key={index}>{dotContent}</View>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: DOT_GAP,
  },
  dot: {
    borderRadius: ACTIVE_SIZE / 2,
  },
  dotActive: {
    width: ACTIVE_SIZE,
    height: ACTIVE_SIZE,
    backgroundColor: BRAND.colors.mossGreen,
  },
  dotInactive: {
    width: INACTIVE_SIZE,
    height: INACTIVE_SIZE,
    backgroundColor: BRAND.colors.borderSubtle,
  },
});
