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
import { Sparkles } from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import * as Haptics from 'expo-haptics';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { selectTodayLockedItems } from '../../../lib/store/selectors';

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

  // Get locked items from store
  const lockedItems = useGremlyStore((state) => selectTodayLockedItems(state));

  // Get raw data from store (stable references)
  const todos = useGremlyStore((state) => state.todos);
  const habitProgress = useGremlyStore((state) => state.habitProgress);

  // Derive completion status with useMemo (computed once, cached)
  const completedTodoIds = useMemo(
    () => new Set(todos.filter((t) => t.completed_at).map((t) => t.id)),
    [todos],
  );

  const completedHabitIds = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
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
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.2, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );

    // Title fades in
    titleOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));

    // After intro, transition
    const timer = setTimeout(() => {
      // Slide header to top
      headerTranslateY.value = withTiming(-250, {
        duration: 600,
        easing: Easing.inOut(Easing.cubic),
      });

      // Stop glow when reaching top
      iconGlow.value = withDelay(400, withTiming(0, { duration: 300 }));

      // Fade in Gremly + instructions after header settles
      instructionsOpacity.value = withDelay(500, withTiming(1, { duration: 400 }));

      // Fade in content (items list)
      contentOpacity.value = withDelay(600, withTiming(1, { duration: 500 }));
    }, 1600);

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
          Did you crush it? Tap <Text style={styles.instructionsBold}>Done</Text>, or slide to{' '}
          <Text style={styles.instructionsBold}>tomorrow</Text>.{' '}
          <Text style={styles.instructionsItalic}>No stress!</Text>
        </Text>
      </Animated.View>

      {/* Progress */}
      <Animated.View style={[styles.progressContainer, contentStyle]}>
        {doneCount === totalCount && totalCount > 0 ? (
          <View style={styles.progressComplete}>
            <Sparkles size={16} color={BRAND.colors.goldenPear} />
            <Text style={styles.progressTextComplete}>You crushed it!</Text>
          </View>
        ) : (
          <Text style={styles.progressText}>
            {doneCount} of {totalCount} complete
          </Text>
        )}
      </Animated.View>

      {/* Items list */}
      <Animated.ScrollView
        style={[styles.itemsContainer, contentStyle]}
        contentContainerStyle={styles.itemsContent}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item, index) => (
          <LockInItemRow
            key={item.id}
            item={item}
            decision={decisions.get(item.id) || 'tomorrow'}
            onDecisionChange={(decision) => handleDecisionChange(item.id, decision)}
            isCelebrated={celebratedItems.has(item.id)}
            index={index}
          />
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
  // Diamond position animation (0 = Archive/left, 1 = Tomorrow/middle, 2 = Done/right)
  const diamondPosition = useSharedValue(1); // Default to middle (Tomorrow)

  useEffect(() => {
    const positionMap: Record<LockInDecision, number> = {
      archive: 0,
      tomorrow: 1,
      done: 2,
    };
    diamondPosition.value = positionMap[decision];
  }, [decision]);

  const diamondAnimatedStyle = useAnimatedStyle(() => {
    // Track is now narrower, calculate positions
    const trackWidth = SCREEN_WIDTH - 40 - 32 - 40; // container padding - item padding - track margins
    const positions = [0, trackWidth / 2 - 16, trackWidth - 32]; // left, center, right (adjusted for diamond width)

    return {
      transform: [
        {
          translateX: withSpring(positions[diamondPosition.value] + 20, {
            damping: 15,
            stiffness: 150,
          }),
        },
      ],
    };
  });

  // Celebration animations
  const celebrationScale = useSharedValue(1);
  const rowGlow = useSharedValue(0);

  useEffect(() => {
    if (isCelebrated && decision === 'done') {
      celebrationScale.value = withSequence(
        withTiming(1.03, { duration: 150 }),
        withSpring(1, { damping: 10 }),
      );
      rowGlow.value = withSequence(
        withTiming(1, { duration: 200 }),
        withTiming(0, { duration: 600 }),
      );
    }
  }, [isCelebrated, decision]);

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: celebrationScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    borderColor: rowGlow.value > 0.5 ? BRAND.colors.goldenPear : BRAND.colors.sageMist,
    borderWidth: interpolate(rowGlow.value, [0, 1], [1, 3]),
  }));

  return (
    <Animated.View
      style={[styles.itemRow, rowAnimatedStyle, glowStyle]}
      entering={SlideInDown.delay(index * 80).duration(400)}
    >
      {/* Item name - NO hint text */}
      <View style={styles.itemHeader}>
        <Text style={styles.itemName} numberOfLines={2}>
          {item.name}
        </Text>
      </View>

      {/* Slim Toggle Track with Dots */}
      <View style={styles.toggleTrackContainer}>
        {/* Track line with dots */}
        <View style={styles.toggleTrackLine}>
          <View style={styles.toggleDot} />
          <View style={styles.toggleDotMiddle} />
          <View style={styles.toggleDot} />
        </View>

        {/* Sliding Diamond Indicator */}
        <Animated.View style={[styles.diamondIndicator, diamondAnimatedStyle]}>
          <Image source={LOCKIN_ICON} style={styles.diamondIconSmall} resizeMode="contain" />
        </Animated.View>

        {/* Tappable Areas (invisible, full height for easy tapping) */}
        <View style={styles.toggleTapAreas}>
          <TouchableOpacity
            style={styles.toggleTapArea}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDecisionChange('archive');
            }}
            activeOpacity={0.7}
            accessibilityLabel={`Archive ${item.name}`}
            accessibilityRole="button"
            accessibilityState={{ selected: decision === 'archive' }}
          />
          <TouchableOpacity
            style={styles.toggleTapArea}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDecisionChange('tomorrow');
            }}
            activeOpacity={0.7}
            accessibilityLabel={`Move ${item.name} to tomorrow`}
            accessibilityRole="button"
            accessibilityState={{ selected: decision === 'tomorrow' }}
          />
          <TouchableOpacity
            style={styles.toggleTapArea}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onDecisionChange('done');
            }}
            activeOpacity={0.7}
            accessibilityLabel={`Mark ${item.name} as done`}
            accessibilityRole="button"
            accessibilityState={{ selected: decision === 'done' }}
          />
        </View>
      </View>

      {/* Labels below track */}
      <View style={styles.toggleLabels}>
        <Text style={[styles.toggleLabel, decision === 'archive' && styles.toggleLabelActive]}>
          Archive
        </Text>
        <Text style={[styles.toggleLabel, decision === 'tomorrow' && styles.toggleLabelActive]}>
          Tomorrow
        </Text>
        <Text style={[styles.toggleLabel, decision === 'done' && styles.toggleLabelActive]}>
          Done ✓
        </Text>
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
    paddingBottom: 8,
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
  instructionsBold: {
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
  },
  instructionsItalic: {
    fontStyle: 'italic',
    color: BRAND.colors.inkMuted,
  },

  // Progress
  progressContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  progressText: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    fontWeight: '500',
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
    paddingHorizontal: 20,
    paddingBottom: 24,
  },

  itemRow: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.colors.sageMist,
    marginBottom: 12,
  },
  itemHeader: {
    marginBottom: 12,
  },
  itemName: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },

  // Toggle track - slim line with dots
  toggleTrackContainer: {
    height: 40,
    justifyContent: 'center',
    position: 'relative',
  },
  toggleTrackLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 4,
    backgroundColor: 'rgba(191, 216, 192, 0.4)',
    borderRadius: 2,
    marginHorizontal: 20,
  },
  toggleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: BRAND.colors.sageMist,
    marginHorizontal: -6,
  },
  toggleDotMiddle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: BRAND.colors.sageMist,
  },
  diamondIndicator: {
    position: 'absolute',
    top: 4,
    left: 0,
    width: 32,
    height: 32,
    backgroundColor: BRAND.colors.surface,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: BRAND.colors.mossGreen,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: BRAND.colors.sageMist,
  },
  diamondIconSmall: {
    width: 20,
    height: 20,
  },
  toggleTapAreas: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  toggleTapArea: {
    flex: 1,
  },
  toggleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    flex: 1,
  },
  toggleLabelActive: {
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
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
