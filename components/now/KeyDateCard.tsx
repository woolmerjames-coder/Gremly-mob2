/**
 * KeyDateCard - Displays an event note (Key Date) in Today's Focus / Morning Brief
 *
 * Renders event notes with:
 * - Space indicator (colored dot or icon)
 * - Event name prominently
 * - Time if event_time exists
 * - Space name as subtitle
 * - Multi-day indicator (Day X of Y)
 */

import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Text } from '../../ui';
import { CalendarDays } from 'lucide-react-native';
import { format, differenceInDays, parseISO } from 'date-fns';
import { getDateService } from '../../lib/date';
import { BRAND } from '../../design/brand';
import { useSpaceById } from '../../lib/store/selectors';
import type { Note } from '../../lib/types';

// Theme colors for space dots
const THEME_COLORS: Record<string, string> = {
  deepTeal: '#0D9488',
  mint: '#34D399',
  cream: '#F59E0B',
  periwinkle: '#9CA6E0',
  default: BRAND.colors.mossGreen,
};

interface KeyDateCardProps {
  event: Note; // Note with subtype='event'
  onPress: (event: Note) => void;
}

/**
 * Format 24h time (HH:mm) to 12h format (h:mm AM)
 */
function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Calculate "Day X of Y" for multi-day events
 */
function getMultiDayIndicator(
  startDate: string,
  endDate: string,
  currentDate: string,
): string | null {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const current = parseISO(currentDate);

  const totalDays = differenceInDays(end, start) + 1;
  const currentDay = differenceInDays(current, start) + 1;

  if (totalDays <= 1) return null;
  return `Day ${currentDay}/${totalDays}`;
}

export function KeyDateCard({ event, onPress }: KeyDateCardProps) {
  const space = useSpaceById(event.space_id || '');

  // Get today's date for multi-day calculation
  const today = format(getDateService().now(), 'yyyy-MM-dd');

  // Determine the theme color for space indicator
  const themeColor = space?.theme
    ? THEME_COLORS[space.theme] || THEME_COLORS.default
    : THEME_COLORS.default;

  // Format time if present
  const timeDisplay = event.event_time ? formatTime(event.event_time) : null;

  // Multi-day indicator
  const multiDayIndicator =
    event.target_date && event.end_date
      ? getMultiDayIndicator(event.target_date, event.end_date, today)
      : null;

  // Right-side display: time takes precedence, then multi-day indicator
  const rightDisplay = timeDisplay || multiDayIndicator;

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => onPress(event)}
      accessibilityRole="button"
      accessibilityLabel={`Key date: ${event.title || 'Untitled event'}${space ? `, in ${space.name}` : ''}${timeDisplay ? `, at ${timeDisplay}` : ''}`}
    >
      {/* Left accent border - sageMist tint to distinguish from CalendarEvent */}
      <View style={styles.accentBorder} />

      {/* Content */}
      <View style={styles.content}>
        {/* Top row: Space dot + Title + Time/Day indicator */}
        <View style={styles.topRow}>
          {/* Space indicator dot */}
          <View style={[styles.spaceDot, { backgroundColor: themeColor }]} />

          {/* Event title */}
          <Text style={styles.title} numberOfLines={1}>
            {event.title || 'Untitled event'}
          </Text>

          {/* Right side: time or multi-day indicator */}
          {rightDisplay && <Text style={styles.rightText}>{rightDisplay}</Text>}
        </View>

        {/* Bottom row: Space name */}
        {space && (
          <View style={styles.bottomRow}>
            <Text style={styles.spaceName} numberOfLines={1}>
              {space.name}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.md,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    overflow: 'hidden',
    ...BRAND.elevation.one,
  },
  pressed: {
    opacity: 0.85,
  },
  accentBorder: {
    width: 4,
    backgroundColor: BRAND.colors.sageMist,
  },
  content: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spaceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    ...BRAND.typography.bodyMedium,
    color: BRAND.colors.charcoalInk,
  },
  rightText: {
    fontSize: 13,
    ...BRAND.typography.body,
    color: BRAND.colors.inkSubtle,
    marginLeft: 8,
  },
  bottomRow: {
    marginTop: 2,
    marginLeft: 16, // Align with title (past the dot)
  },
  spaceName: {
    fontSize: 12,
    ...BRAND.typography.body,
    color: BRAND.colors.inkMuted,
  },
});

export default KeyDateCard;
