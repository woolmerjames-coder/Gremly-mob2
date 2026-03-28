/**
 * EventRow - Displays an event note (Key Date) within time block sections
 *
 * Matches CalendarHint styling: simple inline row with icon, event name,
 * Space name on right, and chevron. No card styling.
 */

import React from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { Calendar, ChevronRight } from 'lucide-react-native';
import { format, differenceInDays, parseISO } from 'date-fns';
import { getDateService } from '../../lib/date';
import { useSpaceById } from '../../lib/store/selectors';
import type { Note } from '../../lib/types';

interface EventRowProps {
  event: Note; // Note with subtype='event'
  onPress: (event: Note) => void;
  isFirst?: boolean;
}

/**
 * Format 24h time (HH:mm) to 12h format (h:mm AM)
 */
function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Calculate "Day X of Y" for multi-day events
 */
function getMultiDayIndicator(
  startDate: string,
  endDate: string,
  currentDate: string,
): string | null {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const current = parseISO(currentDate);

  const totalDays = differenceInDays(end, start) + 1;
  const currentDay = differenceInDays(current, start) + 1;

  if (totalDays <= 1) return null;
  return `Day ${currentDay}/${totalDays}`;
}

export function EventRow({ event, onPress, isFirst: _isFirst = false }: EventRowProps) {
  const space = useSpaceById(event.space_id || '');

  // Get today's date for multi-day calculation
  const today = format(getDateService().now(), 'yyyy-MM-dd');

  // Format time if present
  const timeDisplay = event.event_time ? formatTime(event.event_time) : null;

  // Multi-day indicator
  const multiDayIndicator =
    event.target_date && event.end_date
      ? getMultiDayIndicator(event.target_date, event.end_date, today)
      : null;

  // Build the main text: "Event Name" or "Event Name · 2:00 PM" or "Event Name · Day 1/3"
  const eventName = event.title || 'Untitled event';
  let displayText = eventName;
  if (timeDisplay) {
    displayText = `${eventName} · ${timeDisplay}`;
  } else if (multiDayIndicator) {
    displayText = `${eventName} · ${multiDayIndicator}`;
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => onPress(event)}
      accessibilityRole="button"
      accessibilityLabel={`Event: ${eventName}${space ? `, in ${space.name}` : ''}${timeDisplay ? `, at ${timeDisplay}` : ''}`}
    >
      <Calendar size={14} color="#999999" style={styles.icon} />
      <Text style={styles.text} numberOfLines={1}>
        {displayText}
      </Text>
      {space && (
        <Text style={styles.spaceName} numberOfLines={1}>
          {space.name}
        </Text>
      )}
      <ChevronRight size={16} color="#CCCCCC" style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    // No background, no border - subtle muted row matching CalendarHint
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: '#888888', // Muted gray matching CalendarHint
  },
  spaceName: {
    fontSize: 12,
    color: '#AAAAAA', // Slightly more muted than main text
    marginLeft: 8,
    maxWidth: 100,
  },
  chevron: {
    marginLeft: 8,
  },
});

export default EventRow;
