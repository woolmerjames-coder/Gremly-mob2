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
      <Calendar size={14} color="#999999" strokeWidth={2} />
      <Text style={styles.text}>
        {eventLabel}
        {timesLabel}
      </Text>
      <ChevronRight size={12} color="#CCCCCC" strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    gap: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    flex: 1,
    fontSize: 12,
    color: '#888888', // Muted gray
    fontWeight: '500',
  },
});

export default CalendarHint;
