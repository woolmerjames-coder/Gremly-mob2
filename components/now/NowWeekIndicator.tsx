/**
 * NOW Week Indicator Component
 * Shows weekly habit status at a glance
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { Box, Text } from '../../ui';

interface NowWeekIndicatorProps {
  status?: 'week_complete' | 'flexible' | 'on_track_today' | 'last_chance';
}

export function NowWeekIndicator({ status = 'on_track_today' }: NowWeekIndicatorProps) {
  const getIndicator = () => {
    switch (status) {
      case 'week_complete':
        return '●';
      case 'flexible':
        return '○';
      case 'on_track_today':
        return '◐';
      case 'last_chance':
        return '◑';
      default:
        return '◐';
    }
  };

  const getColor = () => {
    switch (status) {
      case 'week_complete':
        return '#4CAF50';
      case 'flexible':
        return '#9E9E9E';
      case 'on_track_today':
        return '#2196F3';
      case 'last_chance':
        return '#FF9800';
      default:
        return '#2196F3';
    }
  };

  return (
    <Box style={styles.container}>
      <Text style={styles.label}>WEEK:</Text>
      <Text style={[styles.indicator, { color: getColor() }]}>{getIndicator()}</Text>
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
