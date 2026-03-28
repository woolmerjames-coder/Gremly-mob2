/**
 * LockInCheckpointStep - Lock-In Commitment Check-in
 *
 * Animated checkpoint page shown at the start of Evening Sweep (after intro).
 * Users confirm whether they completed their locked-in items.
 *
 * Animation sequence:
 * 1. Diamond icon appears centered with pulsing glow
 * 2. "Lock-In Check" text fades in below
 * 3. After 1.5s, title slides up to become header
 * 4. Lock-in items fade in from below
 *
 * Each item has a 3-option toggle: Done / Tomorrow / Archive
 * - Tomorrow is pre-selected (safe default)
 * - Done triggers celebration animation
 * - Archive removes the commitment
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { getDateService } from '../../../lib/date';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  interpolate,
  Easing,
  SlideInDown,
  cancelAnimation,
} from 'react-native-reanimated';
import ConfettiCannon from 'react-native-confetti-cannon';
import { Text } from '../../../ui';
import { Icon } from '../../../design-system/Icon';
import { Sparkles, Check } from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import * as Haptics from 'expo-haptics';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { selectTodayLockedItemsIncludingCompleted } from '../../../lib/store/selectors';

// Lock-in diamond icon
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LOCKIN_ICON = require('../../../assets/lockin_icon.png');

// Gremly mascot for header
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../../../assets/mascot/gremly-mascot.png');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Types
interface LockInItem {
  id: string;
  type: 'todo' | 'habit';
  name: string;
  isCompleted: boolean; // Already marked done before sweep
}

type LockInDecision = 'done' | 'tomorrow' | 'archive';

interface LockInCheckpointStepProps {
  onContinue: (decisions: Map<string, LockInDecision>) => void;
  onClose?: () => void;
}

export function LockInCheckpointStep({ onContinue, onClose }: LockInCheckpointStepProps) {
  // Track if we've already skipped (to prevent infinite loop)
  const hasSkipped = useRef(false);

  // Decisions for each item (default to 'tomorrow')
  const [decisions, setDecisions] = useState<Map<string, LockInDecision>>(new Map());

  // Track which items have been celebrated (for animation)
  // Start with initially completed items already celebrated
  const [celebratedItems, setCelebratedItems] = useState<Set<string>>(() => new Set());

  // Confetti celebration when all items are done
  const confettiRef = useRef<any>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  // Get locked items from store (including completed ones for celebration)
  const lockedItems = useGremlyStore((state) => selectTodayLockedItemsIncludingCompleted(state));

  // Get raw data from store (stable references)
  const todos = useGremlyStore((state) => state.todos);
  const habitProgress = useGremlyStore((state) => state.habitProgress);

  // Derive completion status with useMemo (computed once, cached)
  const completedTodoIds = useMemo(
    () => new Set(todos.filter((t) => t.completed_at).map((t) => t.id)),
    [todos],
  );

  const completedHabitIds = useMemo(() => {
    const today = getDateService().today();
    return new Set(habitProgress.filter((p) => p.occurred_day === today).map((p) => p.habit_id));
  }, [habitProgress]);

  // Transform to LockInItem format
  const items: LockInItem[] = useMemo(() => {
    return lockedItems.map((item) => {
      const isTodo = 'name' in item && !('frequency' in item);
      const isCompleted = isTodo ? completedTodoIds.has(item.id) : completedHabitIds.has(item.id);

      return {
        id: item.id,
        type: isTodo ? 'todo' : 'habit',
        name: (item as any).name || (item as any).title || 'Untitled',
        isCompleted,
      };
    });
  }, [lockedItems, completedTodoIds, completedHabitIds]);

  // Initialize decisions - already completed items default to 'done', others to 'tomorrow'
  // Also initialize celebratedItems for already completed items
  useEffect(() => {
    const initial = new Map<string, LockInDecision>();
    const initialCelebrated = new Set<string>();
    items.forEach((item) => {
      initial.set(item.id, item.isCompleted ? 'done' : 'tomorrow');
      if (item.isCompleted) {
        initialCelebrated.add(item.id);
      }
    });
    // Batch state updates together to avoid cascading renders
    queueMicrotask(() => {
      setDecisions(initial);
      setCelebratedItems(initialCelebrated);
    });
  }, [items]);

  // Animation values
  const iconScale = useSharedValue(0);
  const iconGlow = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const headerTranslateY = useSharedValue(0);
  const instructionsOpacity = useSharedValue(0); // Gremly + text fade in after
  const contentOpacity = useSharedValue(0);

  // Start intro animation sequence (snappy but intentional)
  useEffect(() => {
    if (items.length === 0) return;

    // Diamond appears with bounce
    iconScale.value = withSpring(1, { damping: 12, stiffness: 100 });

    // Diamond glows intensely
    iconGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.2, { duration: 500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );

    // Title fades in quickly
    titleOpacity.value = withDelay(100, withTiming(1, { duration: 250 }));

    // After intro, transition faster
    const timer = setTimeout(() => {
      // Slide header to top
      headerTranslateY.value = withTiming(-250, {
        duration: 350,
        easing: Easing.inOut(Easing.cubic),
      });

      // Stop glow when reaching top
      iconGlow.value = withDelay(150, withTiming(0, { duration: 200 }));

      // Fade in Gremly + instructions after header settles
      instructionsOpacity.value = withDelay(150, withTiming(1, { duration: 250 }));

      // Fade in content (items list)
      contentOpacity.value = withDelay(200, withTiming(1, { duration: 300 }));
    }, 800);

    return () => clearTimeout(timer);
  }, [items.length]);

  // Cleanup animations on unmount
  useEffect(() => {
    return () => {
      cancelAnimation(iconScale);
      cancelAnimation(iconGlow);
      cancelAnimation(titleOpacity);
      cancelAnimation(headerTranslateY);
      cancelAnimation(instructionsOpacity);
      cancelAnimation(contentOpacity);
    };
  }, []);

  // Trigger confetti when all items are marked done by user action
  useEffect(() => {
    const allDone = items.length > 0 && Array.from(decisions.values()).every((d) => d === 'done');

    // Only trigger if user actually marked all items done (celebratedItems tracks user actions)
    const userMarkedAllDone = allDone && celebratedItems.size === items.length;

    if (userMarkedAllDone && !showConfetti) {
      // Use queueMicrotask to avoid synchronous setState in effect
      queueMicrotask(() => {
        setShowConfetti(true);
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        confettiRef.current?.start();
      }, 100);
    }
  }, [decisions, items.length, celebratedItems.size, showConfetti]);

  // Handle decision change
  const handleDecisionChange = useCallback(
    (itemId: string, decision: LockInDecision) => {
      setDecisions((prev) => {
        const next = new Map(prev);
        next.set(itemId, decision);
        return next;
      });

      // Haptic feedback varies by decision type
      switch (decision) {
        case 'done':
          if (!celebratedItems.has(itemId)) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setCelebratedItems((prev) => new Set(prev).add(itemId));
          } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          break;
        case 'tomorrow':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'archive':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          break;
      }
    },
    [celebratedItems],
  );

  // Handle continue
  const handleContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onContinue(decisions);
  }, [decisions, onContinue]);

  // Animated styles
  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(iconGlow.value, [0, 1], [0.2, 1]),
    shadowRadius: interpolate(iconGlow.value, [0, 1], [8, 35]),
  }));

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const titleFadeStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
  }));

  const instructionsStyle = useAnimatedStyle(() => ({
    opacity: instructionsOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  // Calculate stats
  const doneCount = Array.from(decisions.values()).filter((d) => d === 'done').length;
  const totalCount = items.length;

  // If no locked items, skip this step (only once)
  useEffect(() => {
    if (items.length === 0 && !hasSkipped.current) {
      hasSkipped.current = true;
      onContinue(new Map());
    }
  }, [items.length, onContinue]);

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Close button */}
      {onClose && (
        <Animated.View style={[styles.closeButton, contentStyle]}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityLabel="Close">
            <Icon name="X" size="sm" color={BRAND.colors.charcoalInk} strokeWidth={2} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Header - Diamond + Title (horizontal, starts centered, slides to top) */}
      <Animated.View style={[styles.header, headerAnimatedStyle]}>
        <Animated.View style={[styles.diamondContainer, iconAnimatedStyle, glowAnimatedStyle]}>
          <Image source={LOCKIN_ICON} style={styles.diamondIcon} resizeMode="contain" />
        </Animated.View>
        <Animated.Text style={[styles.headerTitle, titleFadeStyle]}>Lock-In Check</Animated.Text>
      </Animated.View>

      {/* Instructions - Gremly + text (appears after header settles) */}
      <Animated.View style={[styles.instructionsContainer, instructionsStyle]}>
        <Image source={GREMLY_MASCOT} style={styles.instructionsMascot} resizeMode="contain" />
        <Text style={styles.instructionsText}>
          Did you crush it? Tap Done, or slide to tomorrow. No stress!
        </Text>
      </Animated.View>

      {/* Celebration message when all done */}
      {doneCount === totalCount && totalCount > 0 && (
        <Animated.View style={[styles.progressContainer, contentStyle]}>
          <View style={styles.progressComplete}>
            <Sparkles size={16} color={BRAND.colors.goldenPear} />
            <Text style={styles.progressTextComplete}>You crushed it!</Text>
          </View>
        </Animated.View>
      )}

      {/* Items list */}
      <Animated.ScrollView
        style={[styles.itemsContainer, contentStyle]}
        contentContainerStyle={styles.itemsContent}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            <LockInItemRow
              item={item}
              decision={decisions.get(item.id) || 'tomorrow'}
              onDecisionChange={(decision) => handleDecisionChange(item.id, decision)}
              isCelebrated={celebratedItems.has(item.id)}
              index={index}
            />
            {index < items.length - 1 && <View style={styles.itemDivider} />}
          </React.Fragment>
        ))}
      </Animated.ScrollView>

      {/* Continue button */}
      <Animated.View style={[styles.buttonContainer, contentStyle]}>
        <Text style={styles.defaultHint}>Items default to Tomorrow if unchanged</Text>
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.continueButtonText}>Continue to Sweep →</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Confetti */}
      {showConfetti && (
        <ConfettiCannon
          ref={confettiRef}
          count={80}
          origin={{ x: SCREEN_WIDTH / 2, y: -20 }}
          autoStart={false}
          fadeOut={true}
          explosionSpeed={300}
          fallSpeed={2500}
          colors={[
            BRAND.colors.mossGreen,
            BRAND.colors.sageMist,
            BRAND.colors.goldenPear,
            '#FFFFFF',
          ]}
        />
      )}
    </View>
  );
}

