import React from 'react';
import { Text, Pressable, View, StyleSheet } from 'react-native';
import type { CalendarItem } from '../../lib/calendar/CalendarService';

// ═══════════════════════════════════════════════════════════════════
// SOURCE THEME MAP
// ═══════════════════════════════════════════════════════════════════

const SOURCE_THEMES: Record<string, { bg: string; text: string }> = {
  synced: { bg: '#E3EDF7', text: '#2C5282' },
  gremly_event: { bg: '#E8F0EB', text: '#2D4A33' },
  user_calendar: { bg: '#E8F0EB', text: '#2D4A33' },
  todo: { bg: '#FFF8EE', text: '#7C6A4F' },
};

const PROVIDER_DOT_COLORS: Record<string, string> = {
  google: '#4285F4',
  outlook: '#0078D4',
};

const COMPACT_THRESHOLD = 40;

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface TimelineEventBlockProps {
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

export default function TimelineEventBlock({
  event,
  top,
  height,
  left,
  width,
  onPress,
}: TimelineEventBlockProps) {
  const theme = SOURCE_THEMES[event.source] ?? SOURCE_THEMES.synced;
  const isCompact = height < COMPACT_THRESHOLD;
  const dotColor = event.provider ? PROVIDER_DOT_COLORS[event.provider] : undefined;

  const timeLabel =
    event.startTime && event.endTime ? `${event.startTime} – ${event.endTime}` : event.startTime;

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
          backgroundColor: theme.bg,
        },
      ]}
    >
      {/* Provider dot */}
      {dotColor && <View style={[styles.providerDot, { backgroundColor: dotColor }]} />}

      {/* Title — always shown */}
      <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
        {event.title}
      </Text>

      {/* Time — shown if not compact */}
      {!isCompact && timeLabel && (
        <Text style={[styles.detail, { color: theme.text }]} numberOfLines={1}>
          {timeLabel}
        </Text>
      )}

      {/* Location — shown if not compact */}
      {!isCompact && event.location && (
        <Text style={[styles.detail, styles.location, { color: theme.text }]} numberOfLines={1}>
          📍 {event.location}
        </Text>
      )}
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  providerDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
  },
  detail: {
    fontSize: 11,
    opacity: 0.7,
    marginTop: 1,
  },
  location: {
    fontStyle: 'italic',
  },
});
