import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import type { CalendarItem } from '../../lib/calendar/CalendarService';

const SAGE_BG = '#E8F0EB';
const SAGE_TEXT = '#2D4A33';

interface AllDaySectionProps {
  events: CalendarItem[];
  onEventPress: (event: CalendarItem) => void;
}

export default function AllDaySection({ events, onEventPress }: AllDaySectionProps) {
  if (events.length === 0) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>All day</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {events.map((e) => (
          <Pressable key={e.id} onPress={() => onEventPress(e)} style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>
              {e.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
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
    gap: 6,
  },
  chip: {
    backgroundColor: SAGE_BG,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: SAGE_TEXT,
  },
});