// Individual item row with toggle
interface LockInItemRowProps {
  item: LockInItem;
  decision: LockInDecision;
  onDecisionChange: (decision: LockInDecision) => void;
  isCelebrated: boolean;
  index: number;
}

function LockInItemRow({
  item,
  decision,
  onDecisionChange,
  isCelebrated,
  index,
}: LockInItemRowProps) {
  const isCompleted = decision === 'done';

  // Diamond scale animation for completion
  const diamondScale = useSharedValue(1);

  // Celebration animations
  const celebrationScale = useSharedValue(1);
  const rowGlow = useSharedValue(0);

  useEffect(() => {
    if (isCelebrated && isCompleted) {
      celebrationScale.value = withSequence(
        withTiming(1.02, { duration: 150 }),
        withSpring(1, { damping: 10 }),
      );
      rowGlow.value = withSequence(
        withTiming(1, { duration: 200 }),
        withTiming(0, { duration: 600 }),
      );
    }
  }, [isCelebrated, isCompleted]);

  const handleComplete = () => {
    if (isCompleted) {
      // Toggle back to tomorrow (undo)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onDecisionChange('tomorrow');
    } else {
      // Mark as done with bounce animation
      diamondScale.value = withSequence(
        withSpring(1.15, { damping: 8, stiffness: 400 }),
        withSpring(1, { damping: 12, stiffness: 300 }),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDecisionChange('done');
    }
  };

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: celebrationScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    backgroundColor:
      interpolate(rowGlow.value, [0, 1], [0, 0.1]) > 0.05
        ? `rgba(243, 195, 72, ${interpolate(rowGlow.value, [0, 1], [0, 0.15])})`
        : 'transparent',
  }));

  const diamondAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: diamondScale.value }],
  }));

  return (
    <Animated.View
      style={[styles.itemCard, rowAnimatedStyle, glowStyle]}
      entering={SlideInDown.delay(index * 60).duration(300)}
    >
      {/* Item name */}
      <Text style={styles.itemName} numberOfLines={2}>
        {item.name}
      </Text>

      {/* Actions row */}
      <View style={styles.actionsRow}>
        {/* Left side: pill buttons */}
        <View style={styles.pillButtons}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDecisionChange('tomorrow');
            }}
            style={[
              styles.pill,
              decision === 'tomorrow' && styles.pillSelected,
              isCompleted && styles.pillDisabled,
            ]}
            disabled={isCompleted}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.pillText,
                decision === 'tomorrow' && styles.pillTextSelected,
                isCompleted && styles.pillTextDisabled,
              ]}
            >
              Tomorrow
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              onDecisionChange('archive');
            }}
            style={[
              styles.pill,
              decision === 'archive' && styles.pillSelected,
              isCompleted && styles.pillDisabled,
            ]}
            disabled={isCompleted}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.pillText,
                decision === 'archive' && styles.pillTextSelected,
                isCompleted && styles.pillTextDisabled,
              ]}
            >
              Archive
            </Text>
          </TouchableOpacity>
        </View>

        {/* Right side: primary action with diamond */}
        <TouchableOpacity
          onPress={handleComplete}
          style={styles.completedAction}
          activeOpacity={0.7}
        >
          <Animated.View style={diamondAnimatedStyle}>
            <View style={[styles.diamond, isCompleted && styles.diamondFilled]}>
              {isCompleted && (
                <View style={styles.checkContainer}>
                  <Check size={14} color="white" strokeWidth={3} />
                </View>
              )}
            </View>
          </Animated.View>
          <Text style={[styles.completedText, isCompleted && styles.completedTextActive]}>
            Completed
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },

  // Header - Diamond + Title
  header: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 5,
  },
  diamondContainer: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: BRAND.colors.mossGreen,
    shadowOffset: { width: 0, height: 0 },
  },
  diamondIcon: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    letterSpacing: -0.5,
  },

  // Instructions - Gremly + text
  instructionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 120,
    paddingBottom: 16,
    gap: 12,
  },
  instructionsMascot: {
    width: 44,
    height: 44,
  },
  instructionsText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: BRAND.colors.charcoalInk,
  },

  // Celebration message
  progressContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  progressComplete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressTextComplete: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.goldenPear,
  },

  // Items list
  itemsContainer: {
    flex: 1,
  },
  itemsContent: {
    paddingBottom: 24,
    paddingTop: 8,
  },

  // Compact card-based item styles
  itemCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  itemDivider: {
    height: 0,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Pill buttons for Tomorrow/Archive
  pillButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillSelected: {
    backgroundColor: BRAND.colors.sageMist,
    borderColor: BRAND.colors.mossGreen,
  },
  pillDisabled: {
    opacity: 0.5,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
  pillTextSelected: {
    color: BRAND.colors.mossGreen,
    fontWeight: '600',
  },
  pillTextDisabled: {
    opacity: 0.6,
  },

  // Completed action with diamond
  completedAction: {
    alignItems: 'center',
    gap: 4,
  },
  diamond: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: BRAND.colors.mossGreen,
    borderRadius: 4,
    transform: [{ rotate: '45deg' }],
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamondFilled: {
    backgroundColor: BRAND.colors.mossGreen,
  },
  checkContainer: {
    transform: [{ rotate: '-45deg' }],
  },
  completedText: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    fontWeight: '500',
  },
  completedTextActive: {
    color: BRAND.colors.mossGreen,
    fontWeight: '700',
  },

  buttonContainer: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 16,
    backgroundColor: BRAND.colors.linenCream,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  defaultHint: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  continueButton: {
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
  },
});

export default LockInCheckpointStep;
