/**
 * DayTimeline — Scrollable 24-hour vertical grid for a single day.
 *
 * Renders hour labels on the left, event blocks on the right,
 * with overlap handling (column-based layout like Google Calendar).
 * All-day events are passed to AllDaySection above the scroll.
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Animated,
  type LayoutChangeEvent,
} from 'react-native';
import { Text } from '../../ui/Text';
import { ArrowLeft } from 'lucide-react-native';
import { getDateService } from '../../lib/date';
import type { CalendarItem } from '../../lib/calendar/CalendarService';
import TimelineHourLabel from './TimelineHourLabel';
import TimelineEventBlock from './TimelineEventBlock';
import TimelineHabitBlock from './TimelineHabitBlock';
import TimelineCurrentTimeIndicator from './TimelineCurrentTimeIndicator';
import AllDaySection from './AllDaySection';
import EmptyDayState from './EmptyDayState';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const HOUR_HEIGHT = 70;
const TOTAL_HEIGHT = 24 * HOUR_HEIGHT;
const LABEL_WIDTH = 50;
const EVENT_PADDING = 4;
const MIN_EVENT_HEIGHT = 25;
const HOUR_LINE_COLOR = '#E8E6E1';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface DayTimelineProps {
  selectedDate: string;
  events: CalendarItem[];
  onEventPress?: (event: CalendarItem) => void;
  onDateSelect?: (date: string) => void;
}

interface PositionedEvent {
  item: CalendarItem;
  top: number;
  height: number;
  columnIndex: number;
  totalColumns: number;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Parse HH:mm to fractional hours (e.g. "13:30" → 13.5). */
function timeToHours(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h + m / 60;
}

/** Compute top (dp) from an HH:mm string. */
function topFromTime(time: string): number {
  return timeToHours(time) * HOUR_HEIGHT;
}

/**
 * Standard calendar overlap algorithm.
 * Groups overlapping events into columns so they render side-by-side.
 */
function layoutEvents(timedEvents: CalendarItem[]): PositionedEvent[] {
  if (timedEvents.length === 0) return [];

  // Sort by start time, then by end time descending (longer events first)
  const sorted = [...timedEvents].sort((a, b) => {
    const aStart = a.startTime ?? '00:00';
    const bStart = b.startTime ?? '00:00';
    if (aStart !== bStart) return aStart.localeCompare(bStart);
    const aEnd = a.endTime ?? '23:59';
    const bEnd = b.endTime ?? '23:59';
    return bEnd.localeCompare(aEnd); // longer first
  });

  // Each column is a list of events (with their end times for overlap checks)
  type Column = { endHours: number; item: CalendarItem }[];
  const columns: Column[] = [];
  // Track which column each event was assigned to
  const assignments = new Map<CalendarItem, number>();

  // Overlap groups: events that transitively overlap share columns
  type Group = { events: CalendarItem[]; columnCount: number };
  const groups: Group[] = [];
  let currentGroup: Group | null = null;
  let groupEndHours = 0;

  for (const event of sorted) {
    const startH = timeToHours(event.startTime ?? '00:00');
    const durationMin =
      event.durationMinutes ?? (event.endTime ? (timeToHours(event.endTime) - startH) * 60 : 60);
    const endH = startH + Math.max(durationMin, (MIN_EVENT_HEIGHT / HOUR_HEIGHT) * 60) / 60;

    // Check if this event belongs to the current overlap group
    if (currentGroup && startH < groupEndHours) {
      // Still overlapping with the current group
      currentGroup.events.push(event);
      groupEndHours = Math.max(groupEndHours, endH);
    } else {
      // Finalize previous group
      if (currentGroup) {
        currentGroup.columnCount = columns.length;
        groups.push(currentGroup);
      }
      // Start a new group
      columns.length = 0;
      currentGroup = { events: [event], columnCount: 0 };
      groupEndHours = endH;
    }

    // Find the first column where this event doesn't overlap
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const lastInCol = col[col.length - 1];
      if (startH >= lastInCol.endHours) {
        col.push({ endHours: endH, item: event });
        assignments.set(event, c);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([{ endHours: endH, item: event }]);
      assignments.set(event, columns.length - 1);
    }
  }

  // Finalize the last group
  if (currentGroup) {
    currentGroup.columnCount = columns.length;
    groups.push(currentGroup);
  }

  // Build positioned events
  const result: PositionedEvent[] = [];
  for (const group of groups) {
    for (const event of group.events) {
      const startH = timeToHours(event.startTime ?? '00:00');
      const durationMin =
        event.durationMinutes ?? (event.endTime ? (timeToHours(event.endTime) - startH) * 60 : 60);
      const top = topFromTime(event.startTime ?? '00:00');
      const height = Math.max((durationMin / 60) * HOUR_HEIGHT, MIN_EVENT_HEIGHT);

      result.push({
        item: event,
        top,
        height,
        columnIndex: assignments.get(event) ?? 0,
        totalColumns: group.columnCount,
      });
    }
  }

  return result;
}

