/**
 * SweepCelebrationTransition Component
 *
 * Quick count-up animation celebrating completed items since last sweep.
 * Now DCO-aware: uses tone + life context for headline, includes calendar
 * events and captured drops alongside todos and habits.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
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
import {
  Check,
  Repeat,
  Lightbulb,
  Calendar,
  ArrowDown,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { triggerLight, triggerSuccess } from '../../lib/haptics';
import { env } from '../../lib/env';
import type { DcoTone } from '../../lib/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../../assets/mascot/gremly-mascot.png');

// Timing constants
const COUNT_DURATION = 1200;
const COUNT_STAGGER = 150;

// ─────────────────────────────────────────────────────────────────────────────
// DCO-Aware Headline Pools
// ─────────────────────────────────────────────────────────────────────────────

const TONE_PHRASES: Record<DcoTone, string[]> = {
  relaxed: [
    'Easy day. All good.',
    'Light and that\u2019s fine',
    'No rush today',
    'Gentle pace, on purpose',
  ],
  focused: ['Solid progress', 'Locked in today', 'Clean work', 'Productive day'],
  stretched: [
    'You showed up today',
    'Tough day. You pushed through.',
    'A lot on your plate. You handled it.',
    'Long one. You got through it.',
  ],
  recovering: [
    'Easy does it',
    'Slow day. That counts.',
    'Rest is productive too',
    'Gentle day. Still here.',
  ],
  celebratory: ['What a day', 'Look at you go', 'That\u2019s a win', 'Big day. Well earned.'],
};

// Fallback if no DCO
const FALLBACK_PHRASES = [
  'Already crushed it',
  "You've been busy",
  'Nice momentum',
  'Off to a great start',
  'Making progress',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Build the celebration headline using DCO context.
 * Uses lifeMoment directly when available for contextual phrases.
 */
function buildHeadline(
  tone: DcoTone | null,
  lifeMoment: string | null,
  namedAnchors: Array<{ label: string; type: string }>,
): string {
  if (!tone) return pickRandom(FALLBACK_PHRASES);

  // If we have a life moment, use it to build a contextual phrase
  if (lifeMoment) {
    const contextPhrases: Record<DcoTone, (ctx: string) => string[]> = {
      relaxed: (ctx) => [`${ctx}. All good.`, `${ctx}. Easy pace.`],
      focused: (ctx) => [`${ctx}. Solid progress.`, `${ctx}. Clean work today.`],
      stretched: (ctx) => [`${ctx}. You showed up.`, `${ctx}. Tough one, but handled.`],
      recovering: (ctx) => [`${ctx}. Gentle day.`, `${ctx}. Easy does it.`],
      celebratory: (ctx) => [`${ctx}. What a day.`, `${ctx}. Big one.`],
    };

    // Clean up the life moment — capitalize first letter, trim
    const shortMoment = lifeMoment.charAt(0).toUpperCase() + lifeMoment.slice(1);
    const pool = contextPhrases[tone]?.(shortMoment);
    if (pool) return pickRandom(pool);
  }

  // Fall back to tone-only phrases
  return pickRandom(TONE_PHRASES[tone] || FALLBACK_PHRASES);
}

/**
 * Fetch a nano-generated sweep headline from the cortex worker.
 * Returns null on failure — caller falls back to template.
 */
