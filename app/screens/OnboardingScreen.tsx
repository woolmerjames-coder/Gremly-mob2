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
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { GREMLY_PALETTES } from '../../lib/constants/gremlyPalettes';
import MascotLottie from '../components/MascotLottie';

// Mascot images
import GREMLY_MASCOT from '../../assets/mascot/gremly-mascot.png';
import GREMLY_FISTBUMP from '../../assets/mascot/fistbumpgremly.png';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  subtext: string;
  type: 'mascot' | 'icon' | 'color-picker' | 'drain';
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
    id: 'color',
    title: 'Make me yours',
    body: '',
    subtext: 'You can always change this in settings.',
    type: 'color-picker',
  },
  {
    id: 'start',
    title: 'Feed me every day',
    body: "Every drop fills your gremlin back up. Tasks, thoughts, feelings — I'll sort it all out.",
    subtext: 'Tap any card to chat with me along the way.',
    type: 'drain',
  },
];

const PRONOUN_OPTIONS = ['he/him', 'she/her', 'they/them', 'other'];

/**
 * Renders a single onboarding step
 */
function OnboardingStepView({
  step,
  drainVisible,
  nameInput,
  setNameInput,
  pronounsInput,
  setPronounsInput,
}: {
  step: OnboardingStep;
  drainVisible: boolean;
  nameInput: string;
  setNameInput: (v: string) => void;
  pronounsInput: string | null;
  setPronounsInput: (v: string | null) => void;
}) {
  const gremlyColor = useGremlyStore((s) => s.gremlyColor);
  const setGremlyColor = useGremlyStore((s) => s.setGremlyColor);
  const [nameFocused, setNameFocused] = useState(false);

  const selectedPalette = GREMLY_PALETTES.find((p) => p.id === gremlyColor) ?? GREMLY_PALETTES[0];

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
        {step.type === 'color-picker' && (
          <View
            style={{
              height: 240,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'visible',
            }}
          >
            <View style={{ transform: [{ scale: 2 }] }}>
              <MascotLottie showFullColor />
            </View>
          </View>
        )}
        {step.type === 'drain' && (
          <View
            style={{
              height: 240,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'visible',
            }}
          >
            <View style={{ transform: [{ scale: 2 }] }}>
              <MascotLottie drainAnimation showFullColor drainVisible={drainVisible} />
            </View>
          </View>
        )}
      </View>

      {/* Title */}
      <Text style={styles.title}>{step.title}</Text>

      {/* Color picker */}
      {step.type === 'color-picker' && (
        <>
          <View style={styles.colorRow}>
            {GREMLY_PALETTES.map((palette) => {
              const isSelected = palette.id === gremlyColor;
              return (
                <Pressable
                  key={palette.id}
                  onPress={() => setGremlyColor(palette.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${palette.name} color`}
                  accessibilityState={{ selected: isSelected }}
                  style={[
                    styles.colorButton,
                    isSelected && { borderColor: palette.hex.dark, borderWidth: 3 },
                  ]}
                >
                  <View style={[styles.colorButtonInner, { backgroundColor: palette.hex.dark }]} />
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.colorName}>{selectedPalette.name}</Text>
        </>
      )}

      {/* Body text */}
      {step.body ? (
        <Text style={styles.body}>
          {step.id === 'start' && nameInput.trim()
            ? `Every drop fills me back up, ${nameInput.trim()}. Tasks, thoughts, feelings — I'll sort it all out.`
            : step.body}
        </Text>
      ) : null}

      {/* Subtext */}
      {step.subtext ? <Text style={styles.subtext}>{step.subtext}</Text> : null}

      {/* Name + pronouns (color picker step only) */}
      {step.type === 'color-picker' && (
        <View style={styles.profileSection}>
          <TextInput
            style={[styles.nameInput, nameFocused && { borderBottomColor: BRAND.colors.mossGreen }]}
            placeholder="What should I call you?"
            placeholderTextColor={BRAND.colors.inkMuted}
            autoCapitalize="words"
            returnKeyType="done"
            value={nameInput}
            onChangeText={setNameInput}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
          />
          <View style={styles.pronounRow}>
            {PRONOUN_OPTIONS.map((option) => {
              const isSelected = pronounsInput === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setPronounsInput(isSelected ? null : option)}
                  style={[styles.pronounPill, isSelected && styles.pronounPillSelected]}
                >
                  <Text
                    style={[styles.pronounPillText, isSelected && styles.pronounPillTextSelected]}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const flatListRef = useRef<FlatList>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [drainTriggered, setDrainTriggered] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [pronounsInput, setPronounsInput] = useState<string | null>(null);

  // Store action to mark onboarding complete
  const markOnboardingComplete = useGremlyStore((s) => s.markOnboardingComplete);
  const startTraining = useGremlyStore((s) => s.startTraining);
  const setUserProfile = useGremlyStore((s) => s.setUserProfile);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const step = Math.round(offsetX / SCREEN_WIDTH);
      if (step !== currentStep && step >= 0 && step < ONBOARDING_STEPS.length) {
        setCurrentStep(step);
        if (step === 2 && !drainTriggered) setDrainTriggered(true);
      }
    },
    [currentStep],
  );

  const goToStep = useCallback((step: number) => {
    flatListRef.current?.scrollToIndex({ index: step, animated: true });
    setCurrentStep(step);
    if (step === 2) setDrainTriggered(true);
  }, []);

  const handleNext = useCallback(async () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      if (currentStep === 1) {
        setUserProfile(nameInput.trim() || null, pronounsInput);
      }
      goToStep(currentStep + 1);
    }
  }, [currentStep, goToStep, nameInput, pronounsInput, setUserProfile]);

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
        <OnboardingStepView
          step={item}
          drainVisible={drainTriggered}
          nameInput={nameInput}
          setNameInput={setNameInput}
          pronounsInput={pronounsInput}
          setPronounsInput={setPronounsInput}
        />
      </View>
    ),
    [drainTriggered, nameInput, pronounsInput],
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
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 12,
  },
  colorButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorButtonInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  colorName: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  profileSection: {
    marginTop: 16,
    alignItems: 'center',
    width: '100%',
  },
  nameInput: {
    fontFamily: 'Inter-Regular',
    fontSize: 17,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
    paddingVertical: 8,
    maxWidth: 220,
    width: '100%',
    alignSelf: 'center',
  },
  pronounRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  pronounPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: BRAND.colors.borderSubtle,
  },
  pronounPillSelected: {
    backgroundColor: BRAND.colors.mossGreen + '15',
    borderColor: BRAND.colors.mossGreen,
  },
  pronounPillText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
  },
  pronounPillTextSelected: {
    color: BRAND.colors.mossGreen,
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
