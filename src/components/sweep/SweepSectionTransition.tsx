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
import {
  CheckSquare,
  Check,
  Repeat,
  RotateCcw,
  StickyNote,
  Calendar,
  Bell,
  ListChecks,
  PenLine,
  ArrowRight,
  ArrowLeft,
  X,
} from 'lucide-react-native';
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
  sectionType: 'todo' | 'habit' | 'note' | 'event';
  itemCount: number;
  onContinue: () => void;
  onClose?: () => void;
  sweepIntent?: 'today' | 'tomorrow' | 'week';
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_BUTTON = require('../../../assets/buttonforHP.png');

const SECTION_CONTENT: Record<'todo' | 'habit' | 'note' | 'event', SectionContent> = {
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
  event: {
    title: 'YOUR EVENTS',
    icon: Calendar,
    rightOptions: ['Set reminders', 'Add prep tasks'],
    leftOption: 'Let them go',
  },
  note: {
    title: 'YOUR NOTES',
    icon: StickyNote,
    rightOptions: ['Turn into action', 'Remind me later', 'Just save it'],
    leftOption: 'Let it go',
  },
};

type WeeklyIconKey =
  | 'calendar'
  | 'bell'
  | 'arrowLeft'
  | 'rotate'
  | 'checkbox'
  | 'check'
  | 'listCheck'
  | 'pencil';

const WEEKLY_ICON_MAP: Record<WeeklyIconKey, LucideIcon> = {
  calendar: Calendar,
  bell: Bell,
  arrowLeft: ArrowLeft,
  rotate: RotateCcw,
  checkbox: CheckSquare,
  check: Check,
  listCheck: ListChecks,
  pencil: PenLine,
};

const WEEKLY_SECTION_COPY: Record<
  'todo' | 'note' | 'event',
  {
    title: string;
    subtitle: string;
    hint: string;
    rows: {
      icon:
        | 'calendar'
        | 'bell'
        | 'arrowLeft'
        | 'rotate'
        | 'checkbox'
        | 'check'
        | 'listCheck'
        | 'pencil';
      bold: string;
      rest: string;
      muted?: boolean;
    }[];
  }
> = {
  todo: {
    title: 'YOUR TODOS',
    subtitle: 'sorting through, one at a time',
    hint: 'on each card you can',
    rows: [
      { icon: 'calendar', bold: 'Tap a day', rest: ' to schedule it, then Keep' },
      { icon: 'bell', bold: 'Add a reminder', rest: ' if you want a nudge' },
      { icon: 'arrowLeft', bold: 'Let go', rest: ' if it no longer matters', muted: true },
    ],
  },
  note: {
    title: 'YOUR NOTES',
    subtitle: 'a few thoughts to revisit',
    hint: 'for each one, decide what is next',
    rows: [
      { icon: 'rotate', bold: 'Resurface later', rest: ' to bring it back in a future sweep' },
      { icon: 'checkbox', bold: 'Make it a todo', rest: ' if it needs doing' },
      { icon: 'check', bold: 'It is fine as is', rest: ' to leave it filed' },
    ],
  },
  event: {
    title: 'YOUR EVENTS',
    subtitle: 'things coming up to get ready for',
    hint: 'on each card you can',
    rows: [
      { icon: 'bell', bold: 'Set a reminder', rest: ' for the day or week before' },
      { icon: 'listCheck', bold: 'Add a prep todo', rest: ' if there is something to do first' },
      {
        icon: 'pencil',
        bold: 'Fix the timing',
        rest: ' by tapping the date if it is off',
        muted: true,
      },
    ],
  },
};

interface WeeklySectionExplainerProps {
  copy: (typeof WEEKLY_SECTION_COPY)['todo'];
  onContinue: () => void;
  onClose?: () => void;
}

function WeeklySectionExplainer({ copy, onContinue, onClose }: WeeklySectionExplainerProps) {
  const titleIcon: LucideIcon =
    copy.title === 'YOUR NOTES'
      ? StickyNote
      : copy.title === 'YOUR EVENTS'
        ? Calendar
        : CheckSquare;

  return (
    <Pressable style={styles.container} onPress={onContinue}>
      {onClose && (
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={24} color={BRAND.colors.mossGreen} />
        </TouchableOpacity>
      )}

      <View style={styles.weeklyTitleRow}>
        {React.createElement(titleIcon, {
          size: 24,
          color: BRAND.colors.mossGreen,
          strokeWidth: 2,
        })}
        <Text style={styles.title}>{copy.title}</Text>
      </View>

      <Text style={styles.weeklySubtitle}>{copy.subtitle}</Text>
      <Text style={styles.weeklyHint}>{copy.hint}</Text>

      <View style={styles.weeklyRows}>
        {copy.rows.map((row, idx) => {
          const RowIcon = WEEKLY_ICON_MAP[row.icon];
          const rowMuted = !!row.muted;
          return (
            <View key={`${row.icon}-${idx}`} style={styles.weeklyRow}>
              <View
                style={[
                  styles.weeklyRowChip,
                  rowMuted ? styles.weeklyRowChipMuted : styles.weeklyRowChipNormal,
                ]}
              >
                <RowIcon
                  size={14}
                  strokeWidth={2}
                  color={rowMuted ? '#A8842F' : BRAND.colors.mossGreen}
                />
              </View>
              <Text style={styles.weeklyRowText}>
                <Text style={styles.weeklyRowLead}>{row.bold}</Text>
                {row.rest}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />

      <View style={styles.buttonContainer}>
        <Animated.Image source={GREMLY_BUTTON} style={styles.gremlyButton} resizeMode="contain" />
        <Text style={styles.buttonHint}>tap to start</Text>
      </View>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function SweepSectionTransition({
  sectionType,
  itemCount,
  onContinue,
  onClose,
  sweepIntent = 'tomorrow',
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

  if (sweepIntent === 'week') {
    const copy =
      WEEKLY_SECTION_COPY[sectionType as 'todo' | 'note' | 'event'] ?? WEEKLY_SECTION_COPY.todo;
    return <WeeklySectionExplainer copy={copy} onContinue={onContinue} onClose={onClose} />;
  }

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
      <Text style={styles.subtitle}>
        {sectionType === 'event'
          ? `we have ${itemCount} coming up`
          : `we have ${itemCount} to sort through`}
      </Text>

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
  weeklyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
  },
  weeklySubtitle: {
    fontSize: 15,
    color: BRAND.colors.inkMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  weeklyHint: {
    fontSize: 12,
    color: BRAND.colors.inkSubtle,
    marginTop: 8,
    marginBottom: 26,
    textAlign: 'center',
  },
  weeklyRows: {
    width: '100%',
    paddingHorizontal: 14,
    gap: 12,
  },
  weeklyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  weeklyRowChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  weeklyRowChipNormal: {
    backgroundColor: '#cfe0cf',
  },
  weeklyRowChipMuted: {
    backgroundColor: '#f0e6cf',
  },
  weeklyRowText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: BRAND.colors.charcoalInk,
    fontWeight: '400',
  },
  weeklyRowLead: {
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
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
