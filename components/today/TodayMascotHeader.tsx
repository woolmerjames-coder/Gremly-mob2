/**
 * TodayMascotHeader - Phase 9: Energy & Momentum
 * Header component for Today v2 screen
 * Step 4: Adds wave animation on pull-to-refresh
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Box, Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';

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

  // Trigger wave animation when waveTick changes
  useEffect(() => {
    if (waveTick > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsWaving(true);

      // Clear any existing timer
      if (waveTimerRef.current) {
        clearTimeout(waveTimerRef.current);
      }

      // Reset wave state after animation duration
      const duration = reducedMotion ? 300 : 800;
      waveTimerRef.current = setTimeout(() => {
        setIsWaving(false);
      }, duration);
    }

    return () => {
      if (waveTimerRef.current) {
        clearTimeout(waveTimerRef.current);
      }
    };
  }, [waveTick, reducedMotion]);

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

      {/* Mascot placeholder */}
      <TouchableOpacity
        onPress={onMascotPress}
        disabled={!onMascotPress}
        activeOpacity={0.7}
        testID="today-mascot-placeholder"
      >
        <View
          style={[
            styles.mascotPlaceholder,
            {
              backgroundColor: t.colors.surface,
              borderColor: t.colors.border,
            },
          ]}
        >
          {/* TODO: Replace with Lottie animation in Phase 12 */}
          <Text style={styles.mascotIcon} testID="mascot-icon">
            {isWaving ? '👋' : '🐸'}
          </Text>
          <Text variant="subtle" style={styles.mascotLabel}>
            {isWaving && 'Hey there!'}
            {!isWaving && timeWindow === 'morning' && 'Ready to start?'}
            {!isWaving && timeWindow === 'midday' && 'Keep going!'}
            {!isWaving && timeWindow === 'evening' && 'Almost done!'}
          </Text>
        </View>
      </TouchableOpacity>

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
  mascotPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  mascotIcon: {
    fontSize: 48,
  },
  mascotLabel: {
    fontSize: 14,
    textAlign: 'center',
  },
});
