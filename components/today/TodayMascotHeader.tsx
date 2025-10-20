/**
 * TodayMascotHeader - Phase 9: Energy & Momentum
 * Header component for Today v2 screen
 */

import React from 'react';
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
}: TodayMascotHeaderProps) {
  const t = useTokens();

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
          {reducedMotion ? (
            <Text style={styles.mascotIcon}>🐸</Text>
          ) : (
            <Text style={styles.mascotIcon}>🐸</Text>
          )}
          <Text variant="subtle" style={styles.mascotLabel}>
            {timeWindow === 'morning' && 'Ready to start?'}
            {timeWindow === 'midday' && 'Keep going!'}
            {timeWindow === 'evening' && 'Almost done!'}
          </Text>
        </View>
      </TouchableOpacity>
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
