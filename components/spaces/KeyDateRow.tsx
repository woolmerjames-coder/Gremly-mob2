/**
 * KeyDateRow - Renders a single event note row in the Key Dates section
 *
 * Simple, warm list-item styling that matches Gremly's aesthetic.
 * Format: "Feb 12 · QBR" with subtle left accent for today's events.
 * Goals get a star icon and countdown display.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { format, parseISO, isToday, isPast, differenceInDays } from 'date-fns';
import { Star } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import type { Note } from '../../lib/types';
import { getTodayDayString } from '../../lib/date';

export interface KeyDateRowProps {
  event: Note; // Note with subtype='event'
  onPress: (event: Note) => void;
  linkedItemCount?: number;
  isGoal?: boolean; // Whether this is a goal event
}

/**
 * Format the date display for a key date
 * Returns "Feb 18" or "3 days" for multi-day events
 */
function formatDateDisplay(targetDate: string, endDate?: string | null): string {
  const startDate = parseISO(targetDate);
  const formattedStart = format(startDate, 'MMM d');

  if (endDate) {
    const end = parseISO(endDate);
    const days = differenceInDays(end, startDate) + 1;
    if (days > 1) {
      return `${formattedStart} (${days} days)`;
    }
  }

  return formattedStart;
}

/**
 * Format time for display (e.g., "14:00" -> "2pm")
 */
function formatEventTime(time: string): string {
  const [hours] = time.split(':').map(Number);
  const period = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  return `${displayHours}${period}`;
}

export default function KeyDateRow({
  event,
  onPress,
  linkedItemCount = 0,
  isGoal = false,
}: KeyDateRowProps) {
  const targetDate = event.target_date;
  const hasDate = Boolean(targetDate);

  const parsedDate = targetDate ? parseISO(targetDate) : null;
  const isTodayEvent = parsedDate ? isToday(parsedDate) : false;
  const isPastEvent = parsedDate ? isPast(parsedDate) && !isTodayEvent : false;

  const dateDisplay = hasDate ? formatDateDisplay(targetDate!, event.end_date) : 'No date';
  const eventName = event.title || 'Untitled Event';

  // Calculate countdown for goals
  const getCountdown = (): { text: string; isPast: boolean; isToday: boolean } | null => {
    if (!isGoal || !parsedDate) return null;

    const today = getTodayDayString();
    const days = differenceInDays(parsedDate, parseISO(today));

    if (days === 0) {
      return { text: 'Today', isPast: false, isToday: true };
    } else if (days < 0) {
      return { text: `${Math.abs(days)} days ago`, isPast: true, isToday: false };
    } else if (days === 1) {
      return { text: '1 day', isPast: false, isToday: false };
    } else {
      return { text: `${days} days`, isPast: false, isToday: false };
    }
  };

  const countdown = getCountdown();

  // Build the suffix: time or linked count (not for goals - they show countdown)
  let suffix = '';
  if (!isGoal) {
    if (event.event_time) {
      suffix = ` · ${formatEventTime(event.event_time)}`;
    } else if (linkedItemCount > 0) {
      suffix = ` · ${linkedItemCount} item${linkedItemCount > 1 ? 's' : ''}`;
    }
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        isGoal && styles.goalRow,
        isTodayEvent && styles.todayRow,
        isPastEvent && styles.pastRow,
        pressed && styles.pressed,
      ]}
      onPress={() => onPress(event)}
      accessibilityRole="button"
      accessibilityLabel={`${isGoal ? 'Goal: ' : ''}${eventName}, ${dateDisplay}`}
    >
      {/* Goal star icon */}
      {isGoal && (
        <Star
          size={14}
          color={BRAND.colors.goldenPear}
          fill={BRAND.colors.goldenPear}
          style={styles.goalIcon}
        />
      )}

      {/* Left accent line for today (non-goals only) */}
      {isTodayEvent && !isGoal && <View style={styles.todayAccent} />}

      {/* Date */}
      <Text
        style={[
          styles.dateText,
          isGoal && styles.goalDateText,
          isTodayEvent && styles.todayDateText,
          isPastEvent && styles.pastText,
          !hasDate && styles.noDateText,
        ]}
      >
        {dateDisplay}
      </Text>

      {/* Separator dot */}
      <Text style={[styles.separator, isPastEvent && styles.pastText]}>·</Text>

      {/* Event name */}
      <Text
        style={[styles.nameText, isGoal && styles.goalNameText, isPastEvent && styles.pastText]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {eventName}
      </Text>

      {/* Suffix (time or linked count) for non-goals */}
      {suffix ? (
        <Text style={[styles.suffixText, isPastEvent && styles.pastText]}>{suffix}</Text>
      ) : null}

      {/* Countdown for goals */}
      {countdown && (
        <Text
          style={[
            styles.countdownText,
            countdown.isToday && styles.countdownToday,
            countdown.isPast && styles.countdownPast,
          ]}
        >
          {countdown.text}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingLeft: 0,
  },
  goalRow: {
    // Goals have slightly more visual weight
  },
  todayRow: {
    paddingLeft: 0,
  },
  pastRow: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.7,
  },
  goalIcon: {
    marginRight: 6,
  },
  todayAccent: {
    width: 3,
    height: 20,
    backgroundColor: BRAND.colors.goldenPear,
    borderRadius: 1.5,
    marginRight: 8,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    minWidth: 48,
  },
  noDateText: {
    color: BRAND.colors.inkSubtle,
    fontStyle: 'italic',
  },
  goalDateText: {
    fontWeight: '500',
  },
  todayDateText: {
    color: BRAND.colors.goldenPear,
    fontWeight: '500',
  },
  separator: {
    fontSize: 14,
    color: BRAND.colors.inkSubtle,
    marginHorizontal: 6,
  },
  nameText: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    flex: 1,
  },
  goalNameText: {
    fontWeight: '600',
  },
  suffixText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    marginLeft: 4,
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    marginLeft: 8,
  },
  countdownToday: {
    color: BRAND.colors.goldenPear,
  },
  countdownPast: {
    color: BRAND.colors.inkMuted,
  },
  pastText: {
    color: BRAND.colors.inkMuted,
  },
});
