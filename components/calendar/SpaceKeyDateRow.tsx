/**
 * SpaceKeyDateRow - Displays an event note in the Calendar day view
 *
 * Renders Key Date events from Spaces with:
 * - Time or "All day" on the left
 * - Event name in the middle
 * - Space name on the right
 * - Left border accent using Space theme or sageMist
 *
 * Visually distinct from synced CalendarEvents.
 */

import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { BRAND } from '../../design/brand';
import { useSpaceById } from '../../lib/store/selectors';
import type { Note } from '../../lib/types';

// Theme colors for space accent borders
const THEME_COLORS: Record<string, string> = {
  deepTeal: '#0D9488',
  mint: '#34D399',
  cream: '#F59E0B',
  periwinkle: '#9CA6E0',
  default: BRAND.colors.sageMist,
};

interface SpaceKeyDateRowProps {
  event: Note; // Note with subtype='event'
  onPress: (event: Note) => void;
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

export function SpaceKeyDateRow({ event, onPress }: SpaceKeyDateRowProps) {
  const space = useSpaceById(event.space_id || '');

  // Determine accent color from space theme
  const accentColor = space?.theme
    ? THEME_COLORS[space.theme] || THEME_COLORS.default
    : THEME_COLORS.default;

  // Time display
  const timeDisplay = event.event_time ? formatTime(event.event_time) : 'All day';

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => onPress(event)}
      accessibilityRole="button"
      accessibilityLabel={`Key date: ${event.title || 'Untitled event'}${timeDisplay !== 'All day' ? ` at ${timeDisplay}` : ', all day'}${space ? `, in ${space.name}` : ''}`}
    >
      {/* Left accent border */}
      <View style={[styles.accentBorder, { backgroundColor: accentColor }]} />

      {/* Content row */}
      <View style={styles.content}>
        {/* Time */}
        <Text style={styles.time} numberOfLines={1}>
          {timeDisplay}
        </Text>

        {/* Event name */}
        <Text style={styles.title} numberOfLines={1}>
          {event.title || 'Untitled event'}
        </Text>

        {/* Space name */}
        {space && (
          <Text style={styles.spaceName} numberOfLines={1}>
            {space.name}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: `${BRAND.colors.sageMist}15`, // 10% opacity sageMist tint
    borderRadius: BRAND.radius.md,
    marginBottom: 8,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.8,
  },
  accentBorder: {
    width: 3,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  time: {
    width: 70,
    fontSize: 13,
    fontFamily: BRAND.typography.body.fontFamily,
    color: BRAND.colors.inkSubtle,
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontFamily: BRAND.typography.bodyMedium.fontFamily,
    color: BRAND.colors.charcoalInk,
  },
  spaceName: {
    fontSize: 12,
    fontFamily: BRAND.typography.body.fontFamily,
    color: BRAND.colors.inkMuted,
    marginLeft: 8,
    maxWidth: 80,
  },
});

export default SpaceKeyDateRow;
