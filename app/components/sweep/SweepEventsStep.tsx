/**
 * SweepEventsStep -- "Look at what's coming" spoke (v8-events).
 *
 * Reads the next 7 days from the synced_calendar_events store (already
 * loaded in both hydration paths). Groups by day, shows event time,
 * title, and location. Distinguishes all-day and multi-day events with
 * structural chips (pure code, no AI).
 *
 * READ-ONLY -- no event creation or editing in this phase.
 *
 * AI SEAM (v8-events-ai, future phase):
 *   AI trip-detection reads these (especially all-day / multi-day events)
 *   to suggest keep/floor/pause in the AI slice; routine timed work events
 *   should be IGNORED by that AI.
 */

import React, { useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { CalendarDays, MapPin, Clock, ChevronRight } from 'lucide-react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { getDateService } from '../../../lib/date/DateService';
import type { CalendarEvent } from '../../../lib/calendar/CalendarClient';

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

// Today + 7 ahead = 8 days total
const WINDOW_DAYS = 8;

/** Format ISO timestamp to "9:30 AM" in local time. */
function formatEventTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** "Today", "Tomorrow", or "Monday, June 9" — uses DateService to avoid restricted toLocaleDateString */
function formatDayHeading(dateStr: string): string {
  return getDateService().formatForOverlay(dateStr);
}

/**
 * True when the event spans 2+ calendar days.
 * For all-day events the store uses an exclusive end, so span > 1 day
 * means endAt (UTC-date portion) is more than 1 day after startAt.
 * For timed events, start and end must be on different local dates.
 */
function isMultiDay(event: CalendarEvent): boolean {
  const ds = getDateService();
  if (event.isAllDay) {
    const s = ds.utcDatePortion(event.startAt);
    const e = ds.utcDatePortion(event.endAt); // exclusive end
    if (!s || !e) return false;
    return e > ds.addDays(s, 1);
  }
  const s = ds.extractLocalDate(event.startAt);
  const e = ds.extractLocalDate(event.endAt);
  return !!(s && e && e > s);
}

interface DayGroup {
  dateStr: string;
  heading: string;
  events: CalendarEvent[];
}

export interface SweepEventsStepProps {
  onFinish: () => void;
}

export function SweepEventsStep({ onFinish }: SweepEventsStepProps) {
  const calendarEvents = useGremlyStore((s) => s.calendarEvents);

  const dayGroups = useMemo<DayGroup[]>(() => {
    const ds = getDateService();
    const today = ds.today();
    // Deduplicate across days: all-day multi-day events appear under every
    // day they span; we show each event once under its FIRST day in the window.
    const seenIds = new Set<string>();
    const groups: DayGroup[] = [];

    for (let i = 0; i < WINDOW_DAYS; i++) {
      const dateStr = ds.addDays(today, i);
      const raw = calendarEvents[dateStr] ?? [];
      const events = raw.filter((ev) => {
        if (seenIds.has(ev.id)) return false;
        seenIds.add(ev.id);
        return true;
      });

      // All-day first, then chronological
      events.sort((a, b) => {
        if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
        return a.startAt.localeCompare(b.startAt);
      });

      if (events.length > 0) {
        groups.push({ dateStr, heading: formatDayHeading(dateStr), events });
      }
    }

    return groups;
  }, [calendarEvents]);

  const isEmpty = dayGroups.length === 0;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>What's coming up</Text>
        <Text style={styles.subheading}>Your next 7 days at a glance.</Text>

        {isEmpty ? (
          <View style={styles.emptyState}>
            <CalendarDays size={36} strokeWidth={1.5} color={BRAND.colors.inkMuted} />
            <Text style={styles.emptyText}>Nothing on the calendar this week.</Text>
          </View>
        ) : (
          dayGroups.map((group) => (
            <View key={group.dateStr} style={styles.dayGroup}>
              <Text style={styles.dayHeading}>{group.heading}</Text>

              {group.events.map((event) => {
                const multi = isMultiDay(event);
                return (
                  <View key={event.id} style={styles.eventRow}>
                    {/* Left column: time / all-day chip */}
                    <View style={styles.eventTimeCol}>
                      {event.isAllDay ? (
                        <View style={styles.allDayChip}>
                          <Text style={styles.allDayChipText}>all day</Text>
                        </View>
                      ) : (
                        <View style={styles.timeRow}>
                          <Clock size={10} strokeWidth={2} color={BRAND.colors.inkMuted} />
                          <Text style={styles.eventTime}>{formatEventTime(event.startAt)}</Text>
                        </View>
                      )}
                    </View>

                    {/* Right column: title + optional location */}
                    <View style={styles.eventDetails}>
                      <View style={styles.eventTitleRow}>
                        <Text style={styles.eventTitle} numberOfLines={2}>
                          {event.title}
                        </Text>
                        {/* Multi-day chip inline with title */}
                        {multi && (
                          <View style={styles.multiDayChip}>
                            <Text style={styles.multiDayChipText}>multi-day</Text>
                          </View>
                        )}
                      </View>

                      {event.location ? (
                        <View style={styles.locationRow}>
                          <MapPin size={10} strokeWidth={2} color={BRAND.colors.inkMuted} />
                          <Text style={styles.locationText} numberOfLines={1}>
                            {event.location}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      {/* Footer: Done button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={onFinish}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.doneBtnText}>Done</Text>
          <ChevronRight size={16} strokeWidth={2.5} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },

  // ── Header ──
  heading: {
    fontFamily: SERIF,
    fontSize: 26,
    lineHeight: 32,
    color: BRAND.colors.charcoalInk,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    marginBottom: 24,
  },

  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
  },

  // ── Day group ──
  dayGroup: {
    marginBottom: 20,
  },
  dayHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    letterSpacing: 0.3,
    marginBottom: 8,
    textTransform: 'uppercase',
  },

  // ── Event row ──
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: BRAND.radius.sm,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.07)',
    gap: 10,
  },

  // Left column: fixed-width for time / all-day chip
  eventTimeCol: {
    width: 62,
    alignItems: 'flex-start',
    paddingTop: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  eventTime: {
    fontSize: 11,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
  allDayChip: {
    backgroundColor: 'rgba(191,216,192,0.30)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  allDayChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    letterSpacing: 0.2,
  },

  // Right column: event details
  eventDetails: {
    flex: 1,
    gap: 3,
  },
  eventTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    flexShrink: 1,
  },
  multiDayChip: {
    backgroundColor: 'rgba(255,200,120,0.25)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  multiDayChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(160,100,20,0.90)',
    letterSpacing: 0.2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  locationText: {
    fontSize: 11,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    flex: 1,
  },

  // ── Footer ──
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(34,34,34,0.06)',
    backgroundColor: BRAND.colors.linenCream,
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: BRAND.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 6,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
