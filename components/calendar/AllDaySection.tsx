import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { CalendarItem } from '../../lib/calendar/CalendarService';

interface AllDaySectionProps {
  events: CalendarItem[];
}

export default function AllDaySection({ events }: AllDaySectionProps) {
  if (events.length === 0) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>All day</Text>
      <View style={styles.chips}>
        {events.map((e) => (
          <View
            key={e.id}
            style={[styles.chip, e.color ? { backgroundColor: e.color } : undefined]}
          >
            <Text style={styles.chipText} numberOfLines={1}>
              {e.title}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E6E1',
  },
  label: {
    fontSize: 11,
    color: '#9E9E9E',
    marginBottom: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    backgroundColor: '#4A90D9',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});
