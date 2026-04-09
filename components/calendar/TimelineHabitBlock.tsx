import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Repeat } from 'lucide-react-native';
import type { CalendarItem } from '../../lib/calendar/CalendarService';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const PERIWINKLE = '#6B7AA1';
const PERIWINKLE_BORDER = '#B8C4E0';
const PERIWINKLE_WASH = 'rgba(184, 196, 224, 0.12)';
const COMPACT_THRESHOLD = 40;

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface TimelineHabitBlockProps {
  event: CalendarItem;
  top: number;
  height: number;
  left: number;
  width: number;
  onPress: (event: CalendarItem) => void;
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function TimelineHabitBlock({
  event,
  top,
  height,
  left,
  width,
  onPress,
}: TimelineHabitBlockProps) {
  const isCompact = height < COMPACT_THRESHOLD;

  return (
    <Pressable
      onPress={() => onPress(event)}
      style={[
        styles.container,
        {
          position: 'absolute',
          top,
          left,
          width,
          height,
        },
      ]}
    >
      <View style={styles.titleRow}>
        <Repeat size={11} color={PERIWINKLE} />
        <Text style={styles.title} numberOfLines={1}>
          {event.title}
        </Text>
      </View>
      {!isCompact && event.startTime && <Text style={styles.time}>{event.startTime}</Text>}
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: PERIWINKLE_BORDER,
    backgroundColor: PERIWINKLE_WASH,
    opacity: 0.75,
    paddingHorizontal: 8,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: PERIWINKLE,
    flexShrink: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  time: {
    fontSize: 11,
    color: PERIWINKLE,
    opacity: 0.6,
    marginTop: 1,
  },
});
