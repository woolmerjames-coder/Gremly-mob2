/**
 * NOW Header Component
 * Displays greeting, date/time, progress, and week indicator
 *
 * Layout structure:
 * - Top row: greeting/date (left) + mascot (right)
 * - Progress bar
 * - Week status row with LOGS count
 *
 * NOTE: This component does NOT handle safe area insets.
 * The parent screen (NowScreenV1) is responsible for safe area padding.
 */

import React from 'react';
import { Pressable, TextStyle, Image, View } from 'react-native';
import { Text } from '../../ui';
import { makeStyles, useTokens } from '../../design/makeStyles';
import { NowSegmentedBar } from './NowSegmentedBar';
import { Icon } from '../ui/Icon';
import type { NowWeeklyHabitSummary } from '../../lib/now/nowTypes';
import GREMLY_CLIPBOARD from '../../assets/mascot/clipboardgremly.png';

interface NowHeaderProps {
  dateTimeLabel: string;
  /** Total tasks for today (including habits + todos) */
  totalTasksToday: number;
  /** Total completed tasks for today */
  totalCompletedToday: number;
  /** Progress as a fraction (0-1) */
  progressFraction: number;
  weeklySummaries: NowWeeklyHabitSummary[];
  capturesCount: number;
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

export function NowHeader({
  dateTimeLabel,
  totalTasksToday,
  totalCompletedToday,
  progressFraction,
  weeklySummaries,
  capturesCount,
  onPressProgress,
  onPressWeek,
}: NowHeaderProps) {
  const styles = useStyles();
  const tokens = useTokens();
  const greeting = getTimeOfDayGreeting();
  const habitStatus = getHabitWeekStatus(weeklySummaries);

  // Clamp progress ratio to 0-1 range
  const progressRatio = Math.max(
    0,
    Math.min(1, Number.isFinite(progressFraction) ? progressFraction : 0),
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
    <View style={styles.container}>
      {/* Top row: Greeting/Date + Mascot */}
      <View style={styles.topRow}>
        <View style={styles.leftColumn}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.dateTime}>{dateTimeLabel}</Text>
        </View>
        <View style={styles.rightColumn}>
          <Image source={GREMLY_CLIPBOARD} style={styles.mascotImage} resizeMode="contain" />
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <NowSegmentedBar progress={progressRatio} onPress={onPressProgress} />
      </View>

      {/* Week status row + LOGS */}
      <Pressable onPress={onPressWeek} style={styles.weekRow} accessibilityRole="button">
        <View style={styles.weekLeft}>
          <Text style={styles.weekLabel}>WEEK:</Text>
          <Text style={[styles.weekStatus, weekLabelStyle]}>{weekLabelText}</Text>
        </View>
        {hasCaptures && (
          <View style={styles.capturesRow}>
            <View style={styles.capturesIcon}>
              <Icon name="FileText" size="sm" color={tokens.colors.mossGreen} />
            </View>
            <Text style={styles.capturesText}>LOGS: {capturesCount}</Text>
          </View>
        )}
      </Pressable>

      {/* Section divider */}
      <View style={styles.sectionDivider} />
    </View>
  );
}

/**
 * Clean header layout with predictable spacing:
 * - Parent screen handles SafeArea top padding
 * - Clear vertical rhythm: greeting → date (4px) → progress (8px) → week row (12px)
 *
 * SPACING PATTERN (marginTop values):
 * - Greeting: no marginTop (first element)
 * - Date: marginTop: 4 (tight pair with greeting)
 * - Progress bar: marginTop: 8
 * - Week/LOGS row: marginTop: 12
 */
const useStyles = makeStyles((t) => ({
  container: {
    backgroundColor: t.colors.bg,
    paddingTop: t.spacing[5], // 20px - breathing room below notch (safe area handled by screen)
    paddingBottom: t.spacing[2],
  },
  // Top row: horizontal layout with greeting/date on left, mascot on right
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing[4],
    // NO fixed height - let content determine height
  },
  leftColumn: {
    flex: 1,
    justifyContent: 'flex-start',
    // NO overflow: 'hidden' - allow text to render fully
  },
  rightColumn: {
    marginLeft: t.spacing[3],
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  mascotImage: {
    width: 70,
    height: 70,
  },
  // Typography - GREETING
  // lineHeight must be >= fontSize * 1.25 to prevent clipping
  greeting: {
    fontSize: t.typography.size.xl, // 24px
    lineHeight: Math.ceil(t.typography.size.xl * 1.3), // 32px - prevents "G" clipping
    fontFamily: t.typography.fontFamily.bold,
    color: t.colors.moss,
    // NO marginBottom - date has marginTop instead
  },
  // Typography - DATE
  dateTime: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    marginTop: 4, // Gap from greeting
    // NO marginBottom - progressContainer has marginTop instead
  },
  // Progress bar container
  progressContainer: {
    marginTop: 8, // Gap from date
    marginBottom: 12, // Gap before week row
  },
  // Week status row
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing[4],
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
  // LOGS row
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
  // Divider - separates header from Today's Focus section
  sectionDivider: {
    marginTop: 16, // Space above divider (from WEEK/LOGS row)
    marginBottom: 12, // Space below divider (before Today's Focus)
    height: 1,
    marginHorizontal: 24,
    backgroundColor: '#E7E2D9',
  },
}));
