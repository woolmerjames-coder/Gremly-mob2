/**
 * KeyDateRow - Renders a single event note row in the Key Dates section
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { format, parseISO, isToday, isPast } from 'date-fns';
import { BRAND } from '../../design/brand';
import type { Note } from '../../lib/types';

export interface KeyDateRowProps {
  event: Note; // Note with subtype='event'
  onPress: (event: Note) => void;
  linkedItemCount?: number;
}

/**
 * Format the date display for a key date
 * Returns "Feb 18" or "Feb 18-22" if end_date exists
 */
function formatDateRange(targetDate: string, endDate?: string | null): string {
  const startDate = parseISO(targetDate);
  const formattedStart = format(startDate, 'MMM d');

  if (endDate) {
    const end = parseISO(endDate);
    // If same month, show "Feb 18-22", otherwise "Feb 18 - Mar 2"
    if (startDate.getMonth() === end.getMonth()) {
      return `${formattedStart}-${format(end, 'd')}`;
    }
    return `${formattedStart} - ${format(end, 'MMM d')}`;
  }

  return formattedStart;
}

/**
 * Format time for display (e.g., "14:00" -> "2:00 PM")
 */
function formatEventTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export default function KeyDateRow({ event, onPress, linkedItemCount = 0 }: KeyDateRowProps) {
  const targetDate = event.target_date;

  if (!targetDate) {
    return null; // Event notes should always have a target_date
  }

  const parsedDate = parseISO(targetDate);
  const isTodayEvent = isToday(parsedDate);
  const isPastEvent = isPast(parsedDate) && !isTodayEvent;

  const dateDisplay = formatDateRange(targetDate, event.end_date);
  const eventName = event.title || 'Untitled Event';

  // Right side: time if exists, otherwise linked item count
  let rightContent: string | null = null;
  if (event.event_time) {
    rightContent = formatEventTime(event.event_time);
  } else if (linkedItemCount > 0) {
    rightContent = `${linkedItemCount} item${linkedItemCount > 1 ? 's' : ''}`;
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        isTodayEvent && styles.todayContainer,
        isPastEvent && styles.pastContainer,
        pressed && styles.pressed,
      ]}
      onPress={() => onPress(event)}
    >
      {/* Date */}
      <View style={styles.dateColumn}>
        <Text
          style={[
            styles.dateText,
            isTodayEvent && styles.todayText,
            isPastEvent && styles.pastText,
          ]}
        >
          {dateDisplay}
        </Text>
      </View>

      {/* Event name */}
      <View style={styles.nameColumn}>
        <Text
          style={[styles.nameText, isPastEvent && styles.pastText]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {eventName}
        </Text>
      </View>

      {/* Right side: time or linked count */}
      {rightContent && (
        <View style={styles.rightColumn}>
          <Text style={[styles.rightText, isPastEvent && styles.pastText]}>{rightContent}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    marginBottom: 8,
    ...BRAND.elevation.one,
  },
  todayContainer: {
    borderLeftWidth: 3,
    borderLeftColor: BRAND.colors.goldenPear,
  },
  pastContainer: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  dateColumn: {
    width: 72,
    marginRight: 12,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  todayText: {
    color: BRAND.colors.goldenPear,
  },
  pastText: {
    color: BRAND.colors.inkMuted,
  },
  nameColumn: {
    flex: 1,
    marginRight: 8,
  },
  nameText: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  rightColumn: {
    flexShrink: 0,
  },
  rightText: {
    fontSize: 13,
    color: BRAND.colors.inkSubtle,
  },
});
