/**
 * SweepSectionTransition.tsx
 *
 * Transition card shown between sections in the Evening Sweep flow.
 * Displays before Todos, Habits, and Notes sections to orient the user.
 * Shows available actions for each section type.
 * Gremly button to continue after 1 second delay.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { CheckSquare, Repeat, StickyNote, ArrowRight, ArrowLeft, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { BRAND } from '../../../design/brand';
import { Text } from '../../../ui';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type LucideIcon = typeof CheckSquare;

interface SectionContent {
  title: string;
  icon: LucideIcon;
  rightOptions: string[];
  leftOption: string;
}

export interface SweepSectionTransitionProps {
  sectionType: 'todo' | 'habit' | 'note';
  itemCount: number;
  onContinue: () => void;
  onClose?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_BUTTON = require('../../../assets/buttonforHP.png');

const SECTION_CONTENT: Record<'todo' | 'habit' | 'note', SectionContent> = {
  todo: {
    title: 'YOUR TODOS',
    icon: CheckSquare,
    rightOptions: ['Schedule them', 'Remind me later'],
    leftOption: 'Let them go',
  },
  habit: {
    title: 'YOUR HABITS',
    icon: Repeat,
    rightOptions: ['Pick start date', 'Decide later'],
    leftOption: 'Let it go',
  },
  note: {
    title: 'YOUR NOTES',
    icon: StickyNote,
    rightOptions: ['Turn into action', 'Remind me later', 'Just save it'],
    leftOption: 'Let it go',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function SweepSectionTransition({
  sectionType,
  itemCount,
  onContinue,
  onClose,
}: SweepSectionTransitionProps) {
  const [canContinue, setCanContinue] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const pulseScale = useSharedValue(1);
  const pressScale = useSharedValue(1);
  const buttonOpacity = useSharedValue(0);

  const content = SECTION_CONTENT[sectionType];
  const Icon = content.icon;

  // Enable button after 1 second delay, then fade in with pulse
  useEffect(() => {
    const timer = setTimeout(() => {
      setCanContinue(true);
      // Fade in
      buttonOpacity.value = withTiming(1, { duration: 400 });
      // Start gentle pulse after fade in
      pulseScale.value = withDelay(
        400,
        withRepeat(
          withSequence(
            withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          ),
          -1,
          true,
        ),
      );
    }, 1000);
    return () => clearTimeout(timer);
  }, [buttonOpacity, pulseScale]);

  const handlePress = () => {
    if (!canContinue || isPressing) return;

    setIsPressing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Stop the pulse animation - this is valid with reanimated
    cancelAnimation(pulseScale);
    // eslint-disable-next-line react-hooks/immutability
    pulseScale.value = 1;

    // Exaggerated press: squish down, then bounce up, then continue
    pressScale.value = withSequence(
      withTiming(0.85, { duration: 100, easing: Easing.out(Easing.ease) }),
      withTiming(1.15, { duration: 150, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 100 }),
    );

    // Call onContinue after animation
    setTimeout(() => {
      onContinue();
    }, 350);
  };

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: isPressing ? pressScale.value : pulseScale.value }],
    opacity: buttonOpacity.value,
  }));

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Close button */}
      {onClose && (
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={24} color={BRAND.colors.mossGreen} />
        </TouchableOpacity>
      )}

      {/* Title with Icon */}
      <View style={styles.titleRow}>
        <Icon size={24} color={BRAND.colors.mossGreen} strokeWidth={2} />
        <Text style={styles.title}>{content.title}</Text>
      </View>

      {/* Subtitle */}
      <Text style={styles.subtitle}>we have {itemCount} to sort through</Text>

      {/* Options Section */}
      <View style={styles.optionsContainer}>
        {/* Pick one hint */}
        <Text style={styles.pickOneHint}>pick one ↓</Text>

        {/* Right swipe options */}
        {content.rightOptions.map((label, index) => (
          <View key={index} style={styles.optionRow}>
            <Text style={styles.optionLabel}>{label}</Text>
            <ArrowRight size={20} color={BRAND.colors.mossGreen} strokeWidth={2.5} />
          </View>
        ))}

        {/* OR Divider */}
        <View style={styles.orDivider}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.orLine} />
        </View>

        {/* Left swipe option */}
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>{content.leftOption}</Text>
          <ArrowLeft size={20} color={BRAND.colors.inkMuted} strokeWidth={2.5} />
        </View>
      </View>

      {/* Spacer */}
      <View style={{ flex: 1 }} />

      {/* Gremly Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity onPress={handlePress} activeOpacity={1}>
          <Animated.Image
            source={GREMLY_BUTTON}
            style={[styles.gremlyButton, buttonAnimatedStyle]}
            resizeMode="contain"
          />
        </TouchableOpacity>
        <Text style={styles.buttonHint}>tap to continue</Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(191, 216, 192, 0.25)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 140,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    padding: 8,
    zIndex: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'visible',
    paddingVertical: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    letterSpacing: 2,
    textAlign: 'center',
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 15,
    color: BRAND.colors.inkMuted,
    marginTop: 8,
    marginBottom: 32,
  },
  optionsContainer: {
    width: '100%',
    paddingHorizontal: 40,
    marginTop: 32,
  },
  pickOneHint: {
    fontSize: 11,
    color: BRAND.colors.inkSubtle,
    textAlign: 'right',
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  optionLabel: {
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: BRAND.colors.inkSubtle,
    opacity: 0.3,
  },
  orText: {
    fontSize: 12,
    color: BRAND.colors.inkSubtle,
    marginHorizontal: 12,
    fontWeight: '500',
  },
  buttonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  gremlyButton: {
    width: 100,
    height: 100,
  },
  buttonHint: {
    fontSize: 12,
    color: BRAND.colors.inkSubtle,
    marginTop: 8,
  },
});

export default SweepSectionTransition;
