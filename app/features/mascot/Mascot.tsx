/**
 * Mascot Visual Component (Phase 10.6)
 *
 * Animated mascot that responds to state changes with different poses and animations.
 * Uses React Native Reanimated for smooth transitions.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { env } from '../../../lib/env';
import { useMascot } from './useMascot';
import type { MascotState } from './mascotMachine';

// Size variants
export type MascotSize = 'sm' | 'md' | 'lg';

interface MascotProps {
  size?: MascotSize;
  style?: any;
}

// Size configurations
const SIZE_CONFIG: Record<MascotSize, { width: number; height: number; fontSize: number }> = {
  sm: { width: 32, height: 32, fontSize: 20 },
  md: { width: 48, height: 48, fontSize: 28 },
  lg: { width: 64, height: 64, fontSize: 36 },
};

// Mascot emoji/character mappings for different states
const MASCOT_CHARACTERS: Record<MascotState, string> = {
  idle: '🐨', // Calm koala
  thinking: '🤔', // Thinking face
  replying: '💬', // Speech bubble
  playful: '😊', // Happy face
  celebrate: '🎉', // Party emoji
  error: '😕', // Confused face
};

/**
 * Mascot Component - Animated character that responds to chat events
 */
export function Mascot({ size = 'md', style }: MascotProps): React.JSX.Element | null {
  const { state, isVisible, debugInfo } = useMascot();

  // Animation values
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(isVisible ? 1 : 0);
  const bounceY = useSharedValue(0);
  const wiggle = useSharedValue(0);

  // Size configuration
  const sizeConfig = SIZE_CONFIG[size];

  // Visibility animation
  useEffect(() => {
    opacity.value = withTiming(isVisible ? 1 : 0, {
      duration: 300,
      easing: Easing.ease,
    });
  }, [isVisible, opacity]);

  // State-specific animations
  useEffect(() => {
    // Reset all animations first
    scale.value = 1;
    rotation.value = 0;
    bounceY.value = 0;
    wiggle.value = 0;

    switch (state) {
      case 'idle':
        // Gentle breathing animation
        scale.value = withRepeat(
          withSequence(
            withTiming(1.02, { duration: 2000, easing: Easing.ease }),
            withTiming(1, { duration: 2000, easing: Easing.ease }),
          ),
          -1,
          false,
        );
        break;

      case 'thinking':
        // Tilt and gentle pulse
        rotation.value = withTiming(-5, { duration: 300 });
        scale.value = withRepeat(
          withSequence(
            withTiming(1.1, { duration: 800, easing: Easing.ease }),
            withTiming(1, { duration: 800, easing: Easing.ease }),
          ),
          -1,
          false,
        );
        break;

      case 'replying':
        // Quick bounce animation (one-shot)
        bounceY.value = withSequence(
          withTiming(-8, { duration: 150, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 150, easing: Easing.in(Easing.quad) }),
        );
        scale.value = withSequence(
          withTiming(1.15, { duration: 150 }),
          withTiming(1, { duration: 150 }),
        );
        break;

      case 'playful':
        // Wiggle and bounce (one-shot)
        wiggle.value = withSequence(
          withTiming(10, { duration: 100 }),
          withTiming(-10, { duration: 100 }),
          withTiming(8, { duration: 100 }),
          withTiming(-8, { duration: 100 }),
          withTiming(0, { duration: 100 }),
        );
        bounceY.value = withSequence(
          withTiming(-12, { duration: 200, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 200, easing: Easing.bounce }),
        );
        break;

      case 'celebrate':
        // Celebration spin and scale
        rotation.value = withSequence(
          withTiming(360, { duration: 600, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 0 }),
        );
        scale.value = withSequence(
          withTiming(1.3, { duration: 300, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 300, easing: Easing.bounce }),
        );
        break;

      case 'error':
        // Small shake animation
        wiggle.value = withSequence(
          withTiming(5, { duration: 50 }),
          withTiming(-5, { duration: 50 }),
          withTiming(5, { duration: 50 }),
          withTiming(-5, { duration: 50 }),
          withTiming(0, { duration: 50 }),
        );
        break;

      default:
        break;
    }
  }, [state, scale, rotation, bounceY, wiggle]);

  // Animated styles
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: scale.value },
        { rotate: `${rotation.value}deg` },
        { translateY: bounceY.value },
        { translateX: wiggle.value },
      ],
      opacity: opacity.value,
    };
  });

  // Don't render if mascot is disabled
  if (!env.feature.mascot.enabled) {
    return null;
  }

  const character = MASCOT_CHARACTERS[state];

  return (
    <View style={[styles.container, style]}>
      <Animated.View style={[animatedStyle]}>
        <Text
          style={[
            styles.character,
            {
              fontSize: sizeConfig.fontSize,
              width: sizeConfig.width,
              height: sizeConfig.height,
              lineHeight: sizeConfig.height,
            },
          ]}
        >
          {character}
        </Text>
      </Animated.View>

      {/* Debug watermark */}
      {env.feature.mascot.debug && debugInfo && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugText}>{state}</Text>
          {debugInfo.hasTimeout && <Text style={[styles.debugText, styles.debugTimeout]}>⏱</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  character: {
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  debugContainer: {
    position: 'absolute',
    bottom: -16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  debugText: {
    fontSize: 8,
    color: '#666',
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 2,
    borderRadius: 2,
  },
  debugTimeout: {
    marginTop: 1,
  },
});

export default Mascot;