async function fetchNanoHeadline(
  tone: DcoTone | null,
  lifeMoment: string | null,
  counts: { todos: number; habits: number; events: number; drops: number },
): Promise<string | null> {
  try {
    const cortexUrl = env.cortexUrl;
    const anonKey = env.supabaseAnonKey;

    if (!cortexUrl || !anonKey) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

    const res = await fetch(cortexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        type: 'sweep-headline',
        tone,
        lifeMoment,
        todosCompleted: counts.todos,
        habitsCompleted: counts.habits,
        eventsCompleted: counts.events,
        dropsCaptured: counts.drops,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    return data.headline || null;
  } catch {
    return null; // Silent fail — template fallback handles it
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CompletedItem {
  id: string;
  name: string;
  type: 'todo' | 'habit' | 'note';
}

interface CompletedEvent {
  id: string;
  title: string;
}

interface Props {
  completedItems: CompletedItem[];
  completedEvents?: CompletedEvent[];
  dropsCount?: number;
  dcoTone?: DcoTone | null;
  dcoLifeMoment?: string | null;
  dcoNamedAnchors?: Array<{ label: string; type: string }>;
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
  const hasStarted = useRef(false);
  const hasCompleted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const startTime = Date.now() + delay;
    const endTime = startTime + duration;

    const interval = setInterval(() => {
      const now = Date.now();

      if (now < startTime) return;

      if (now >= endTime || hasCompleted.current) {
        if (!hasCompleted.current) {
          hasCompleted.current = true;
          setDisplayValue(targetValue);
          clearInterval(interval);

          scale.value = withSequence(
            withSpring(1.15, { damping: 8, stiffness: 400 }),
            withSpring(1, { damping: 12, stiffness: 300 }),
          );
          triggerLight();
          onComplete?.();
        }
        return;
      }

      const progress = (now - startTime) / duration;
      const easedProgress = Easing.out(Easing.cubic)(progress);
      const currentValue = Math.round(easedProgress * targetValue);

      setDisplayValue(currentValue);
    }, 32);

    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (targetValue === 0) return null;

  const displayLabel = targetValue === 1 ? label.replace(/s$/, '') : label;

  return (
    <Animated.View
      style={[styles.counterRow, animatedStyle]}
      entering={FadeInDown.delay(delay).duration(300)}
    >
      <View style={styles.counterIcon}>{icon}</View>
      <Text style={styles.counterValue}>{displayValue}</Text>
      <Text style={styles.counterLabel}>{displayLabel}</Text>
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Item List Component (for expanded view)
// ─────────────────────────────────────────────────────────────────────────────

interface ItemListProps {
  items: CompletedItem[];
  events: CompletedEvent[];
}

const ItemList: React.FC<ItemListProps> = ({ items, events }) => {
  const todos = items.filter((i) => i.type === 'todo');
  const habits = items.filter((i) => i.type === 'habit');
  const notes = items.filter((i) => i.type === 'note');

  const renderSection = (
    sectionItems: Array<{ id: string; name?: string; title?: string }>,
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
              {item.name || item.title || 'Untitled'}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.listContainer}>
      {renderSection(todos, 'TODOS', <Check size={14} color={BRAND.colors.inkMuted} />)}
      {renderSection(habits, 'HABITS', <Repeat size={14} color={BRAND.colors.inkMuted} />)}
      {renderSection(events, 'EVENTS', <Calendar size={14} color={BRAND.colors.inkMuted} />)}
      {renderSection(notes, 'IDEAS', <Lightbulb size={14} color={BRAND.colors.inkMuted} />)}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const SweepCelebrationTransition: React.FC<Props> = ({
  completedItems,
  completedEvents = [],
  dropsCount = 0,
  dcoTone = null,
  dcoLifeMoment = null,
  dcoNamedAnchors = [],
  onComplete,
  onSkip,
}) => {
  const [phrase, setPhrase] = useState(() =>
    buildHeadline(dcoTone, dcoLifeMoment, dcoNamedAnchors),
  );

  // Upgrade headline with nano call (replaces template if successful)
  useEffect(() => {
    if (!dcoTone) return; // No DCO, stick with fallback

    const counts = {
      todos: completedItems.filter((i) => i.type === 'todo').length,
      habits: completedItems.filter((i) => i.type === 'habit').length,
      events: completedEvents?.length || 0,
      drops: dropsCount || 0,
    };

    fetchNanoHeadline(dcoTone, dcoLifeMoment, counts).then((nanoResult) => {
      if (nanoResult) {
        setPhrase(nanoResult);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [canContinue, setCanContinue] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [completedCounters, setCompletedCounters] = useState(0);

  // Count by type
  const counts = useMemo(
    () => ({
      todos: completedItems.filter((i) => i.type === 'todo').length,
      habits: completedItems.filter((i) => i.type === 'habit').length,
      notes: completedItems.filter((i) => i.type === 'note').length,
      events: completedEvents.length,
      drops: dropsCount,
    }),
    [completedItems, completedEvents, dropsCount],
  );

  const totalCategories = [
    counts.todos,
    counts.habits,
    counts.notes,
    counts.events,
    counts.drops,
  ].filter((c) => c > 0).length;

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
    triggerLight();
    setIsExpanded((prev) => !prev);
  }, []);

  // Handle background tap to continue
  const handleBackgroundTap = useCallback(() => {
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
    <TouchableWithoutFeedback onPress={handleBackgroundTap}>
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Gremly Mascot */}
          <Animated.Image
            source={GREMLY_MASCOT}
            style={styles.mascot}
            resizeMode="contain"
            entering={FadeIn.duration(400)}
          />

          {/* Celebration Phrase — DCO-aware */}
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
            {counts.events > 0 && (
              <AnimatedCounter
                targetValue={counts.events}
                delay={getDelay(counterIndex++)}
                duration={COUNT_DURATION}
                icon={<Calendar size={20} color={BRAND.colors.mossGreen} strokeWidth={2.5} />}
                label={counts.events === 1 ? 'event' : 'events'}
                onComplete={handleCounterComplete}
              />
            )}
            {counts.drops > 0 && (
              <AnimatedCounter
                targetValue={counts.drops}
                delay={getDelay(counterIndex++)}
                duration={COUNT_DURATION}
                icon={<ArrowDown size={20} color={BRAND.colors.mossGreen} strokeWidth={2.5} />}
                label={counts.drops === 1 ? 'drop' : 'drops'}
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
            <Animated.View entering={FadeIn.duration(200)}>
              <View
                style={styles.expandedContainer}
                onStartShouldSetResponder={() => true}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                <ScrollView
                  style={styles.listScrollView}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={true}
                  bounces={true}
                >
                  <ItemList items={completedItems} events={completedEvents} />
                </ScrollView>
              </View>
            </Animated.View>
          )}
        </View>

        {/* Hint at bottom */}
        <Animated.Text style={styles.hint} entering={FadeIn.duration(300).delay(1500)}>
          {canContinue ? 'tap to continue' : 'tap to skip'}
        </Animated.Text>
      </View>
    </TouchableWithoutFeedback>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles (unchanged from original)
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
    height: 200,
    minWidth: 280,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: 'hidden',
  },
  listScrollView: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
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
