/**
 * HabitWeeklyRow - Displays a habit with weekly progress in divider-row style
 *
 * Matches Gremly Today styling with:
 * - Left accent bar (Moss Green)
 * - Title + frequency
 * - 7 day dots showing progress
 * - Status badge (text only)
 * - Fraction display (e.g., "4/7")
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Box, Text } from '../../ui';
import type {
  WeeklyHabitStats,
  DayDot,
  HabitStatus,
} from '../../lib/today/hooks/useWeeklyHabitStats';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HabitWeeklyRowProps {
  /** Enriched habit object from useWeeklyHabitStats */
  habit: WeeklyHabitStats;
  /** Whether to show bottom divider */
  showDivider?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MOSS_GREEN = '#2E5540';
const GOLDEN_PEAR = '#E0C47A';
const DOT_DONE = MOSS_GREEN;
const DOT_MISSED = '#C8C8C8';
const DOT_FUTURE = '#EAEAEA';

const DOT_SIZE = 6;
const DOT_GAP = 6;
const ACCENT_WIDTH = 4;
const ROW_HEIGHT = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getStatusLabel(status: HabitStatus): string {
  switch (status) {
    case 'on_track':
      return 'On track';
    case 'needs_attention':
      return 'Needs attention';
    case 'done_for_week':
      return 'Done for week';
    default:
      return '';
  }
}

function getStatusColor(status: HabitStatus): string {
  switch (status) {
    case 'on_track':
    case 'done_for_week':
      return MOSS_GREEN;
    case 'needs_attention':
      return GOLDEN_PEAR;
    default:
      return '#757575';
  }
}

function getDotColor(dot: DayDot): string {
  switch (dot) {
    case 'done':
      return DOT_DONE;
    case 'missed':
      return DOT_MISSED;
    case 'future':
      return DOT_FUTURE;
    default:
      return DOT_FUTURE;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function HabitWeeklyRow({ habit, showDivider = true }: HabitWeeklyRowProps) {
  const statusLabel = getStatusLabel(habit.status);
  const statusColor = getStatusColor(habit.status);
  const fraction = `${habit.weeklyCompleted}/${habit.weeklyTarget}`;

  return (
    <View style={[styles.row, showDivider && styles.rowWithDivider]}>
      {/* Left accent bar */}
      <View style={styles.accent} />

      {/* Main content */}
      <View style={styles.content}>
        {/* Top section: title and status */}
        <View style={styles.topRow}>
          <View style={styles.titleSection}>
            <Text style={styles.title} numberOfLines={1}>
              {habit.name}
            </Text>
            <Text style={styles.frequency}>{habit.formattedFrequency}</Text>
          </View>

          {/* Status + fraction on right */}
          <View style={styles.rightSection}>
            <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
            <Text style={styles.fraction}>{fraction}</Text>
          </View>
        </View>

        {/* Day dots */}
        <View style={styles.dotsContainer}>
          {habit.dayDots.map((dot, index) => (
            <View key={index} style={[styles.dot, { backgroundColor: getDotColor(dot) }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    minHeight: ROW_HEIGHT,
    paddingVertical: 8,
  },
  rowWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  accent: {
    width: ACCENT_WIDTH,
    backgroundColor: MOSS_GREEN,
    borderRadius: 6,
    marginRight: 12,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  titleSection: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 2,
  },
  frequency: {
    fontSize: 13,
    color: '#757575',
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  fraction: {
    fontSize: 13,
    fontWeight: '600',
    color: '#424242',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: DOT_GAP,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});

export default HabitWeeklyRow;
