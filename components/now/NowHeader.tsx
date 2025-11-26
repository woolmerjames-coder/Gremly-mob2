/**
 * NOW Header Component
 * Displays greeting, date/time, progress, and week indicator
 */

import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Box, Text } from '../../ui';
import { NowProgressDots } from './NowProgressDots';
import { NowWeekIndicator } from './NowWeekIndicator';
import { makeStyles } from '../../design/makeStyles';
import type { NowProgressState } from '../../lib/now/nowTypes';
import type { WeekStatus } from '../../lib/now/useNowData';

interface NowHeaderProps {
  dateTimeLabel: string;
  progressState: NowProgressState;
  weekStatus: WeekStatus;
  onPressProgress?: () => void;
  onPressWeek?: () => void;
}

/**
 * Get time-of-day greeting based on current hour
 */
function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return 'Good morning';
  } else if (hour >= 12 && hour < 18) {
    return 'Good afternoon';
  } else {
    return 'Good evening';
  }
}

const useStyles = makeStyles((t) => ({
  container: {
    paddingHorizontal: t.spacing[4],
    paddingTop: t.spacing[4],
    paddingBottom: t.spacing[4],
  },
  greeting: {
    fontSize: t.typography.size.xl, // 24px - matches MindDrop header
    fontFamily: t.typography.fontFamily.bold,
    color: t.colors.moss,
    marginBottom: t.spacing[1],
  },
  dateTime: {
    fontSize: t.typography.size.sm, // 14px - matches MindDrop subtitle
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    marginBottom: t.spacing[4],
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionDivider: {
    marginTop: 16,
    marginBottom: 0,
    height: 1,
    marginHorizontal: 24,
    backgroundColor: '#E7E2D9',
  },
}));

export function NowHeader({
  dateTimeLabel,
  progressState,
  weekStatus,
  onPressProgress,
  onPressWeek,
}: NowHeaderProps) {
  const styles = useStyles();
  const greeting = getTimeOfDayGreeting();

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
      <Box style={styles.sectionDivider} />
    </Box>
  );
}
