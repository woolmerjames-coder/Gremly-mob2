import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';
import { Pressable } from 'react-native';

export type MenuItem = { key: string; label: string; danger?: boolean };

type Props = {
  items: MenuItem[];
  onSelect: (key: string) => void;
};

export default function Menu({ items, onSelect }: Props) {
  const y = useMemo(() => new Animated.Value(6), []);
  const opacity = useMemo(() => new Animated.Value(0), []);
  const scale = useMemo(() => new Animated.Value(0.96), []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [y, opacity, scale]);

  return (
    <Animated.View style={[styles.menu, { opacity, transform: [{ translateY: y }, { scale }] }]}>
      {items.map((it) => (
        <Pressable
          key={it.key}
          onPress={() => onSelect(it.key)}
          style={({ hovered, pressed }: any) => [
            styles.menuItem,
            (hovered || pressed) && { backgroundColor: 'rgba(191,216,192,0.12)' },
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.menuText, it.danger && styles.menuTextDanger]}>{it.label}</Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  menu: {
    minWidth: 160,
    backgroundColor: COLORS.Linen,
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.Sage,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  menuItem: {
    paddingHorizontal: SPACE.md,
    paddingVertical: 10,
  },
  menuText: { color: COLORS.Deep, fontWeight: '600' },
  menuTextDanger: { color: '#A91D1D' },
});
