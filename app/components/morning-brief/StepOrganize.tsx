/**
 * StepOrganize - Step 4 of the Morning Brief flow
 *
 * Single-purpose CTA screen: one button to trigger AI organize,
 * or skip to arrange manually. Reuses OrganizeButton's internal
 * loading state, spinner, and API call.
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, Pressable, Image, StyleSheet, Animated, Easing } from 'react-native';
import { Text } from '../../../ui';
import { ChevronLeft } from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { useCapacityForDate, useCalendarEventsForDate } from '../../../lib/store/capacitySelectors';
import {
  organizeDay,
  buildOrganizeDayRequest,
  type TaskAssignment,
} from '../../../lib/api/organizeDay';
import { getDateService } from '../../../lib/date';
import {
  selectCompletionsInRolling7Days,
  selectCompletionsInRolling30Days,
} from '../../../lib/store/selectors';

// eslint-disable-next-line @typescript-eslint/no-var-requires -- React Native image import
const MORNING_BRIEF_GREMLY = require('../../../assets/mascot/morningbriefgremly.png');

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface StepOrganizeProps {
  // Passed through to OrganizeButton
  targetDate?: string;
  isPrioritizing: boolean;
  selectedIds: Set<string>;
  lockedIds: Set<string>;
  isOverCapacity: boolean;

  // Auto-skip when nothing to organize
  hasTasksToOrganize: boolean;

  // Callbacks
  onOrganizeComplete: (summary: string, reasoning: string[]) => void;
  onOrganizeError: (error: string) => void;
  onAnimationStart: (assignments: TaskAssignment[]) => void;
  onAnimationComplete: () => void;

  // Save parked items after organize
  onSaveParked?: () => void;

  // Navigation
  onContinue: () => void;
  onSkip: () => void;
  onBack?: () => void;
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function StepOrganize({
  targetDate,
  isPrioritizing,
  selectedIds,
  lockedIds,
  isOverCapacity,
  hasTasksToOrganize,
  onOrganizeComplete,
  onOrganizeError,
  onAnimationStart,
  onAnimationComplete,
  onSaveParked,
  onContinue,
  onSkip,
  onBack,
}: StepOrganizeProps) {
  // Auto-skip when there's nothing to organize
  useEffect(() => {
    if (!hasTasksToOrganize) {
      onContinue();
    }
  }, [hasTasksToOrganize, onContinue]);

  // ── Organize logic (inlined from OrganizeButton) ──────────────
  type OrganizePhase = 'idle' | 'organizing' | 'animating' | 'complete';
  const [phase, setPhase] = useState<OrganizePhase>('idle');

  const [progressAnim] = useState(() => new Animated.Value(0));
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const pulseCompositeRef = useRef<Animated.CompositeAnimation | null>(null);

  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const applyOrganizeAssignments = useGremlyStore((s) => s.applyOrganizeAssignments);
  const slotUnpositionedTasks = useGremlyStore((s) => s.slotUnpositionedTasks);
  const hiddenTodayIds = useGremlyStore((s) => s.hiddenTodayIds);
  const habitRolling7 = useGremlyStore(selectCompletionsInRolling7Days);
  const habitRolling30 = useGremlyStore(selectCompletionsInRolling30Days);

  const today = targetDate ?? getDateService().getCurrentDate();
  const currentHour = targetDate ? 0 : getDateService().getHour();

  const capacity = useCapacityForDate(today);
  const calendarEvents = useCalendarEventsForDate(today);

  useEffect(() => {
    if (phase === 'organizing') {
      pulseCompositeRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseCompositeRef.current.start();
    } else {
      pulseCompositeRef.current?.stop();
      pulseAnim.setValue(1);
    }
    return () => {
      pulseCompositeRef.current?.stop();
    };
  }, [phase, pulseAnim]);

  const isDisabled = isPrioritizing && (isOverCapacity || (selectedIds && selectedIds.size === 0));
  const isOrganizing = phase === 'organizing' || phase === 'animating';

  const startProgressAnimation = () => {
    progressAnim.setValue(0);
    setPhase('organizing');
    Animated.timing(progressAnim, {
      toValue: 0.85,
      duration: 8000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const completeProgressAnimation = (callback: () => void) => {
    progressAnim.stopAnimation(() => {
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start(() => {
        setTimeout(() => {
          setPhase('complete');
          progressAnim.setValue(0);
          callback();
        }, 200);
      });
    });
  };

  const handleOrganize = async () => {
    if (phase !== 'idle' || isDisabled) return;
    startProgressAnimation();

    try {
      const filteredTodos =
        isPrioritizing && selectedIds ? todos.filter((t) => selectedIds.has(t.id)) : todos;
      const filteredHabits =
        isPrioritizing && selectedIds ? habits.filter((h) => selectedIds.has(h.id)) : habits;

      const request = buildOrganizeDayRequest({
        todos: filteredTodos,
        habits: filteredHabits,
        calendarEvents,
        capacity,
        today,
        currentHour,
        hiddenTodayIds,
        habitRolling7,
        habitRolling30,
        lockedIds: isPrioritizing ? lockedIds : undefined,
      });

      const response = await organizeDay(request);

      if (response.error) {
        completeProgressAnimation(() => {
          setPhase('idle');
          onOrganizeError(response.summary || 'Something went wrong');
        });
        return;
      }

      completeProgressAnimation(() => {
        setPhase('animating');
        if (response.assignments.length > 0) {
          onAnimationStart(response.assignments);
        }
        const animationDuration = 400 + response.assignments.length * 150;
        setTimeout(() => {
          if (response.assignments.length > 0) {
            applyOrganizeAssignments(response.assignments);
          }
          slotUnpositionedTasks();
          onAnimationComplete();
          setPhase('idle');
          onOrganizeComplete(response.summary, response.reasoning ?? []);
          onSaveParked?.();
          setTimeout(() => onContinue(), 800);
        }, animationDuration);
      });
    } catch {
      completeProgressAnimation(() => {
        setPhase('idle');
        onOrganizeError('Failed to organize tasks');
      });
    }
  };

  // ── Button label + style logic ────────────────────────────────
  const getButtonLabel = (): string => {
    if (isOrganizing) return 'Organizing your day...';
    if (isOverCapacity) return 'Park some items to continue';
    if (isPrioritizing && selectedIds && selectedIds.size === 0) return 'Select some tasks first';
    return '✦ Organize my day';
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.outerContainer}>
      {/* Centered content */}
      <View style={styles.content}>
        {/* Mascot */}
        <Image source={MORNING_BRIEF_GREMLY} style={styles.mascotImage} resizeMode="contain" />

        {/* Sparkle */}
        <Text style={styles.sparkle}>✦</Text>

        {/* Title + description */}
        <Text style={styles.title}>Let Gremly organize your day</Text>
        <Text style={styles.description}>
          Gremly will slot your priorities into free time around your meetings.
        </Text>
      </View>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.footerRow}>
          {onBack && (
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
              onPress={onBack}
            >
              <ChevronLeft size={20} color={BRAND.colors.inkMuted} />
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.ctaButton,
              onBack ? { flex: 1 } : undefined,
              isDisabled && styles.ctaButtonDisabled,
              isOrganizing && styles.ctaButtonOrganizing,
              pressed && !isDisabled && !isOrganizing && { backgroundColor: '#AECBB0' },
            ]}
            onPress={handleOrganize}
            disabled={!!isDisabled || isOrganizing}
          >
            {isOrganizing && (
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            )}
            <Text style={[styles.ctaText, isDisabled && styles.ctaTextDisabled]}>
              {getButtonLabel()}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.skipPressable, pressed && { opacity: 0.5 }]}
          onPress={onSkip}
        >
          <Text style={styles.skipText}>I'll arrange it myself →</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  mascotImage: {
    width: 120,
    height: 120,
  },
  sparkle: {
    fontSize: 16,
    color: BRAND.colors.mossGreen,
    opacity: 0.3,
    letterSpacing: 2,
    marginTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },

  // ── Footer ──────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: BRAND.colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButton: {
    backgroundColor: '#BFD8C0',
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ctaButtonDisabled: {
    backgroundColor: 'rgba(194,122,107,0.1)',
  },
  ctaButtonOrganizing: {
    backgroundColor: '#E8F0EC',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E5540',
    zIndex: 1,
  },
  ctaTextDisabled: {
    color: '#C27A6B',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(46, 85, 64, 0.25)',
    borderRadius: 16,
  },
  skipPressable: {
    alignItems: 'center',
  },
  skipText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
    paddingVertical: 14,
  },
});

export default StepOrganize;
