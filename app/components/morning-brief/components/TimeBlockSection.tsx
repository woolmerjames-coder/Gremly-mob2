/**
 * TimeBlockSection
 *
 * Displays a single time block (Morning/Afternoon/Evening) with:
 * - Section header with accent bar, icon, and remaining time
 * - Calendar events (tap for details)
 * - Assigned tasks
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Sunrise, Sun, Sunset, Calendar, X, ChevronUp, ChevronDown } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { getEffectiveEventTimes, type EventTimeOverride } from '../../../../lib/capacity';
import type { TimeBlockCapacity, TimeBlock, TimeBlockPreferences } from '../../../../lib/capacity';
import type { CalendarEvent } from '../../../../lib/calendar/CalendarClient';
import type { Todo, Habit, Note } from '../../../../lib/types';
import { useGremlyStore } from '../../../../lib/store/useGremlyStore';
import { TaskItem, type TaskItemData } from './TaskItem';
import { EventTimePicker } from './EventTimePicker';
import { GapRow } from './GapRow';
import { type TimeGap, type SlottedTask } from '../../../../lib/timeGaps';

// Stable empty object to prevent re-renders from new object references
const EMPTY_TIME_OVERRIDES: Record<string, EventTimeOverride> = {};

/**
 * Format hour for display (e.g., 6 -> "6am", 12 -> "12pm")
 */
function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

/**
 * Format available minutes for display (e.g., 150 -> "2h 30m")
 */
function formatAvailable(mins: number): string {
  if (mins <= 0) return '0m';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remaining = mins % 60;
  return remaining > 0 ? `${hrs}h ${remaining}m` : `${hrs}h`;
}

// Colors matching CalendarScreen
const COLORS = {
  linenCream: '#F9F6F1',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  inkSubtle: 'rgba(14, 17, 22, 0.7)',
  divider: '#E8E6E1',
  mossGreen: '#2E5540',
  surface: '#FFFFFF',
};

// Section config matching CalendarScreen exactly
// Note: 'day' is the afternoon block in our TimeBlock type
const SECTION_CONFIG: Record<TimeBlock, { label: string; color: string; Icon: LucideIcon }> = {
  morning: { label: 'MORNING', color: '#D4A574', Icon: Sunrise },
  day: { label: 'AFTERNOON', color: '#C9956C', Icon: Sun },
  evening: { label: 'EVENING', color: '#A89BC9', Icon: Sunset },
};

interface TimeBlockSectionProps {
  capacity: TimeBlockCapacity;
  events: CalendarEvent[];
  /** Key Date events (notes with subtype='event') for this time block */
  keyDateEvents?: Note[];
  /** Function to get space name by ID */
  getSpaceName?: (spaceId: string | null | undefined) => string | undefined;
  /** Called when user taps a Key Date event */
  onKeyDatePress?: (event: Note) => void;
  /** Called when user taps the three-dot quick action on a Key Date event */
  onKeyDateQuickAction?: (event: Note) => void;
  tasks: TaskItemData[];
  onTaskPress: (task: TaskItemData) => void;
  /** Called when user taps the time estimate */
  onTimePress?: (task: TaskItemData) => void;
  /** Array of hidden event IDs */
  hiddenEventIds?: string[];
  /** Date context for hiding events (YYYY-MM-DD) */
  dateContext: string;
  /** Todos/habits slotted into specific times in this block */
  slottedItems?: Array<(Todo | Habit) & { scheduled_start_iso: string }>;
  /** Called when user taps [+] on a gap */
  onGapSlotPress?: (gap: TimeGap) => void;
  /** Called when user taps a slotted task */
  onSlottedTaskPress?: (task: SlottedTask) => void;
  /** Lookup map: id → TaskItemData for rendering slotted tasks with TaskItem */
  taskDataById?: Record<string, TaskItemData>;
}

/**
 * Format duration in compact form matching task estimates (e.g., "30m", "1h", "1h 30m")
 */
