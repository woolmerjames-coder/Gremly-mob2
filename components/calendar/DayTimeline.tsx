import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { CalendarItem } from '../../lib/calendar/CalendarService';

interface DayTimelineProps {
  date: string;
  items: CalendarItem[];
}

export default function DayTimeline({ date, items }: DayTimelineProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        DayTimeline — {date} ({items.length} items)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingVertical: 12 },
  text: { fontSize: 14, color: '#666' },
});
