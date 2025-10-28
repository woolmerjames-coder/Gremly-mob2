/**
 * TypingDots Component - Phase 10.6
 *
 * Subtle 3-dot typing indicator shown when mascot is in 'thinking' state.
 * Respects reduced motion preferences.
 */

import React, { useEffect, useMemo } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { FLAG_REDUCED } from '../../config/featureFlags';

interface TypingDotsProps {
  visible: boolean;
  size?: number;
  color?: string;
}

export default function TypingDots({
  visible = false,
  size = 8,
  color = 'rgba(107, 114, 128, 0.6)', // Subtle gray from design tokens
}: TypingDotsProps) {
  const dot1Opacity = useMemo(() => new Animated.Value(0.3), []);
  const dot2Opacity = useMemo(() => new Animated.Value(0.3), []);
  const dot3Opacity = useMemo(() => new Animated.Value(0.3), []);

  useEffect(() => {
    const dot1 = dot1Opacity;
    const dot2 = dot2Opacity;
    const dot3 = dot3Opacity;

    if (!visible || FLAG_REDUCED) {
      dot1.setValue(0.3);
      dot2.setValue(0.3);
      dot3.setValue(0.3);
      return;
    }

    const createDotAnimation = (animatedValue: Animated.Value, delay: number) => {
      return Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.sequence([
            Animated.timing(animatedValue, {
              toValue: 1,
              duration: 600,
              useNativeDriver: false,
            }),
            Animated.timing(animatedValue, {
              toValue: 0.3,
              duration: 600,
              useNativeDriver: false,
            }),
          ]),
        ),
      ]);
    };

    const staggerDelay = 200; // 200ms stagger between dots

    // Start all animations in parallel
    Animated.parallel([
      createDotAnimation(dot1, 0),
      createDotAnimation(dot2, staggerDelay),
      createDotAnimation(dot3, staggerDelay * 2),
    ]).start();

    // Cleanup function to stop animations
    return () => {
      dot1.stopAnimation();
      dot2.stopAnimation();
      dot3.stopAnimation();
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  const dotStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
    marginHorizontal: size * 0.3,
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[dotStyle, { opacity: dot1Opacity }]} />
      <Animated.View style={[dotStyle, { opacity: dot2Opacity }]} />
      <Animated.View style={[dotStyle, { opacity: dot3Opacity }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
});
