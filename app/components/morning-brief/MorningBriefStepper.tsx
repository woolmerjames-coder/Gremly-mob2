import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { Rocket } from 'lucide-react-native';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MORNING_BRIEF_GREMLY = require('../../../assets/mascot/morningbriefgremly.png');
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type BriefStep = 'glance' | 'sweep' | 'prioritize' | 'organize' | 'plan';

export interface StepperProps {
  stepsNeeded: BriefStep[];
  renderGlance: (onContinue: () => void, onSkipToEnd: () => void) => React.ReactNode;
  renderSweep: (onContinue: () => void, onSkip: () => void, onBack: () => void) => React.ReactNode;
  renderPrioritize: (
    onContinue: () => void,
    onSkip: () => void,
    onBack: () => void,
  ) => React.ReactNode;
  renderOrganize: (
    onOrganize: () => void,
    onSkip: () => void,
    onBack: () => void,
    onShowCelebration: () => void,
  ) => React.ReactNode;
  renderPlan: (onBack: () => void) => React.ReactNode;
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

  // ── Celebration overlay (lives here so it survives step transitions) ──
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationFade] = useState(() => new Animated.Value(0));
  const [celebrationScale] = useState(() => new Animated.Value(0.5));
  const [celebrationSlide] = useState(() => new Animated.Value(0));
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

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      transitionTo(currentIndex - 1);
    }
  }, [currentIndex, transitionTo]);

  const skipToEnd = useCallback(() => {
    const planIndex = stepsNeeded.indexOf('plan');
    if (planIndex !== -1) {
      transitionTo(planIndex);
    }
  }, [stepsNeeded, transitionTo]);

  // Celebration: show overlay → advance to Plan behind it → fade out
  const triggerCelebration = useCallback(() => {
    setShowCelebration(true);
    celebrationFade.setValue(0);
    celebrationScale.setValue(0.5);
    celebrationSlide.setValue(0);

    // Pop in
    Animated.parallel([
      Animated.timing(celebrationFade, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(celebrationScale, {
        toValue: 1,
        friction: 6,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();

    // After hold time, advance to Plan behind the overlay then reveal
    setTimeout(() => {
      // Advance stepper (Plan renders underneath the green overlay)
      const planIndex = stepsNeeded.indexOf('plan');
      if (planIndex !== -1) {
        // Direct index change — no fade transition (overlay hides it)
        setCurrentIndex(planIndex);
      }

      // Wait for Plan to mount and render
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(celebrationSlide, {
            toValue: -SCREEN_HEIGHT,
            duration: 500,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(celebrationFade, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setShowCelebration(false);
          celebrationFade.setValue(0);
          celebrationScale.setValue(0.5);
          celebrationSlide.setValue(0);
        });
      }, 600);
    }, 1500);
  }, [stepsNeeded, celebrationFade, celebrationScale, celebrationSlide]);

  const stepContent = (() => {
    switch (currentStep) {
      case 'glance':
        return renderGlance(advance, skipToEnd);
      case 'sweep':
        return renderSweep(advance, advance, goBack);
      case 'prioritize':
        return renderPrioritize(advance, advance, goBack);
      case 'organize':
        return renderOrganize(advance, skipToEnd, goBack, triggerCelebration);
      case 'plan':
        return renderPlan(goBack);
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

      {/* ── Celebration overlay (persists across step transitions) ── */}
      {showCelebration && (
        <Animated.View
          style={[
            styles.celebrationOverlay,
            {
              opacity: celebrationFade,
              transform: [{ translateY: celebrationSlide }],
            },
          ]}
        >
          <View style={styles.celebrationContent}>
            <Animated.Image
              source={MORNING_BRIEF_GREMLY}
              style={[styles.celebrationMascot, { transform: [{ scale: celebrationScale }] }]}
              resizeMode="contain"
            />
            <Animated.View
              style={{ opacity: celebrationFade, transform: [{ scale: celebrationScale }] }}
            >
              <Text style={styles.celebrationTitle}>You're locked in.</Text>
              <View style={styles.celebrationSubRow}>
                <Text style={styles.celebrationSubtitle}>LFG</Text>
                <Rocket size={18} color={'#2E5540'} style={{ marginLeft: 6 }} />
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      )}
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
  // Celebration overlay
  celebrationOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#BFD8C0',
    zIndex: 200,
  },
  celebrationContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  celebrationMascot: {
    width: 160,
    height: 160,
    marginBottom: 28,
  },
  celebrationTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#2E5540',
    textAlign: 'center',
    lineHeight: 42,
  },
  celebrationSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  celebrationSubtitle: {
    fontSize: 18,
    color: '#2E5540',
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 26,
  },
});
