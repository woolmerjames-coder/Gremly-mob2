/**
 * VoicePulse - Recording Animation Component
 *
 * Shows visual feedback around the mic icon:
 * - Recording: pulsing red circle + red dot indicator
 * - Transcribing: spinning dashed border
 * - Idle: nothing visible
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
  interpolate,
} from 'react-native-reanimated';

export type VoicePulseState = 'idle' | 'recording' | 'transcribing';

interface VoicePulseProps {
  state: VoicePulseState;
  size?: number;
  recordingColor?: string;
  transcribingColor?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export const VoicePulse: React.FC<VoicePulseProps> = ({
  state,
  size = 32,
  recordingColor = '#E74C3C',
  transcribingColor = '#3498DB',
  children,
  style,
}) => {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);
  const dotScale = useSharedValue(0);
  const spinValue = useSharedValue(0);

  useEffect(() => {
    if (state === 'recording') {
      // Pulse animation
      pulseScale.value = 1;
      pulseOpacity.value = 0.5;

      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 700, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 700, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );

      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 700, easing: Easing.out(Easing.ease) }),
          withTiming(0.5, { duration: 700, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );

      // Show recording dot
      dotScale.value = withTiming(1, { duration: 200 });

      // Stop spinner
      cancelAnimation(spinValue);
      spinValue.value = 0;
    } else if (state === 'transcribing') {
      // Stop pulse
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);

      pulseScale.value = withTiming(1.3, { duration: 200 });
      pulseOpacity.value = withTiming(0.3, { duration: 200 });

      // Start spinner
      spinValue.value = 0;
      spinValue.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false,
      );

      // Hide recording dot
      dotScale.value = withTiming(0, { duration: 150 });
    } else {
      // Idle - fade everything out
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      cancelAnimation(spinValue);

      pulseScale.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(0, { duration: 200 });
      dotScale.value = withTiming(0, { duration: 150 });
      spinValue.value = 0;
    }

    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      cancelAnimation(spinValue);
    };
  }, [state, pulseScale, pulseOpacity, dotScale, spinValue]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
    backgroundColor: state === 'transcribing' ? transcribingColor : recordingColor,
  }));

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinValue.value}deg` }],
    opacity: state === 'transcribing' ? 1 : 0,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
    opacity: interpolate(dotScale.value, [0, 1], [0, 1]),
  }));

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      {/* Pulse circle */}
      <Animated.View
        style={[styles.pulse, { width: size, height: size, borderRadius: size / 2 }, pulseStyle]}
      />

      {/* Spinner ring (transcribing) */}
      <Animated.View
        style={[
          styles.spinner,
          {
            width: size + 6,
            height: size + 6,
            borderRadius: (size + 6) / 2,
            borderColor: transcribingColor,
          },
          spinnerStyle,
        ]}
      />

      {/* Content (mic icon) */}
      <View style={styles.content}>{children}</View>

      {/* Recording dot */}
      <Animated.View style={[styles.dot, { backgroundColor: recordingColor }, dotStyle]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
  },
  spinner: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
  },
  content: {
    zIndex: 1,
  },
  dot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

export default VoicePulse;
