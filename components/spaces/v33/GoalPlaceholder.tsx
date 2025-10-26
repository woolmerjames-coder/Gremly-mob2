import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { COLORS, RADII, SPACE } from './_tokens';

export default function GoalPlaceholder() {
  const opacity = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 150,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      {/* Sample Goal Card 1 - Running */}
      <View style={styles.sampleCard}>
        <View style={styles.iconWrap}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            {/* Geometric running icon */}
            <Path
              d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z"
              fill={COLORS.Moss}
              opacity={0.4}
            />
          </Svg>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.sampleTitle}>Run 3× this week</Text>
          <Text style={styles.sampleSubtitle}>2/3 completed</Text>
        </View>
        <View style={styles.dotsWrap}>
          <View style={[styles.dot, styles.dotFilled]} />
          <View style={[styles.dot, styles.dotFilled]} />
          <View style={[styles.dot, styles.dotEmpty]} />
        </View>
      </View>

      {/* Sample Goal Card 2 - Water */}
      <View style={styles.sampleCard}>
        <View style={styles.iconWrap}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            {/* Droplet icon */}
            <Path
              d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"
              fill="none"
              stroke={COLORS.Moss}
              strokeWidth={2}
              opacity={0.4}
            />
          </Svg>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.sampleTitle}>Drink water</Text>
          <Text style={styles.sampleSubtitle}>5/8 today</Text>
        </View>
        <View style={styles.dotsWrap}>
          {[...Array(5)].map((_, i) => (
            <View key={`filled-${i}`} style={[styles.dot, styles.dotFilled]} />
          ))}
          {[...Array(3)].map((_, i) => (
            <View key={`empty-${i}`} style={[styles.dot, styles.dotEmpty]} />
          ))}
        </View>
      </View>

      {/* Helper text */}
      <Text style={styles.helperText}>
        Your active goals will appear here once you set one up — try adding something new.
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(191,216,192,0.09)', // SectionGoalsTint
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 18,
    paddingBottom: 18,
    paddingHorizontal: 20,
  },
  sampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34,34,34,0.08)',
    opacity: 0.5,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  sampleTitle: {
    color: COLORS.Deep,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    letterSpacing: 0.2,
    lineHeight: 20,
  },
  sampleSubtitle: {
    color: 'rgba(26,51,40,0.6)',
    fontSize: 13,
    marginTop: 2,
    lineHeight: 17,
  },
  dotsWrap: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotFilled: {
    backgroundColor: COLORS.Pear,
  },
  dotEmpty: {
    backgroundColor: COLORS.Sage,
    opacity: 0.4,
  },
  helperText: {
    color: 'rgba(26,51,40,0.7)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '400',
  },
});
