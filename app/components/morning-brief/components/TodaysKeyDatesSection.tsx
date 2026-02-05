/**
 * TodaysKeyDatesSection
 *
 * Displays Key Date events for today at the top of Morning Brief.
 * These are informational anchors, not assignable to time blocks.
 *
 * Style matches other section headers (ON YOUR PLATE, time blocks).
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Calendar } from 'lucide-react-native';
import type { Note } from '../../../../lib/types';

// Colors matching CalendarScreen and other Morning Brief sections
const COLORS = {
  linenCream: '#F9F6F1',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  divider: '#E8E6E1',
  mossGreen: '#2E5540',
  surface: '#FFFFFF',
};

// Section color for Key Dates - warm calendar color
const SECTION_COLOR = '#D4A574';

interface TodaysKeyDatesSectionProps {
  /** Key Date events for today */
  keyDates: Note[];
  /** Function to get space name by ID */
  getSpaceName?: (spaceId: string | null | undefined) => string | undefined;
  /** Called when user taps an event */
  onKeyDatePress?: (event: Note) => void;
}

/**
 * Format time string (HH:mm) to display format (2:00 PM)
 */
function formatTime(time: string): string {
  const [hourStr, minStr] = time.split(':');
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return min > 0 ? `${displayHour}:${minStr} ${ampm}` : `${displayHour}:00 ${ampm}`;
}

export function TodaysKeyDatesSection({
  keyDates,
  getSpaceName,
  onKeyDatePress,
}: TodaysKeyDatesSectionProps) {
  // Don't render if no key dates
  if (keyDates.length === 0) {
    return null;
  }

  const handlePress = (keyDate: Note) => {
    console.log('[MorningBrief] Key Date tapped (TodaysKeyDates):', keyDate.id, keyDate.title);
    onKeyDatePress?.(keyDate);
  };

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.sectionHeaderAccent, { backgroundColor: SECTION_COLOR }]} />
        <Calendar size={16} color={SECTION_COLOR} style={styles.sectionIcon} />
        <Text style={[styles.sectionHeader, { color: SECTION_COLOR }]}>TODAY'S KEY DATES</Text>
      </View>

      {/* Event List */}
      {keyDates.map((keyDate, index) => {
        const spaceName = getSpaceName?.(keyDate.space_id);
        const eventTime = keyDate.event_time;
        const isLast = index === keyDates.length - 1;

        return (
          <Pressable
            key={keyDate.id}
            style={[styles.eventRow, !isLast && styles.eventRowBorder]}
            onPress={() => handlePress(keyDate)}
          >
            <Calendar size={16} color={COLORS.inkMuted} style={styles.eventIcon} />
            <View style={styles.eventContent}>
              <Text style={styles.eventTitle} numberOfLines={1}>
                {keyDate.title || 'Untitled Event'}
                {eventTime && <Text style={styles.eventTime}> · {formatTime(eventTime)}</Text>}
              </Text>
            </View>
            {spaceName && (
              <Text style={styles.spaceName} numberOfLines={1}>
                {spaceName}
              </Text>
            )}
          </Pressable>
        );
      })}

      {/* Bottom divider before ON YOUR PLATE */}
      <View style={styles.sectionDivider} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
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
  sectionIcon: {
    marginRight: 6,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
  },
  eventRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
  eventIcon: {
    marginRight: 12,
  },
  eventContent: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.charcoalInk,
  },
  eventTime: {
    fontSize: 15,
    fontWeight: '400',
    color: COLORS.inkMuted,
  },
  spaceName: {
    fontSize: 13,
    color: COLORS.inkMuted,
    marginLeft: 12,
    maxWidth: 100,
  },
  sectionDivider: {
    height: 8,
    backgroundColor: COLORS.linenCream,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.divider,
  },
});
