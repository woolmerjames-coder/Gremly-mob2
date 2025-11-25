/**
 * NOW Header Component
 * Displays greeting, date/time, progress, and week indicator
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { Box, Text } from '../../ui';
import { NowProgressDots } from './NowProgressDots';
import { NowWeekIndicator } from './NowWeekIndicator';

export function NowHeader() {
  // Placeholder data - will be replaced with real data in Phase 3
  const greeting = 'Hi James — Good Morning';
  const dateTime = 'Monday, November 25 • 10:30 AM';

  return (
    <Box style={styles.container}>
      <Text style={styles.greeting}>{greeting}</Text>
      <Text style={styles.dateTime}>{dateTime}</Text>

      <Box style={styles.metricsRow}>
        <NowProgressDots mode="dots" dots={[true, false, true, false]} percent={42} />
        <NowWeekIndicator status="on_track_today" />
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
