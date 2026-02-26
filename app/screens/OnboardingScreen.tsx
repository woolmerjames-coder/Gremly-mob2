/**
 * OnboardingScreen - Multi-step onboarding flow
 *
 * Introduces new users to Gremly and the daily ritual concept.
 * 3 swipeable screens: Welcome, The Ritual, Get Started
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNotificationPreferences } from '../../hooks/useNotificationPreferences';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../ui';
import { Sprout, ArrowDown, Sparkles } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';

// Mascot images
import GREMLY_MASCOT from '../../assets/mascot/gremly-mascot.png';
import GREMLY_FISTBUMP from '../../assets/mascot/fistbumpgremly.png';
import GREMLY_SWEEP from '../../assets/mascot/sweepcomplete.png';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  subtext: string;
  type: 'mascot' | 'icon';
  mascot?: any;
  showRitualRows?: boolean;
  showNotificationSetup?: boolean;
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
    id: 'ritual',
    title: 'The Daily Ritual',
    body: '',
    subtext: '',
    type: 'mascot',
    mascot: GREMLY_SWEEP,
    showRitualRows: true,
    showNotificationSetup: true,
  },
  {
    id: 'start',
    title: 'I help you think',
    body: 'Tap any card to chat with me. I can help you research, break things down, or turn a vague idea into real steps.',
    subtext: "Lost? Tap me on any screen and I'll explain what to do.",
    type: 'mascot',
    mascot: GREMLY_FISTBUMP,
  },
];

/**
 * Renders icon+text rows for the ritual explanation
 */
function RitualRows() {
  return (
    <View style={styles.ritualRowsContainer}>
      <View style={styles.ritualRow}>
        <ArrowDown size={20} color={BRAND.colors.mossGreen} />
        <Text style={styles.ritualRowText}>Drop 3+ thoughts anytime (feeds me)</Text>
      </View>
      <View style={styles.ritualRow}>
        <Sparkles size={20} color={BRAND.colors.mossGreen} />
        <Text style={styles.ritualRowText}>Sweep 3+ cards before bed (rests me)</Text>
      </View>
    </View>
  );
}

/**
 * Notification time setup component for Screen 2
 */
function NotificationSetup({
  morningTime,
  eveningTime,
  onMorningTimeChange,
  onEveningTimeChange,
}: {
  morningTime: Date;
  eveningTime: Date;
  onMorningTimeChange: (date: Date) => void;
  onEveningTimeChange: (date: Date) => void;
}) {
  return (
    <View style={notifStyles.container}>
      {/* Divider */}
      <View style={notifStyles.divider} />

      <Text style={notifStyles.sectionTitle}>When should I remind you?</Text>

      {/* Morning reminder */}
      <View style={notifStyles.timeRow}>
        <Text style={notifStyles.timeLabel}>Morning check-in</Text>
        <DateTimePicker
          value={morningTime}
          mode="time"
          display="compact"
          onChange={(event, date) => {
            if (date) onMorningTimeChange(date);
          }}
        />
      </View>

      {/* Evening reminder */}
      <View style={notifStyles.timeRow}>
        <Text style={notifStyles.timeLabel}>Evening sweep</Text>
        <DateTimePicker
          value={eveningTime}
          mode="time"
          display="compact"
          onChange={(event, date) => {
            if (date) onEveningTimeChange(date);
          }}
        />
      </View>

      <Text style={notifStyles.settingsHint}>
        You can adjust times or turn off reminders in Settings.
      </Text>
    </View>
  );
}

const notifStyles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 16,
    marginBottom: 0,
    paddingHorizontal: 8,
  },
  divider: {
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
    marginBottom: 16,
    opacity: 0.5,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
    marginBottom: 12,
    textAlign: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: BRAND.colors.surface,
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: BRAND.radius.md,
    marginBottom: 6,
  },
  timeLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: BRAND.colors.charcoalInk,
  },
  settingsHint: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
});

/**
 * Renders a single onboarding step
 */
interface OnboardingStepViewProps {
  step: OnboardingStep;
  morningTime?: Date;
  eveningTime?: Date;
  onMorningTimeChange?: (date: Date) => void;
  onEveningTimeChange?: (date: Date) => void;
}

