/**
 * StreamingCursor - Premium "Breathing Orb" Thinking Indicator
 *
 * A golden pulsing orb that indicates Gremly is thinking/responding.
 * Features a two-layer animation: core orb + glow halo for a premium feel.
 *
 * @example
 * <InlineStreamingCursor visible={isThinking} size={10} />
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';

const GOLDEN_PEAR = '#E0C47A';

// Animation timing constants
const PULSE_DURATION = 1400; // ms for full cycle
const HALO_DELAY = 200; // ms offset for halo (slightly out of phase)
const FADE_OUT_DURATION = 150;

export function InlineStreamingCursor({ visible, size = 10 }: { visible: boolean; size?: number }) {
  // Core orb animations
  const coreProgress = useSharedValue(0);

  // Halo animations (slightly delayed)
  const haloProgress = useSharedValue(0);

  // Master opacity for fade in/out
  const masterOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Fade in
      masterOpacity.value = withTiming(1, { duration: 200 });

      // Core orb pulse: 0 → 1 → 0 (infinite)
      coreProgress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: PULSE_DURATION / 2, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: PULSE_DURATION / 2, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );

      // Halo pulse: same pattern but delayed 200ms for organic feel
      haloProgress.value = withDelay(
        HALO_DELAY,
        withRepeat(
          withSequence(
            withTiming(1, { duration: PULSE_DURATION / 2, easing: Easing.inOut(Easing.ease) }),
            withTiming(0, { duration: PULSE_DURATION / 2, easing: Easing.inOut(Easing.ease) }),
          ),
          -1,
          false,
        ),
      );
    } else {
      // Fade out smoothly
      cancelAnimation(coreProgress);
      cancelAnimation(haloProgress);
      masterOpacity.value = withTiming(0, { duration: FADE_OUT_DURATION });
    }

    return () => {
      cancelAnimation(coreProgress);
      cancelAnimation(haloProgress);
      cancelAnimation(masterOpacity);
    };
  }, [visible]);

  // Core orb: scale 1.0 → 1.3, opacity 0.7 → 1.0
  const coreAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(coreProgress.value, [0, 1], [1.0, 1.3]);
    const opacity = interpolate(coreProgress.value, [0, 1], [0.7, 1.0]);

    return {
      transform: [{ scale }],
      opacity: opacity * masterOpacity.value,
    };
  });

  // Halo: scale 1.0 → 1.5, opacity 0.2 → 0.4
  const haloAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(haloProgress.value, [0, 1], [1.0, 1.5]);
    const opacity = interpolate(haloProgress.value, [0, 1], [0.2, 0.4]);

    return {
      transform: [{ scale }],
      opacity: opacity * masterOpacity.value,
    };
  });

  if (!visible) return null;

  const haloSize = size * 2;

  return (
    <View style={[styles.container, { width: haloSize, height: haloSize }]}>
      {/* Layer 2: Glow halo (behind) */}
      <Animated.View
        style={[
          styles.halo,
          {
            width: haloSize,
            height: haloSize,
            borderRadius: haloSize / 2,
            backgroundColor: GOLDEN_PEAR,
          },
          haloAnimatedStyle,
        ]}
      />

      {/* Layer 1: Core orb (front) */}
      <Animated.View
        style={[
          styles.core,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: GOLDEN_PEAR,
          },
          coreAnimatedStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    marginBottom: 2,
  },
  halo: {
    position: 'absolute',
  },
  core: {
    position: 'absolute',
    // Subtle shadow for depth
    shadowColor: GOLDEN_PEAR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
});

// Re-export for backwards compatibility
export default InlineStreamingCursor;
