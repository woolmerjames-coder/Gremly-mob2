/**
 * OnboardingScreen - Multi-step onboarding flow
 *
 * Introduces new users to Gremly.
 * 2 swipeable screens: Welcome, Get Started
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
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';

// Mascot images
import GREMLY_MASCOT from '../../assets/mascot/gremly-mascot.png';
import GREMLY_FISTBUMP from '../../assets/mascot/fistbumpgremly.png';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  subtext: string;
  type: 'mascot' | 'icon';
  mascot?: any;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: "Hi, I'm Gremly",
    body: 'I help you get things out of your head and into a system that actually works.',
    subtext: 'The more we work together, the more we both grow.',
    type: 'mascot',
    mascot: GREMLY_MASCOT,
  },
  {
    id: 'start',
    title: 'Where do we start?',
    body: "Just drop whatever's on your mind. Tasks, thoughts, feelings. I'll figure out the rest.",
    subtext: 'Tap any card to chat with me along the way.',
    type: 'mascot',
    mascot: GREMLY_FISTBUMP,
  },
];

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
      </View>

      {/* Title */}
      <Text style={styles.title}>{step.title}</Text>

      {/* Body text */}
      {step.body ? <Text style={styles.body}>{step.body}</Text> : null}

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
  const startTraining = useGremlyStore((s) => s.startTraining);

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

  const handleNext = useCallback(async () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      goToStep(currentStep + 1);
    }
  }, [currentStep, goToStep]);

  const handleComplete = useCallback(async () => {
    await markOnboardingComplete();
    await startTraining();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Tabs' }],
      }),
    );
  }, [navigation, markOnboardingComplete, startTraining]);

  const handleSkip = useCallback(async () => {
    await handleComplete();
  }, [handleComplete]);

  const renderStep = useCallback(
    ({ item }: { item: OnboardingStep }) => (
      <View style={styles.stepWrapper}>
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
        contentContainerStyle={{ flexGrow: 1 }}
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
    backgroundColor: BRAND.colors.sageMist,
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
  stepWrapper: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  stepContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 40,
    paddingHorizontal: 24,
    paddingBottom: 100, // Space for bottom controls
  },
  visualContainer: {
    marginBottom: 32,
  },
  mascotImage: {
    width: 160,
    height: 160,
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 28,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 16,
    width: '100%',
    lineHeight: 36,
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
