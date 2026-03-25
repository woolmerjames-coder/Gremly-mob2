import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
  createAnimatedComponent,
} from 'react-native-reanimated';
import { BRAND } from '../../../design/brand';

const AnimatedCircle = createAnimatedComponent(Circle);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SIZE = 36;
const STROKE_WIDTH = 2.5;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface TrainingIconProps {
  completedCount: number;
  totalCount: number;
  onPress: () => void;
}

export default function TrainingIcon({ completedCount, totalCount, onPress }: TrainingIconProps) {
  const progress = totalCount > 0 ? Math.min(completedCount / totalCount, 1) : 0;
  const isComplete = completedCount >= totalCount;

  // Arc animation
  const animatedOffset = useSharedValue(CIRCUMFERENCE);

  useEffect(() => {
    const targetOffset = CIRCUMFERENCE * (1 - progress);
    animatedOffset.value = withTiming(targetOffset, {
      duration: 800,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [progress, animatedOffset]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: animatedOffset.value,
  }));

  // Pulse animation
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isComplete) {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 200 });
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [isComplete, scale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const center = SIZE / 2;

  return (
    <AnimatedPressable
      onPress={onPress}
      style={[styles.container, pulseStyle]}
      accessibilityLabel={`Training progress: ${completedCount} of ${totalCount} complete`}
      accessibilityRole="button"
    >
      <Svg width={SIZE} height={SIZE} style={styles.svg}>
        {/* Background track */}
        <Circle
          cx={center}
          cy={center}
          r={RADIUS}
          stroke="#E4E6DE"
          strokeWidth={STROKE_WIDTH}
          fill="none"
        />
        {/* Progress arc */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={RADIUS}
          stroke={BRAND.colors.mossGreen}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          // @ts-expect-error reanimated animatedProps not in svg Circle type defs
          animatedProps={arcProps}
          fill="none"
        />
      </Svg>
      {/* Center text */}
      <View style={styles.labelContainer}>
        <Animated.Text style={styles.label}>{completedCount}</Animated.Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
  },
  svg: {
    transform: [{ rotate: '-90deg' }],
  },
  labelContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
});
