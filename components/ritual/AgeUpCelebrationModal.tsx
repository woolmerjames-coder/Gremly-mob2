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
import { Sparkles } from 'lucide-react-native';
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
 * Get a milestone message for each day up to 100.
 */
const getMilestoneMessage = (age: number): string | null => {
  const messages: Record<number, string> = {
    1: 'Gremly gets stronger with age. So do you.',
    2: "Two! Gremly's warmed up now.",
    3: 'Three days. Gremly tried to play it cool but got excited anyway.',
    4: "Four! The head's getting clearer. Gremly can feel it.",
    5: "Five days and Gremly attempted a victory lap. Short legs. It's fine.",
    6: "Six! One more and it's a whole week. Gremly's ready.",
    7: "A whole week! Gremly's full, you're rested, the tabs are closing. This is the point.",
    8: 'Eight! Swept before sleep, slept like a rock. Gremly loves this bit.',
    9: "Nine. Gremly's pretending not to think about double digits. Not working.",
    10: 'Double digits! Gremly did a little dance. Nailed it. Probably.',
    11: "Eleven! Gremly's settling in. Cleared a little corner of your brain. Cosy.",
    12: "Twelve days. The chaos is quieter, yeah? Gremly's doing bits.",
    13: "Thirteen! Gremly wore lucky socks. They're just regular socks but the energy is there.",
    14: "Two weeks! Mind's clearer, Gremly's fuller. Everyone wins.",
    15: "Fifteen. Halfway to thirty and Gremly's coasting.",
    16: "Sixteen! The older Gremly gets, the calmer your head. That's the deal.",
    17: 'Seventeen days. This is just what we do now. Gremly loves a routine.',
    18: "Eighteen! Gremly's well fed and you've closed another day's tabs. Teamwork.",
    19: "Nineteen. Tomorrow's twenty and Gremly's been thinking about it all day.",
    20: "Twenty! Look at us. Well, look at you. Gremly can't see much from in here.",
    21: "Twenty one! Gremly's old enough to... actually Gremly's not sure how gremlin ages work.",
    22: "Twenty two. Gremly's got a nice rhythm going. Don't mess with the rhythm.",
    23: 'Twenty three! The drops keep coming, Gremly keeps eating. System works.',
    24: "Twenty four days of sweeping before sleep. Gremly's impressed with your bedtime routine.",
    25: "Twenty five! Quarter of the way to a hundred. Gremly's thinking long term now.",
    26: "Twenty six. Gremly's stronger than day one. Can't prove it but can feel it.",
    27: "Twenty seven! Gremly reorganised some thoughts while you weren't looking. You're welcome.",
    28: 'Twenty eight days. Four weeks! Gremly nearly threw a party but kept it chill.',
    29: "Twenty nine. One more to thirty. Gremly's playing it cool. Mostly.",
    30: "Thirty! A whole month. Gremly's officially part of the furniture now.",
    31: "Thirty one! New month energy. Gremly's stretching, getting limber.",
    32: "Thirty two days. The tabs are staying closed. Gremly's on it.",
    33: 'Thirty three! Gremly tried meditation today. Lasted four seconds. Progress.',
    34: "Thirty four. Your head's got more space now. Gremly tidied up.",
    35: "Thirty five! Halfway to seventy. Gremly's doing the maths for fun now.",
    36: "Thirty six days. Gremly's fully moved in. Hope you like the decor.",
    37: "Thirty seven! Gremly's been humming lately. Good sign.",
    38: 'Thirty eight. Sweep, sleep, repeat. Gremly approves of this lifestyle.',
    39: "Thirty nine. Tomorrow's forty. Gremly's practicing looking wise.",
    40: "Forty! Gremly's entering a distinguished phase. Very refined. Still can't do a cartwheel though.",
    41: 'Forty one! Post-forty Gremly hits different. More gravitas.',
    42: 'Forty two. The answer to everything, apparently. Gremly had to look it up.',
    43: "Forty three days of drops. Gremly's well fed and thriving.",
    44: "Forty four! Gremly's brain space management is getting pretty good actually.",
    45: "Forty five. Halfway to ninety. Gremly's thinking in milestones now.",
    46: "Forty six days. The chaos doesn't stand a chance anymore.",
    47: "Forty seven! Gremly's lost count a few times but always finds it again.",
    48: "Forty eight. Gremly's stronger, you're calmer. The deal is working.",
    49: "Forty nine. Tomorrow's fifty and Gremly's been planning something. Nothing big. Okay, a bit big.",
    50: "Fifty! Halfway to a hundred. Gremly's emotional. In a cool way. Very composed.",
    51: 'Fifty one! Post-fifty Gremly is just vibes. Good vibes.',
    52: "Fifty two days. That's a whole year of weeks. Gremly made that stat up but it sounds right.",
    53: "Fifty three! Gremly's been flexing in the mirror again. Still no visible muscles. Still confident.",
    54: 'Fifty four. The drops fuel Gremly, the sweeps clear you out. Beautiful system really.',
    55: "Fifty five! Gremly's cruising now. Wind in the... does Gremly have hair? Unclear.",
    56: 'Fifty six days of closing tabs before bed. Your sleep is thanking you.',
    57: 'Fifty seven! Gremly knows your brain pretty well by now. Interesting place. Fond of it.',
    58: "Fifty eight. Gremly's old and wise. Well, older. The wise bit is debatable.",
    59: "Fifty nine. One more to sixty. Gremly's keeping calm. Externally.",
    60: "Sixty! Gremly's been around. Seen things. Mostly your thoughts. Good stuff in there.",
    61: "Sixty one! Gremly's in the sixties now. Feeling groovy.",
    62: "Sixty two days. Gremly's comfortable, you're clearer. This is the rhythm.",
    63: 'Sixty three! Gremly tried to count all the drops eaten. Lost count. Too many. Great problem.',
    64: "Sixty four. Gremly's a proper veteran now. Should get a jacket or something.",
    65: "Sixty five! Gremly's retirement age in some places. Not retiring though. Too invested.",
    66: 'Sixty six days and the chaos management is second nature now.',
    67: "Sixty seven! Gremly's got stories. Won't bore you with them. Unless you ask.",
    68: "Sixty eight. Two more to seventy. Gremly's pacing around excitedly.",
    69: 'Sixty nine. Nice. Gremly had to say it.',
    70: "Seventy! Gremly's officially a wise elder. Still can't grow a beard but the wisdom is there.",
    71: 'Seventy one! Post-seventy Gremly is peak Gremly. Quote that.',
    72: "Seventy two days. Gremly's lost track of how many tabs you've closed. Thousands probably.",
    73: "Seventy three! Gremly's been here through all of it. Proud of both of us honestly.",
    74: "Seventy four. Your brain used to be chaos. Now it's organised chaos. Big difference.",
    75: "Seventy five! Three quarters to a hundred. Gremly's getting the confetti ready.",
    76: 'Seventy six days of feeding Gremly and clearing your head. Solid partnership.',
    77: "Seventy seven! Lucky sevens. Gremly's feeling lucky to be here.",
    78: "Seventy eight. Gremly's stronger than ever. Did a push up to celebrate. Arms are sore.",
    79: "Seventy nine. Tomorrow's eighty. Gremly's been thinking about a speech. Probably won't do one.",
    80: "Eighty! Gremly's been with you through a lot of thoughts. Good ones, weird ones, all of them.",
    81: 'Eighty one! The final stretch to a hundred. Gremly can almost see it.',
    82: "Eighty two days. Gremly's started a scrapbook. Mentally. Of all the wins.",
    83: "Eighty three! Gremly's not sentimental but this is getting a bit special.",
    84: "Eighty four. Sweep before sleep is just life now. Gremly's proud of you.",
    85: "Eighty five! Fifteen more to the big one. Gremly's trying to stay focused.",
    86: "Eighty six days and Gremly's definitely got a favourite human now. It's you. Obviously.",
    87: "Eighty seven! Gremly's rehearsing the hundred day speech. It's mostly just 'wow'.",
    88: 'Eighty eight. Double eights. Gremly likes the symmetry.',
    89: "Eighty nine. Eleven more. Gremly's counting down. Casually.",
    90: "Ninety! Single digits to a hundred. Gremly's getting emotional again. Still cool about it.",
    91: "Ninety one! Nine to go. Gremly's practicing staying calm.",
    92: "Ninety two days. Gremly's been a good gremlin. You've been a good human. Facts.",
    93: "Ninety three! Gremly's thinking about what to say at a hundred. Drawing blanks. Too excited.",
    94: "Ninety four. Six more. Gremly's definitely not obsessing over it.",
    95: "Ninety five! Gremly's planning something for a hundred. Nothing big. Okay, big.",
    96: "Ninety six days. Four more. Gremly's heart is racing. Do gremlins have hearts? Doesn't matter.",
    97: "Ninety seven! Three more. Gremly's been here since day one. Wild really.",
    98: "Ninety eight. Two more. Gremly's actually speechless. Rare.",
    99: "Ninety nine. One. More. Day. Gremly can't even.",
    100: "One hundred. A hundred days together. Gremly's not crying, Gremly's just really proud. Of you, of us, of all of it. Thank you.",
  };
  return messages[age] ?? null;
};