function formatDurationCompact(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

/**
 * Format time as "h:mm AM/PM" (no leading zero)
 */
function formatTimeShort(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Get unique event ID
 */
function getEventId(event: CalendarEvent): string {
  return `${event.provider}-${event.providerEventId}`;
}

// ═══════════════════════════════════════════════════════════════════
// UNIFIED TIMELINE HELPERS
// ═══════════════════════════════════════════════════════════════════

const MIN_GAP_MINUTES = 10;

/** Format gap duration for display (e.g., "45 min free") */
function formatGapLabel(mins: number): string {
  if (mins < 60) return `${mins} min free`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs} hr free` : `${hrs} hr ${rem} min free`;
}

/** Convert minutes-since-midnight to ISO string for a given date */
function minutesToIso(dateCtx: string, mins: number): string {
  const d = new Date(`${dateCtx}T12:00:00`);
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d.toISOString();
}

/** Format HH:mm string to "h:mm AM/PM" */
function formatKeyDateTime(time: string): string {
  const [hourStr, minStr] = time.split(':');
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return min > 0 ? `${displayHour}:${minStr} ${ampm}` : `${displayHour}:00 ${ampm}`;
}

/** Discriminated union for all items in a block's unified timeline */
type UnifiedItem =
  | { kind: 'slotted_task'; slottedTask: SlottedTask; startMinutes: number }
  | { kind: 'event'; event: CalendarEvent; startMinutes: number }
  | { kind: 'key_date'; keyDate: Note; startMinutes: number | null }
  | { kind: 'task'; task: TaskItemData; startMinutes: null }
  | { kind: 'gap'; gap: TimeGap };

/** Get the duration in minutes for an item (used for gap calculation) */
function getItemDuration(item: Exclude<UnifiedItem, { kind: 'gap' }>): number {
  switch (item.kind) {
    case 'event':
      return Math.round(
        (new Date(item.event.endAt).getTime() - new Date(item.event.startAt).getTime()) /
          (1000 * 60),
      );
    case 'slotted_task':
      return item.slottedTask.estimateMinutes;
    case 'key_date': {
      const et = item.keyDate.event_time;
      const endt = item.keyDate.end_time;
      if (et && endt) {
        const [sh, sm] = et.split(':').map(Number);
        const [eh, em] = endt.split(':').map(Number);
        return Math.max(0, eh * 60 + em - (sh * 60 + sm));
      }
      return 0;
    }
    case 'task':
      return item.task.estimatedMinutes || 0;
  }
}

export function TimeBlockSection({
  capacity,
  events,
  keyDateEvents = [],
  getSpaceName,
  onKeyDatePress,
  onKeyDateQuickAction,
  tasks,
  onTaskPress,
  onTimePress,
  hiddenEventIds = [],
  dateContext,
  slottedItems = [],
  onGapSlotPress,
  onSlottedTaskPress,
  taskDataById = {},
}: TimeBlockSectionProps) {
  const { block, availableMinutes, isPast } = capacity;
  const config = SECTION_CONFIG[block];

  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timePickerEvent, setTimePickerEvent] = useState<CalendarEvent | null>(null);

  // Get overrides and actions from store
  // IMPORTANT: Access the full object, then use ?? EMPTY_TIME_OVERRIDES to avoid
  // creating a new object reference on every render which causes infinite loops
  const eventTimeOverrides = useGremlyStore((s) => s.eventTimeOverrides) ?? EMPTY_TIME_OVERRIDES;
  const setEventTimeOverride = useGremlyStore((s) => s.setEventTimeOverride);
  const clearEventTimeOverride = useGremlyStore((s) => s.clearEventTimeOverride);
  const openEventPopup = useGremlyStore((s) => s.openEventPopup);

  // Time block edit state
  const timeBlockPreferences = useGremlyStore((s) => s.timeBlockPreferences);
  const setTimeBlockPreferences = useGremlyStore((s) => s.setTimeBlockPreferences);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editStart, setEditStart] = useState(0);
  const [editEnd, setEditEnd] = useState(0);

  // Map block prop to preference key
  const blockKey = block === 'morning' ? 'morning' : block === 'day' ? 'day' : 'evening';

  const openTimeBlockEditor = () => {
    setEditStart(capacity.startHour);
    setEditEnd(capacity.endHour);
    setEditModalVisible(true);
  };

  const saveTimeBlockEdit = () => {
    const newPrefs = { ...timeBlockPreferences };

    if (blockKey === 'morning') {
      newPrefs.morning = { startHour: editStart, endHour: editEnd };
      newPrefs.day = { ...newPrefs.day, startHour: editEnd };
    } else if (blockKey === 'day') {
      newPrefs.morning = { ...newPrefs.morning, endHour: editStart };
      newPrefs.day = { startHour: editStart, endHour: editEnd };
      newPrefs.evening = { ...newPrefs.evening, startHour: editEnd };
    } else if (blockKey === 'evening') {
      newPrefs.day = { ...newPrefs.day, endHour: editStart };
      newPrefs.evening = { startHour: editStart, endHour: editEnd };
    }

    setTimeBlockPreferences(newPrefs);
    setEditModalVisible(false);
  };

  const getMinStart = (): number => {
    if (blockKey === 'morning') return 0;
    if (blockKey === 'day') return timeBlockPreferences.morning.startHour + 1;
    return timeBlockPreferences.day.startHour + 1;
  };

  const getMaxEnd = (): number => {
    if (blockKey === 'morning') return timeBlockPreferences.day.endHour - 1;
    if (blockKey === 'day') return timeBlockPreferences.evening.endHour - 1;
    return 23;
  };

  // Memoize visible events to prevent unnecessary recalculations
  const visibleEvents = useMemo(() => {
    const hiddenSet = new Set(hiddenEventIds);
    return events.filter((e) => !e.isAllDay && !hiddenSet.has(getEventId(e)));
  }, [events, hiddenEventIds]);

  // Set of slotted task IDs to avoid duplicates
  const slottedIds = useMemo(() => new Set((slottedItems ?? []).map((s) => s.id)), [slottedItems]);

  // ── Unified timeline: merge all items, sort chronologically, insert gaps ──
  const unifiedTimeline = useMemo((): UnifiedItem[] => {
    type TimedItem = Exclude<UnifiedItem, { kind: 'gap' }>;
    const items: TimedItem[] = [];

    // 1. Slotted tasks (have scheduled_start_iso)
    for (const item of slottedItems) {
      const start = new Date(item.scheduled_start_iso);
      const estimate = item.time_estimate_minutes ?? 15;
      items.push({
        kind: 'slotted_task',
        slottedTask: {
          id: item.id,
          type: item.type,
          title: item.name,
          estimateMinutes: estimate,
          scheduledStartIso: item.scheduled_start_iso,
          scheduledEndIso: new Date(start.getTime() + estimate * 60 * 1000).toISOString(),
        },
        startMinutes: start.getHours() * 60 + start.getMinutes(),
      });
    }

    // 2. Calendar events (currently empty, future-proofed)
    for (const event of visibleEvents) {
      const start = new Date(event.startAt);
      items.push({
        kind: 'event',
        event,
        startMinutes: start.getHours() * 60 + start.getMinutes(),
      });
    }

    // 3. Key date events
    for (const keyDate of keyDateEvents) {
      if (keyDate.event_time) {
        const [h, m] = keyDate.event_time.split(':').map(Number);
        items.push({ kind: 'key_date', keyDate, startMinutes: h * 60 + m });
      } else {
        items.push({ kind: 'key_date', keyDate, startMinutes: null });
      }
    }

    // 4. Non-slotted assigned tasks (no scheduled time)
    for (const task of tasks) {
      if (!slottedIds.has(task.id)) {
        items.push({ kind: 'task', task, startMinutes: null });
      }
    }

    // Sort: timed items ascending, untimed items at end preserving order
    const timed = items
      .filter((i): i is TimedItem & { startMinutes: number } => i.startMinutes != null)
      .sort((a, b) => a.startMinutes - b.startMinutes);
    const untimed = items.filter((i) => i.startMinutes == null);

    // Walk through timed items, inserting gaps >= 10 min
    const result: UnifiedItem[] = [];
    const blockStartMins = capacity.startHour * 60;
    const blockEndMins = capacity.endHour * 60;

    if (timed.length > 0) {
      let cursor = blockStartMins;
      for (const item of timed) {
        if (item.startMinutes > cursor) {
          const gapMins = item.startMinutes - cursor;
          if (gapMins >= MIN_GAP_MINUTES) {
            result.push({
              kind: 'gap',
              gap: {
                startIso: minutesToIso(dateContext, cursor),
                endIso: minutesToIso(dateContext, item.startMinutes),
                durationMinutes: gapMins,
                label: formatGapLabel(gapMins),
              },
            });
          }
        }
        result.push(item);
        cursor = Math.max(cursor, item.startMinutes + getItemDuration(item));
      }
      // Trailing gap to block end
      if (cursor < blockEndMins) {
        const gapMins = blockEndMins - cursor;
        if (gapMins >= MIN_GAP_MINUTES) {
          result.push({
            kind: 'gap',
            gap: {
              startIso: minutesToIso(dateContext, cursor),
              endIso: minutesToIso(dateContext, blockEndMins),
              durationMinutes: gapMins,
              label: formatGapLabel(gapMins),
            },
          });
        }
      }
    }

    // Append untimed items at end
    result.push(...untimed);

    return result;
  }, [slottedItems, visibleEvents, keyDateEvents, tasks, slottedIds, capacity, dateContext]);

  if (!config) return null;

  const { label, color, Icon } = config;

  const isEmpty = unifiedTimeline.length === 0;

  const handleEventPress = (event: CalendarEvent) => {
    console.log('[TimeBlockSection] handleEventPress called:', event.title);
    openEventPopup(event, dateContext);
  };

  /** Handle tapping a Key Date event - calls the callback */
  const handleKeyDatePress = (keyDate: Note) => {
    console.log('[MorningBrief] Key Date tapped:', keyDate.id, keyDate.title);
    onKeyDatePress?.(keyDate);
  };

  const handleTimeSave = (eventId: string, startAt: string, endAt: string) => {
    setEventTimeOverride(eventId, startAt, endAt);
  };

  const handleTimeReset = (eventId: string) => {
    clearEventTimeOverride(eventId);
  };

  const handleTimePickerClose = () => {
    setTimePickerVisible(false);
    setTimePickerEvent(null);
  };

  // Format time range from capacity
  const timeRange = `${formatHour(capacity.startHour)} – ${formatHour(capacity.endHour)}`;
  const availableDisplay = formatAvailable(availableMinutes);

  return (
    <View style={[styles.section, isPast && styles.sectionPast]}>
      {/* Section Header */}
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.sectionHeaderAccent, { backgroundColor: color }]} />
        <Icon size={16} color={isPast ? COLORS.inkMuted : color} style={styles.sectionIcon} />
        <Text style={[styles.sectionHeader, { color: isPast ? COLORS.inkMuted : color }]}>
          {label}
        </Text>
        <Pressable onPress={openTimeBlockEditor} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.timeRangeTappable}>({timeRange})</Text>
        </Pressable>
        <Text style={styles.availableTime}>
          {isPast ? '· Passed' : `· ${availableDisplay} available`}
        </Text>
      </View>

      {/* Unified chronological timeline */}
      {unifiedTimeline.map((item, idx) => {
        const isLast = idx === unifiedTimeline.length - 1;
        const nextItem = unifiedTimeline[idx + 1];
        const showDivider = !isLast && nextItem?.kind !== 'gap';

        if (item.kind === 'gap') {
          return (
            <GapRow key={`gap-${item.gap.startIso}`} gap={item.gap} onSlotPress={onGapSlotPress} />
          );
        }

        if (item.kind === 'slotted_task') {
          const st = item.slottedTask;
          const taskData = taskDataById[st.id];
          const timeLabel = formatTimeShort(new Date(st.scheduledStartIso));
          return (
            <React.Fragment key={`slotted-${st.id}`}>
              <View style={styles.slottedTaskRow}>
                <View style={{ flex: 1 }}>
                  {taskData ? (
                    <TaskItem
                      task={taskData}
                      onPress={() => onSlottedTaskPress?.(st)}
                      onTimePress={onTimePress}
                      showEstimate={true}
                      dimmed={isPast}
                    />
                  ) : (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 12,
                      }}
                    >
                      <Text
                        style={{ fontSize: 15, color: COLORS.charcoalInk, flex: 1 }}
                        numberOfLines={1}
                      >
                        {st.title}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.unifiedTime}>{timeLabel}</Text>
              </View>
              {showDivider && <View style={styles.rowDivider} />}
            </React.Fragment>
          );
        }

        if (item.kind === 'event') {
          const event = item.event;
          const eventId = getEventId(event);
          const { startAt: effectiveStart, endAt: effectiveEnd } = getEffectiveEventTimes(
            event,
            eventTimeOverrides,
          );
          const effectiveMinutes = Math.round(
            (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60),
          );
          return (
            <React.Fragment key={eventId}>
              <Pressable style={styles.unifiedRow} onPress={() => handleEventPress(event)}>
                <Calendar size={16} color={COLORS.inkMuted} style={styles.unifiedIcon} />
                <Text style={[styles.unifiedTitle, isPast && styles.textMuted]} numberOfLines={1}>
                  {event.title}
                </Text>
                <Text style={styles.unifiedDuration}>
                  {formatDurationCompact(effectiveMinutes)}
                </Text>
                <Text style={styles.unifiedTime}>{formatTimeShort(effectiveStart)}</Text>
              </Pressable>
              {showDivider && <View style={styles.rowDivider} />}
            </React.Fragment>
          );
        }

        if (item.kind === 'key_date') {
          const keyDate = item.keyDate;
          const spaceName = getSpaceName?.(keyDate.space_id);
          const eventTime = keyDate.event_time;
          const titleText =
            (keyDate.title || 'Untitled Event') + (spaceName ? ` \u00B7 ${spaceName}` : '');
          const endTime = keyDate.end_time;

          let durationLabel: string | null = null;
          if (eventTime && endTime) {
            const [sh, sm] = eventTime.split(':').map(Number);
            const [eh, em] = endTime.split(':').map(Number);
            const durationMins = eh * 60 + em - (sh * 60 + sm);
            if (durationMins > 0) durationLabel = formatDurationCompact(durationMins);
          }

          return (
            <React.Fragment key={keyDate.id}>
              <Pressable
                style={styles.unifiedRow}
                onPress={() =>
                  onKeyDateQuickAction ? onKeyDateQuickAction(keyDate) : handleKeyDatePress(keyDate)
                }
              >
                <Calendar size={16} color={COLORS.inkMuted} style={styles.unifiedIcon} />
                <Text style={[styles.unifiedTitle, isPast && styles.textMuted]} numberOfLines={1}>
                  {titleText}
                </Text>
                {durationLabel && <Text style={styles.unifiedDuration}>{durationLabel}</Text>}
                {eventTime ? (
                  <Text style={styles.unifiedTime}>{formatKeyDateTime(eventTime)}</Text>
                ) : (
                  <Text style={styles.unifiedTime}>All day</Text>
                )}
              </Pressable>
              {showDivider && <View style={styles.rowDivider} />}
            </React.Fragment>
          );
        }

        // kind === 'task' (untimed, at bottom)
        const task = item.task;
        return (
          <React.Fragment key={task.id}>
            <View style={styles.taskRow}>
              <TaskItem
                task={task}
                onPress={onTaskPress}
                onTimePress={onTimePress}
                showEstimate={true}
                dimmed={isPast}
              />
            </View>
            {showDivider && <View style={styles.rowDivider} />}
          </React.Fragment>
        );
      })}

      {/* Empty state */}
      {isEmpty && !isPast && (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>No events or tasks</Text>
        </View>
      )}

      {/* Event Time Picker */}
      <EventTimePicker
        visible={timePickerVisible}
        eventId={timePickerEvent ? getEventId(timePickerEvent) : null}
        eventTitle={timePickerEvent?.title ?? null}
        originalStartAt={timePickerEvent?.startAt ?? null}
        originalEndAt={timePickerEvent?.endAt ?? null}
        currentOverride={
          timePickerEvent ? (eventTimeOverrides[getEventId(timePickerEvent)] ?? null) : null
        }
        onClose={handleTimePickerClose}
        onSave={handleTimeSave}
        onReset={handleTimeReset}
      />

      {/* Time Block Edit Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <Pressable style={styles.editOverlay} onPress={() => setEditModalVisible(false)}>
          <View style={styles.editModal} onStartShouldSetResponder={() => true}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>Edit {label}</Text>
              <Pressable onPress={() => setEditModalVisible(false)} hitSlop={8}>
                <X size={20} color={COLORS.inkMuted} />
              </Pressable>
            </View>

            <View style={styles.editTimeRow}>
              <View style={styles.editTimeColumn}>
                <Text style={styles.editTimeLabel}>Start</Text>
                <View style={styles.editAdjuster}>
                  <Pressable
                    onPress={() => setEditStart(Math.max(getMinStart(), editStart - 1))}
                    disabled={editStart <= getMinStart()}
                    style={styles.editAdjusterButton}
                  >
                    <ChevronDown
                      size={20}
                      color={editStart <= getMinStart() ? COLORS.divider : COLORS.mossGreen}
                    />
                  </Pressable>
                  <Text style={styles.editTimeValue}>{formatHour(editStart)}</Text>
                  <Pressable
                    onPress={() => setEditStart(Math.min(editEnd - 1, editStart + 1))}
                    disabled={editStart >= editEnd - 1}
                    style={styles.editAdjusterButton}
                  >
                    <ChevronUp
                      size={20}
                      color={editStart >= editEnd - 1 ? COLORS.divider : COLORS.mossGreen}
                    />
                  </Pressable>
                </View>
              </View>

              <Text style={styles.editArrow}>→</Text>

              <View style={styles.editTimeColumn}>
                <Text style={styles.editTimeLabel}>End</Text>
                <View style={styles.editAdjuster}>
                  <Pressable
                    onPress={() => setEditEnd(Math.max(editStart + 1, editEnd - 1))}
                    disabled={editEnd <= editStart + 1}
                    style={styles.editAdjusterButton}
                  >
                    <ChevronDown
                      size={20}
                      color={editEnd <= editStart + 1 ? COLORS.divider : COLORS.mossGreen}
                    />
                  </Pressable>
                  <Text style={styles.editTimeValue}>{formatHour(editEnd)}</Text>
                  <Pressable
                    onPress={() => setEditEnd(Math.min(getMaxEnd(), editEnd + 1))}
                    disabled={editEnd >= getMaxEnd()}
                    style={styles.editAdjusterButton}
                  >
                    <ChevronUp
                      size={20}
                      color={editEnd >= getMaxEnd() ? COLORS.divider : COLORS.mossGreen}
                    />
                  </Pressable>
                </View>
              </View>
            </View>

            <Pressable style={styles.editSaveButton} onPress={saveTimeBlockEdit}>
              <Text style={styles.editSaveText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: 4,
  },
  sectionPast: {
    opacity: 0.5,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeaderAccent: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    marginRight: 10,
  },
  sectionIcon: {
    marginRight: 6,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  passedText: {
    fontSize: 12,
    color: COLORS.inkMuted,
    marginLeft: 6,
  },
  availableTime: {
    fontSize: 12,
    color: COLORS.inkMuted,
    marginLeft: 4,
    flex: 1,
    textAlign: 'right',
  },
  /* Unified row — shared by events, slotted tasks, key dates */
  unifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  unifiedIcon: {
    marginRight: 12,
  },
  unifiedTitle: {
    flex: 1,
    fontSize: 15,
    color: COLORS.charcoalInk,
  },
  unifiedDuration: {
    fontSize: 13,
    color: COLORS.inkMuted,
    marginLeft: 8,
  },
  unifiedTime: {
    fontSize: 13,
    color: COLORS.inkMuted,
    marginLeft: 8,
    minWidth: 65,
    textAlign: 'right',
  },
  slottedTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E8E6E1',
    marginHorizontal: 16,
  },
  textMuted: {
    color: COLORS.inkMuted,
  },
  taskRow: {
    paddingHorizontal: 16,
  },
  emptyRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.inkMuted,
    fontStyle: 'italic',
  },
  timeRangeTappable: {
    fontSize: 12,
    color: COLORS.mossGreen,
    marginLeft: 4,
    textDecorationLine: 'underline',
  },
  editOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  editModal: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  editModalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.charcoalInk,
  },
  editTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  editTimeColumn: {
    alignItems: 'center',
  },
  editTimeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  editAdjuster: {
    alignItems: 'center',
  },
  editAdjusterButton: {
    padding: 8,
  },
  editTimeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.charcoalInk,
    paddingVertical: 4,
    minWidth: 90,
    textAlign: 'center',
  },
  editArrow: {
    fontSize: 18,
    color: COLORS.inkMuted,
    marginHorizontal: 16,
    marginTop: 24,
  },
  editSaveButton: {
    backgroundColor: COLORS.mossGreen,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.surface,
  },
});
