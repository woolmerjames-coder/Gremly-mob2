/**
 * OnboardingScreen - Multi-step onboarding flow
 *
 * Introduces new users to Gremly and the daily ritual concept.
 * 3 swipeable screens: Welcome, The Ritual, Get Started
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Pressable,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../ui';
import { Sprout } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';

// Mascot images
import GREMLY_MASCOT from '../../assets/mascot/gremly-mascot.png';
import GREMLY_FISTBUMP from '../../assets/mascot/fistbumpgremly.png';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const REQUIRED_COUNT = 3;
const DOT_SIZE = 8;
const DOT_GAP = 6;

interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  subtext: string;
  type: 'mascot' | 'icon';
  mascot?: any;
  showRitualDots?: boolean;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Meet your Gremly',
    body: 'Gremlins are born from mental chaos. Yours found you — and wants to help you feel less overwhelmed.',
    subtext: 'The more you work together, the more Gremly grows.',
    type: 'mascot',
    mascot: GREMLY_MASCOT,
  },
  {
    id: 'ritual',
    title: 'The Daily Ritual',
    body: "Each day, drop 3 thoughts and sweep 3 cards. That's it.",
    subtext:
      'Complete the ritual and Gremly ages by one day. No punishment if you miss — Gremly just waits for you.',
    type: 'icon',
    showRitualDots: true,
  },
  {
    id: 'start',
    title: 'Ready to drop your first thought?',
    body: 'Anything on your mind — tasks, ideas, worries. Drop it, and Gremly will help you sort it out.',
    subtext: '',
    type: 'mascot',
    mascot: GREMLY_FISTBUMP,
  },
];

/**
 * Renders empty ritual progress dots for the onboarding explanation
 */
function RitualDotsPreview() {
  return (
    <View style={styles.ritualDotsContainer}>
      {/* Drops section */}
      <View style={styles.ritualSection}>
        <View style={styles.dotsRow}>
          {Array.from({ length: REQUIRED_COUNT }).map((_, index) => (
            <View key={`drop-${index}`} style={styles.dotEmpty} />
          ))}
        </View>
        <Text style={styles.dotLabel}>drops</Text>
      </View>

      {/* Plus sign */}
      <Text style={styles.plusSign}>+</Text>

      {/* Sweeps section */}
      <View style={styles.ritualSection}>
        <View style={styles.dotsRow}>
          {Array.from({ length: REQUIRED_COUNT }).map((_, index) => (
            <View key={`sweep-${index}`} style={styles.dotEmpty} />
          ))}
        </View>
        <Text style={styles.dotLabel}>swept</Text>
      </View>
    </View>
  );
}

/**
 * Renders a single onboarding step
 */
function OnboardingStepView({ step }: { step: OnboardingStep }) {
  return (
    <View style={styles.stepContainer}>
      {/* Visual element */}
      <View style={styles.visualContainer}>
        {step.type === 'mascot' && step.mascot && (
          <Image
            source={step.mascot}
            style={styles.mascotImage}
            resizeMode="contain"
            accessibilityLabel="Gremly mascot"
          />
        )}
        {step.type === 'icon' && (
          <View style={styles.iconContainer}>
            <Sprout size={48} color={BRAND.colors.mossGreen} />
          </View>
        )}
      </View>

      {/* Title */}
      <Text style={styles.title}>{step.title}</Text>

      {/* Ritual dots preview (only on ritual step) */}
      {step.showRitualDots && <RitualDotsPreview />}

      {/* Body text */}
      <Text style={styles.body}>{step.body}</Text>

      {/* Subtext */}
      {step.subtext ? <Text style={styles.subtext}>{step.subtext}</Text> : null}
    </View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const flatListRef = useRef<FlatList>(null);
  const [currentStep, setCurrentStep] = useState(0);

  // Store action to mark onboarding complete
  const markOnboardingComplete = useGremlyStore((s) => s.markOnboardingComplete);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const step = Math.round(offsetX / SCREEN_WIDTH);
      if (step !== currentStep && step >= 0 && step < ONBOARDING_STEPS.length) {
        setCurrentStep(step);
      }
    },
    [currentStep],
  );

  const goToStep = useCallback((step: number) => {
    flatListRef.current?.scrollToIndex({ index: step, animated: true });
    setCurrentStep(step);
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      goToStep(currentStep + 1);
    }
  }, [currentStep, goToStep]);

  const handleComplete = useCallback(async () => {
    // Mark onboarding as complete
    await markOnboardingComplete();
    // Navigate to main app (reset navigation stack)
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Tabs' }],
      }),
    );
  }, [navigation, markOnboardingComplete]);

  const handleSkip = useCallback(async () => {
    await handleComplete();
  }, [handleComplete]);

  const renderStep = useCallback(
    ({ item }: { item: OnboardingStep }) => (
      <View style={{ width: SCREEN_WIDTH }}>
        <OnboardingStepView step={item} />
      </View>
    ),
    [],
  );

  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Skip button */}
      <Pressable
        style={styles.skipButton}
        onPress={handleSkip}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>

      {/* Swipeable content */}
      <FlatList
        ref={flatListRef}
        data={ONBOARDING_STEPS}
        renderItem={renderStep}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
        style={styles.flatList}
        contentContainerStyle={styles.flatListContent}
      />

      {/* Bottom controls */}
      <View style={styles.bottomContainer}>
        {/* Dot indicators */}
        <View style={styles.dotsContainer}>
          {ONBOARDING_STEPS.map((_, index) => (
            <Pressable
              key={index}
              onPress={() => goToStep(index)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <View
                style={[
                  styles.stepDot,
                  index === currentStep ? styles.stepDotActive : styles.stepDotInactive,
                ]}
              />
            </Pressable>
          ))}
        </View>

        {/* Action button */}
        {isLastStep ? (
          <Pressable style={styles.primaryButton} onPress={handleComplete}>
            <Text style={styles.primaryButtonText}>Let's go</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.secondaryButton} onPress={handleNext}>
            <Text style={styles.secondaryButtonText}>Next</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  skipButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.inkMuted,
  },
  flatList: {
    flex: 1,
  },
  flatListContent: {
    alignItems: 'center',
  },
  stepContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 100, // Space for bottom controls
  },
  visualContainer: {
    marginBottom: 32,
  },
  mascotImage: {
    width: 160,
    height: 160,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: BRAND.colors.sageMist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 28,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 17,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 12,
  },
  subtext: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Ritual dots preview
  ritualDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 16,
  },
  ritualSection: {
    alignItems: 'center',
    gap: 4,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: DOT_GAP,
  },
  dotEmpty: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: BRAND.colors.borderSubtle,
  },
  dotLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.inkSubtle,
  },
  plusSign: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.inkMuted,
    marginBottom: 16,
  },
  // Bottom controls
  bottomContainer: {
    paddingHorizontal: 32,
    paddingBottom: 24,
    gap: 24,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stepDotActive: {
    backgroundColor: BRAND.colors.mossGreen,
  },
  stepDotInactive: {
    backgroundColor: BRAND.colors.borderSubtle,
  },
  primaryButton: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 16,
    borderRadius: BRAND.radius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: BRAND.radius.md,
    borderWidth: 1.5,
    borderColor: BRAND.colors.mossGreen,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    color: BRAND.colors.mossGreen,
  },
});
