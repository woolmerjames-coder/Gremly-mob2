/**
 * KeyDateRow - Renders a single event note row in the Key Dates section
 *
 * Simple, warm list-item styling that matches Gremly's aesthetic.
 * Format: "Feb 12 · QBR" with subtle left accent for today's events.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { format, parseISO, isToday, isPast, differenceInDays } from 'date-fns';
import { BRAND } from '../../design/brand';
import type { Note } from '../../lib/types';

export interface KeyDateRowProps {
  event: Note; // Note with subtype='event'
  onPress: (event: Note) => void;
  linkedItemCount?: number;
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

export default function KeyDateRow({ event, onPress, linkedItemCount = 0 }: KeyDateRowProps) {
  const targetDate = event.target_date;

  if (!targetDate) {
    return null; // Event notes should always have a target_date
  }

  const parsedDate = parseISO(targetDate);
  const isTodayEvent = isToday(parsedDate);
  const isPastEvent = isPast(parsedDate) && !isTodayEvent;

  const dateDisplay = formatDateDisplay(targetDate, event.end_date);
  const eventName = event.title || 'Untitled Event';

  // Build the suffix: time or linked count
  let suffix = '';
  if (event.event_time) {
    suffix = ` · ${formatEventTime(event.event_time)}`;
  } else if (linkedItemCount > 0) {
    suffix = ` · ${linkedItemCount} item${linkedItemCount > 1 ? 's' : ''}`;
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        isTodayEvent && styles.todayRow,
        isPastEvent && styles.pastRow,
        pressed && styles.pressed,
      ]}
      onPress={() => onPress(event)}
      accessibilityRole="button"
      accessibilityLabel={`${eventName}, ${dateDisplay}`}
    >
      {/* Left accent line for today */}
      {isTodayEvent && <View style={styles.todayAccent} />}

      {/* Date */}
      <Text
        style={[
          styles.dateText,
          isTodayEvent && styles.todayDateText,
          isPastEvent && styles.pastText,
        ]}
      >
        {dateDisplay}
      </Text>

      {/* Separator dot */}
      <Text style={[styles.separator, isPastEvent && styles.pastText]}>·</Text>

      {/* Event name */}
      <Text
        style={[styles.nameText, isPastEvent && styles.pastText]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {eventName}
      </Text>

      {/* Suffix (time or linked count) */}
      {suffix ? (
        <Text style={[styles.suffixText, isPastEvent && styles.pastText]}>{suffix}</Text>
      ) : null}
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
  todayRow: {
    paddingLeft: 0,
  },
  pastRow: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.7,
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
  suffixText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    marginLeft: 4,
  },
  pastText: {
    color: BRAND.colors.inkMuted,
  },
});
