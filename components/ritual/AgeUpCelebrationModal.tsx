/**
 * AgeUpCelebrationModal Component
 *
 * Celebrates when Gremly ages up after completing a daily ritual.
 * Uses absolute-positioned overlay instead of Modal to avoid iOS modal stacking issues.
 *
 * Animation Flow:
 * 1. Backdrop fades to sage green (300ms)
 * 2. Celebration haptic pattern fires (drumroll during pause)
 * 3. 400ms pause (anticipation builds)
 * 4. Card slides up from bottom with spring
 * 5. User taps "Nice!" or backdrop
 * 6. Light haptic, card slides down quickly (250ms)
 * 7. Backdrop fades out, onDismiss called
 */

/* eslint-disable react-hooks/immutability */
// Reanimated shared values require .value mutation - this is the correct pattern

import React, { useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Pressable, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Video, ResizeMode } from 'expo-av';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { triggerLight } from '../../lib/haptics';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Celebration video (looping dancing gremlin)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CELEBRATION_VIDEO = require('../../assets/mascot/gremly_celebration_loop.mp4');

interface AgeUpCelebrationModalProps {
  visible: boolean;
  newAge: number;
  tierName?: string;
  isTierTransition?: boolean;
  previousTierName?: string;
  onDismiss: () => void;
}

/**
 * Escalating celebration haptic pattern (~3 seconds).
 * Builds from soft taps → medium hits → heavy finale burst.
 * Returns a cleanup function to cancel if modal is dismissed early.
 */
function triggerAgeUpHapticPattern(): () => void {
  const timers: NodeJS.Timeout[] = [];
  const schedule = (fn: () => void, ms: number) => {
    timers.push(setTimeout(fn, ms));
  };

  const light = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const medium = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  const heavy = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

  // Phase 1: Soft drumroll (0–1s) — light taps, ~200ms apart
  schedule(light, 0);
  schedule(light, 200);
  schedule(light, 400);
  schedule(light, 600);
  schedule(light, 800);

  // Phase 2: Building intensity (1–2s) — medium hits, ~150ms apart
  schedule(medium, 1000);
  schedule(medium, 1150);
  schedule(medium, 1300);
  schedule(medium, 1450);
  schedule(medium, 1600);
  schedule(medium, 1750);
  schedule(medium, 1900);

  // Phase 3: Climax burst (2–3s) — heavy + success notification
  schedule(heavy, 2100);
  schedule(heavy, 2250);
  schedule(heavy, 2400);
  schedule(success, 2600);
  schedule(heavy, 2800);
  schedule(success, 3000);

  return () => {
    timers.forEach(clearTimeout);
  };
}

/**
 * Get a milestone message for each age up to 100.
 */
