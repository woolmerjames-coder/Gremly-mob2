/**
 * CalendarDayView - Shows all items for a selected date
 *
 * Displays todos, habits, and journals in a minimal list style.
 * Matches Gremly brand and Today screen style exactly.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { getDateService } from '../../lib/date';
import { useCalendarItemsForDate, type CalendarItem } from '../../lib/store/calendarSelectors';
import { useEventsForDate } from '../../lib/store/selectors';
import { SpaceKeyDateRow } from './SpaceKeyDateRow';
import type { Note } from '../../lib/types';

// ═══════════════════════════════════════════════════════════════════
// BRAND COLORS
// ═══════════════════════════════════════════════════════════════════

const BRAND = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  sageMist: '#BFD8C0',
  charcoalInk: '#222222',
  mutedSageText: '#768879',
  danger: '#9E3B3B',
  white: '#FFFFFF',
};

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface CalendarDayViewProps {
  selectedDate: string; // YYYY-MM-DD
  onItemPress: (item: CalendarItem) => void;
  onKeyDatePress?: (event: Note) => void;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

// Format time for display (HH:mm -> h:mm AM/PM)
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
}

// Get subtitle text for item
function getSubtitle(item: CalendarItem): string {
  if (item.type === 'todo') {
    return item.time ? `Todo · ${formatTime(item.time)}` : 'Todo';
  }
  if (item.type === 'habit') {
    return 'Habit · Daily';
  }
  return 'Journal';
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function CalendarDayView({
  selectedDate,
  onItemPress,
  onKeyDatePress,
}: CalendarDayViewProps) {
  const dateService = getDateService();
  const items = useCalendarItemsForDate(selectedDate);
  const keyDateEvents = useEventsForDate(selectedDate);

  // Split key dates into timed and all-day
  const timedKeyDates = keyDateEvents.filter(
    (e) => e.event_time !== null && e.event_time !== undefined,
  );
  const allDayKeyDates = keyDateEvents.filter((e) => !e.event_time);

  // Split items into timed and untimed
  const timedItems = items.filter((i) => i.time !== null);
  const untimedItems = items.filter((i) => i.time === null);

  // Format the header date
  const headerDate = dateService.formatForOverlay(selectedDate);

  // Check if there's any content to show
  const hasContent = items.length > 0 || keyDateEvents.length > 0;

  // Empty state
  if (!hasContent) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.emptyContent}>
        <Text style={styles.headerDate}>{headerDate}</Text>
        <View style={styles.emptyCenter}>
          <Text style={styles.emptyText}>Nothing scheduled</Text>
          <Text style={styles.emptyHint}>Your day is wide open</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerDate}>{headerDate}</Text>

      {/* All-day Key Dates */}
      {allDayKeyDates.length > 0 && (
        <>
          <Text style={styles.sectionDivider}>All Day</Text>
          {allDayKeyDates.map((event) => (
            <SpaceKeyDateRow key={event.id} event={event} onPress={(e) => onKeyDatePress?.(e)} />
          ))}
        </>
      )}

      {/* Timed Key Dates */}
      {timedKeyDates.map((event) => (
        <SpaceKeyDateRow key={event.id} event={event} onPress={(e) => onKeyDatePress?.(e)} />
      ))}

      {/* Timed items */}
      {timedItems.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.card}
          onPress={() => onItemPress(item)}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.leftBorder,
              item.isCompleted && styles.leftBorderCompleted,
              !item.isCompleted && item.isOverdue && styles.leftBorderOverdue,
            ]}
          />
          <View style={styles.cardContent}>
            <Text
              style={[styles.title, item.isCompleted && styles.titleCompleted]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={styles.subtitle}>{getSubtitle(item)}</Text>
          </View>
        </TouchableOpacity>
      ))}

      {/* Divider for untimed section */}
      {timedItems.length > 0 && untimedItems.length > 0 && (
        <Text style={styles.sectionDivider}>No specific time</Text>
      )}

      {/* Untimed items */}
      {untimedItems.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.card}
          onPress={() => onItemPress(item)}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.leftBorder,
              item.isCompleted && styles.leftBorderCompleted,
              !item.isCompleted && item.isOverdue && styles.leftBorderOverdue,
            ]}
          />
          <View style={styles.cardContent}>
            <Text
              style={[styles.title, item.isCompleted && styles.titleCompleted]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={styles.subtitle}>{getSubtitle(item)}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.linenCream,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyContent: {
    flex: 1,
    padding: 16,
  },
  headerDate: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND.mossGreen,
    marginBottom: 16,
  },
  sectionDivider: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.mutedSageText,
    marginTop: 20,
    marginBottom: 12,
  },
  // Card
  card: {
    flexDirection: 'row',
    backgroundColor: BRAND.white,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    overflow: 'hidden',
  },
  leftBorder: {
    width: 3,
    backgroundColor: BRAND.mossGreen,
  },
  leftBorderCompleted: {
    backgroundColor: BRAND.sageMist,
  },
  leftBorderOverdue: {
    backgroundColor: BRAND.danger,
  },
  cardContent: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.charcoalInk,
    marginBottom: 2,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: BRAND.mutedSageText,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.mutedSageText,
  },
  // Empty state
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.mutedSageText,
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 14,
    color: BRAND.mutedSageText,
    opacity: 0.7,
  },
});
