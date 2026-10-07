/**
 * FedWash: the green that rises over the Gremly home when he is fed, under
 * the box, so the box stays on top and keeps taking text. The controller
 * owns the clock; this only draws. The home tells the controller where the
 * box starts so the root MomentLayer can carry on from there on day 3.
 */

/* eslint-disable react-hooks/immutability */
// Reanimated shared values are mutated through .value by design

import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import celebrationController from './CelebrationController';

const WASH: [string, string, string] = ['#C9DFC9', '#9CC4A3', '#5E9E6C'];
const OUT = Easing.bezier(0.2, 0.8, 0.2, 1);
const IN = Easing.bezier(0.6, 0, 0.8, 0.4);

interface Props {
  /** The height of the region above the box, which the wash fills */
  height: number;
  /** Where that region ends: the box's height, measured from the bottom */
  bottom: number;
}

export function FedWash({ height, bottom }: Props) {
  const washHeight = useSharedValue(0);

  useEffect(() => {
    return celebrationController.subscribe((payload) => {
      if (payload.kind !== 'moment' || !payload.moment) return;
      const m = payload.moment;
      if (m.ageOnly) return;
      const d = (ms: number) => (m.reducedMotion ? 0 : ms);
      switch (m.phase) {
        case 'wash':
          washHeight.value = withTiming(height, { duration: d(900), easing: OUT });
          break;
        case 'fall':
        case 'end':
          washHeight.value = withTiming(0, { duration: d(600), easing: IN });
          break;
        default:
          break;
      }
    });
  }, [height, washHeight]);

  const style = useAnimatedStyle(() => ({ height: washHeight.value }));

  return (
    <Animated.View style={[styles.wash, { bottom }, style]} pointerEvents="none" testID="fed-wash">
      <LinearGradient
        colors={WASH}
        locations={[0, 0.48, 1]}
        style={[styles.gradient, { height }]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wash: { position: 'absolute', left: 0, right: 0, overflow: 'hidden', zIndex: 1 },
  gradient: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
