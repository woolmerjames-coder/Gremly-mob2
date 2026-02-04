/**
 * TimeBlockSection
 *
 * Displays a single time block (Morning/Afternoon/Evening) with:
 * - Section header with accent bar, icon, and remaining time
 * - Calendar events (tap for details)
 * - Assigned tasks
 */

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Sunrise, Sun, Sunset, Calendar, X, ChevronUp, ChevronDown } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { getEffectiveEventTimes, type EventTimeOverride } from '../../../../lib/capacity';
import type { TimeBlockCapacity, TimeBlock, TimeBlockPreferences } from '../../../../lib/capacity';
import type { CalendarEvent } from '../../../../lib/calendar/CalendarClient';
import { useGremlyStore } from '../../../../lib/store/useGremlyStore';
import { TaskItem, type TaskItemData } from './TaskItem';
import { EventTimePicker } from './EventTimePicker';

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

/**
 * Format duration in minutes to readable string (e.g., 90 -> "1 hr 30 min")
 */
function formatDurationMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remaining = mins % 60;
  return remaining > 0 ? `${hrs} hr ${remaining} min` : `${hrs} hr`;
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
  tasks: TaskItemData[];
  onTaskPress: (task: TaskItemData) => void;
  /** Called when user taps the time estimate */
  onTimePress?: (task: TaskItemData) => void;
  /** Array of hidden event IDs */
  hiddenEventIds?: string[];
  /** Date context for hiding events (YYYY-MM-DD) */
  dateContext: string;
}

/**
 * Calculate event duration string
 */
function formatEventDuration(event: CalendarEvent, overrideMinutes?: number): string | null {
  if (event.isAllDay) return null;
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const mins = overrideMinutes ?? Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hrs} hr ${remainingMins} min` : `${hrs} hr`;
}

/**
 * Get unique event ID
 */
function getEventId(event: CalendarEvent): string {
  return `${event.provider}-${event.providerEventId}`;
}

export function TimeBlockSection({
  capacity,
  events,
  tasks,
  onTaskPress,
  onTimePress,
  hiddenEventIds = [],
  dateContext,
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

  if (!config) return null;

  const { label, color, Icon } = config;

  const isEmpty = visibleEvents.length === 0 && tasks.length === 0;

  const handleEventPress = (event: CalendarEvent) => {
    console.log('[TimeBlockSection] handleEventPress called:', event.title);
    openEventPopup(event, dateContext);
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

  // Helper to get original duration in minutes
  const getOriginalDurationMinutes = (event: CalendarEvent): number => {
    return Math.round(
      (new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / (1000 * 60),
    );
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

      {/* Calendar Events - 2 lines only */}
      {visibleEvents.map((event, idx) => {
        const eventId = getEventId(event);
        const {
          startAt: effectiveStart,
          endAt: effectiveEnd,
          hasOverride,
        } = getEffectiveEventTimes(event, eventTimeOverrides);

        // Calculate durations
        const originalMinutes = getOriginalDurationMinutes(event);
        const effectiveMinutes = Math.round(
          (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60),
        );

        // Format times for display
        const formatTime = (d: Date) =>
          d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const effectiveTimeRange = `${formatTime(effectiveStart)} - ${formatTime(effectiveEnd)}`;

        const isLast = idx === visibleEvents.length - 1 && tasks.length === 0;
        return (
          <React.Fragment key={eventId}>
            <Pressable style={styles.eventRow} onPress={() => handleEventPress(event)}>
              <Calendar size={16} color={COLORS.inkMuted} style={styles.eventIcon} />
              <View style={styles.eventContent}>
                {/* Line 1: Time + Duration */}
                <Text style={[styles.eventTime, isPast && styles.textMuted]}>
                  {effectiveTimeRange}{' '}
                  {hasOverride ? (
                    // Override: Show duration change
                    <>
                      <Text style={styles.durationStrike}>
                        ({formatDurationMinutes(originalMinutes)}
                      </Text>
                      <Text style={styles.durationOverride}>
                        {' → '}
                        {formatDurationMinutes(effectiveMinutes)})
                      </Text>
                    </>
                  ) : (
                    // No override: Show duration only
                    <>({formatDurationMinutes(effectiveMinutes)})</>
                  )}
                </Text>
                {/* Line 2: Title */}
                <Text style={[styles.eventTitle, isPast && styles.textMuted]} numberOfLines={1}>
                  {event.title}
                </Text>
              </View>
            </Pressable>
            {!isLast && <View style={styles.rowDivider} />}
          </React.Fragment>
        );
      })}

      {/* Assigned Tasks */}
      {tasks.map((task, idx) => {
        const isLast = idx === tasks.length - 1;
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
            {!isLast && <View style={styles.rowDivider} />}
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
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginHorizontal: 16,
  },
  eventIcon: {
    marginTop: 2,
    marginRight: 12,
  },
  eventContent: {
    flex: 1,
  },
  eventTime: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.inkMuted,
    marginBottom: 2,
  },
  durationStrike: {
    textDecorationLine: 'line-through',
    color: COLORS.inkMuted,
  },
  durationOverride: {
    color: COLORS.mossGreen,
    fontWeight: '600',
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.charcoalInk,
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
