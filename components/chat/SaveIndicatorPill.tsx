import React from 'react';
import { Text, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

interface Props {
  count: number;
  onPress: () => void;
  visible: boolean;
  style?: ViewStyle;
}

export function SaveIndicatorPill({ count, onPress, visible, style }: Props) {
  if (!visible || count === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={style}>
      <TouchableOpacity onPress={onPress} style={styles.pill} activeOpacity={0.7}>
        <View style={styles.dot}>
          <Text style={styles.dotText}>{count}</Text>
        </View>
        <Text style={styles.label}>Save items</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.12)',
    borderRadius: 999,
    paddingVertical: 7,
    paddingRight: 13,
    paddingLeft: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2E5540',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { color: '#F9F6F1', fontSize: 11, fontWeight: '600' },
  label: { fontFamily: 'Inter-Medium', fontSize: 12, color: '#2E5540' },
});
