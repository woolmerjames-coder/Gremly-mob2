import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import type { CalendarItem } from '../../lib/calendar/CalendarService';

const DEFAULT_COLOR = '#4A90D9';

interface TimelineEventBlockProps {
  item: CalendarItem;
  style?: ViewStyle;
}

export default function TimelineEventBlock({ item, style }: TimelineEventBlockProps) {
  const bg = item.color ?? DEFAULT_COLOR;
  return (
    <View style={[styles.container, { backgroundColor: bg }, style]}>
      <Text style={styles.title} numberOfLines={1}>
        {item.title}
      </Text>
      {item.startTime && (
        <Text style={styles.time}>
          {item.startTime}
          {item.endTime ? ` – ${item.endTime}` : ''}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 6,
    padding: 4,
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
