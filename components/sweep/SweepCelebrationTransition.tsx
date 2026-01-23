/**
 * SweepCelebrationTransition Component
 *
 * Quick count-up animation celebrating completed items since last sweep.
 * Shows totals with fast counting animation, expandable to see details.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  TouchableOpacity,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  Easing,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { Check, Repeat, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { triggerLight, triggerSuccess } from '../../lib/haptics';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../../assets/mascot/gremly-mascot.png');

// Timing constants
const COUNT_DURATION = 1200; // Total time to count up all numbers
const COUNT_STAGGER = 150; // Delay between starting each counter

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
// Animated Counter Component
// ─────────────────────────────────────────────────────────────────────────────

interface AnimatedCounterProps {
  targetValue: number;
  delay: number;
  duration: number;
  icon: React.ReactNode;
  label: string;
  onComplete?: () => void;
}

const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  targetValue,
  delay,
  duration,
  icon,
  label,
  onComplete,
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    const startTime = Date.now() + delay;
    const endTime = startTime + duration;

    const interval = setInterval(() => {
      const now = Date.now();

      if (now < startTime) {
        return; // Still waiting for delay
      }

      if (now >= endTime) {
        setDisplayValue(targetValue);
        clearInterval(interval);

        // Bounce on complete
        scale.value = withSequence(
          withSpring(1.15, { damping: 8, stiffness: 400 }),
          withSpring(1, { damping: 12, stiffness: 300 }),
        );
        triggerLight();
        onComplete?.();
        return;
      }

      // Calculate progress
      const progress = (now - startTime) / duration;
      const easedProgress = Easing.out(Easing.cubic)(progress);
      const currentValue = Math.round(easedProgress * targetValue);

      if (currentValue !== displayValue) {
        setDisplayValue(currentValue);
      }
    }, 16); // ~60fps

    return () => clearInterval(interval);
  }, [targetValue, delay, duration, displayValue, scale, onComplete]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (targetValue === 0) return null;

  return (
    <Animated.View
      style={[styles.counterRow, animatedStyle]}
      entering={FadeInDown.delay(delay).duration(300)}
    >
      <View style={styles.counterIcon}>{icon}</View>
      <Text style={styles.counterValue}>{displayValue}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Item List Component (for expanded view)
// ─────────────────────────────────────────────────────────────────────────────

interface ItemListProps {
  items: CompletedItem[];
}

const ItemList: React.FC<ItemListProps> = ({ items }) => {
  const todos = items.filter((i) => i.type === 'todo');
  const habits = items.filter((i) => i.type === 'habit');
  const notes = items.filter((i) => i.type === 'note');

  const renderSection = (
    sectionItems: CompletedItem[],
    title: string,
    sectionIcon: React.ReactNode,
  ) => {
    if (sectionItems.length === 0) return null;

    return (
      <View style={styles.listSection}>
        <View style={styles.listSectionHeader}>
          {sectionIcon}
          <Text style={styles.listSectionTitle}>{title}</Text>
        </View>
        {sectionItems.map((item) => (
          <View key={item.id} style={styles.listItem}>
            <Check size={14} color={BRAND.colors.mossGreen} strokeWidth={2.5} />
            <Text style={styles.listItemText} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false} bounces={false}>
      {renderSection(todos, 'TODOS', <Check size={14} color={BRAND.colors.inkMuted} />)}
      {renderSection(habits, 'HABITS', <Repeat size={14} color={BRAND.colors.inkMuted} />)}
      {renderSection(notes, 'IDEAS', <Lightbulb size={14} color={BRAND.colors.inkMuted} />)}
    </ScrollView>
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
  const [canContinue, setCanContinue] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [completedCounters, setCompletedCounters] = useState(0);

  // Count by type
  const counts = useMemo(
    () => ({
      todos: completedItems.filter((i) => i.type === 'todo').length,
      habits: completedItems.filter((i) => i.type === 'habit').length,
      notes: completedItems.filter((i) => i.type === 'note').length,
    }),
    [completedItems],
  );

  const totalCategories = [counts.todos, counts.habits, counts.notes].filter((c) => c > 0).length;

  // Handle counter completion
  const handleCounterComplete = useCallback(() => {
    setCompletedCounters((prev) => {
      const next = prev + 1;
      if (next >= totalCategories) {
        triggerSuccess();
        setCanContinue(true);
      }
      return next;
    });
  }, [totalCategories]);

  // Handle expand toggle
  const handleToggleExpand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    triggerLight();
    setIsExpanded((prev) => !prev);
  }, []);

  // Handle tap to continue
  const handleTap = useCallback(() => {
    if (canContinue) {
      onComplete();
    } else {
      onSkip();
    }
  }, [canContinue, onComplete, onSkip]);

  // Calculate delays for staggered counters
  const getDelay = (index: number) => 400 + index * COUNT_STAGGER;

  let counterIndex = 0;

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.container}>
        <View style={styles.content}>
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

          {/* Subtitle */}
          <Animated.Text style={styles.subtitle} entering={FadeIn.duration(400).delay(200)}>
            SINCE YOUR LAST SWEEP
          </Animated.Text>

          {/* Counters */}
          <View style={styles.countersContainer}>
            {counts.todos > 0 && (
              <AnimatedCounter
                targetValue={counts.todos}
                delay={getDelay(counterIndex++)}
                duration={COUNT_DURATION}
                icon={<Check size={20} color={BRAND.colors.mossGreen} strokeWidth={2.5} />}
                label={counts.todos === 1 ? 'todo' : 'todos'}
                onComplete={handleCounterComplete}
              />
            )}
            {counts.habits > 0 && (
              <AnimatedCounter
                targetValue={counts.habits}
                delay={getDelay(counterIndex++)}
                duration={COUNT_DURATION}
                icon={<Repeat size={20} color={BRAND.colors.mossGreen} strokeWidth={2.5} />}
                label={counts.habits === 1 ? 'habit' : 'habits'}
                onComplete={handleCounterComplete}
              />
            )}
            {counts.notes > 0 && (
              <AnimatedCounter
                targetValue={counts.notes}
                delay={getDelay(counterIndex++)}
                duration={COUNT_DURATION}
                icon={<Lightbulb size={20} color={BRAND.colors.mossGreen} strokeWidth={2.5} />}
                label={counts.notes === 1 ? 'idea' : 'ideas'}
                onComplete={handleCounterComplete}
              />
            )}
          </View>

          {/* Expand Button */}
          {canContinue && (
            <Animated.View entering={FadeIn.duration(300)}>
              <TouchableOpacity
                style={styles.expandButton}
                onPress={handleToggleExpand}
                activeOpacity={0.7}
              >
                <Text style={styles.expandButtonText}>
                  {isExpanded ? 'Hide details' : 'See what you did'}
                </Text>
                {isExpanded ? (
                  <ChevronUp size={18} color={BRAND.colors.mossGreen} />
                ) : (
                  <ChevronDown size={18} color={BRAND.colors.mossGreen} />
                )}
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Expanded Item List */}
          {isExpanded && (
            <Animated.View style={styles.expandedContainer} entering={FadeIn.duration(200)}>
              <ItemList items={completedItems} />
            </Animated.View>
          )}
        </View>

        {/* Continue Hint */}
        <Animated.Text style={styles.hint} entering={FadeIn.duration(300).delay(1500)}>
          {canContinue ? 'tap to continue' : 'tap to skip'}
        </Animated.Text>
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
  content: {
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
    fontSize: 24,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    letterSpacing: 1.5,
    marginBottom: 32,
  },
  countersContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    minWidth: 200,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  counterIcon: {
    width: 28,
    alignItems: 'center',
  },
  counterValue: {
    fontSize: 24,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    marginHorizontal: 8,
    minWidth: 32,
    textAlign: 'center',
  },
  counterLabel: {
    fontSize: 16,
    color: BRAND.colors.inkMuted,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 6,
  },
  expandButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
  expandedContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginTop: 12,
    maxHeight: 200,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  listContainer: {
    padding: 16,
  },
  listSection: {
    marginBottom: 16,
  },
  listSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  listSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    letterSpacing: 1,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 4,
    gap: 10,
  },
  listItemText: {
    flex: 1,
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
  },
  hint: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    fontSize: 14,
    color: BRAND.colors.inkMuted,
  },
});

export default SweepCelebrationTransition;
