/**
 * StepGlance — Step 1 of the Morning Brief flow
 *
 * A calm, premium "morning greeting card" showing available
 * free time and today's schedule at a glance. Not a data table.
 */

import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import type { Note } from '../../../lib/types';
import type { CalendarEvent } from '../../../lib/calendar/CalendarClient';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface StepGlanceProps {
  /** Key-date events (user-created notes with subtype='event') */
  events: Note[];
  /** Synced external calendar events (Google / Apple) */
  calendarEvents?: CalendarEvent[];
  /** IDs of hidden key-date events */
  hiddenEventIds: string[];
  /** Free minutes — must match the header display exactly */
  freeMinutes: number;
  /** Total calendar event count (from capacity) */
  totalEventCount: number;
  /** Callbacks */
  onEventQuickAction: (event: Note) => void;
  onContinue: () => void;
  onSkipToEnd: () => void;
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

/** Format free minutes: 315 → "5h 15m", 45 → "45m", 0 → "0m" */
function formatFreeMinutes(mins: number): string {
  if (mins <= 0) return '0m';
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`;
  if (hours > 0) return `${hours}h`;
  return `${remainder}m`;
}

/**
 * Format a time range with en-dash.
 * "8:00 – 8:30 AM"  or  "11:30 AM – 1:00 PM"
 */
function formatTimeRange(startTime: string | null, endTime: string | null): string {
  if (!startTime) return 'All day';

  const formatSingle = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return { str: `${displayH}:${String(m).padStart(2, '0')}`, period };
  };

  const start = formatSingle(startTime);

  if (!endTime) return `${start.str} ${start.period}`;

  const end = formatSingle(endTime);

  // Same period → show once at the end
  if (start.period === end.period) {
    return `${start.str}\u2009\u2013\u2009${end.str} ${end.period}`;
  }
  return `${start.str} ${start.period}\u2009\u2013\u2009${end.str} ${end.period}`;
}

/** Extract HH:mm from an ISO timestamp */
function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════
// Unified event model (merges key dates + calendar events)
// ═══════════════════════════════════════════════════════════════════

interface DisplayEvent {
  id: string;
  title: string;
  startTime: string | null; // HH:mm or null for all-day
  endTime: string | null;
  isAllDay: boolean;
  /** Only present for key-date events (pressable) */
  sourceNote?: Note;
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
  onEventQuickAction,
  onContinue,
  onSkipToEnd,
}: StepGlanceProps) {
  const [expanded, setExpanded] = useState(false);

  // ── Merge key dates + calendar events into unified list ──────────
  const allEvents = useMemo<DisplayEvent[]>(() => {
    const hiddenSet = new Set(hiddenEventIds);

    // Key-date notes
    const fromNotes: DisplayEvent[] = events
      .filter((e) => !hiddenSet.has(e.id))
      .map((e) => ({
        id: e.id,
        title: e.title || 'Untitled',
        startTime: e.event_time ?? null,
        endTime: e.end_time ?? null,
        isAllDay: !!e.is_all_day,
        sourceNote: e,
      }));

    // Synced calendar events
    const fromCalendar: DisplayEvent[] = (calendarEvents ?? []).map((e) => ({
      id: `cal-${e.id}`,
      title: e.title || 'Untitled',
      startTime: e.isAllDay ? null : isoToHHMM(e.startAt),
      endTime: e.isAllDay ? null : isoToHHMM(e.endAt),
      isAllDay: e.isAllDay,
    }));

    // De-duplicate by title + start time (synced events may overlap with key dates)
    const seen = new Set<string>();
    const deduped: DisplayEvent[] = [];
    for (const ev of [...fromNotes, ...fromCalendar]) {
      const key = `${ev.title}|${ev.startTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(ev);
    }

    // Sort: timed events ascending, all-day at bottom
    return deduped.sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? 1 : -1;
      return (a.startTime ?? '').localeCompare(b.startTime ?? '');
    });
  }, [events, calendarEvents, hiddenEventIds]);

  // ── Collapsed vs expanded ───────────────────────────────────────
  const INITIAL_VISIBLE = 4;
  const hasMore = allEvents.length > INITIAL_VISIBLE;
  const visibleEvents = expanded ? allEvents : allEvents.slice(0, INITIAL_VISIBLE);
  const hiddenCount = allEvents.length - INITIAL_VISIBLE;

  const hasEvents = allEvents.length > 0 || totalEventCount > 0;
  const isFullyBooked = freeMinutes <= 0;
  const freeTimeFormatted = formatFreeMinutes(freeMinutes);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 1. GREETING + FREE TIME HERO ──────────────────────── */}
      <View style={styles.heroArea}>
        {isFullyBooked ? (
          <>
            <Text style={styles.fullyBookedTitle}>Fully booked today</Text>
            <Text style={styles.fullyBookedSub}>But you can still shuffle things around</Text>
          </>
        ) : (
          <>
            <Text style={styles.greeting}>You have</Text>
            <Text style={styles.heroLine}>
              <Text style={styles.heroTime}>{freeTimeFormatted}</Text>
              {' of open time today'}
            </Text>
          </>
        )}
      </View>

      {/* ── 2. EVENTS SECTION ─────────────────────────────────── */}
      {hasEvents ? (
        <>
          <Text style={styles.sectionLabel}>TODAY&apos;S SCHEDULE</Text>
          <View style={styles.card}>
            {visibleEvents.map((event, index) => {
              const isLast = index === visibleEvents.length - 1 && !hasMore;
              const isLastVisible = index === visibleEvents.length - 1;

              return (
                <Pressable
                  key={event.id}
                  style={[
                    styles.eventRow,
                    (!isLast || (hasMore && !expanded)) && !isLastVisible
                      ? styles.eventRowBorder
                      : null,
                    isLastVisible && (hasMore || expanded) && styles.eventRowBorder,
                    event.isAllDay && styles.eventRowAllDay,
                  ]}
                  onPress={() => {
                    if (event.sourceNote) onEventQuickAction(event.sourceNote);
                  }}
                >
                  <Text style={[styles.eventTime, event.isAllDay && styles.eventTimeAllDay]}>
                    {event.isAllDay ? 'All day' : formatTimeRange(event.startTime, event.endTime)}
                  </Text>
                  <Text style={styles.eventTitle} numberOfLines={2}>
                    {event.title}
                  </Text>
                </Pressable>
              );
            })}

            {/* +X more / Show less toggle */}
            {hasMore && (
              <Pressable style={styles.moreRow} onPress={() => setExpanded((v) => !v)}>
                <Text style={styles.moreText}>
                  {expanded ? 'Show less' : `+${hiddenCount} more in your calendar`}
                </Text>
                {expanded ? (
                  <ChevronUp size={14} color={BRAND.colors.mossGreen} />
                ) : (
                  <ChevronDown size={14} color={BRAND.colors.mossGreen} />
                )}
              </Pressable>
            )}
          </View>
        </>
      ) : (
        /* Zero events empty state */
        <View style={styles.emptySchedule}>
          <Text style={styles.emptyTitle}>Nothing scheduled</Text>
          <Text style={styles.emptySubtitle}>The whole day is yours</Text>
        </View>
      )}

      {/* ── 3. FOOTER ─────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.85 }]}
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
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },

  // ── Hero ────────────────────────────────────────────────────────
  heroArea: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    marginBottom: 2,
  },
  heroLine: {
    fontSize: 18,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  heroTime: {
    fontSize: 32,
    fontWeight: '800',
    color: BRAND.colors.mossGreen,
  },
  fullyBookedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  fullyBookedSub: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    marginTop: 2,
  },

  // ── Section label ───────────────────────────────────────────────
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: BRAND.colors.inkMuted,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingHorizontal: 20,
  },

  // ── Events card ─────────────────────────────────────────────────
  card: {
    backgroundColor: '#FEFDFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  eventRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  eventRowAllDay: {
    opacity: 0.6,
  },
  eventTime: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
    width: 120,
  },
  eventTimeAllDay: {
    fontStyle: 'italic',
  },
  eventTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },

  // ── +X more row ─────────────────────────────────────────────────
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
  },
  moreText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },

  // ── Empty schedule ──────────────────────────────────────────────
  emptySchedule: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  emptySubtitle: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    marginTop: 4,
  },

  // ── Footer ──────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  primaryButton: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: BRAND.colors.mossGreen,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FEFDFB',
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
