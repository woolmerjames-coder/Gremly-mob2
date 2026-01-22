/**
 * NowCalendarEventRow - Read-only row for external calendar events
 *
 * Displays calendar events from connected providers (Outlook, Google).
 * Similar to NowFocusRow but:
 * - No completion checkbox (read-only)
 * - Calendar icon instead of entity icon
 * - Shows time range (e.g., "2:00 PM - 3:00 PM" or "All day")
 * - Shows location if present
 * - Distinguished styling with left accent border
 */

import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from '../../ui';
import { Calendar, MapPin, Clock } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import type { CalendarItem } from '../../lib/store/calendarSelectors';

// Provider accent colors
const PROVIDER_COLORS = {
  outlook: '#0078D4', // Microsoft blue
  google: '#4285F4', // Google blue
  default: '#9CA6E0', // Periwinkle smoke fallback
};

interface NowCalendarEventRowProps {
  event: CalendarItem;
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
  isFirst = false,
  isLast = false,
  onPress,
}: NowCalendarEventRowProps) {
  const accentColor = event.provider ? PROVIDER_COLORS[event.provider] : PROVIDER_COLORS.default;

  const timeRangeText = formatTimeRange(event.time, event.endTime);
  const isAllDay = !event.time;

  return (
    <View style={styles.container}>
      {/* Top divider (unless first item) */}
      {!isFirst && <View style={styles.divider} />}

      <TouchableOpacity
        style={styles.row}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
        accessibilityRole="button"
        accessibilityLabel={`Calendar event: ${event.title}, ${timeRangeText}`}
      >
        {/* Left accent border */}
        <View style={[styles.accentBorder, { backgroundColor: accentColor }]} />

        {/* Calendar icon */}
        <View style={[styles.iconContainer, { backgroundColor: `${accentColor}15` }]}>
          <Calendar size={16} color={accentColor} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Title */}
          <Text style={styles.title} numberOfLines={1}>
            {event.title}
          </Text>

          {/* Meta row: time and location */}
          <View style={styles.metaRow}>
            {/* Time chip */}
            <View style={[styles.chip, isAllDay && styles.chipAllDay]}>
              <Clock size={10} color={isAllDay ? accentColor : BRAND.colors.inkSubtle} />
              <Text style={[styles.chipText, isAllDay && { color: accentColor }]}>
                {timeRangeText}
              </Text>
            </View>

            {/* Location chip */}
            {event.location && (
              <View style={styles.chip}>
                <MapPin size={10} color={BRAND.colors.inkSubtle} />
                <Text style={styles.chipText} numberOfLines={1}>
                  {event.location}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Provider badge (subtle) */}
        {event.provider && (
          <View style={styles.providerBadge}>
            <Text style={[styles.providerText, { color: accentColor }]}>
              {event.provider === 'outlook' ? 'O' : 'G'}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Bottom padding for last item */}
      {isLast && <View style={styles.bottomPadding} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(156, 166, 224, 0.06)', // Very subtle periwinkle tint
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    marginLeft: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingLeft: 0, // Accent border takes space
    paddingRight: 12,
    minHeight: 52,
  },
  accentBorder: {
    width: 3,
    alignSelf: 'stretch',
    marginRight: 12,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  title: {
    fontSize: 14,
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  chipAllDay: {
    backgroundColor: 'rgba(156, 166, 224, 0.15)', // Periwinkle tint for all-day
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
    maxWidth: 120,
  },
  providerBadge: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  providerText: {
    fontSize: 10,
    fontWeight: '700',
  },
  bottomPadding: {
    height: 4,
  },
});

export default NowCalendarEventRow;
