/**
 * MascotIcon - Animated mascot for empty states and success moments
 * Phase 7: Added pulse animation, emotion states, and reduced motion support
 *
 * Features:
 * - Idle pulse animation (subtle scale breathing)
 * - Emotion-based animations (neutral → celebrate → focus)
 * - Respects reduced motion accessibility setting
 */

import React, { useEffect } from 'react';
import { View, ViewStyle, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from '../design/animations';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MascotImage = require('../assets/mascot/gremly-mascot.png');

interface MascotIconProps {
  pose?: 'neutral' | 'think' | 'celebrate' | 'default';
  style?: ViewStyle;
  size?: number;
  accessibilityLabel?: string;
  /** Enable idle pulse animation (default: true) */
  animate?: boolean;
}

export default function MascotIcon({
  pose = 'neutral',
  style,
  size = 96,
  accessibilityLabel = 'Gremly mascot',
  animate = true,
}: MascotIconProps) {
  const isReducedMotion = useReducedMotion();

  // Animation values
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  // Idle pulse animation (breathing effect)
  useEffect(() => {
    if (!animate || isReducedMotion) {
      scale.value = 1;
      return;
    }

    // Subtle breathing animation: 1 → 1.03 → 1
    scale.value = withRepeat(
      withSequence(
        withTiming(1.03, {
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(1, {
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1, // Infinite
      false,
    );
  }, [animate, isReducedMotion, scale]);

  // Emotion-based animations
  useEffect(() => {
    if (isReducedMotion) {
      rotate.value = 0;
      return;
    }

    switch (pose) {
      case 'celebrate':
        // Wiggle animation
        rotate.value = withSequence(
          withTiming(-5, { duration: 100 }),
          withTiming(5, { duration: 100 }),
          withTiming(-5, { duration: 100 }),
          withTiming(0, { duration: 100 }),
        );
        break;

      case 'think':
        // Slight tilt
        rotate.value = withTiming(-3, { duration: 300 });
        break;

      case 'neutral':
      case 'default':
      default:
        rotate.value = withTiming(0, { duration: 300 });
        break;
    }
  }, [pose, isReducedMotion, rotate]);

  // Animated style
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  // Use Animated.View only if animations are enabled
  const AnimatedView = Animated.View;

  return (
    <View style={style} accessibilityLabel={accessibilityLabel} accessible>
      {animate && !isReducedMotion ? (
        <AnimatedView style={animatedStyle}>
          <Image source={MascotImage} style={{ width: size, height: size }} resizeMode="contain" />
        </AnimatedView>
      ) : (
        <View>
          <Image source={MascotImage} style={{ width: size, height: size }} resizeMode="contain" />
        </View>
      )}
    </View>
  );
}
