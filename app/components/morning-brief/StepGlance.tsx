import React, { useMemo } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { Calendar } from 'lucide-react-native';
import type { Note } from '../../../lib/types';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface StepGlanceProps {
  events: Note[];
  hiddenEventIds: string[];
  freeMinutes: number;
  eventCount: number;
  onEventQuickAction: (event: Note) => void;
  onEventPress?: (event: Note) => void;
  onContinue: () => void;
  onSkipToEnd: () => void;
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

/** Convert "14:30" → "2:30 PM". Returns empty string for null. */
function formatEventTime(time: string | null | undefined): string {
  if (!time) return '';
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h)) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m > 0 ? `${h12}:${String(m).padStart(2, '0')} ${period}` : `${h12} ${period}`;
}

/** Compute duration string from event_time and end_time. */
function computeEventDuration(event: Note): string | null {
  if (!event.event_time || !event.end_time) return null;
  const [sh, sm] = event.event_time.split(':').map(Number);
  const [eh, em] = event.end_time.split(':').map(Number);
  if (isNaN(sh) || isNaN(eh)) return null;
  const mins = eh * 60 + (em || 0) - (sh * 60 + (sm || 0));
  if (mins <= 0) return null;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`;
  if (hours > 0) return `${hours}h`;
  return `${remainder}m`;
}

/** Format free minutes: 135 → "2h 15m", 45 → "45m", 0 → "0m" */
function formatFreeMinutes(mins: number): string {
  if (mins <= 0) return '0m';
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`;
  if (hours > 0) return `${hours}h`;
  return `${remainder}m`;
}

/** Sum total event time and format as "~3 hrs" or "~1 hr 30m". */
function formatTotalEventTime(events: Note[]): string {
  let totalMins = 0;
  for (const event of events) {
    if (!event.event_time || !event.end_time || event.is_all_day) continue;
    const [sh, sm] = event.event_time.split(':').map(Number);
    const [eh, em] = event.end_time.split(':').map(Number);
    if (isNaN(sh) || isNaN(eh)) continue;
    const mins = eh * 60 + (em || 0) - (sh * 60 + (sm || 0));
    if (mins > 0) totalMins += mins;
  }
  if (totalMins <= 0) return '~0m';
  const hours = Math.floor(totalMins / 60);
  const remainder = totalMins % 60;
  if (hours > 0 && remainder > 0) return `~${hours} hr${hours > 1 ? 's' : ''} ${remainder}m`;
  if (hours > 0) return `~${hours} hr${hours > 1 ? 's' : ''}`;
  return `~${remainder}m`;
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function StepGlance({
  events,
  hiddenEventIds,
  freeMinutes,
  onEventQuickAction,
  onEventPress,
  onContinue,
  onSkipToEnd,
}: StepGlanceProps) {
  // Filter and sort events
  const visibleEvents = useMemo(() => {
    const hiddenSet = new Set(hiddenEventIds);
    const filtered = events.filter((e) => !hiddenSet.has(e.id));

    // Sort: timed events first (ascending by event_time), all-day last
    return filtered.sort((a, b) => {
      const aAllDay = a.is_all_day ? 1 : 0;
      const bAllDay = b.is_all_day ? 1 : 0;
      if (aAllDay !== bAllDay) return aAllDay - bAllDay;
      if (!a.is_all_day && !b.is_all_day) {
        return (a.event_time ?? '').localeCompare(b.event_time ?? '');
      }
      return 0;
    });
  }, [events, hiddenEventIds]);

  const totalEventTimeStr = useMemo(() => formatTotalEventTime(visibleEvents), [visibleEvents]);

  const freeTimeStr = formatFreeMinutes(freeMinutes);
  const hasEvents = visibleEvents.length > 0;

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Events card */}
      <View style={styles.card}>
        {hasEvents ? (
          <>
            {/* Card header */}
            <View style={styles.cardHeader}>
              <Calendar size={16} color={BRAND.colors.mossGreen} />
              <Text style={styles.cardHeaderCount}>
                {visibleEvents.length} event{visibleEvents.length !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.cardHeaderSub}>· {totalEventTimeStr} blocked</Text>
            </View>

            {/* Event rows */}
            {visibleEvents.map((event, index) => {
              const isLast = index === visibleEvents.length - 1;
              const duration = computeEventDuration(event);
              const isAllDay = event.is_all_day;

              return (
                <Pressable
                  key={event.id}
                  style={[
                    styles.eventRow,
                    !isLast && styles.eventRowBorder,
                    isAllDay && styles.eventRowAllDay,
                  ]}
                  onPress={() => onEventQuickAction(event)}
                >
                  <Text style={styles.eventTime}>
                    {isAllDay ? 'All day' : formatEventTime(event.event_time)}
                  </Text>
                  <Text style={styles.eventTitle} numberOfLines={1}>
                    {event.title || 'Untitled'}
                  </Text>
                  {duration && <Text style={styles.eventDuration}>{duration}</Text>}
                </Pressable>
              );
            })}

            {/* Free time bar */}
            <View style={styles.freeTimeBar}>
              <Text style={styles.freeTimeValue}>{freeTimeStr}</Text>
              <Text style={styles.freeTimeLabel}>free today</Text>
            </View>
          </>
        ) : (
          /* Zero events empty state */
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No meetings today</Text>
            <Text style={styles.emptySub}>{freeTimeStr} free to work with 🌿</Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.continueBtn, pressed && { opacity: 0.7 }]}
          onPress={onContinue}
        >
          <Text style={styles.continueBtnText}>Continue →</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.5 }]}
          onPress={onSkipToEnd}
        >
          <Text style={styles.skipBtnText}>Skip to schedule</Text>
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
  card: {
    backgroundColor: '#FEFDFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  cardHeader: {
    backgroundColor: '#E8F0EB',
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  cardHeaderCount: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
  },
  cardHeaderSub: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  eventRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  eventRowAllDay: {
    opacity: 0.55,
  },
  eventTime: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    width: 52,
  },
  eventTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  eventDuration: {
    fontSize: 11,
    color: BRAND.colors.inkMuted,
  },

  freeTimeBar: {
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  freeTimeValue: {
    fontSize: 20,
    fontWeight: '800',
    color: BRAND.colors.mossGreen,
    letterSpacing: -0.5,
  },
  freeTimeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
  emptyState: {
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  emptySub: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    marginTop: 4,
  },
  footer: {
    paddingHorizontal: 20,
    marginTop: 12,
  },
  continueBtn: {
    backgroundColor: '#E8F0EB',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  skipBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipBtnText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
  },
});

export default StepGlance;
