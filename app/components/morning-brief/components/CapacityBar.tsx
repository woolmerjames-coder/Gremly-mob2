import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../../../design/brand';

interface CapacityBarProps {
  remainingMinutes: number; // Can be negative (over capacity)
  totalMinutes: number; // Total available capacity
  lockedCount: number; // Number of locked items (0-3)
  maxLocks: number; // Always 3
}

function formatTime(minutes: number): string {
  const abs = Math.abs(minutes);
  if (abs < 60) return `${abs}m`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getBarColor(remaining: number, total: number): string {
  if (total <= 0) return '#C27A6B';
  const ratio = remaining / total;
  if (ratio < 0.1) return '#C27A6B'; // coral — under 10% or negative
  if (ratio < 0.3) return '#C9956C'; // warm — 10-30%
  return '#7BAF8B'; // mossGreen area — over 30%
}

export function CapacityBar({ remainingMinutes, totalMinutes, lockedCount }: CapacityBarProps) {
  const fillAnim = useMemo(() => new Animated.Value(0), []);

  const usedMinutes = totalMinutes - remainingMinutes;
  const fillPercent = totalMinutes > 0 ? Math.min((usedMinutes / totalMinutes) * 100, 100) : 100;
  const barColor = getBarColor(remainingMinutes, totalMinutes);
  const isOver = remainingMinutes < 0;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: fillPercent,
      duration: 500,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [fillPercent, fillAnim]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* Bar track */}
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: fillWidth,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>

      {/* Labels row */}
      <View style={styles.labelsRow}>
        <Text style={[styles.remainingLabel, { color: barColor }]}>
          {isOver
            ? `${formatTime(Math.abs(remainingMinutes))} over capacity`
            : `${formatTime(remainingMinutes)} remaining`}
        </Text>

        {lockedCount > 0 && (
          <Text style={styles.lockedLabel}>{`\u25C6 ${lockedCount} locked`}</Text>
        )}

        <Text style={styles.totalLabel}>{formatTime(totalMinutes)} total</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 6,
  },
  track: {
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  fill: {
    height: 3,
    borderTopRightRadius: 1.5,
    borderBottomRightRadius: 1.5,
  },
  labelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  remainingLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter-Medium',
  },
  lockedLabel: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.mossGreen,
    marginLeft: 'auto',
    marginRight: 8,
  },
  totalLabel: {
    fontSize: 11,
    color: BRAND.colors.inkMuted,
    fontFamily: 'Inter-Regular',
    marginLeft: 'auto',
  },
});
