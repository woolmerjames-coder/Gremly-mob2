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
  Pressable,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { GREMLY_PALETTES } from '../../lib/constants/gremlyPalettes';
import MascotLottie from '../components/MascotLottie';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  subtext: string;
  type: 'mascot' | 'icon' | 'color-picker' | 'drain';
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: "Hi, I'm Gremly",
    body: 'I help you get things out of your head and into a system that actually works.',
    subtext: 'The more we work together, the more we both grow.',
    type: 'mascot',
  },
  {
    id: 'color',
    title: 'Choose your Gremly',
    body: '',
    subtext: 'You can always change this in settings.',
    type: 'color-picker',
  },
  {
    id: 'start',
    title: 'Feed me your thoughts every day',
    body: "Every drop fills your gremlin back up. Tasks, thoughts, feelings — I'll sort it all out.",
    subtext: 'Tap any card to chat with me along the way.',
    type: 'drain',
  },
];

const PRONOUN_OPTIONS = ['he/him', 'she/her', 'they/them', 'custom'];

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
  customPronouns,
  setCustomPronouns,
}: {
  step: OnboardingStep;
  drainVisible: boolean;
  nameInput: string;
  setNameInput: (v: string) => void;
  pronounsInput: string | null;
  setPronounsInput: (v: string | null) => void;
  customPronouns: string;
  setCustomPronouns: (v: string) => void;
}) {
  const gremlyColor = useGremlyStore((s) => s.gremlyColor);
  const setGremlyColor = useGremlyStore((s) => s.setGremlyColor);
  const [nameFocused, setNameFocused] = useState(false);

  return (
    <View style={styles.stepContainer}>
      {/* Visual element */}
      <View style={styles.visualContainer}>
        {step.type === 'mascot' && (
          <View
            style={{
              minHeight: 240,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'visible',
            }}
          >
            <View style={{ transform: [{ scale: 2 }] }}>
              <MascotLottie showFullColor animationOverride="waving" />
            </View>
          </View>
        )}
        {step.type === 'color-picker' && (
          <View
            style={{
              minHeight: 240,
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
              minHeight: 240,
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
      <Text style={styles.title} maxFontSizeMultiplier={1.3}>
        {step.title}
      </Text>

      {/* Color picker */}
      {step.type === 'color-picker' && (
        <View
          style={styles.colorRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="Gremly color"
        >
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

      {/* Name + pronouns (welcome step only) */}
      {step.type === 'mascot' && (
        <View style={styles.profileCard}>
          <TextInput
            style={[styles.nameInput, nameFocused && styles.nameInputFocused]}
            placeholder="Your name"
            placeholderTextColor={BRAND.colors.inkMuted}
            autoCapitalize="words"
            returnKeyType="done"
            value={nameInput}
            onChangeText={setNameInput}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            allowFontScaling={true}
            accessibilityLabel="Your name"
            accessibilityHint="Enter what Gremly should call you"
          />
          <View
            style={[styles.pronounRow, { marginTop: 10 }]}
            accessibilityRole="radiogroup"
            accessibilityLabel="Pronouns"
          >
            {PRONOUN_OPTIONS.map((option) => {
              const isSelected = pronounsInput === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setPronounsInput(isSelected ? null : option)}
                  style={[styles.pronounPill, isSelected && styles.pronounPillSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
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
          {pronounsInput === 'custom' && (
            <TextInput
              style={[
                styles.customPronounInput,
                nameFocused && { borderBottomColor: BRAND.colors.mossGreen },
              ]}
              placeholder="Type your pronouns"
              placeholderTextColor={BRAND.colors.inkMuted}
              autoCapitalize="none"
              returnKeyType="done"
              value={customPronouns}
              onChangeText={setCustomPronouns}
            />
          )}
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
  const [customPronouns, setCustomPronouns] = useState('');

  // Store actions
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
      if (currentStep === 0) {
        const finalPronouns =
          pronounsInput === 'custom' ? customPronouns.trim() || null : pronounsInput;
        setUserProfile(nameInput.trim() || null, finalPronouns);
      }
      goToStep(currentStep + 1);
    }
  }, [currentStep, goToStep, nameInput, pronounsInput, customPronouns, setUserProfile]);

  const handleComplete = useCallback(async () => {
    navigation.navigate('TrialIntro' as never);
  }, [navigation]);

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
          customPronouns={customPronouns}
          setCustomPronouns={setCustomPronouns}
        />
      </View>
    ),
    [drainTriggered, nameInput, pronounsInput, customPronouns],
  );

  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Skip button */}
      <Pressable
        style={styles.skipButton}
        onPress={handleSkip}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Skip onboarding"
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
        accessibilityLabel="Onboarding steps"
        accessibilityRole="tablist"
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
              accessibilityRole="tab"
              accessibilityLabel={`Page ${index + 1} of ${ONBOARDING_STEPS.length}`}
              accessibilityState={{ selected: index === currentStep }}
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
          <Pressable
            style={styles.secondaryButton}
            onPress={handleComplete}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Next</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.secondaryButton} onPress={handleNext} accessibilityRole="button">
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
    marginBottom: 8,
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
  profileCard: {
    marginTop: 16,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  nameInput: {
    fontFamily: 'Inter-Regular',
    fontSize: 17,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: BRAND.colors.borderSubtle,
    width: '100%',
  },
  nameInputFocused: {
    borderColor: BRAND.colors.mossGreen,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  pronounRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  pronounPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
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
    fontSize: 13,
    color: BRAND.colors.charcoalInk,
  },
  pronounPillTextSelected: {
    color: BRAND.colors.mossGreen,
  },
  customPronounInput: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
    paddingVertical: 6,
    maxWidth: 180,
    width: '100%',
    alignSelf: 'center',
    marginTop: 8,
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
