import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Mascot from '../../../assets/mascot/mascot.ai.svg';
import { BRAND } from '../../../design/brand';
import { isReducedMotion } from '../../../lib/a11y/reducedMotion';

type Props = {
  onPress?: () => void;
};

export default function MascotBadge({ onPress }: Props) {
  const scale = useMemo(() => new Animated.Value(1), []);
  const [waving, setWaving] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Gentle pulse on mount (respect reduced motion)
  useEffect(() => {
    const rm = isReducedMotion();
    if (!rm) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.06, duration: 180, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scale]);

  // Optional: Small wave on press (subtle)
  const handlePress = () => {
    const rm = isReducedMotion();
    if (!rm) {
      setWaving(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setWaving(false), 600);
    }
    onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Mascot"
      accessibilityHint="Opens tips"
      hitSlop={8}
      testID="today-v3-mascot-badge"
    >
      <Animated.View
        style={[styles.wrap, { transform: [{ scale }] }]}
        accessibilityRole="image"
        accessibilityLabel="Mascot badge"
      >
        <View style={styles.circle}>
          <Mascot width={28} height={28} />
        </View>
        {waving && <View style={styles.wave} />}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: 999,
    padding: 6,
    ...BRAND.elevation.one,
  },
  wave: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(160, 215, 192, 0.25)', // soft sage flash
  },
});
