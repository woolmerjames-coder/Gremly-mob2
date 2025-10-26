import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';
import Svg, { Circle } from 'react-native-svg';

export type GoalCardProps = {
  id: string;
  title: string;
  state: 'idle' | 'active' | 'complete';
  subtitle?: string;
  onOpen: () => void;
  onMenu: (id: string) => void;
};

export default function GoalCard({ id, title, state, subtitle, onOpen, onMenu }: GoalCardProps) {
  const lift = useMemo(() => new Animated.Value(0), []);
  const pulse = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
    if (state !== 'complete') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 150, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 150, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, state]);

  const stateColor =
    state === 'idle' ? COLORS.Sage : state === 'active' ? COLORS.Moss : COLORS.Pear;

  return (
    <Pressable
      onPress={onOpen}
      onPressIn={() =>
        Animated.timing(lift, { toValue: -2, duration: 80, useNativeDriver: true }).start()
      }
      onPressOut={() =>
        Animated.timing(lift, { toValue: 0, duration: 120, useNativeDriver: true }).start()
      }
      style={{ width: '100%' }}
    >
      <Animated.View style={[styles.card, { transform: [{ translateY: lift }] }]}>
        {/* Left status icon */}
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <Svg width={18} height={18}>
            <Circle
              cx={9}
              cy={9}
              r={7}
              stroke={stateColor}
              strokeWidth={2}
              fill={state === 'active' ? 'rgba(46,85,64,0.15)' : 'transparent'}
            />
          </Svg>
        </Animated.View>

        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>

        {/* Kebab menu */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onMenu(id);
          }}
          style={({ pressed, hovered }: any) => [
            styles.kebab,
            { opacity: hovered ? 1 : 0.7 },
            pressed && { opacity: 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open goal menu"
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Circle cx={12} cy={5} r={1.8} fill={COLORS.Moss} />
            <Circle cx={12} cy={12} r={1.8} fill={COLORS.Moss} />
            <Circle cx={12} cy={19} r={1.8} fill={COLORS.Moss} />
          </Svg>
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.Linen,
    borderRadius: RADII.card,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.2)', // Sage @20%
  },
  title: { fontWeight: '700', color: COLORS.Deep },
  subtitle: { color: 'rgba(26,51,40,0.7)', marginTop: 2, fontSize: 12 },
  kebab: { paddingHorizontal: 6, paddingVertical: 4 },
  menuWrap: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
});
