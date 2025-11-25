/**
 * NOW Header Component
 * Displays greeting, date/time, progress, and week indicator
 */

import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Box, Text } from '../../ui';
import { NowProgressDots } from './NowProgressDots';
import { NowWeekIndicator } from './NowWeekIndicator';
import type { NowProgressState } from '../../lib/now/nowTypes';
import type { WeekStatus } from '../../lib/now/useNowData';

interface NowHeaderProps {
  greeting: string;
  dateTimeLabel: string;
  progressState: NowProgressState;
  weekStatus: WeekStatus;
  onPressProgress?: () => void;
  onPressWeek?: () => void;
}

export function NowHeader({
  greeting,
  dateTimeLabel,
  progressState,
  weekStatus,
  onPressProgress,
  onPressWeek,
}: NowHeaderProps) {
  return (
    <Box style={styles.container}>
      <Text style={styles.greeting}>{greeting}</Text>
      <Text style={styles.dateTime}>{dateTimeLabel}</Text>

      <Box style={styles.metricsRow}>
        <TouchableOpacity onPress={onPressProgress} activeOpacity={0.7}>
          <NowProgressDots progressState={progressState} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onPressWeek} activeOpacity={0.7}>
          <NowWeekIndicator status={weekStatus} />
        </TouchableOpacity>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 4,
  },
  dateTime: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
