/**
 * SweepPill - Small pill button for Sweep action
 *
 * Displays a sweep action with item count.
 * Uses Harmonic Cortex palette: Golden Pear accent, Moss Green text.
 *
 * Visual states:
 * - count === 0: Muted/calm appearance with reduced opacity
 * - count > 0: Active appearance with full opacity and accent tint
 * - count >= 5: Subtle "breathe" animation to draw attention
 */

import React, { useEffect, useRef } from 'react';
import { Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { Sparkles } from 'lucide-react-native';

// Harmonic Cortex palette
const GOLDEN_PEAR = '#E0C47A';
const GOLDEN_PEAR_STRONG = '#C4A85C'; // Darkened ~12% for text contrast
const LINEN_CREAM = '#F9F6F1';

// Derived colors for states
const GOLDEN_PEAR_MUTED = 'rgba(224, 196, 122, 0.5)'; // 50% opacity for muted state
const GOLDEN_PEAR_STRONG_MUTED = 'rgba(196, 168, 92, 0.6)'; // Muted strong for zero state text
const GOLDEN_PEAR_TINT_BG = 'rgba(224, 196, 122, 0.12)'; // 12% opacity for active background

export interface SweepPillProps {
  /** Number of items waiting to be swept */
  count: number;
  /** Called when the pill is pressed */
  onPress: () => void;
}

/* eslint-disable react-hooks/refs -- Animated.Value refs are intentionally accessed in render for RN animations */
export function SweepPill({ count, onPress }: SweepPillProps) {
  const hasItems = count > 0;
  const shouldAnimate = count >= 5;

  // Animated value for breathe effect
  const scaleAnimRef = useRef(new Animated.Value(1));
  const scaleAnim = scaleAnimRef.current;

  useEffect(() => {
    if (shouldAnimate) {
      // Start breathe animation loop
      const breatheAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.03,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      breatheAnimation.start();

      return () => {
        breatheAnimation.stop();
        scaleAnim.setValue(1);
      };
    } else {
      // Reset scale when not animating
      scaleAnim.setValue(1);
    }
  }, [shouldAnimate, scaleAnim]);

  // Build the count label
  const countLabel = hasItems ? (count === 1 ? '1 item waiting' : `${count} items waiting`) : '0';

  // Dynamic styles based on state
  const pillStyle = [styles.pill, hasItems ? styles.pillActive : styles.pillMuted];

  const iconColor = hasItems ? GOLDEN_PEAR : GOLDEN_PEAR_MUTED;
  const borderColor = hasItems ? GOLDEN_PEAR : GOLDEN_PEAR_MUTED;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={({ pressed }) => [...pillStyle, { borderColor }, pressed && styles.pillPressed]}
        onPress={onPress}
        testID="sweep-pill"
        accessibilityRole="button"
        accessibilityLabel={`Sweep ${count} ${count === 1 ? 'item' : 'items'} waiting`}
      >
        <Sparkles size={16} color={iconColor} strokeWidth={2} />
        <Text style={[styles.label, hasItems ? styles.labelActive : styles.labelMuted]}>
          Sweep{' '}
          <Text style={[styles.count, hasItems ? styles.countActive : styles.countMuted]}>
            · {countLabel}
          </Text>
        </Text>
      </Pressable>
    </Animated.View>
  );
}
/* eslint-enable react-hooks/refs */

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    borderWidth: 1,
    gap: 8,
  },
  // Muted state (count === 0)
  pillMuted: {
    backgroundColor: LINEN_CREAM,
  },
  // Active state (count > 0)
  pillActive: {
    backgroundColor: GOLDEN_PEAR_TINT_BG,
  },
  pillPressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  labelActive: {
    color: GOLDEN_PEAR_STRONG,
  },
  labelMuted: {
    color: GOLDEN_PEAR_STRONG_MUTED,
  },
  count: {
    fontWeight: '400',
  },
  countActive: {
    color: GOLDEN_PEAR_STRONG,
    fontWeight: '500',
  },
  countMuted: {
    color: GOLDEN_PEAR_STRONG_MUTED,
  },
});

export default SweepPill;