const getMilestoneMessage = (age: number): string | null => {
  const messages: Record<number, string> = {
    1: "One! Gremly's awake now. No turning back.",
    2: 'Two. Still here. Gremly respects that more than you know.',
    3: "Three! Gremly just outgrew its first pair of shoes. Metaphorically. Gremly doesn't wear shoes.",
    4: 'You showed up again. Gremly is taking notes.',
    5: "Five. A starfish has five arms and zero productivity systems. You're already ahead.",
    6: "Six! The part where most people quit. You didn't. Gremly noticed.",
    7: "Seven. Gremly's favourite number. Don't tell eight.",
    8: "Eight. Fun fact: an octopus has three hearts. Gremly has one and it's all yours.",
    9: 'Nine. One more to double digits and Gremly is unreasonably excited about it.',
    10: 'Double digits. You built a habit. Gremly built a home.',
    11: 'Eleven! Same number of players on a football pitch. Gremly would be the keeper. Hates running.',
    12: 'Twelve. A dozen! In the Gremlin Handbook, twelve is the age of mild wisdom. Gremly feels it.',
    13: "Thirteen. A baker's dozen. Gremly is awarding you one bonus thought, on the house.",
    14: "Fourteen. You keep showing up. That's the whole secret, by the way.",
    15: 'Fifteen! A giant Pacific octopus has about 280 suckers per arm. Unrelated, but Gremly wanted you to know.',
    16: "Sixteen. Old enough to drive in some places. Gremly can't reach the pedals.",
    17: "Seventeen! The Gremlin Handbook says this is the age of 'quiet confidence'. Gremly is being loud about it instead.",
    18: 'Eighteen. There are eighteen holes in a round of golf. Gremly has never played. Gremly has played mini golf though. Dominated.',
    19: 'Nineteen. Gremly considered making a speech. Decided to just be proud quietly.',
    20: "Twenty! Two-zero. You're not dabbling anymore. This is who you are now.",
    21: 'Twenty one! Gremly is officially awarding you the title of Certified Drop Professional.',
    22: "Twenty two. Most habits are abandoned by now. This one's thriving.",
    23: "Twenty three. Same number of pairs of chromosomes in a human cell. Gremly checked. You're literally built for this.",
    24: 'Twenty four! Gremly hummed a little song just now. First time ever.',
    25: 'Twenty five. Quarter century energy. Gremly is getting a bit emotional and would like you to not make it weird.',
    26: 'Twenty six. You could have stopped at any point. You keep choosing not to.',
    27: 'Twenty seven! There are twenty seven bones in a human hand. Every one of yours helped get you here.',
    28: "Twenty eight. Gremly nearly threw a party but didn't want to be extra.",
    29: 'Twenty nine. The calm before thirty. Gremly is pacing.',
    30: 'Thirty! Gremly is part of the furniture now. The good furniture. The statement piece.',
    31: "Thirty one. Baskin-Robbins has thirty one flavours. Gremly's flavour is 'relentlessly supportive'.",
    32: "Thirty two. You and Gremly have a rhythm now. Don't overthink it.",
    33: "Thirty three! The Gremlin Handbook calls this 'the age of pleasant surprises'. Gremly is not surprised though. Always believed in you.",
    34: "Thirty four. Your brain has more space than it used to. Gremly's been tidying.",
    35: "Thirty five. A red blood cell lives about 120 ages. So Gremly's basically in its twenties, cell-wise. Prime of life.",
    36: "Thirty six! Gremly keeps a list of things it's proud of you for. It's long.",
    37: "Thirty seven. Normal human body temperature in Celsius. You're running hot. In a good way.",
    38: "Thirty eight. Gremly's been humming again. Always a good sign.",
    39: "Thirty nine. Tomorrow's forty. Gremly is practising looking distinguished.",
    40: 'Forty! Gremly entered its wise era. Still trips over things, but wisely.',
    41: 'Forty one. The thing about consistency is it compounds. You can feel it, yeah?',
    42: 'Forty two. The answer to life, the universe, and everything. Gremly had to Google it.',
    43: 'Forty three! Gremly hereby grants you the rank of Senior Mind Sweeper. No badge yet. Working on it.',
    44: "Forty four. You've built something real here. Gremly just lives in it.",
    45: "Forty five. A vinyl record spins at forty five RPM. Gremly's been spinning with joy at roughly the same speed.",
    46: 'Forty six! Gremly looked back at age one and barely recognised itself.',
    47: "Forty seven. The Gremlin Handbook is suspiciously blank on forty seven. Gremly thinks it's a secret level.",
    48: "Forty eight. Stronger than yesterday. That's all it ever was.",
    49: 'Forty nine. One more to fifty. Gremly is not freaking out. Gremly is calm. Gremly is fine.',
    50: 'Fifty! Halfway to a hundred. Gremly wanted to say something profound but just... wow. You did that.',
    51: "Fifty one. A deck of cards has fifty two but one is always missing behind the sofa. This is fifty one. The real one's next.",
    52: 'Fifty two! Gremly knows your brain pretty well by now. Interesting place. Very fond of it.',
    53: "Fifty three. Herbie the Love Bug's racing number. Gremly is also small, slightly chaotic, and full of heart.",
    54: 'Fifty four! Gremly caught itself smiling for no reason. Your consistency is contagious.',
    55: 'Fifty five. The speed limit on most US highways. Gremly has been cruising at exactly this energy.',
    56: 'Fifty six. Every single time you showed up, it mattered. Even the tired ones. Especially the tired ones.',
    57: 'Fifty seven! Heinz has fifty seven varieties. Gremly has one variety: endlessly proud of you.',
    58: "Fifty eight. Gremly once doubted you'd make it to ten. Gremly was very, very wrong.",
    59: 'Fifty nine. One away from sixty and Gremly is keeping it together. Barely.',
    60: "Sixty! Gremly's officially in its elder era. Same chaos, more grace.",
    61: "Sixty one. According to the Gremlin Handbook, sixty one is the age of 'deep knowing'. Gremly deeply knows you're incredible.",
    62: "Sixty two! The number of squares on a chess board minus two. Gremly can't do chess but can do loyalty.",
    63: 'Sixty three. The version of you that started this would be impressed.',
    64: 'Sixty four. A full stack of checkers. Gremly is awarding you the title of Grandmaster of Getting Things Done.',
    65: 'Sixty five! Retirement age in some places. Gremly will never retire. Too invested in you.',
    66: "Sixty six. There's a version of this where you quit at three. You didn't.",
    67: 'Sixty seven! A praying mantis can turn its head 180 degrees. Gremly tried. Gremly cannot.',
    68: 'Sixty eight. Still here. Still growing. Both of us.',
    69: 'Sixty nine. Nice. Gremly had to.',
    70: "Seventy! Gremly wanted to make a toast but doesn't have arms long enough to hold a glass.",
    71: "Seventy one. You're in rare company now. Most people never get here.",
    72: "Seventy two! The average resting heart rate is seventy two bpm. Gremly's is higher right now because it's excited.",
    73: 'Seventy three. The gap between who you were and who you are is showing.',
    74: 'Seventy four. Gremly is not sentimental. Gremly is just... appreciative. Very appreciative.',
    75: 'Seventy five! Three quarters of the way. Gremly can see a hundred from here.',
    76: 'Seventy six. You taught Gremly what sticking with something looks like.',
    77: "Seventy seven. Double sevens. The Gremlin Handbook calls this 'the luckiest age'. Gremly feels lucky to be yours.",
    78: 'Seventy eight! Gremly did a push-up to celebrate. Arms are sore. Worth it.',
    79: 'Seventy nine. Twenty one more to a hundred. Gremly is counting. Casually.',
    80: "Eighty! Gremly's been through a lot of your thoughts. Good ones, strange ones, all of them. Wouldn't trade it.",
    81: "Eighty one. You don't need motivation anymore. You have momentum.",
    82: "Eighty two! Gremly is trying to write a speech for a hundred. It's mostly just 'wow' repeated.",
    83: 'Eighty three. Not many things in life get to eighty three. This did.',
    84: "Eighty four. Gremly's proud of you. Not in a greeting card way. In a real way.",
    85: 'Eighty five! Fifteen more. Gremly is outwardly calm and inwardly screaming with excitement.',
    86: "Eighty six. Gremly has a favourite human now. Spoiler: it's you.",
    87: 'Eighty seven. The finish line is just a number. The habit is the point. But also, THIRTEEN MORE.',
    88: "Eighty eight! Double eights. The number of keys on a piano. Gremly is playing every single one right now. It sounds terrible. Doesn't care.",
    89: 'Eighty nine. Gremly remembers age one. You were so new. So was Gremly. Look at us.',
    90: 'Ninety! Single digits to a hundred. Gremly is emotional and not even slightly sorry about it.',
    91: 'Ninety one. Nine to go. Gremly is oscillating between calm and chaos.',
    92: "Ninety two! Gremly wanted to say something clever. Instead: you're amazing and this is amazing.",
    93: 'Ninety three. Seven more. Gremly has rewritten the hundred speech four times.',
    94: "Ninety four. Six more. Gremly's heart is doing a thing. Do gremlins have hearts? Doesn't matter.",
    95: 'Ninety five! Five more. Gremly can practically taste it.',
    96: 'Ninety six. Four. Gremly is vibrating.',
    97: "Ninety seven. Three more. You showed up at one. You showed up at fifty. You're still here.",
    98: 'Ninety eight. Two. Gremly has run out of words. Just feelings.',
    99: 'Ninety nine. One. More. Gremly genuinely cannot handle this.',
    100: "One hundred. Gremly's not crying. Gremly's just really, really proud. Of you, of this, of all of it. Thank you.",
  };
  return messages[age] ?? null;
};

