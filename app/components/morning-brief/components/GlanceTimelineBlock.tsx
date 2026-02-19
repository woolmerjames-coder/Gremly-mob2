/**
 * GlanceTimelineBlock
 *
 * Renders a single time block as a visual timeline strip.
 * Events are proportionally positioned colored cards.
 * Free time is visible as open space between events.
 * Current time shown as a green dot + line.
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BRAND } from '../../../../design/brand';
import type { CalendarEvent } from '../../../../lib/calendar/CalendarClient';
import type { Note } from '../../../../lib/types';
import { getEffectiveEventTimes, type EventTimeOverride } from '../../../../lib/capacity';

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const MINUTES_PER_PIXEL = 1.1; // Controls vertical scale of timeline
const MIN_EVENT_HEIGHT = 22;

const BLOCK_THEME = {
  morning: {
    label: 'MORNING',
    accent: '#D4A574',
    bg: '#FBF3EB',
    eventBg: '#EDD5BD',
  },
  day: {
    label: 'AFTERNOON',
    accent: '#C9956C',
    bg: '#FAF0E8',
    eventBg: '#E8CDAE',
  },
  evening: {
    label: 'EVENING',
    accent: '#A89BC9',
    bg: '#F3F0FA',
    eventBg: '#D4CCE8',
  },
} as const;

type BlockKey = keyof typeof BLOCK_THEME;

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  if (hour < 12) return `${hour}a`;
  return `${hour - 12}p`;
}

function formatTimeShort(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m > 0 ? `${displayH}:${String(m).padStart(2, '0')} ${period}` : `${displayH} ${period}`;
}

function formatFreeMinutes(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface GlanceTimelineBlockProps {
  block: BlockKey;
  startHour: number;
  endHour: number;
  /** Synced calendar events (already filtered to this date, NOT filtered to this block) */
  calendarEvents: CalendarEvent[];
  /** Key-date Note events for this block */
  keyDateEvents?: Note[];
  /** Current minute of day (hour*60 + minute). For tomorrow, pass 0. */
  currentMinute: number;
  /** Event time overrides from store */
  eventTimeOverrides?: Record<string, EventTimeOverride>;
  /** Callback when user taps a calendar event */
  onCalendarEventPress?: (event: CalendarEvent) => void;
  /** Callback when user taps a key-date event */
  onKeyDatePress?: (event: Note) => void;
  /** Current date context as YYYY-MM-DD */
  dateContext: string;
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export function GlanceTimelineBlock({
  block,
  startHour,
  endHour,
  calendarEvents,
  keyDateEvents = [],
  currentMinute,
  eventTimeOverrides = {},
  onCalendarEventPress,
  onKeyDatePress,
  dateContext,
}: GlanceTimelineBlockProps) {
  const theme = BLOCK_THEME[block];
  const blockStartMin = startHour * 60;
  const blockEndMin = endHour * 60;
  const blockDuration = blockEndMin - blockStartMin;
  const blockHeight = blockDuration / MINUTES_PER_PIXEL;

  const isPast = currentMinute >= blockEndMin;
  const isCurrent = currentMinute >= blockStartMin && currentMinute < blockEndMin;
  const currentLineTop = isCurrent ? (currentMinute - blockStartMin) / MINUTES_PER_PIXEL : null;

  // Resolve calendar events that overlap this block
  const blockCalEvents = useMemo(() => {
    return calendarEvents
      .filter((e) => {
        if (e.isAllDay) return false;
        const { startAt, endAt } = getEffectiveEventTimes(e, eventTimeOverrides);
        const eStartMin = startAt.getHours() * 60 + startAt.getMinutes();
        const eEndMin = endAt.getHours() * 60 + endAt.getMinutes();
        return eStartMin < blockEndMin && eEndMin > blockStartMin;
      })
      .map((e) => {
        const { startAt, endAt } = getEffectiveEventTimes(e, eventTimeOverrides);
        return {
          event: e,
          startMin: Math.max(startAt.getHours() * 60 + startAt.getMinutes(), blockStartMin),
          endMin: Math.min(endAt.getHours() * 60 + endAt.getMinutes(), blockEndMin),
        };
      })
      .sort((a, b) => a.startMin - b.startMin);
  }, [calendarEvents, eventTimeOverrides, blockStartMin, blockEndMin]);

  // Resolve key-date events that fall in this block
  const blockKeyDates = useMemo(() => {
    return keyDateEvents
      .filter((n) => {
        if (!n.event_time || n.is_all_day) return false;
        const [h] = n.event_time.split(':').map(Number);
        return h >= startHour && h < endHour;
      })
      .map((n) => {
        const [h, m] = (n.event_time ?? '0:0').split(':').map(Number);
        const eStartMin = h * 60 + m;
        let eEndMin = eStartMin + 30; // default 30m
        if (n.end_time) {
          const [eh, em] = n.end_time.split(':').map(Number);
          eEndMin = eh * 60 + em;
        }
        return {
          note: n,
          startMin: Math.max(eStartMin, blockStartMin),
          endMin: Math.min(eEndMin, blockEndMin),
        };
      });
  }, [keyDateEvents, startHour, endHour, blockStartMin, blockEndMin]);

  // Calculate free minutes (from now, within this block)
  const freeMinutes = useMemo(() => {
    const clippedStart = Math.max(blockStartMin, currentMinute);
    if (clippedStart >= blockEndMin) return 0;

    // Merge all event ranges
    const allRanges = [
      ...blockCalEvents.map((e) => ({ start: e.startMin, end: e.endMin })),
      ...blockKeyDates.map((k) => ({ start: k.startMin, end: k.endMin })),
    ]
      .map((r) => ({
        start: Math.max(r.start, clippedStart),
        end: Math.min(r.end, blockEndMin),
      }))
      .filter((r) => r.end > r.start)
      .sort((a, b) => a.start - b.start);

    const merged: Array<{ start: number; end: number }> = [];
    for (const r of allRanges) {
      if (merged.length && r.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
      } else {
        merged.push({ ...r });
      }
    }

    let free = 0;
    let cursor = clippedStart;
    for (const r of merged) {
      if (r.start > cursor) free += r.start - cursor;
      cursor = Math.max(cursor, r.end);
    }
    if (cursor < blockEndMin) free += blockEndMin - cursor;
    return free;
  }, [blockCalEvents, blockKeyDates, blockStartMin, blockEndMin, currentMinute]);

  // Hour grid lines
  const hourLines = useMemo(() => {
    const lines: Array<{ hour: number; top: number }> = [];
    for (let h = startHour; h < endHour; h++) {
      lines.push({ hour: h, top: ((h - startHour) * 60) / MINUTES_PER_PIXEL });
    }
    return lines;
  }, [startHour, endHour]);

  // Auto-collapse past blocks — show compact header only (saves 300+ pixels of scroll)
  if (isPast) {
    const eventCount = blockCalEvents.length + blockKeyDates.length;
    return (
      <View style={[styles.container, styles.containerPast]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.accentBar, { backgroundColor: theme.accent }]} />
            <Text style={[styles.blockLabel, { color: theme.accent }]}>{theme.label}</Text>
            <Text style={styles.timeRange}>
              {formatHourLabel(startHour)} – {formatHourLabel(endHour)}
            </Text>
          </View>
          <Text style={styles.passedLabel}>
            {eventCount > 0 ? `${eventCount} event${eventCount !== 1 ? 's' : ''} · ` : ''}Passed
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Block header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.accentBar, { backgroundColor: theme.accent }]} />
          <Text style={[styles.blockLabel, { color: theme.accent }]}>{theme.label}</Text>
          <Text style={styles.timeRange}>
            {formatHourLabel(startHour)} – {formatHourLabel(endHour)}
          </Text>
        </View>
        {freeMinutes > 0 && (
          <Text style={styles.freeLabel}>{formatFreeMinutes(freeMinutes)} free</Text>
        )}
      </View>

      {/* Timeline track */}
      <View style={[styles.track, { height: blockHeight, backgroundColor: theme.bg }]}>
        {/* Hour grid lines */}
        {hourLines.map(({ hour, top }) => (
          <View key={hour} style={[styles.gridLine, { top }]} pointerEvents="none">
            <Text style={[styles.gridHour, { color: `${theme.accent}88` }]}>
              {formatHourLabel(hour)}
            </Text>
            <View style={[styles.gridRule, { backgroundColor: `${theme.accent}15` }]} />
          </View>
        ))}

        {/* Calendar event cards */}
        {blockCalEvents.map(({ event, startMin, endMin }) => {
          const top = (startMin - blockStartMin) / MINUTES_PER_PIXEL;
          const height = Math.max((endMin - startMin) / MINUTES_PER_PIXEL, MIN_EVENT_HEIGHT);
          const duration = endMin - startMin;
          const isCompact = height < 36;
          const startDate = new Date(event.startAt);

          return (
            <Pressable
              key={event.id}
              onPress={() => onCalendarEventPress?.(event)}
              style={[
                styles.eventCard,
                {
                  top,
                  height,
                  backgroundColor: theme.eventBg,
                  borderLeftColor: theme.accent,
                  flexDirection: isCompact ? 'row' : 'column',
                  alignItems: isCompact ? 'center' : 'flex-start',
                  justifyContent: isCompact ? 'space-between' : 'flex-start',
                  paddingVertical: isCompact ? 2 : 6,
                },
              ]}
            >
              <Text style={styles.eventTitle} numberOfLines={isCompact ? 1 : 2}>
                {event.title}
              </Text>
              <Text style={styles.eventMeta}>
                {formatTimeShort(startDate.getHours(), startDate.getMinutes())} · {duration}m
              </Text>
            </Pressable>
          );
        })}

        {/* Key-date event cards (same visual treatment) */}
        {blockKeyDates.map(({ note, startMin, endMin }) => {
          const top = (startMin - blockStartMin) / MINUTES_PER_PIXEL;
          const height = Math.max((endMin - startMin) / MINUTES_PER_PIXEL, MIN_EVENT_HEIGHT);
          const duration = endMin - startMin;
          const isCompact = height < 36;
          const [sh, sm] = (note.event_time ?? '0:0').split(':').map(Number);

          return (
            <Pressable
              key={note.id}
              onPress={() => onKeyDatePress?.(note)}
              style={[
                styles.eventCard,
                {
                  top,
                  height,
                  backgroundColor: theme.eventBg,
                  borderLeftColor: theme.accent,
                  flexDirection: isCompact ? 'row' : 'column',
                  alignItems: isCompact ? 'center' : 'flex-start',
                  justifyContent: isCompact ? 'space-between' : 'flex-start',
                  paddingVertical: isCompact ? 2 : 6,
                },
              ]}
            >
              <Text style={styles.eventTitle} numberOfLines={isCompact ? 1 : 2}>
                {note.title || 'Untitled'}
              </Text>
              <Text style={styles.eventMeta}>
                {formatTimeShort(sh, sm)} · {duration}m
              </Text>
            </Pressable>
          );
        })}

        {/* Current time indicator */}
        {currentLineTop !== null && (
          <View style={[styles.nowLine, { top: currentLineTop }]} pointerEvents="none">
            <View style={styles.nowDot} />
            <View style={styles.nowRule} />
          </View>
        )}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// OPEN WINDOWS SUMMARY (exported for use in StepGlance)