function OnboardingStepView({
  step,
  morningTime,
  eveningTime,
  onMorningTimeChange,
  onEveningTimeChange,
}: OnboardingStepViewProps) {
  return (
    <View style={styles.stepContainer}>
      {/* Visual element */}
      <View style={styles.visualContainer}>
        {step.type === 'mascot' && step.mascot && (
          <Image
            source={step.mascot}
            style={[styles.mascotImage, step.showNotificationSetup && { width: 120, height: 120 }]}
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

      {/* Ritual rows (only on ritual step) */}
      {step.showRitualRows && <RitualRows />}

      {/* Ritual subtext (between ritual rows and notification setup) */}
      {step.showRitualRows && (
        <View style={styles.ritualSubtextContainer}>
          <Text style={styles.ritualSubtextBold}>Complete the ritual and I age by 1.</Text>
          <Text style={styles.ritualSubtextMuted}>Miss a day? No stress, I just wait.</Text>
        </View>
      )}

      {/* Notification setup (only on ritual step) */}
      {step.showNotificationSetup &&
        morningTime &&
        eveningTime &&
        onMorningTimeChange &&
        onEveningTimeChange && (
          <NotificationSetup
            morningTime={morningTime}
            eveningTime={eveningTime}
            onMorningTimeChange={onMorningTimeChange}
            onEveningTimeChange={onEveningTimeChange}
          />
        )}

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

  // Notification preferences - integrates with existing system
  const { preferences: notificationPrefs, savePreferences: saveNotificationPrefs } =
    useNotificationPreferences();

  // Local state for notification setup (initialized from defaults, synced when prefs load)
  const [morningTime, setMorningTime] = useState<Date>(() => {
    const date = new Date();
    date.setHours(8, 0, 0, 0);
    return date;
  });
  const [eveningTime, setEveningTime] = useState<Date>(() => {
    const date = new Date();
    date.setHours(21, 0, 0, 0);
    return date;
  });
  const hasInitializedFromPrefs = useRef(false);

  // Sync local state when preferences load (only once)
  useEffect(() => {
    if (notificationPrefs && !hasInitializedFromPrefs.current) {
      hasInitializedFromPrefs.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional sync from async-loaded prefs
      setMorningTime(notificationPrefs.morningTime);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional sync from async-loaded prefs
      setEveningTime(notificationPrefs.eveningTime);
    }
  }, [notificationPrefs]);

  // Save notification settings
  const saveNotificationSettings = useCallback(async () => {
    if (!notificationPrefs) return;

    try {
      await saveNotificationPrefs({
        morningEnabled: true,
        morningTime: morningTime,
        eveningEnabled: true,
        eveningTime: eveningTime,
        afternoonEnabled: notificationPrefs.afternoonEnabled,
        afternoonTime: notificationPrefs.afternoonTime,
        weeklyEnabled: notificationPrefs.weeklyEnabled,
        weeklyTime: notificationPrefs.weeklyTime,
        weeklyDay: notificationPrefs.weeklyDay,
        timezone: notificationPrefs.timezone,
      });
      console.log('[Onboarding] Notification preferences saved');
    } catch (err) {
      console.error('[Onboarding] Failed to save notification preferences:', err);
    }
  }, [notificationPrefs, morningTime, eveningTime, saveNotificationPrefs]);

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
    // If leaving Screen 2 (ritual screen), save notification preferences
    if (currentStep === 1) {
      await saveNotificationSettings();
    }

    if (currentStep < ONBOARDING_STEPS.length - 1) {
      goToStep(currentStep + 1);
    }
  }, [currentStep, goToStep, saveNotificationSettings]);

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
      <View style={styles.stepWrapper}>
        <OnboardingStepView
          step={item}
          morningTime={morningTime}
          eveningTime={eveningTime}
          onMorningTimeChange={setMorningTime}
          onEveningTimeChange={setEveningTime}
        />
      </View>
    ),
    [morningTime, eveningTime],
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
  // Ritual rows
  ritualRowsContainer: {
    gap: 16,
    marginBottom: 8,
    width: '100%',
  },
  ritualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
  },
  ritualRowText: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    flex: 1,
  },
  ritualSubtextContainer: {
    marginTop: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  ritualSubtextBold: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
  },
  ritualSubtextMuted: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginTop: 2,
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