// Hour labels 00–23
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function DayTimeline({
  selectedDate,
  events,
  onEventPress,
  onDateSelect,
}: DayTimelineProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [layerWidth, setLayerWidth] = useState(0);
  const ds = getDateService();
  const isToday = selectedDate === ds.today();

  // Fade animation for "Go to today" pill
  const pillOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(pillOpacity, {
      toValue: isToday ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isToday, pillOpacity]);

  const handleGoToToday = useCallback(() => {
    onDateSelect?.(getDateService().today());
  }, [onDateSelect]);

  // Measure the event layer so we can compute pixel positions
  const onEventLayerLayout = useCallback((e: LayoutChangeEvent) => {
    setLayerWidth(e.nativeEvent.layout.width);
  }, []);

  // Separate all-day vs timed events
  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: CalendarItem[] = [];
    const timed: CalendarItem[] = [];
    for (const e of events) {
      if (e.isAllDay) {
        allDay.push(e);
      } else {
        timed.push(e);
      }
    }
    return { allDayEvents: allDay, timedEvents: timed };
  }, [events]);

  // Layout timed events with overlap handling
  const positioned = useMemo(() => layoutEvents(timedEvents), [timedEvents]);

  // Auto-scroll on mount / date change
  useEffect(() => {
    let targetY: number;

    if (isToday) {
      const hour = ds.getHour();
      targetY = Math.max((hour - 1) * HOUR_HEIGHT, 0);
    } else if (timedEvents.length > 0) {
      const firstStart = timedEvents.map((e) => e.startTime ?? '24:00').sort()[0];
      targetY = Math.max(topFromTime(firstStart) - 30, 0);
    } else {
      targetY = 7 * HOUR_HEIGHT; // 7:00 AM
    }

    // Small delay so the ScrollView is measured
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: targetY, animated: false });
    }, 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Noop handler when parent doesn't pass one
  const handleEventPress = onEventPress ?? (() => {});

  return (
    <View style={styles.outerContainer}>
      {/* All-day events above the scroll area */}
      {allDayEvents.length > 0 && (
        <AllDaySection events={allDayEvents} onEventPress={handleEventPress} />
      )}

      {/* Empty state when no events at all */}
      {events.length === 0 && <EmptyDayState />}

      {/* Scrollable hour grid */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hour rows — labels + grid lines */}
        {HOURS.map((hour) => (
          <View key={hour} style={styles.hourRow}>
            <TimelineHourLabel hour={hour} />
            <View style={styles.hourLine} />
          </View>
        ))}

        {/* Event rendering area (absolutely positioned) */}
        <View style={styles.eventLayer} pointerEvents="box-none" onLayout={onEventLayerLayout}>
          {layerWidth > 0 &&
            positioned.map((pe) => {
              const colWidth = (layerWidth - EVENT_PADDING * 2) / pe.totalColumns;
              const eventLeft = pe.columnIndex * colWidth + EVENT_PADDING;
              const eventWidth = colWidth - EVENT_PADDING;

              return pe.item.source === 'habit' ? (
                <TimelineHabitBlock
                  key={pe.item.id}
                  event={pe.item}
                  top={pe.top}
                  height={pe.height}
                  left={eventLeft}
                  width={eventWidth}
                  onPress={handleEventPress}
                />
              ) : (
                <TimelineEventBlock
                  key={pe.item.id}
                  event={pe.item}
                  top={pe.top}
                  height={pe.height}
                  left={eventLeft}
                  width={eventWidth}
                  onPress={handleEventPress}
                />
              );
            })}
        </View>

        {/* Current time indicator */}
        {isToday && <TimelineCurrentTimeIndicator hourHeight={HOUR_HEIGHT} />}
      </ScrollView>

      {/* Floating "Go to today" pill */}
      {!isToday && (
        <Animated.View style={[styles.todayPill, { opacity: pillOpacity }]} pointerEvents="auto">
          <Pressable onPress={handleGoToToday} style={styles.todayPillPressable}>
            <View style={styles.todayPillInner}>
              <ArrowLeft size={14} color="#fff" />
              <Text style={styles.todayPillText}>Go to today</Text>
            </View>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    height: TOTAL_HEIGHT,
    position: 'relative',
  },
  hourRow: {
    height: HOUR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  hourLine: {
    flex: 1,
    height: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HOUR_LINE_COLOR,
    borderStyle: 'dashed',
  },
  eventLayer: {
    position: 'absolute',
    top: 0,
    left: LABEL_WIDTH,
    right: 0,
    height: TOTAL_HEIGHT,
  },
  todayPill: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  todayPillPressable: {
    backgroundColor: '#6B8F71',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  todayPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  todayPillText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
});
