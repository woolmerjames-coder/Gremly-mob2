/**
 * CalendarHint - Muted row showing calendar events within a time block
 *
 * Displays event count and times, tappable to open Calendar Screen.
 */

import React from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { Calendar, ChevronRight } from 'lucide-react-native';

interface CalendarHintProps {
  eventCount: number;
  times: string[]; // e.g., ['9:30 AM', '1:00 PM'] or ['All day']
  onPress?: () => void;
}

export function CalendarHint({ eventCount, times, onPress }: CalendarHintProps) {
  if (eventCount === 0) return null;

  const eventLabel = `${eventCount} event${eventCount !== 1 ? 's' : ''}`;
  const timesLabel = times.length > 0 ? ` (${times.slice(0, 3).join(', ')})` : '';

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${eventLabel}${timesLabel}`}
    >
      <Calendar size={14} color="#999999" style={styles.icon} />
      <Text style={styles.text}>
        {eventLabel}
        {timesLabel}
      </Text>
      <ChevronRight size={16} color="#CCCCCC" style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    // No background, no border - subtle muted row
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
    color: '#888888', // Muted gray
  },
  chevron: {
    marginLeft: 8,
  },
});

export default CalendarHint;
