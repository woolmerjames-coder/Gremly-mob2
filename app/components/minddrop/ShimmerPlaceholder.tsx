/**
 * ShimmerPlaceholder - Animated skeleton placeholder with shimmer effect
 * Used for loading states in Mind Drop cards
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface ShimmerPlaceholderProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
}

export const ShimmerPlaceholder: React.FC<ShimmerPlaceholderProps> = ({
  width,
  height,
  borderRadius = 4,
  style,
}) => {
  const translateX = useSharedValue(-100);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(100, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={[styles.shimmerContainer, { width, height, borderRadius }, style]}>
      <Animated.View style={[styles.shimmerGradient, shimmerStyle]}>
        {/* Gradient effect using layered views since LinearGradient can be heavy */}
        <View style={styles.gradientLeft} />
        <View style={styles.gradientCenter} />
        <View style={styles.gradientRight} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  shimmerContainer: {
    backgroundColor: 'rgba(191, 216, 192, 0.2)',
    overflow: 'hidden',
  },
  shimmerGradient: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    width: '200%',
  },
  gradientLeft: {
    flex: 1,
    backgroundColor: 'rgba(191, 216, 192, 0.3)',
  },
  gradientCenter: {
    flex: 1,
    backgroundColor: 'rgba(191, 216, 192, 0.6)',
  },
  gradientRight: {
    flex: 1,
    backgroundColor: 'rgba(191, 216, 192, 0.3)',
  },
});

export default ShimmerPlaceholder;