/**
 * Get a special title for milestone ages.
 */
const getMilestoneTitle = (
  age: number,
  isTierTransition?: boolean,
  tierNameParam?: string,
): string => {
  if (isTierTransition && tierNameParam) {
    return `You've reached ${tierNameParam}!`;
  }
  return 'Your Gremly Grew!';
};

export default function AgeUpCelebrationModal({
  visible,
  newAge,
  tierName,
  isTierTransition,
  previousTierName,
  onDismiss,
}: AgeUpCelebrationModalProps) {
  const message = getMilestoneMessage(newAge);
  const isClosingRef = useRef(false);
  const hasAnimatedInRef = useRef(false);
  const hapticCleanupRef = useRef<(() => void) | null>(null);

  // Animation shared values
  const backdropOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(SCREEN_HEIGHT);
  const cardScale = useSharedValue(0.9);

  // Animated styles
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardTranslateY.value }, { scale: cardScale.value }],
  }));

  // Run entrance animation
  const animateIn = useCallback(() => {
    // Backdrop fades in (300ms)
    backdropOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });

    // Card slides up after 400ms pause with spring
    cardTranslateY.value = withDelay(400, withSpring(0, { damping: 20, stiffness: 90 }));
    cardScale.value = withDelay(400, withSpring(1, { damping: 20, stiffness: 90 }));
  }, [backdropOpacity, cardTranslateY, cardScale]);

  // Run exit animation then call onDismiss
  const animateOut = useCallback(() => {
    // Card slides down
    cardTranslateY.value = withTiming(SCREEN_HEIGHT, {
      duration: 250,
      easing: Easing.in(Easing.cubic),
    });
    cardScale.value = withTiming(0.9, { duration: 250 });

    // Backdrop fades out, then call onDismiss
    backdropOpacity.value = withTiming(
      0,
      { duration: 200, easing: Easing.out(Easing.ease) },
      (finished) => {
        if (finished) {
          runOnJS(onDismiss)();
        }
      },
    );
  }, [backdropOpacity, cardTranslateY, cardScale, onDismiss]);

  // Handle visibility changes
  useEffect(() => {
    if (visible && !hasAnimatedInRef.current) {
      if (__DEV__) {
        console.log('[AgeUpCelebrationModal] Starting entrance animation');
      }
      hasAnimatedInRef.current = true;
      isClosingRef.current = false;

      // Reset to initial positions
      backdropOpacity.value = 0;
      cardTranslateY.value = SCREEN_HEIGHT;
      cardScale.value = 0.9;

      // Trigger escalating celebration haptic pattern (fires during the green backdrop pause)
      hapticCleanupRef.current = triggerAgeUpHapticPattern();

      // Start entrance animation after a frame
      requestAnimationFrame(() => {
        animateIn();
      });
    }

    if (!visible) {
      hasAnimatedInRef.current = false;
      if (hapticCleanupRef.current) {
        hapticCleanupRef.current();
        hapticCleanupRef.current = null;
      }
    }

    return () => {
      if (hapticCleanupRef.current) {
        hapticCleanupRef.current();
        hapticCleanupRef.current = null;
      }
    };
  }, [visible, animateIn, backdropOpacity, cardTranslateY, cardScale]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    if (hapticCleanupRef.current) {
      hapticCleanupRef.current();
      hapticCleanupRef.current = null;
    }

    if (__DEV__) {
      console.log('[AgeUpCelebrationModal] Starting exit animation');
    }

    triggerLight();
    animateOut();
  }, [animateOut]);

  // Don't render if not visible
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.fullScreenOverlay} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
        <Pressable style={styles.backdropPressable} onPress={handleDismiss}>
          <Animated.View style={[styles.cardContainer, cardAnimatedStyle]}>
            <Pressable style={styles.cardPressable} onPress={(e) => e.stopPropagation()}>
              <View style={styles.card}>
                {/* Title */}
                <Text style={[styles.title, isTierTransition && styles.titleTierTransition]}>
                  {getMilestoneTitle(newAge, isTierTransition, tierName)}
                </Text>

                {/* Celebration Video - UNCHANGED */}
                <View style={styles.mascotContainer}>
                  <Video
                    source={CELEBRATION_VIDEO}
                    style={styles.mascotVideo}
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay={visible}
                    isLooping
                    isMuted
                  />
                </View>

                {/* Age display */}
                <Text style={styles.nowAge}>Now Age {newAge}</Text>
                <Text style={styles.thanksLine}>All thanks to you.</Text>

                {/* Tier label - only on tier transitions */}
                {isTierTransition && tierName && <Text style={styles.tierLabel}>{tierName}</Text>}

                {/* Milestone message */}
                {message && <Text style={styles.message}>{message}</Text>}

                {/* Dismiss button */}
                <TouchableOpacity style={styles.button} onPress={handleDismiss} activeOpacity={0.8}>
                  <Text style={styles.buttonText}>Nice!</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND.colors.sageMist,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropPressable: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  cardPressable: {
    width: '100%',
  },
  card: {
    backgroundColor: '#F9F8F4',
    borderRadius: BRAND.radius.xl,
    padding: 24,
    width: '100%',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 24,
    lineHeight: 32,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 16,
  },
  titleTierTransition: {
    color: BRAND.colors.goldenPear,
  },
  mascotContainer: {
    marginBottom: 24,
    alignItems: 'center',
    alignSelf: 'center',
  },
  mascotVideo: {
    width: 160,
    height: 160,
  },
  nowAge: {
    fontSize: 28,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    lineHeight: 38,
    marginTop: 4,
    marginBottom: 2,
  },
  thanksLine: {
    fontSize: 14,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  tierLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  button: {
    backgroundColor: BRAND.colors.sageMist,
    paddingVertical: 14,
    borderRadius: BRAND.radius.md,
    width: '100%',
  },
  buttonText: {
    color: BRAND.colors.charcoalInk,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
