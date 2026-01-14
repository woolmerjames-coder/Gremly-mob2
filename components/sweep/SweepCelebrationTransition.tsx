/**
 * SweepCelebrationTransition Component
 *
 * Full-screen transition celebrating completed items since last sweep.
 * Uses Reanimated for smooth 60fps animations on the UI thread.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  withRepeat,
  runOnJS,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { Check, Repeat, Lightbulb } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { triggerLight, triggerMedium, triggerSuccess } from '../../lib/haptics';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../../assets/mascot/gremly-mascot.png');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_ANIMATED_ITEMS = 6;
const MAX_VISIBLE_TICKS = 6;

// Timing constants (in ms)
const TIMING = {
  initialDelay: 800,
  cardSlideIn: 500,
  cardVisible: 600,
  cardFadeOut: 300,
  tickDelay: 400, // Tick appears this long after card arrives
  betweenCards: 200, // Pause between cards
  consolidateDelay: 600,
  moreTextDuration: 1000,
};

const CELEBRATION_PHRASES = [
  'Already crushed it',
  "You've been busy",
  'Nice momentum',
  'Off to a great start',
  'Making progress',
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CompletedItem {
  id: string;
  name: string;
  type: 'todo' | 'habit' | 'note';
}

interface Props {
  completedItems: CompletedItem[];
  onComplete: () => void;
  onSkip: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Icon Component
// ─────────────────────────────────────────────────────────────────────────────

const ItemIcon: React.FC<{ type: CompletedItem['type']; size?: number; color?: string }> = ({
  type,
  size = 16,
  color = BRAND.colors.charcoalInk,
}) => {
  switch (type) {
    case 'habit':
      return <Repeat size={size} color={color} strokeWidth={2} />;
    case 'note':
      return <Lightbulb size={size} color={color} strokeWidth={2} />;
    default:
      return <Check size={size} color={color} strokeWidth={2} />;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Animated Card Component
// ─────────────────────────────────────────────────────────────────────────────

interface AnimatedCardProps {
  item: CompletedItem;
  onAnimationComplete: () => void;
  onTickTime: () => void;
}

const AnimatedCard: React.FC<AnimatedCardProps> = ({ item, onAnimationComplete, onTickTime }) => {
  const translateX = useSharedValue(-SCREEN_WIDTH);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    // Haptic when card appears
    triggerLight();

    // Slide in
    translateX.value = withTiming(0, {
      duration: TIMING.cardSlideIn,
      easing: Easing.out(Easing.cubic),
    });

    // Trigger tick after card is visible
    const tickTimeout = setTimeout(() => {
      runOnJS(onTickTime)();
    }, TIMING.cardSlideIn + TIMING.tickDelay);

    // Fade out after visible duration
    const fadeTimeout = setTimeout(() => {
      opacity.value = withTiming(0, { duration: TIMING.cardFadeOut });
      scale.value = withTiming(0.8, { duration: TIMING.cardFadeOut });
    }, TIMING.cardSlideIn + TIMING.cardVisible);

    // Signal complete
    const completeTimeout = setTimeout(
      () => {
        runOnJS(onAnimationComplete)();
      },
      TIMING.cardSlideIn + TIMING.cardVisible + TIMING.cardFadeOut,
    );

    return () => {
      clearTimeout(tickTimeout);
      clearTimeout(fadeTimeout);
      clearTimeout(completeTimeout);
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  const truncatedName = item.name.length > 40 ? `${item.name.slice(0, 40)}…` : item.name;

  return (
    <Animated.View style={[styles.card, animatedStyle]}>
      <View style={styles.cardIcon}>
        <ItemIcon type={item.type} />
      </View>
      <Text style={styles.cardText} numberOfLines={1}>
        {truncatedName}
      </Text>
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Animated Tick Component
// ─────────────────────────────────────────────────────────────────────────────

const AnimatedTick: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 200 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 150 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.tick, animatedStyle]}>
      <Check size={24} color={BRAND.colors.mossGreen} strokeWidth={2.5} />
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Consolidated Tick Component (with pulse)
// ─────────────────────────────────────────────────────────────────────────────

const ConsolidatedTick: React.FC<{ count: number; onPulseStart: () => void }> = ({
  count,
  onPulseStart,
}) => {
  const scale = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const burstOpacity = useSharedValue(0.6);
  const burstScale = useSharedValue(0.5);

  useEffect(() => {
    // Haptic on explosion
    triggerSuccess();

    // Burst effect
    burstScale.value = withTiming(1.8, { duration: 400, easing: Easing.out(Easing.cubic) });
    burstOpacity.value = withTiming(0, { duration: 400 });

    // Main tick springs in
    scale.value = withSpring(1, { damping: 10, stiffness: 150 }, () => {
      // Start pulsing after spring completes
      runOnJS(onPulseStart)();
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, // Infinite
        false,
      );
    });
  }, []);

  const tickStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pulseScale.value }],
  }));

  const burstStyle = useAnimatedStyle(() => ({
    transform: [{ scale: burstScale.value }],
    opacity: burstOpacity.value,
  }));

  return (
    <View style={styles.consolidatedContainer}>
      <Animated.View style={[styles.burst, burstStyle]} />
      <Animated.View style={[styles.consolidatedTick, tickStyle]}>
        <Check size={44} color={BRAND.colors.mossGreen} strokeWidth={2.5} />
        <Text style={styles.tickCount}>{count}</Text>
      </Animated.View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const SweepCelebrationTransition: React.FC<Props> = ({
  completedItems,
  onComplete,
  onSkip,
}) => {
  const [phrase] = useState(
    () => CELEBRATION_PHRASES[Math.floor(Math.random() * CELEBRATION_PHRASES.length)],
  );

  // Group items by type
  const groupedItems = useMemo(() => {
    const todos = completedItems.filter((item) => item.type === 'todo');
    const habits = completedItems.filter((item) => item.type === 'habit');
    const notes = completedItems.filter((item) => item.type === 'note');

    // Build ordered sections (only include non-empty)
    const sections: {
      type: 'todos' | 'habits' | 'notes';
      items: CompletedItem[];
      label: string;
    }[] = [];

    if (todos.length > 0) {
      sections.push({
        type: 'todos',
        items: todos.slice(0, MAX_ANIMATED_ITEMS),
        label: todos.length === 1 ? '1 todo done' : `${todos.length} todos done`,
      });
    }
    if (habits.length > 0) {
      sections.push({
        type: 'habits',
        items: habits.slice(0, MAX_ANIMATED_ITEMS),
        label: habits.length === 1 ? '1 habit logged' : `${habits.length} habits logged`,
      });
    }
    if (notes.length > 0) {
      sections.push({
        type: 'notes',
        items: notes.slice(0, MAX_ANIMATED_ITEMS),
        label: notes.length === 1 ? '1 idea captured' : `${notes.length} ideas captured`,
      });
    }

    return sections;
  }, [completedItems]);

  // Animation state
  const [phase, setPhase] = useState<'waiting' | 'cards' | 'more' | 'consolidated' | 'done'>(
    'waiting',
  );
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentItemIndex, setCurrentItemIndex] = useState(-1);
  const [sectionLabel, setSectionLabel] = useState<string | null>(null);
  const [tickCount, setTickCount] = useState(0);
  const [canContinue, setCanContinue] = useState(false);

  const totalAnimated = groupedItems.reduce((sum, section) => sum + section.items.length, 0);
  const remainingCount = completedItems.length - totalAnimated;
  const totalCount = completedItems.length;

  // Start the animation sequence after initial delay
  useEffect(() => {
    if (groupedItems.length === 0) {
      // No items, skip to done - use timeout to avoid sync setState in effect
      const skipTimeout = setTimeout(() => {
        setPhase('consolidated');
      }, 0);
      return () => clearTimeout(skipTimeout);
    }

    const timeout = setTimeout(() => {
      // Start first section
      setPhase('cards');
      setSectionLabel(groupedItems[0].label);
      setCurrentSectionIndex(0);

      // Small delay before first card
      setTimeout(() => {
        setCurrentItemIndex(0);
      }, 400);
    }, TIMING.initialDelay);

    return () => clearTimeout(timeout);
  }, [groupedItems]);

  // Handle card animation complete - move to next card or finish
  const handleCardComplete = useCallback(() => {
    const currentSection = groupedItems[currentSectionIndex];
    if (!currentSection) return;

    const nextItemIndex = currentItemIndex + 1;

    if (nextItemIndex < currentSection.items.length) {
      // More items in this section
      setTimeout(() => {
        setCurrentItemIndex(nextItemIndex);
      }, TIMING.betweenCards);
    } else {
      // Section complete, check for next section
      const nextSectionIndex = currentSectionIndex + 1;

      if (nextSectionIndex < groupedItems.length) {
        // Move to next section
        setTimeout(() => {
          setSectionLabel(groupedItems[nextSectionIndex].label);
          setCurrentSectionIndex(nextSectionIndex);
          setCurrentItemIndex(-1);

          // Small delay before cards start
          setTimeout(() => {
            setCurrentItemIndex(0);
          }, 400);
        }, TIMING.consolidateDelay);
      } else {
        // All sections complete
        setTimeout(() => {
          setSectionLabel(null);
          if (remainingCount > 0) {
            setPhase('more');
            setTimeout(() => {
              setPhase('consolidated');
            }, TIMING.moreTextDuration);
          } else {
            setPhase('consolidated');
          }
        }, TIMING.consolidateDelay);
      }
    }
  }, [currentSectionIndex, currentItemIndex, groupedItems, remainingCount]);

  // Handle tick appearance
  const handleTickTime = useCallback(() => {
    triggerMedium();
    setTickCount((prev) => prev + 1);
  }, []);

  // Handle consolidated tick pulse start
  const handlePulseStart = useCallback(() => {
    setPhase('done');
    setCanContinue(true);
  }, []);

  // Handle tap
  const handleTap = () => {
    if (canContinue) {
      onComplete();
    } else {
      onSkip();
    }
  };

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          {/* Gremly Mascot */}
          <Animated.Image
            source={GREMLY_MASCOT}
            style={styles.mascot}
            resizeMode="contain"
            entering={FadeIn.duration(400)}
          />

          {/* Celebration Phrase */}
          <Animated.Text style={styles.phrase} entering={FadeIn.duration(400).delay(100)}>
            {phrase}
          </Animated.Text>

          {/* Explanatory Text */}
          <Animated.Text style={styles.explanationText} entering={FadeIn.duration(400).delay(200)}>
            SINCE YOUR LAST SWEEP
          </Animated.Text>

          {/* Section Header */}
          {sectionLabel && phase === 'cards' && (
            <Animated.Text
              key={sectionLabel}
              style={styles.sectionLabel}
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(200)}
            >
              {sectionLabel}
            </Animated.Text>
          )}

          {/* Ticks Accumulation Area */}
          <View style={styles.ticksArea}>
            {phase !== 'consolidated' && phase !== 'done' && (
              <View style={styles.ticksRow}>
                {Array.from({ length: Math.min(tickCount, MAX_VISIBLE_TICKS) }).map((_, idx) => (
                  <AnimatedTick key={`tick-${idx}`} />
                ))}
                {tickCount > MAX_VISIBLE_TICKS && (
                  <Animated.Text style={styles.tickOverflow} entering={FadeIn.duration(200)}>
                    +{tickCount - MAX_VISIBLE_TICKS}
                  </Animated.Text>
                )}
              </View>
            )}

            {(phase === 'consolidated' || phase === 'done') && (
              <ConsolidatedTick count={totalCount} onPulseStart={handlePulseStart} />
            )}
          </View>

          {/* Card Animation Area */}
          <View style={styles.cardArea}>
            {phase === 'cards' &&
              currentItemIndex >= 0 &&
              currentSectionIndex < groupedItems.length &&
              currentItemIndex < groupedItems[currentSectionIndex].items.length && (
                <AnimatedCard
                  key={groupedItems[currentSectionIndex].items[currentItemIndex].id}
                  item={groupedItems[currentSectionIndex].items[currentItemIndex]}
                  onAnimationComplete={handleCardComplete}
                  onTickTime={handleTickTime}
                />
              )}
          </View>

          {/* "+X more" text */}
          {phase === 'more' && (
            <Animated.Text
              style={styles.moreText}
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(300)}
            >
              +{remainingCount} more
            </Animated.Text>
          )}

          {/* Skip/Continue Hint */}
          <Animated.Text style={styles.hint} entering={FadeIn.duration(300).delay(1000)}>
            {canContinue ? 'tap to continue' : 'tap to skip'}
          </Animated.Text>
        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND.colors.sageMist,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  mascot: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  phrase: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 8,
  },
  explanationText: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    letterSpacing: 1.5,
    marginBottom: 32,
  },
  ticksArea: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  ticksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  tick: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tickOverflow: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
    marginLeft: 8,
  },
  consolidatedContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  burst: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: BRAND.colors.goldenPear,
  },
  consolidatedTick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tickCount: {
    fontSize: 36,
    fontWeight: '800',
    color: BRAND.colors.charcoalInk,
  },
  cardArea: {
    height: 56,
    width: SCREEN_WIDTH - 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  card: {
    position: 'absolute',
    width: SCREEN_WIDTH - 48,
    height: 52,
    backgroundColor: 'white',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardIcon: {
    marginRight: 12,
  },
  cardText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    textAlign: 'center',
    marginBottom: 16,
    textTransform: 'lowercase',
  },
  moreText: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 24,
  },
  hint: {
    position: 'absolute',
    bottom: 50,
    fontSize: 14,
    color: BRAND.colors.inkMuted,
  },
});

export default SweepCelebrationTransition;
