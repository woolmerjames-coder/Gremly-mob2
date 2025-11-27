/**
 * NOW Header Component
 * Displays greeting, date/time, progress, and week indicator
 */

import React from 'react';
import { Pressable, TextStyle, Image } from 'react-native';
import { Box, Text } from '../../ui';
import { makeStyles, useTokens } from '../../design/makeStyles';
import { NowSegmentedBar } from './NowSegmentedBar';
import { Icon } from '../ui/Icon';
import type { NowProgressState, NowWeeklyHabitSummary } from '../../lib/now/nowTypes';
import GREMLY_CLIPBOARD from '../../assets/mascot/clipboardgremly.png';

interface NowHeaderProps {
  dateTimeLabel: string;
  progressState: NowProgressState;
  progressPercent: number;
  weeklySummaries: NowWeeklyHabitSummary[];
  capturesCount: number;
  completedCount?: number;
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
  }

  return 'Good evening';
}

function getHabitWeekStatus(
  weeklySummaries: NowWeeklyHabitSummary[],
): 'ahead' | 'on_track' | 'behind' {
  if (!weeklySummaries || weeklySummaries.length === 0) {
    return 'on_track';
  }

  const allAhead = weeklySummaries.every((summary) => summary.status === 'week_complete');
  if (allAhead) {
    return 'ahead';
  }

  const anyBehind = weeklySummaries.some((summary) => summary.status === 'last_chance');
  if (anyBehind) {
    return 'behind';
  }

  return 'on_track';
}

const useStyles = makeStyles((t) => ({
  container: {
    paddingTop: t.spacing[4],
    paddingBottom: t.spacing[4],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing[4],
  },
  greetingColumn: {
    flex: 1,
  },
  mascotContainer: {
    width: 58,
    height: 58,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mascotImage: {
    width: 52,
    height: 52,
  },
  greeting: {
    fontSize: t.typography.size.xl,
    fontFamily: t.typography.fontFamily.bold,
    color: t.colors.moss,
    marginBottom: t.spacing[1],
  },
  dateTime: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    marginBottom: t.spacing[4],
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing[4],
    marginTop: t.spacing[2],
    marginBottom: t.spacing[2],
  },
  weekLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: t.colors.subtle,
  },
  weekStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: t.spacing[1],
  },
  weekStatusAhead: {
    color: t.colors.mossGreen,
  },
  weekStatusOnTrack: {
    color: t.colors.subtle,
  },
  weekStatusBehind: {
    color: t.colors.warning,
  },
  capturesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  capturesIcon: {
    marginRight: 4,
  },
  capturesText: {
    fontSize: 12,
    fontWeight: '500',
    color: t.colors.mossGreen,
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
  progressPercent,
  weeklySummaries,
  capturesCount,
  completedCount,
  onPressProgress,
  onPressWeek,
}: NowHeaderProps) {
  const styles = useStyles();
  const tokens = useTokens();
  const greeting = getTimeOfDayGreeting();
  const habitStatus = getHabitWeekStatus(weeklySummaries);
  const fallbackRatio =
    progressState.totalEligibleCount > 0
      ? progressState.completedCount / progressState.totalEligibleCount
      : 0;
  const progressRatio = Math.max(
    0,
    Math.min(1, Number.isFinite(progressPercent) ? progressPercent : fallbackRatio),
  );

  let weekLabelText = 'HABITS ON TRACK';
  let weekLabelStyle: TextStyle = styles.weekStatusOnTrack;

  if (habitStatus === 'ahead') {
    weekLabelText = 'HABITS AHEAD';
    weekLabelStyle = styles.weekStatusAhead;
  } else if (habitStatus === 'behind') {
    weekLabelText = 'HABITS BEHIND';
    weekLabelStyle = styles.weekStatusBehind;
  }

  const hasCaptures = (capturesCount ?? 0) > 0;

  return (
    <Box style={styles.container}>
      <Box style={styles.topRow}>
        <Box style={styles.greetingColumn}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.dateTime}>{dateTimeLabel}</Text>
        </Box>
        <Box style={styles.mascotContainer}>
          <Image source={GREMLY_CLIPBOARD} style={styles.mascotImage} resizeMode="contain" />
        </Box>
      </Box>
      <NowSegmentedBar progress={progressRatio} onPress={onPressProgress} />

      <Pressable onPress={onPressWeek} style={styles.weekRow} accessibilityRole="button">
        <Box style={styles.weekLeft}>
          <Text style={styles.weekLabel}>WEEK:</Text>
          <Text style={[styles.weekStatus, weekLabelStyle]}>{weekLabelText}</Text>
        </Box>
        {hasCaptures && (
          <Box style={styles.capturesRow}>
            <Box style={styles.capturesIcon}>
              <Icon name="FileText" size="sm" color={tokens.colors.mossGreen} />
            </Box>
            <Text style={styles.capturesText}>LOGS: {capturesCount}</Text>
          </Box>
        )}
      </Pressable>
      <Box style={styles.sectionDivider} />
    </Box>
  );
}
