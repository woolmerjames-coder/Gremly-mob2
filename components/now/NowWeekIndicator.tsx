/**
 * NOW Week Indicator Component
 * Shows weekly habit status at a glance
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { Box, Text } from '../../ui';
import type { WeekStatus } from '../../lib/now/useNowData';

interface NowWeekIndicatorProps {
  status: WeekStatus;
}

export function NowWeekIndicator({ status }: NowWeekIndicatorProps) {
  const icons: Record<WeekStatus, string> = {
    ahead: '✓',
    on_track: '◐',
    needs_attention: '!',
  };

  const colors: Record<WeekStatus, string> = {
    ahead: '#4CAF50',
    on_track: '#2196F3',
    needs_attention: '#FF9800',
  };

  return (
    <Box style={styles.container}>
      <Text style={styles.label}>WEEK:</Text>
      <Text style={[styles.indicator, { color: colors[status] }]}>{icons[status]}</Text>
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.5,
  },
  indicator: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
