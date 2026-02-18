/**
 * StepGlance — Step 1 of the Morning Brief flow
 *
 * Visual "morning greeting card" showing the shape of your day.
 * Proportional timeline blocks with event cards, current time
 * indicator, and free-time gaps — so you can orient instantly.
 */

import React, { useMemo } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Text as RNText } from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { getDateService } from '../../../lib/date';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { GlanceTimelineBlock, GlanceOpenWindows } from './components/GlanceTimelineBlock';
import type { Note } from '../../../lib/types';
import type { CalendarEvent } from '../../../lib/calendar/CalendarClient';

// ═══════════════════════════════════════════════════════════════════
// Types (unchanged — same props interface)
// ═══════════════════════════════════════════════════════════════════

interface StepGlanceProps {
  /** Key-date events (user-created notes with subtype='event') */
  events: Note[];
  /** Synced external calendar events (Google / Apple) */
  calendarEvents?: CalendarEvent[];
  /** IDs of hidden key-date events */
  hiddenEventIds: string[];
  /** Free minutes — matches the header display */
  freeMinutes: number;
  /** Total calendar event count (from capacity) */
  totalEventCount: number;
  /** Total minutes in calendar events today */
  eventMinutes: number;
  /** Whether hidden event data has been loaded */
  isReady?: boolean;
  /** Callbacks */
  onEventQuickAction: (event: Note) => void;
  onCalendarEventAction: (calEvent: CalendarEvent) => void;
  onContinue: () => void;
  onSkipToEnd: () => void;
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function formatFreeMinutes(mins: number): string {
  if (mins <= 0) return '0m';
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`;
  if (hours > 0) return `${hours}h`;
  return `${remainder}m`;
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function StepGlance({
  events,
  calendarEvents,
  hiddenEventIds,
  freeMinutes,
  totalEventCount,
  eventMinutes,
  isReady,
  onEventQuickAction,
  onCalendarEventAction,
  onContinue,
  onSkipToEnd,
}: StepGlanceProps) {
  const timeBlockPreferences = useGremlyStore((s) => s.timeBlockPreferences);
  const eventTimeOverrides = useGremlyStore((s) => s.eventTimeOverrides) ?? {};

  const freeTimeFormatted = formatFreeMinutes(freeMinutes);

  // Current minute of day (for time clipping + now indicator)
  const currentMinute = useMemo(() => {
    const now = getDateService().now();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  // Filter out hidden calendar events
  const visibleCalEvents = useMemo(() => {
    if (!calendarEvents) return [];
    const hiddenSet = new Set(hiddenEventIds);
    return calendarEvents.filter(
      (e) => !hiddenSet.has(e.id) && !hiddenSet.has(`${e.provider}-${e.providerEventId}`),
    );
  }, [calendarEvents, hiddenEventIds]);

  // Filter out hidden key-date events
  const visibleKeyDates = useMemo(() => {
    const hiddenSet = new Set(hiddenEventIds);
    return events.filter((e) => !hiddenSet.has(e.id));
  }, [events, hiddenEventIds]);

  // All-day events: calendar all-day + notes that are all-day OR have no event_time
  // (Notes with no time set are treated as all-day — e.g. "Fly to LA")
  // De-duplicate: if a calendar event and note share the same title, keep the calendar event
  const { dedupedCalAllDay, dedupedNoteAllDay } = useMemo(() => {
    const calAllDay = visibleCalEvents.filter((e) => e.isAllDay);
    const noteAllDay = visibleKeyDates.filter((e) => !!e.is_all_day || !e.event_time);

    // Build a set of calendar event titles (lowercased) for dedup
    const calTitles = new Set(calAllDay.map((e) => (e.title || '').toLowerCase().trim()));

    // Filter out notes whose title matches a calendar event
    const uniqueNotes = noteAllDay.filter(
      (n) => !calTitles.has((n.title || '').toLowerCase().trim()),
    );

    return { dedupedCalAllDay: calAllDay, dedupedNoteAllDay: uniqueNotes };
  }, [visibleCalEvents, visibleKeyDates]);

  const hasAllDay = dedupedCalAllDay.length > 0 || dedupedNoteAllDay.length > 0;

  // Block config from user preferences
  const blocks = useMemo(
    () => [
      {
        key: 'morning' as const,
        startHour: timeBlockPreferences.morning.startHour,
        endHour: timeBlockPreferences.morning.endHour,
      },
      {
        key: 'day' as const,
        startHour: timeBlockPreferences.day.startHour,
        endHour: timeBlockPreferences.day.endHour,
      },
      {
        key: 'evening' as const,
        startHour: timeBlockPreferences.evening.startHour,
        endHour: timeBlockPreferences.evening.endHour,
      },
    ],
    [timeBlockPreferences],
  );

  // Key dates grouped by block (deduped against calendar events)
  const keyDatesByBlock = useMemo(() => {
    // Build a set of calendar event titles for dedup
    const calTitles = new Set(
      (visibleCalEvents ?? []).map((e) => (e.title || '').toLowerCase().trim()),
    );

    const result: Record<string, Note[]> = { morning: [], day: [], evening: [] };
    for (const note of visibleKeyDates) {
      if (note.is_all_day || !note.event_time) continue;
      // Skip notes that duplicate a calendar event
      if (calTitles.has((note.title || '').toLowerCase().trim())) continue;
      const [h] = note.event_time.split(':').map(Number);
      for (const block of blocks) {
        if (h >= block.startHour && h < block.endHour) {
          result[block.key].push(note);
          break;
        }
      }
    }
    return result;
  }, [visibleKeyDates, visibleCalEvents, blocks]);

  // Today's date for dateContext
  const today = useMemo(() => getDateService().getCurrentDate(), []);

  // Gate: wait for hidden state before rendering to prevent flash
  if (isReady === false) {
    return <View style={styles.scroll} />;
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. DAY SHAPE HERO ─────────────────────────────────── */}
        <View style={styles.heroArea}>
          {freeMinutes <= 0 ? (
            <>
              <RNText style={styles.heroHeadline}>Packed today</RNText>
              <RNText style={styles.heroSub}>
                {formatFreeMinutes(eventMinutes)} in events · but you can still shuffle things
              </RNText>
            </>
          ) : totalEventCount === 0 ? (
            <>
              <RNText style={styles.heroHeadline}>Nothing scheduled</RNText>
              <RNText style={styles.heroSub}>The whole day is yours</RNText>
            </>
          ) : (
            <>
              <View style={styles.heroStatsRow}>
                <View style={styles.heroStat}>
                  <RNText style={styles.heroStatNumber}>{formatFreeMinutes(eventMinutes)}</RNText>
                  <RNText style={styles.heroStatLabel}>in events</RNText>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroStat}>
                  <RNText style={styles.heroStatNumberGreen}>{freeTimeFormatted}</RNText>
                  <RNText style={styles.heroStatLabel}>for you</RNText>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ── 2. ALL-DAY EVENTS (if any) ────────────────────────── */}
        {hasAllDay && (
          <View style={styles.allDaySection}>
            {dedupedCalAllDay.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => onCalendarEventAction(e)}
                style={styles.allDayChip}
              >
                <Text style={styles.allDayLabel}>All day</Text>
                <Text style={styles.allDayTitle} numberOfLines={1}>
                  {e.title}
                </Text>
              </Pressable>
            ))}
            {dedupedNoteAllDay.map((e) => (
              <Pressable key={e.id} onPress={() => onEventQuickAction(e)} style={styles.allDayChip}>
                <Text style={styles.allDayLabel}>All day</Text>
                <Text style={styles.allDayTitle} numberOfLines={1}>
                  {e.title || 'Untitled'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── 3. VISUAL TIMELINE ────────────────────────────────── */}
        {blocks.map((block) => (
          <GlanceTimelineBlock
            key={block.key}
            block={block.key}
            startHour={block.startHour}
            endHour={block.endHour}
            calendarEvents={visibleCalEvents}
            keyDateEvents={keyDatesByBlock[block.key]}
            currentMinute={currentMinute}
            eventTimeOverrides={eventTimeOverrides}
            onCalendarEventPress={onCalendarEventAction}
            onKeyDatePress={onEventQuickAction}
            dateContext={today}
          />
        ))}

        {/* ── 4. OPEN WINDOWS SUMMARY ───────────────────────────── */}
        <GlanceOpenWindows
          calendarEvents={visibleCalEvents}
          keyDateEvents={visibleKeyDates}
          eventTimeOverrides={eventTimeOverrides}
          blocks={blocks}
          currentMinute={currentMinute}
        />

        {/* Spacer so content doesn't hide behind sticky footer */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── 5. STICKY FOOTER ────────────────────────────────────── */}
      <View style={styles.stickyFooter}>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && { backgroundColor: '#AECBB0' }]}
          onPress={onContinue}
        >
          <Text style={styles.primaryButtonText}>Continue →</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.skipPressable, pressed && { opacity: 0.5 }]}
          onPress={onSkipToEnd}
        >
          <Text style={styles.skipText}>Skip to schedule</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },

  // ── Hero ────────────────────────────────────────────────────────
  heroArea: {
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
  },
  heroHeadline: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  heroSub: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    marginTop: 3,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroStat: {
    flex: 1,
  },
  heroStatNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: BRAND.colors.charcoalInk,
    letterSpacing: -0.5,
  },
  heroStatNumberGreen: {
    fontSize: 28,
    fontWeight: '800',
    color: BRAND.colors.mossGreen,
    letterSpacing: -0.5,
  },
  heroStatLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
    marginTop: 1,
  },
  heroDivider: {
    width: 1,
    height: 36,
    backgroundColor: BRAND.colors.borderSubtle,
    marginHorizontal: 16,
  },

  // ── All-day events ──────────────────────────────────────────────
  allDaySection: {
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 4,
  },
  allDayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(46,85,64,0.05)',
    gap: 8,
  },
  allDayLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    fontStyle: 'italic',
  },
  allDayTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },

  // ── Sticky Footer ──────────────────────────────────────────────
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: BRAND.colors.linenCream,
    // Fade effect at top edge
    borderTopWidth: 0,
    shadowColor: BRAND.colors.linenCream,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
  primaryButton: {
    backgroundColor: '#BFD8C0',
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E5540',
  },
  skipPressable: {
    alignItems: 'center',
  },
  skipText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    paddingVertical: 14,
  },
});

export default StepGlance;
