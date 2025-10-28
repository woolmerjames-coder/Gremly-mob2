import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { COLORS } from './_tokens';

type GoalRowProps = {
  id: string;
  title: string;
  done: number;
  target: number;
  state: 'idle' | 'active' | 'complete';
  iconType?: 'running' | 'water' | 'default';
  onPress?: () => void;
};

export default function GoalRow({
  title,
  done,
  target,
  state,
  iconType = 'default',
  onPress,
}: GoalRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
    >
      <View style={styles.iconWrap}>{renderIcon(iconType, COLORS.Moss)}</View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle}>
          {done}/{target} completed
        </Text>
      </View>
      <View style={styles.dotsWrap}>
        {Array.from({ length: Math.min(target, 8) }).map((_, i) => (
          <View key={i} style={[styles.dot, i < done ? styles.dotFilled : styles.dotEmpty]} />
        ))}
      </View>
    </Pressable>
  );
}

function renderIcon(type: 'running' | 'water' | 'default', color: string = COLORS.Moss) {
  if (type === 'running') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path
          d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z"
          fill="none"
          stroke={`${color}CC`}
          strokeWidth={2}
        />
      </Svg>
    );
  }

  if (type === 'water') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path
          d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"
          fill="none"
          stroke={`${color}CC`}
          strokeWidth={2}
        />
      </Svg>
    );
  }

  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8} fill="none" stroke={`${color}CC`} strokeWidth={2} />
      <Path d="M8 12l3 3 5-6" stroke={`${color}CC`} strokeWidth={2} fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34,34,34,0.08)', // Subtle divider
  },
  rowPressed: {
    opacity: 0.7,
    transform: [{ translateY: 1 }],
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    color: COLORS.Text,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: 22,
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  subtitle: {
    color: COLORS.TextLight,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter-Regular',
  },
  dotsWrap: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotFilled: {
    backgroundColor: COLORS.Pear,
  },
  dotEmpty: {
    backgroundColor: COLORS.Sage,
    opacity: 0.3,
  },
});
