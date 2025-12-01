/**
 * NOW Header Component
 * Displays greeting, date/time, and summary cards in a new 2-column layout
 *
 * Layout structure:
 * - Top row: greeting/date (left) + mascot (right)
 * - Cards row:
 *   - Left column: tall Today card (spans full height)
 *   - Right column: stacked Habits card (top) + Your Notes card (bottom)
 *
 * NOTE: This component does NOT handle safe area insets.
 * The parent screen (NowScreenV1) is responsible for safe area padding.
 */

import React, { useMemo } from 'react';
import { TouchableOpacity, Image, View } from 'react-native';
import { Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';
import { Icon } from '../../design-system/Icon';
import { BRAND } from '../../design/brand';
import type { NowWeeklyHabitSummary } from '../../lib/now/nowTypes';
import GREMLY_CLIPBOARD from '../../assets/mascot/clipboardgremly.png';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MOSS_GREEN = BRAND.colors.mossGreen;
const INK_CHARCOAL = BRAND.colors.charcoalInk;
const INK_SUBTLE = BRAND.colors.inkSubtle;
const TRACK_GREY = '#E5E4DF'; // Light grey track background
const CARD_BG_TODAY = '#FAF8F5'; // Warm cream for Today card
const CARD_BG_HABITS = '#F2F7F0'; // Very light sage for Habits card
const CARD_BG_NOTES = '#F7F7F5'; // Neutral warm for Your Notes card

// Progress bar color evolution thresholds
const PROGRESS_COLOR_EMPTY = '#E5E4DF'; // 0%
const PROGRESS_COLOR_LOW = '#BFD8C0'; // 1-50%
const PROGRESS_COLOR_MID = '#2E5540'; // 51-99% (moss green)
const PROGRESS_COLOR_COMPLETE = '#E0C47A'; // 100% (golden pear)

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Segment for habits progress bar */
type HabitSegment = {
  isOnTrack: boolean;
};

interface NowHeaderProps {
  dateTimeLabel: string;
  /** Total tasks for today (including habits + todos) */
  totalTasksToday: number;
  /** Total completed tasks for today */
  totalCompletedToday: number;
  weeklySummaries: NowWeeklyHabitSummary[];
  capturesCount: number;
  onPressProgress?: () => void;
  onPressWeek?: () => void;
  /** Handler for Your Notes card press */
  onPressLogs?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Compute progress bar fill color based on completion percentage
 * 0%: light grey, 1-50%: light green, 51-99%: moss green, 100%: golden pear
 */
function getProgressFillColor(percent: number): string {
  if (percent === 0) return PROGRESS_COLOR_EMPTY;
  if (percent >= 1) return PROGRESS_COLOR_COMPLETE;
  if (percent > 0.5) return PROGRESS_COLOR_MID;
  return PROGRESS_COLOR_LOW;
}

/**
 * Compute habit segments from weekly summaries
 * Each habit becomes a segment that's either on-track or off-track
 */
function computeHabitSegments(weeklySummaries: NowWeeklyHabitSummary[]): {
  segments: HabitSegment[];
  onTrackCount: number;
  totalCount: number;
} {
  if (!weeklySummaries || weeklySummaries.length === 0) {
    // Empty state: no habits, no segments
    return {
      segments: [],
      onTrackCount: 0,
      totalCount: 0,
    };
  }

  const segments: HabitSegment[] = weeklySummaries.map((summary) => ({
    // Consider "on_track_today", "week_complete", and "flexible" as on-track
    // "last_chance" means behind/needs attention
    isOnTrack: summary.status !== 'last_chance',
  }));

  const onTrackCount = segments.filter((s) => s.isOnTrack).length;

  return {
    segments,
    onTrackCount,
    totalCount: segments.length,
  };
}

export function NowHeader({
  dateTimeLabel,
  totalTasksToday,
  totalCompletedToday,
  weeklySummaries,
  capturesCount,
  onPressProgress,
  onPressWeek,
  onPressLogs,
}: NowHeaderProps) {
  const styles = useStyles();
  const greeting = getTimeOfDayGreeting();

  // Calculate Today progress (clamped to [0, 1])
  const todayProgress =
    totalTasksToday > 0 ? Math.min(1, Math.max(0, totalCompletedToday / totalTasksToday)) : 0;

  // Compute progress bar fill color based on completion
  const progressFillColor = getProgressFillColor(todayProgress);

  // Build today label (e.g., "2/4")
  const todayLabel = `${totalCompletedToday}/${totalTasksToday}`;

  // Compute habit segments for the segmented bar
  const habitData = useMemo(() => computeHabitSegments(weeklySummaries), [weeklySummaries]);

  // Build habits label (e.g., "3/5 this week")
  const habitsLabel = `${habitData.onTrackCount}/${habitData.totalCount} this week`;

  // Build notes count text
  const notesCountText = capturesCount === 0 ? '0' : `${capturesCount}`;

  // Secondary meta for Today card
  const habitCount = habitData.totalCount;
  const todoCount = totalTasksToday - habitCount; // Approximate todos (tasks minus habits)

  return (
    <View style={styles.container}>
      {/* Top row: Greeting/Date + Mascot */}
      <View style={styles.topRow}>
        <View style={styles.greetingColumn}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.dateTime}>{dateTimeLabel}</Text>
          {/* Partial divider under date - brand accent */}
          <View style={styles.headerDivider} />
        </View>
        <View style={styles.mascotColumn}>
          {/* Soft circular glow behind mascot */}
          <View style={styles.mascotGlow} />
          <Image source={GREMLY_CLIPBOARD} style={styles.mascotImage} resizeMode="contain" />
        </View>
      </View>

      {/* Summary Cards Row: Left (Today) + Right (Habits + Your Notes stacked) */}
      <View style={styles.summaryRow}>
        {/* Left Column: Today Card */}
        <View style={styles.leftColumn}>
          <TouchableOpacity style={styles.todayCard} onPress={onPressProgress} activeOpacity={0.8}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <Icon name="Calendar" size="sm" color={MOSS_GREEN} />
                <Text style={styles.todayCardTitle}>Today</Text>
              </View>
              <View style={styles.cardValueRow}>
                <Text style={styles.todayCardValue}>{todayLabel}</Text>
                <Icon name="ChevronRight" size="sm" color={INK_SUBTLE} />
              </View>
            </View>
            <View style={styles.todayCardContent}>
              <View style={styles.progressBarTrack}>
                {todayProgress > 0 && (
                  <View
                    style={[
                      styles.progressBarFill,
                      { flex: todayProgress, backgroundColor: progressFillColor },
                    ]}
                  />
                )}
                {todayProgress < 1 && (
                  <View style={[styles.progressBarRemainder, { flex: 1 - todayProgress }]} />
                )}
              </View>
              <Text style={styles.secondaryMeta}>
                {habitCount} habits · {Math.max(0, todoCount)} todos
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Right Column: Habits + Your Notes stacked */}
        <View style={styles.rightColumn}>
          {/* Habits Card */}
          <TouchableOpacity style={styles.habitsCard} onPress={onPressWeek} activeOpacity={0.8}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <Icon name="CheckCircle2" size="sm" color={MOSS_GREEN} />
                <Text style={styles.cardTitle}>Habits</Text>
              </View>
              <Icon name="ChevronRight" size="sm" color={INK_SUBTLE} />
            </View>
            <Text style={styles.habitsWeekValue}>{habitsLabel}</Text>
            {habitData.segments.length > 0 ? (
              <View style={styles.habitsSegmentsRow}>
                {habitData.segments.map((segment, index) => (
                  <View
                    key={index}
                    style={[
                      styles.habitSegment,
                      segment.isOnTrack ? styles.habitSegmentOn : styles.habitSegmentOff,
                    ]}
                  />
                ))}
              </View>
            ) : (
              // Empty state: show single grey track when no habits
              <View style={styles.habitsEmptyTrack} />
            )}
          </TouchableOpacity>

          {/* Your Notes Card */}
          <TouchableOpacity style={styles.notesCard} onPress={onPressLogs} activeOpacity={0.8}>
            <View style={styles.notesCardHeader}>
              <View style={styles.notesTitleRow}>
                <Icon name="FileText" size="sm" color={MOSS_GREEN} />
                <Text style={styles.notesCardTitle}>Your Notes</Text>
                <Text style={styles.notesSeparator}> · </Text>
                <Text style={styles.notesCount}>{notesCountText}</Text>
              </View>
              <Icon name="ChevronRight" size="sm" color={INK_SUBTLE} />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/**
 * Clean header layout with 2-column card arrangement:
 * - Parent screen handles SafeArea top padding
 * - Compact vertical rhythm: greeting → date → cards → divider
 */
const useStyles = makeStyles((t) => ({
  container: {
    backgroundColor: t.colors.bg,
    paddingTop: t.spacing[4], // 16px - breathing room below notch
    paddingBottom: t.spacing[1],
  },
  // Top row: horizontal layout with greeting/date on left, mascot on right
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing[4], // 16px
  },
  greetingColumn: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  mascotColumn: {
    marginLeft: t.spacing[3],
    marginTop: 8, // Nudge mascot down to align visually with card row
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  mascotGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(242, 247, 240, 0.18)', // Sage tint at 18% opacity
  },
  mascotImage: {
    width: 64,
    height: 64,
  },
  // Header divider - partial width accent under date
  headerDivider: {
    width: '32%',
    height: 3,
    backgroundColor: 'rgba(46, 85, 64, 0.18)', // Moss Green at 18% opacity
    borderRadius: 2,
    marginTop: 8,
  },
  // Typography - GREETING
  greeting: {
    fontSize: t.typography.size.xl, // 24px
    lineHeight: Math.ceil(t.typography.size.xl * 1.3), // 32px - prevents "G" clipping
    fontFamily: t.typography.fontFamily.bold,
    color: t.colors.moss,
  },
  // Typography - DATE
  dateTime: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    marginTop: 0, // Tight coupling with greeting
  },
  // Summary row - 2 equal-width columns
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: t.spacing[4], // 16px
    marginTop: 12,
    marginBottom: 6,
    gap: 12, // Column gap between left and right
  },
  // Left column: contains Today card, stretches to match right column height
  leftColumn: {
    flex: 1,
  },
  // Right column: stacked Habits + Your Notes cards
  rightColumn: {
    flex: 1,
    flexDirection: 'column',
    gap: 12, // Row gap between Habits and Your Notes
  },
  // Today card - matches combined height of right column cards
  todayCard: {
    height: 130,
    backgroundColor: CARD_BG_TODAY,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 6, // Reduced top padding for better vertical centering
    paddingBottom: 12,
    justifyContent: 'space-between',
    // Subtle elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  todayCardTitle: {
    fontSize: 14,
    fontFamily: t.typography.fontFamily.bold,
    color: INK_CHARCOAL,
  },
  todayCardValue: {
    fontSize: 13,
    fontFamily: t.typography.fontFamily.medium,
    color: MOSS_GREEN,
  },
  todayCardContent: {
    gap: 6,
  },
  // Habits card (top of right column)
  habitsCard: {
    height: 77,
    backgroundColor: CARD_BG_HABITS,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'space-between',
    // Subtle elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  habitsWeekValue: {
    fontSize: 12,
    fontFamily: t.typography.fontFamily.regular,
    color: MOSS_GREEN,
    marginTop: -4, // Tight spacing below title row
    marginLeft: 22, // Align with text after icon
    marginBottom: 6, // Space before progress segments
  },
  // Your Notes card (bottom of right column)
  notesCard: {
    height: 41,
    backgroundColor: CARD_BG_NOTES,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    // Subtle elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  notesCardTitle: {
    fontSize: 14,
    fontFamily: t.typography.fontFamily.medium,
    color: INK_CHARCOAL,
  },
  notesSeparator: {
    fontSize: 14,
    fontFamily: t.typography.fontFamily.regular,
    color: 'rgba(34, 34, 34, 0.5)',
  },
  notesCount: {
    fontSize: 14,
    fontFamily: t.typography.fontFamily.medium,
    color: INK_CHARCOAL,
  },
  // Notes card specific header - no flex expansion
  notesCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // No flex: 1 so it doesn't expand, keeping count close to title
  },
  // Shared card header row
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  cardValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: t.typography.fontFamily.medium,
    color: INK_CHARCOAL,
  },
  secondaryMeta: {
    fontSize: 12,
    fontFamily: t.typography.fontFamily.regular,
    color: 'rgba(34, 34, 34, 0.7)',
    marginTop: 2,
  },
  cardValue: {
    fontSize: 13,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
  },
  cardValueSmall: {
    fontSize: 12,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
  },
  // Today's pill progress bar
  progressBarTrack: {
    flexDirection: 'row',
    height: 16,
    backgroundColor: TRACK_GREY,
    borderRadius: 999, // Soft pill shape
    overflow: 'hidden',
  },
  progressBarFill: {
    borderRadius: 999,
  },
  progressBarRemainder: {
    backgroundColor: 'transparent',
  },
  // Habits segmented bar
  habitsSegmentsRow: {
    flexDirection: 'row',
    height: 5, // Slightly smaller height
    gap: 6, // More breathing room between segments
    justifyContent: 'center',
    marginTop: 4, // More vertical padding above
    marginBottom: 6, // More vertical padding below
  },
  habitSegment: {
    flex: 1,
    maxWidth: 22, // Slightly smaller segments for breathing room
    height: 5,
    borderRadius: 999, // Soft pill shape
  },
  habitSegmentOn: {
    backgroundColor: MOSS_GREEN,
  },
  habitSegmentOff: {
    backgroundColor: TRACK_GREY,
  },
  // Empty state track for habits
  habitsEmptyTrack: {
    height: 5,
    backgroundColor: TRACK_GREY,
    borderRadius: 999,
    marginTop: 4,
    marginBottom: 6,
  },
  // Divider - separates header from Today's Focus section
  sectionDivider: {
    marginTop: 6,
    marginBottom: 6,
    height: 1,
    marginHorizontal: 24,
    backgroundColor: '#E7E2D9',
  },
}));
