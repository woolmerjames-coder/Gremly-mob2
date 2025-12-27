/**
 * TodayMascotHeader - Phase 9: Energy & Momentum
 * Header component for Today v2 screen
 * Step 4: Adds wave animation on pull-to-refresh
 */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ToastAndroid,
  Platform,
  Pressable,
  Animated,
  Image,
} from 'react-native';
import { Box, Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import { runCortexProxyDiag } from '../../lib/cortex/diag';
import { isReducedMotion } from '../../lib/a11y/reducedMotion';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Mascot = require('../../assets/mascot/gremly-mascot.png');

type TimeWindow = 'morning' | 'midday' | 'evening';

export interface TodayMascotHeaderProps {
  greeting: string;
  subline: string;
  streakCount?: number;
  completedToday?: number;
  plannedToday?: number;
  showMood?: boolean;
  timeWindow: TimeWindow;
  reducedMotion?: boolean;
  onMascotPress?: () => void;
  waveTick?: number; // Trigger wave animation on change
}

export default function TodayMascotHeader({
  greeting,
  subline,
  streakCount = 0,
  completedToday = 0,
  plannedToday = 0,
  showMood = false,
  timeWindow,
  reducedMotion = false,
  onMascotPress,
  waveTick = 0,
}: TodayMascotHeaderProps) {
  const t = useTokens();
  const [isWaving, setIsWaving] = useState(false);
  const waveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scaleAnim = useMemo(() => new Animated.Value(1), []);

  // Dev-only: Cortex ping via long-press
  const devPing = async () => {
    const res = await runCortexProxyDiag();
    const msg = res.ok ? 'Cortex OK' : `Cortex FAIL: ${res.error}`;
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert('Cortex Ping', msg);
    }
  };

  // Trigger wave animation when waveTick changes
  useEffect(() => {
    if (waveTick > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsWaving(true);

      const rm = typeof reducedMotion === 'boolean' ? reducedMotion : isReducedMotion();
      const duration = rm ? 300 : 800;

      // Animate scale if not reduced motion
      if (!rm) {
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.06,
            duration: duration / 2,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: duration / 2,
            useNativeDriver: true,
          }),
        ]).start();
      }

      // Clear any existing timer
      if (waveTimerRef.current) {
        clearTimeout(waveTimerRef.current);
      }

      // Reset wave state after animation duration
      waveTimerRef.current = setTimeout(() => {
        setIsWaving(false);
      }, duration);
    }

    return () => {
      if (waveTimerRef.current) {
        clearTimeout(waveTimerRef.current);
      }
    };
  }, [waveTick, reducedMotion, scaleAnim]);

  return (
    <Box gap={3} testID="today-mascot-header">
      {/* Greeting and subline */}
      <Box gap={1}>
        <Text variant="title" testID="today-greeting">
          {greeting}
        </Text>
        <Text variant="subtle" testID="today-subline">
          {subline}
        </Text>
      </Box>

      {/* Quick chips row */}
      <View style={styles.chipsRow} testID="today-chips-row">
        {/* Streak chip */}
        {streakCount > 0 && (
          <View style={[styles.chip, { backgroundColor: t.colors.accentMint }]}>
            <Text style={[styles.chipText, { color: t.colors.primary }]}>
              🔥 {streakCount} day{streakCount !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* Progress chip */}
        <View style={[styles.chip, { backgroundColor: t.colors.primary }]}>
          <Text
            style={[styles.chipText, { color: t.colors.onPrimary }]}
            testID="today-progress-chip"
          >
            {completedToday}/{plannedToday} today
          </Text>
        </View>

        {/* Mood chip (optional) */}
        {showMood && (
          <View style={[styles.chip, { backgroundColor: t.colors.accentPeri }]}>
            <Text style={[styles.chipText, { color: t.colors.primary }]}>😊 Mood</Text>
          </View>
        )}
      </View>

      {/* Mascot with PNG image */}
      <Pressable
        onPress={onMascotPress}
        onLongPress={__DEV__ ? devPing : undefined}
        delayLongPress={250}
        disabled={!onMascotPress && !__DEV__}
        testID="today-mascot"
        accessibilityLabel="Gremly mascot"
        accessibilityRole="button"
      >
        <Animated.View
          style={[
            styles.mascotWrap,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Image source={Mascot} style={{ width: 72, height: 72 }} resizeMode="contain" />
        </Animated.View>
      </Pressable>

      {/* Test-only: Wave tick indicator */}
      {process.env.JEST_WORKAROUND === '1' && (
        <View testID="mascot-wave-tick" accessibilityLabel={String(waveTick ?? 0)} />
      )}
    </Box>
  );
}

const styles = StyleSheet.create({
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  mascotWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
});
