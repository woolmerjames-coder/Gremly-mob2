/**
 * TimeBlockSection - A time block section with colored accent bar + text header
 *
 * Renders a section for grouping items by time of day (morning, afternoon, etc.)
 * Includes optional calendar hint showing upcoming events.
 *
 * Style matches CalendarScreen: accent bar + uppercase label header.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Calendar, ChevronRight } from 'lucide-react-native';

// Section colors matching CalendarScreen
const SECTION_COLORS = {
  locked: '#6B8F71', // Sage green
  morning: '#D4A574', // Muted warm tan
  afternoon: '#C9956C', // Muted terracotta
  evening: '#A89BC9', // Muted lavender
  anytime: '#999999', // Gray
} as const;

// Section labels
const SECTION_LABELS = {
  locked: 'LOCKED IN',
  morning: 'MORNING',
  afternoon: 'AFTERNOON',
  evening: 'EVENING',
  anytime: 'ANY TIME',
} as const;

type TimeBlock = 'locked' | 'morning' | 'afternoon' | 'evening' | 'anytime';

interface CalendarHintData {
  count: number;
  times: string[]; // e.g., ['9:30 AM', '1:00 PM']
}

interface TimeBlockSectionProps {
  block: TimeBlock;
  isCurrent?: boolean;
  isFirst?: boolean;
  calendarHint?: CalendarHintData;
  onCalendarHintPress?: () => void;
  children: React.ReactNode; // The item rows
}

export function TimeBlockSection({
  block,
  isCurrent = false,
  isFirst = false,
  calendarHint,
  onCalendarHintPress,
  children,
}: TimeBlockSectionProps) {
  const color = SECTION_COLORS[block];
  const label = SECTION_LABELS[block];

  return (
    <View style={styles.container}>
      {/* Section divider - heavier line between sections, hidden for first */}
      {!isFirst && <View style={styles.sectionDivider} />}

      {/* Section header with colored accent bar */}
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.sectionHeaderAccent, { backgroundColor: color }]} />
        <Text style={[styles.sectionHeader, { color }]}>{label}</Text>
      </View>

      {/* Calendar hint - shown below header, above items */}
      {calendarHint && calendarHint.count > 0 && (
        <Pressable
          style={styles.calendarHint}
          onPress={onCalendarHintPress}
          accessibilityRole="button"
          accessibilityLabel={`${calendarHint.count} calendar events`}
        >
          <Calendar size={14} color="#999999" strokeWidth={2} />
          <Text style={styles.calendarHintText}>
            {calendarHint.count} event{calendarHint.count !== 1 ? 's' : ''}
            {calendarHint.times.length > 0 && ` (${calendarHint.times.slice(0, 2).join(', ')})`}
          </Text>
          <ChevronRight size={12} color="#CCCCCC" strokeWidth={2} />
        </Pressable>
      )}

      {/* Empty state for current block with no items and no events */}
      {React.Children.count(children) === 0 && !calendarHint && isCurrent && (
        <Text style={styles.emptyText}>Nothing scheduled</Text>
      )}

      {/* Items content area */}
      <View style={styles.itemsContainer}>
        {/* Render children with dividers between items */}
        {React.Children.toArray(children).map((child, index, arr) => (
          <React.Fragment key={index}>
            {child}
            {/* Add divider if not last item */}
            {index < arr.length - 1 && <View style={styles.itemDivider} />}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Transparent background - sits on linen cream
  },
  sectionDivider: {
    height: 1.5,
    backgroundColor: '#D5D2CC', // Heavier divider between sections
    marginHorizontal: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeaderAccent: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    marginRight: 10,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  calendarHint: {
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
  calendarHintText: {
    flex: 1,
    fontSize: 12,
    color: '#888888',
    fontWeight: '500',
  },
  itemsContainer: {
    // Items are full-width now (no left column)
  },
  emptyText: {
    fontSize: 14,
    color: '#666666',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  itemDivider: {
    height: 1,
    backgroundColor: '#EDEAE5', // Lighter than section divider - subtle separation
    marginLeft: 16, // Align with content edge
  },
});

export default TimeBlockSection;
