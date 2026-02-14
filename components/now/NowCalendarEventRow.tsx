/**
 * NowCalendarEventRow - Compact row for calendar events in Gremly brand style
 *
 * Shows event title with time and location chips in muted neutral tones.
 * Accepts either a CalendarItem or Note entity.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '../../ui';
import { Calendar, Clock, MapPin } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import type { CalendarItem } from '../../lib/store/calendarSelectors';
import type { Note } from '../../lib/types';

interface NowCalendarEventRowProps {
  /** CalendarItem from calendarSelectors (existing path) */
  event?: CalendarItem;
  /** Note entity with subtype='event' (new unified path) */
  eventNote?: Note;
  isFirst?: boolean;
  isLast?: boolean;
  onPress?: () => void;
}

/**
 * Format 24h time (HH:mm) to 12h format (h:mm AM/PM)
 */
function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format time range for display
 */
function formatTimeRange(startTime: string | null, endTime: string | null | undefined): string {
  if (!startTime) {
    return 'All day';
  }

  const start = formatTime(startTime);
  if (!endTime) {
    return start;
  }

  const end = formatTime(endTime);
  return `${start} – ${end}`;
}

export function NowCalendarEventRow({
  event,
  eventNote,
  isFirst = false,
  isLast: _isLast = false,
  onPress,
}: NowCalendarEventRowProps) {
  // Normalize: support both CalendarItem and Note inputs
  const normalized = useMemo(() => {
    if (eventNote) {
      return {
        title: eventNote.title || 'Untitled Event',
        time: eventNote.event_time || null,
        endTime: eventNote.end_time ?? null,
        isAllDay: eventNote.is_all_day ?? !eventNote.event_time,
        location: eventNote.location ?? null,
      };
    }
    if (event) {
      return {
        title: event.title,
        time: event.time,
        endTime: event.endTime ?? null,
        isAllDay: !event.time,
        location: event.location ?? null,
      };
    }
    return null;
  }, [event, eventNote]);

  if (!normalized) return null;

  const timeRangeText = formatTimeRange(normalized.time, normalized.endTime);
  const isAllDay = normalized.isAllDay;
  const showChips = !isAllDay;

  return (
    <View style={styles.container}>
      {/* Top divider (unless first item) */}
      {!isFirst && <View style={styles.divider} />}

      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Calendar event: ${normalized.title}, ${timeRangeText}`}
      >
        {/* Calendar icon */}
        <Calendar size={14} color="#999999" style={{ marginRight: 10 }} />

        {/* Content */}
        <View style={styles.content}>
          {/* Title */}
          <Text style={styles.title} numberOfLines={1}>
            {normalized.title}
          </Text>

          {/* Meta row: time and location (hidden for all-day events) */}
          {showChips && (
            <View style={styles.metaRow}>
              {/* Time chip */}
              <View style={styles.chip}>
                <Clock size={10} color={BRAND.colors.inkSubtle} />
                <Text style={styles.chipText}>{timeRangeText}</Text>
              </View>

              {/* Location chip */}
              {normalized.location && (
                <View style={styles.chip}>
                  <MapPin size={10} color={BRAND.colors.inkSubtle} />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {normalized.location}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    marginLeft: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 12,
    minHeight: 36,
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 0,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
    maxWidth: 120,
  },
});

export default NowCalendarEventRow;
