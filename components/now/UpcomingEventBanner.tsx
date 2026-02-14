import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Calendar, ChevronRight } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { colors } from '../../src/theme/tokens';
import type { Note } from '../../lib/types';

/* ─── helpers ─────────────────────────────────────────────────── */

function formatTime12h(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function getMinutesUntil(eventTime: string): number {
  const now = new Date();
  const [h, m] = eventTime.split(':').map(Number);
  const eventMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return eventMinutes - nowMinutes;
}

/* ─── types ───────────────────────────────────────────────────── */

interface UpcomingEventBannerProps {
  /** Today's event notes, sorted by event_time (all-day first) */
  eventNotes: Note[];
  /** Called when the user taps the banner */
  onPress?: (event: Note) => void;
}

/* ─── component ───────────────────────────────────────────────── */

export function UpcomingEventBanner({ eventNotes, onPress }: UpcomingEventBannerProps) {
  // Auto-refresh every 60 s so minutesUntil stays current
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Find next future timed event
  const nextEvent = useMemo(() => {
    for (const note of eventNotes) {
      if (!note.event_time) continue; // skip all-day
      if (getMinutesUntil(note.event_time) > 0) return note;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventNotes, tick]);

  // Hide entirely when there are no events at all
  if (eventNotes.length === 0) return null;

  /* ── summary mode ── */
  if (!nextEvent) {
    return (
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Calendar size={18} color={colors.light.moss} />
        </View>
        <Text style={styles.summaryText}>
          {eventNotes.length} event{eventNotes.length !== 1 ? 's' : ''} today
        </Text>
      </View>
    );
  }

  /* ── active event mode ── */
  const minutesUntil = getMinutesUntil(nextEvent.event_time!);

  // Build temporal message
  let temporalMsg: string;
  let temporalColor: string = colors.light.mutedText;

  if (minutesUntil <= 5) {
    temporalMsg = 'Starting now';
    temporalColor = colors.light.danger;
  } else if (minutesUntil <= 30) {
    temporalMsg = `In ${minutesUntil} min — time to prep`;
    temporalColor = colors.light.moss;
  } else if (minutesUntil <= 60) {
    temporalMsg = `In ${minutesUntil} min`;
  } else {
    temporalMsg = `At ${formatTime12h(nextEvent.event_time!)}`;
  }

  // Append location if present
  const location = nextEvent.location;
  const line2 = location ? `${temporalMsg}  · ${location}` : temporalMsg;

  // Border accent
  const borderAccent =
    minutesUntil <= 5
      ? { borderLeftWidth: 3, borderLeftColor: colors.light.danger }
      : minutesUntil <= 30
        ? { borderLeftWidth: 3, borderLeftColor: colors.light.moss }
        : undefined;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress?.(nextEvent)}
      style={[styles.container, borderAccent]}
    >
      <View style={styles.iconCircle}>
        <Calendar size={18} color={colors.light.moss} />
      </View>

      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {nextEvent.title}
        </Text>
        <Text style={[styles.subtitle, { color: temporalColor }]} numberOfLines={1}>
          {line2}
        </Text>
      </View>

      <ChevronRight size={18} color={colors.light.mutedText} />
    </TouchableOpacity>
  );
}

/* ─── styles ──────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F4F3',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(191, 216, 192, 0.35)', // sage-tinted
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  center: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontFamily: BRAND.typography.subhead.fontFamily,
    color: BRAND.colors.charcoalInk,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: BRAND.typography.body.fontFamily,
    color: colors.light.mutedText,
    marginTop: 2,
  },
  summaryText: {
    flex: 1,
    fontSize: 13,
    fontFamily: BRAND.typography.bodyMedium.fontFamily,
    color: colors.light.mutedText,
  },
});