// ═══════════════════════════════════════════════════════════════════

interface GapChip {
  startMin: number;
  endMin: number;
  duration: number;
  blockKey: BlockKey;
  accent: string;
}

interface GlanceOpenWindowsProps {
  calendarEvents: CalendarEvent[];
  keyDateEvents?: Note[];
  eventTimeOverrides?: Record<string, EventTimeOverride>;
  blocks: Array<{ key: BlockKey; startHour: number; endHour: number }>;
  currentMinute: number;
}

export function GlanceOpenWindows({
  calendarEvents,
  keyDateEvents = [],
  eventTimeOverrides = {},
  blocks,
  currentMinute,
}: GlanceOpenWindowsProps) {
  const gaps = useMemo(() => {
    const result: GapChip[] = [];

    for (const block of blocks) {
      const blockStart = Math.max(block.startHour * 60, currentMinute);
      const blockEnd = block.endHour * 60;
      if (blockStart >= blockEnd) continue;

      const theme = BLOCK_THEME[block.key];

      // Gather all event ranges in this block
      const ranges: Array<{ start: number; end: number }> = [];

      for (const e of calendarEvents) {
        if (e.isAllDay) continue;
        const { startAt, endAt } = getEffectiveEventTimes(e, eventTimeOverrides);
        const eStart = startAt.getHours() * 60 + startAt.getMinutes();
        const eEnd = endAt.getHours() * 60 + endAt.getMinutes();
        if (eStart < blockEnd && eEnd > blockStart) {
          ranges.push({
            start: Math.max(eStart, blockStart),
            end: Math.min(eEnd, blockEnd),
          });
        }
      }

      for (const n of keyDateEvents) {
        if (!n.event_time || n.is_all_day) continue;
        const [h, m] = n.event_time.split(':').map(Number);
        const nStart = h * 60 + m;
        let nEnd = nStart + 30;
        if (n.end_time) {
          const [eh, em] = n.end_time.split(':').map(Number);
          nEnd = eh * 60 + em;
        }
        if (nStart < blockEnd && nEnd > blockStart) {
          ranges.push({
            start: Math.max(nStart, blockStart),
            end: Math.min(nEnd, blockEnd),
          });
        }
      }

      ranges.sort((a, b) => a.start - b.start);
      const merged: Array<{ start: number; end: number }> = [];
      for (const r of ranges) {
        if (merged.length && r.start <= merged[merged.length - 1].end) {
          merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
        } else {
          merged.push({ ...r });
        }
      }

      let cursor = blockStart;
      for (const r of merged) {
        if (r.start - cursor >= 15) {
          result.push({
            startMin: cursor,
            endMin: r.start,
            duration: r.start - cursor,
            blockKey: block.key,
            accent: theme.accent,
          });
        }
        cursor = Math.max(cursor, r.end);
      }
      if (blockEnd - cursor >= 15) {
        result.push({
          startMin: cursor,
          endMin: blockEnd,
          duration: blockEnd - cursor,
          blockKey: block.key,
          accent: theme.accent,
        });
      }
    }

    return result;
  }, [calendarEvents, keyDateEvents, eventTimeOverrides, blocks, currentMinute]);

  if (gaps.length === 0) return null;

  return (
    <View style={windowStyles.container}>
      <Text style={windowStyles.label}>OPEN WINDOWS</Text>
      <View style={windowStyles.chipRow}>
        {gaps.map((gap, i) => {
          const startH = Math.floor(gap.startMin / 60);
          const startM = gap.startMin % 60;
          const endH = Math.floor(gap.endMin / 60);
          const endM = gap.endMin % 60;
          return (
            <View key={i} style={windowStyles.chip}>
              <View style={[windowStyles.chipDot, { backgroundColor: gap.accent }]} />
              <Text style={windowStyles.chipTime}>
                {formatHourLabel(startH)}
                {startM > 0 ? `:${String(startM).padStart(2, '0')}` : ''}–{formatHourLabel(endH)}
                {endM > 0 ? `:${String(endM).padStart(2, '0')}` : ''}
              </Text>
              <Text style={windowStyles.chipDuration}>{formatFreeMinutes(gap.duration)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    marginBottom: 2,
  },
  containerPast: {
    opacity: 0.4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accentBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
  blockLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  timeRange: {
    fontSize: 11,
    color: '#AAA',
  },
  freeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  passedLabel: {
    fontSize: 11,
    color: '#AAA',
    fontStyle: 'italic',
  },
  track: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridHour: {
    fontSize: 9,
    fontWeight: '500',
    width: 32,
    textAlign: 'right',
    paddingRight: 6,
    fontVariant: ['tabular-nums'],
  },
  gridRule: {
    flex: 1,
    height: 1,
  },
  eventCard: {
    position: 'absolute',
    left: 36,
    right: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    borderLeftWidth: 3,
    overflow: 'hidden',
    gap: 1,
  },
  eventTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0E1116',
    lineHeight: 16,
    flexShrink: 1,
  },
  eventMeta: {
    fontSize: 10,
    color: '#888',
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: BRAND.colors.mossGreen,
    marginLeft: 4,
    // React Native doesn't support box-shadow the same way.
    // Use a subtle border instead for the halo effect:
    borderWidth: 2,
    borderColor: '#E8F0EB',
  },
  nowRule: {
    flex: 1,
    height: 1.5,
    backgroundColor: BRAND.colors.mossGreen,
    marginLeft: -1,
  },
});

const windowStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#E8F0EB',
    borderWidth: 1,
    borderColor: '#D6E5D9',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: BRAND.colors.mossGreen,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8E6E1',
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  chipTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0E1116',
    fontVariant: ['tabular-nums'],
  },
  chipDuration: {
    fontSize: 10,
    color: '#888',
    fontWeight: '500',
  },
});
