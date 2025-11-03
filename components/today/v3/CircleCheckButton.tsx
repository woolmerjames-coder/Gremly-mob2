import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { BRAND } from '../../../design/brand';

type Props = {
  size?: number;
  onPress?: () => void;
  style?: ViewStyle;
  ariaLabel?: string;
};

export default function CircleCheckButton({
  size = 20,
  onPress,
  style,
  ariaLabel = 'Mark complete',
}: Props) {
  const [flash, setFlash] = useState(false);
  const [bg] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!flash) return;

    bg.setValue(0);
    scale.setValue(1);

    Animated.parallel([
      Animated.timing(bg, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.95, duration: 80, useNativeDriver: false }),
        Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: false }),
      ]),
    ]).start(() => {
      Animated.timing(bg, { toValue: 0, duration: 250, useNativeDriver: false }).start();
      setFlash(false);
    });
  }, [flash, bg, scale]);

  const backgroundColor = useMemo(
    () =>
      bg.interpolate({
        inputRange: [0, 1],
        outputRange: ['#FFFFFF', BRAND.colors.goldenPear],
      }),
    [bg],
  );

  return (
    <Pressable
      onPress={() => {
        setFlash(true);
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={ariaLabel}
      style={[{ width: size, height: size }, style]}
    >
      <Animated.View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor,
            transform: [{ scale }],
            borderColor: BRAND.colors.mossGreen,
          },
        ]}
      >
        {flash ? <Text style={styles.tick}>✓</Text> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  tick: {
    fontSize: 12,
    color: '#1A3328',
    fontWeight: '700',
    lineHeight: 12,
  },
});
