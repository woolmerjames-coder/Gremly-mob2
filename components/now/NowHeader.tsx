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

import React from 'react';
import { TouchableOpacity, Image, View } from 'react-native';
import { Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';
import { Icon } from '../../design-system/Icon';
import { BRAND } from '../../design/brand';
import GREMLY_CLIPBOARD from '../../assets/mascot/clipboardgremly.png';
import type { CalendarEvent } from '../../lib/calendar/CalendarClient';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MOSS_GREEN = BRAND.colors.mossGreen;
const INK_CHARCOAL = BRAND.colors.charcoalInk;
const INK_SUBTLE = BRAND.colors.inkSubtle;
const LINEN_CREAM = '#F9F6F1'; // Official Gremly background-light
const TRACK_GREY = '#D8D6D3'; // Darker grey track for better contrast
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

interface NowHeaderProps {
  dateTimeLabel: string;
  /** Total tasks for today (including habits + todos) */
  totalTasksToday: number;
  /** Total completed tasks for today */
  totalCompletedToday: number;
  /** Number of habits due today */
  todayHabitCount: number;
  /** Number of todos due today */
  todayTodoCount: number;
  capturesCount: number;
  /** Number of habits that are up to date (checked in within cadence window) */
  habitsUpToDate: number;
  /** Total number of building habits */
  habitsTotal: number;
  /** Remaining time estimate in minutes for incomplete todos */
  remainingMinutes?: number;
  /** Calendar events for today */
  calendarEvents?: CalendarEvent[];
  onPressProgress?: () => void;
  onPressWeek?: () => void;
  /** Handler for Calendar card press - navigates to CalendarScreen */
  onCalendarPress?: () => void;
  /** Handler for Your Notes card press - opens YourNotesPopup */
  onNotesPress?: () => void;
  /** Handler for mascot press - opens help */
  onMascotPress?: () => void;
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

export function NowHeader({
  dateTimeLabel,
  totalTasksToday,
  totalCompletedToday,
  todayHabitCount: _todayHabitCount,
  todayTodoCount: _todayTodoCount,
  capturesCount,
  habitsUpToDate,
  habitsTotal,
  remainingMinutes = 0,
  calendarEvents = [],
  onPressProgress,
  onPressWeek,
  onCalendarPress,
  onNotesPress,
  onMascotPress,
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

  // Build habits label (e.g., "3/5 up to date")
  const habitsLabel = `${habitsUpToDate}/${habitsTotal} up to date`;

  // Task progress for calendar card
  const progressPercent = totalTasksToday > 0 ? (totalCompletedToday / totalTasksToday) * 100 : 0;
  const remainingHours = remainingMinutes > 0 ? (remainingMinutes / 60).toFixed(1) : null;

  // Build notes count text
  const notesCountText = capturesCount === 0 ? '0' : `${capturesCount}`;

  // Calendar summary calculations
  const eventCount = calendarEvents.length;
  const totalMinutes = calendarEvents.reduce((sum, event) => {
    if (event.isAllDay) return sum;
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    return sum + (end.getTime() - start.getTime()) / (1000 * 60);
  }, 0);
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

  // Find next upcoming event
  const now = new Date();
  const upcomingEvent = calendarEvents.find((e) => new Date(e.startAt) > now);
  const minutesUntil = upcomingEvent
    ? Math.round((new Date(upcomingEvent.startAt).getTime() - now.getTime()) / (1000 * 60))
    : null;

  // Format calendar summary text
  const calendarLine1 =
    eventCount > 0
      ? `${eventCount} event${eventCount !== 1 ? 's' : ''} · ${totalHours} hrs`
      : 'No events today';
  const calendarLine2 =
    upcomingEvent && minutesUntil !== null && minutesUntil > 0
      ? `Next: ${upcomingEvent.title.slice(0, 20)}${upcomingEvent.title.length > 20 ? '...' : ''} in ${minutesUntil} min`
      : null;

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
          <TouchableOpacity onPress={onMascotPress} activeOpacity={0.8} accessibilityLabel="Help">
            <Image source={GREMLY_CLIPBOARD} style={styles.mascotImage} resizeMode="contain" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary Cards Row: Left (Today) + Right (Habits + Your Notes stacked) */}
      <View style={styles.summaryRow}>
        {/* Left Column: Calendar Card */}
        <View style={styles.leftColumn}>
          <TouchableOpacity style={styles.todayCard} onPress={onCalendarPress} activeOpacity={0.8}>
            {/* Top row: Calendar + chevron */}
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <Icon name="Calendar" size="sm" color={MOSS_GREEN} />
                <Text style={styles.todayCardTitle}>Calendar</Text>
              </View>
              <Icon name="ChevronRight" size="sm" color={INK_SUBTLE} />
            </View>

            {/* Calendar summary */}
            <Text style={styles.calendarSummaryLine1}>{calendarLine1}</Text>
            {calendarLine2 && <Text style={styles.calendarSummaryLine2}>{calendarLine2}</Text>}

            {/* Task progress bar */}
            {totalTasksToday > 0 && (
              <View style={styles.taskProgressRow}>
                <View style={styles.taskProgressTrack}>
                  <View style={[styles.taskProgressFill, { width: `${progressPercent}%` }]} />
                </View>
                <Text style={styles.taskProgressText}>
                  {totalCompletedToday}/{totalTasksToday} done
                </Text>
              </View>
            )}
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
          </TouchableOpacity>

          {/* Your Notes Card */}
          <TouchableOpacity style={styles.notesCard} onPress={onNotesPress} activeOpacity={0.8}>
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
    backgroundColor: LINEN_CREAM, // Official Gremly background-light
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
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.6)', // Soft cream/white glow
    // iOS shadow blur for glow effect
    shadowColor: '#FAF8F5',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 25, // Blur radius ~25px
  },
  mascotImage: {
    width: 64,
    height: 64,
  },
  // Header divider - partial width accent under date
  headerDivider: {
    width: '32%',
    height: 3,
    backgroundColor: MOSS_GREEN, // Full brand green
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
    height: 110,
    backgroundColor: CARD_BG_TODAY,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 6, // Reduced top padding for better vertical centering
    paddingBottom: 12,
    justifyContent: 'flex-start',
    // Soft shadow: 0 2px 8px rgba(0,0,0,0.06)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
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
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#757575',
  },
  progressFraction: {
    fontSize: 12,
    fontWeight: '600',
    color: '#212121',
  },
  // Calendar summary text styles
  calendarSummaryLine1: {
    fontSize: 13,
    fontWeight: '500',
    color: INK_CHARCOAL,
    marginTop: 8,
  },
  calendarSummaryLine2: {
    fontSize: 11,
    fontWeight: '400',
    color: INK_SUBTLE,
    marginTop: 4,
  },
  // Task progress bar in calendar card
  taskProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 'auto',
    gap: 8,
  },
  taskProgressTrack: {
    flex: 1,
    height: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 6,
  },
  taskProgressFill: {
    height: '100%',
    backgroundColor: MOSS_GREEN,
    borderRadius: 6,
  },
  taskProgressText: {
    fontSize: 11,
    fontWeight: '500',
    color: INK_SUBTLE,
  },
  // Habits card (top of right column)
  habitsCard: {
    height: 55,
    backgroundColor: CARD_BG_HABITS,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'space-between',
    // Soft shadow: 0 2px 8px rgba(0,0,0,0.06)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
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
    minHeight: 41,
    backgroundColor: CARD_BG_NOTES,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    // Soft shadow: 0 2px 8px rgba(0,0,0,0.06)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
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
  cardTitle: {
    fontSize: 14,
    fontFamily: t.typography.fontFamily.medium,
    color: INK_CHARCOAL,
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
    height: 14,
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
