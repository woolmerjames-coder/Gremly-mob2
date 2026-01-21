/**
 * TimeBlockSection - A time block section with icon+label on left, items on right
 *
 * Renders a horizontal section for grouping items by time of day (morning, afternoon, etc.)
 * Includes optional calendar hint showing upcoming events.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Sunrise, Sun, Sunset, Clock, Lock, Calendar, ChevronRight } from 'lucide-react-native';
import { BRAND } from '../../design/brand';

// Time block configuration with colors and icons
const TIME_BLOCK_CONFIG = {
  locked: { label: 'Locked In', Icon: Lock, color: '#6B8F71' }, // sage green
  morning: { label: 'Morning', Icon: Sunrise, color: '#F59E0B' },
  afternoon: { label: 'Afternoon', Icon: Sun, color: '#F97316' },
  evening: { label: 'Evening', Icon: Sunset, color: '#8B5CF6' },
  anytime: { label: 'Any time', Icon: Clock, color: '#666666' },
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
  const config = TIME_BLOCK_CONFIG[block];
  const IconComponent = config.Icon;

  return (
    <View style={styles.container}>
      {/* Divider - hidden for first section */}
      {!isFirst && <View style={styles.divider} />}

      <View style={styles.contentRow}>
        {/* Left column: icon, label */}
        <View style={styles.leftColumn}>
          {/* Icon container with tinted background */}
          <View style={[styles.iconContainer, { backgroundColor: `${config.color}15` }]}>
            <IconComponent size={16} color={config.color} strokeWidth={2} />
          </View>

          {/* Label */}
          <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
        </View>

        {/* Right column: calendar hint + children (item rows) */}
        <View style={styles.rightColumn}>
          {/* Calendar hint row - shown at top */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Transparent background - sits on linen cream
  },
  divider: {
    height: 1.5,
    backgroundColor: '#D5D2CC', // Darker than item divider - marks new section
    marginLeft: 16,
    marginRight: 4, // Align with item dividers (rightColumn paddingRight)
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'stretch', // Makes left column match right column height
  },
  leftColumn: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center', // Centers content vertically within stretched height
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 5,
    textAlign: 'center',
  },
  rightColumn: {
    flex: 1,
    paddingRight: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#666666',
    paddingVertical: 12,
  },
  itemDivider: {
    height: 1,
    backgroundColor: '#EDEAE5', // Lighter than section divider - subtle separation
  },
  calendarHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
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
});

export default TimeBlockSection;
