import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';
import { BRAND } from '../../../design/brand';

type Props = {
  visible: boolean;
  onEnd?: () => void;
  style?: ViewStyle;
};

export default function GlowPulse({ visible, onEnd, style }: Props) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(0.9));

  useEffect(() => {
    if (!visible) return;

    opacity.setValue(0);
    scale.setValue(0.9);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 120, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.06, duration: 180, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
    ]).start(() => onEnd?.());
  }, [visible, opacity, scale, onEnd]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glow,
        {
          opacity,
          transform: [{ scale }],
          backgroundColor: BRAND.colors.goldenPear,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    left: -6,
    right: -6,
    borderRadius: 12,
    zIndex: 0,
  },
});
