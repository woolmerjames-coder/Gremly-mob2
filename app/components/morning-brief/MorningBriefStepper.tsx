import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, Animated, Easing, Platform, KeyboardAvoidingView } from 'react-native';
import { BRAND } from '../../../design/brand';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type BriefStep = 'glance' | 'sweep' | 'prioritize' | 'organize' | 'plan';

export interface StepperProps {
  stepsNeeded: BriefStep[];
  renderGlance: (onContinue: () => void, onSkipToEnd: () => void) => React.ReactNode;
  renderSweep: (onContinue: () => void, onSkip: () => void) => React.ReactNode;
  renderPrioritize: (onContinue: () => void, onSkip: () => void) => React.ReactNode;
  renderOrganize: (onOrganize: () => void, onSkip: () => void) => React.ReactNode;
  renderPlan: () => React.ReactNode;
  children?: React.ReactNode;
}

// ═══════════════════════════════════════════════════════════════════
// Progress Bar
// ═══════════════════════════════════════════════════════════════════

function StepProgressBar({ current, total }: { current: number; total: number }) {
  const segments = useMemo(() => Array.from({ length: total }, (_, i) => i), [total]);

  return (
    <View style={styles.progressBar}>
      {segments.map((i) => (
        <View
          key={i}
          style={[
            styles.progressSegment,
            {
              backgroundColor: i <= current ? BRAND.colors.mossGreen : BRAND.colors.borderSubtle,
            },
          ]}
        />
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Stepper
// ═══════════════════════════════════════════════════════════════════

export function MorningBriefStepper({
  stepsNeeded,
  renderGlance,
  renderSweep,
  renderPrioritize,
  renderOrganize,
  renderPlan,
  children,
}: StepperProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fadeAnim] = useState(() => new Animated.Value(1));
  const [slideAnim] = useState(() => new Animated.Value(0));
  // Track whether a fade transition is in flight.
  // 0 = idle, 1 = transitioning.  Using Animated.Value avoids
  // both useRef (.current flagged by react-hooks/refs) and
  // direct state-object mutation (flagged by the linter).
  const [transitionFlag] = useState(() => new Animated.Value(0));

  const currentStep = stepsNeeded[currentIndex];

  const transitionTo = useCallback(
    (targetIndex: number) => {
      // eslint-disable-next-line no-underscore-dangle
      if ((transitionFlag as any).__getValue() !== 0) return;
      transitionFlag.setValue(1);
      // Fade out + slide up
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -8,
          duration: 150,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentIndex(targetIndex);
        slideAnim.setValue(8);
        // Fade in + slide down to 0
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => {
          transitionFlag.setValue(0);
        });
      });
    },
    [fadeAnim, transitionFlag],
  );

  const advance = useCallback(() => {
    if (currentIndex < stepsNeeded.length - 1) {
      transitionTo(currentIndex + 1);
    }
  }, [currentIndex, stepsNeeded.length, transitionTo]);

  const skipToEnd = useCallback(() => {
    const planIndex = stepsNeeded.indexOf('plan');
    if (planIndex !== -1) {
      transitionTo(planIndex);
    }
  }, [stepsNeeded, transitionTo]);

  const stepContent = (() => {
    switch (currentStep) {
      case 'glance':
        return renderGlance(advance, skipToEnd);
      case 'sweep':
        return renderSweep(advance, advance);
      case 'prioritize':
        return renderPrioritize(advance, advance);
      case 'organize':
        return renderOrganize(advance, skipToEnd);
      case 'plan':
        return renderPlan();
      default:
        return null;
    }
  })();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {stepsNeeded.length > 1 && (
        <StepProgressBar current={currentIndex} total={stepsNeeded.length} />
      )}
      <Animated.View
        style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        {stepContent}
      </Animated.View>
      {children}
    </KeyboardAvoidingView>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  progressBar: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
});