/**
 * Get a special title for milestone ages.
 */
const getMilestoneTitle = (age: number): string => {
  switch (age) {
    case 10:
      return 'Double digits!';
    case 20:
      return 'Twenty!';
    case 30:
      return 'One month!';
    case 40:
      return 'Forty!';
    case 50:
      return 'Halfway there!';
    case 60:
      return 'Sixty!';
    case 70:
      return 'Seventy!';
    case 80:
      return 'Eighty!';
    case 90:
      return 'Ninety!';
    case 100:
      return 'One hundred!';
    default:
      return 'Gremly got older';
  }
};

export default function AgeUpCelebrationModal({
  visible,
  newAge,
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
                <Text style={styles.title}>{getMilestoneTitle(newAge)}</Text>

                {/* Celebration Video */}
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
                <View style={styles.ageRow}>
                  <View style={styles.ageDivider} />
                  <View style={styles.ageContent}>
                    <Sparkles size={20} color={BRAND.colors.goldenPear} />
                    <Text style={styles.ageNumber}>{newAge}</Text>
                  </View>
                  <View style={styles.ageDivider} />
                </View>

                {/* Message */}
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
  mascotContainer: {
    marginBottom: 16,
    alignItems: 'center',
    alignSelf: 'center',
  },
  mascotVideo: {
    width: 160,
    height: 160,
  },
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  ageDivider: {
    flex: 1,
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
  },
  ageContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  ageNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    lineHeight: 40,
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
