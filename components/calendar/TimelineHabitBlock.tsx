import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import type { CalendarItem } from '../../lib/calendar/CalendarService';

const HABIT_COLOR = '#6B8F71';

interface TimelineHabitBlockProps {
  item: CalendarItem;
  style?: ViewStyle;
}

export default function TimelineHabitBlock({ item, style }: TimelineHabitBlockProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title} numberOfLines={1}>
        {item.title}
      </Text>
      {item.startTime && <Text style={styles.time}>{item.startTime}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 6,
    padding: 4,
    backgroundColor: HABIT_COLOR,
    borderLeftWidth: 3,
    borderLeftColor: '#4A6B4F',
    overflow: 'hidden',
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  time: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },
});
