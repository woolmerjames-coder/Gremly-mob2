/**
 * TimeBlockSection
 *
 * Displays a single time block (Morning/Afternoon/Evening) with:
 * - Section header with accent bar, icon, and remaining time
 * - Calendar events (tap for details)
 * - Assigned tasks
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Sunrise, Sun, Sunset, Calendar, X, MapPin, Clock, Pencil } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { formatBlockRemaining } from '../../../../lib/capacity';
import type { TimeBlockCapacity, TimeBlock } from '../../../../lib/capacity';
import type { CalendarEvent } from '../../../../lib/calendar/CalendarClient';
import { useGremlyStore } from '../../../../lib/store/useGremlyStore';
import { TaskItem, type TaskItemData } from './TaskItem';
import { EventDurationPicker } from './EventDurationPicker';

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
  /** Called when user hides an event from the view */
  onHideEvent?: (eventId: string) => void;
  /** Array of hidden event IDs */
  hiddenEventIds?: string[];
}

/**
 * Format event time range for display (compact)
 */
function formatEventTimeCompact(event: CalendarEvent): string {
  if (event.isAllDay) return 'All day';
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const startStr = start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const endStr = end.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${startStr} - ${endStr}`;
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

/**
 * Event Detail Popup
 */
interface EventDetailPopupProps {
  event: CalendarEvent | null;
  visible: boolean;
  onClose: () => void;
  onHide: () => void;
  onEditDuration: () => void;
  durationOverride?: number;
}

function EventDetailPopup({
  event,
  visible,
  onClose,
  onHide,
  onEditDuration,
  durationOverride,
}: EventDetailPopupProps) {
  if (!event) return null;

  const originalDuration = formatEventDuration(event);
  const displayDuration = durationOverride
    ? formatEventDuration(event, durationOverride)
    : originalDuration;
  const hasOverride = durationOverride !== undefined;
  const timeRange = formatEventTimeCompact(event);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={popupStyles.overlay} onPress={onClose}>
        <Pressable style={popupStyles.container} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={popupStyles.header}>
            <Text style={popupStyles.title} numberOfLines={2}>
              {event.title}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={COLORS.inkMuted} />
            </Pressable>
          </View>

          {/* Details */}
          <View style={popupStyles.details}>
            <View style={popupStyles.detailRow}>
              <Clock size={16} color={COLORS.inkMuted} />
              <Text style={popupStyles.detailText}>
                {timeRange}
                {hasOverride ? (
                  <>
                    {' ('}
                    <Text style={popupStyles.strikethrough}>{originalDuration}</Text>
                    {' → '}
                    <Text style={popupStyles.overrideText}>{displayDuration}</Text>
                    {')'}
                  </>
                ) : displayDuration ? (
                  ` (${displayDuration})`
                ) : (
                  ''
                )}
              </Text>
            </View>

            {event.location && (
              <View style={popupStyles.detailRow}>
                <MapPin size={16} color={COLORS.inkMuted} />
                <Text style={popupStyles.detailText}>{event.location}</Text>
              </View>
            )}

            <View style={popupStyles.detailRow}>
              <Calendar size={16} color={COLORS.inkMuted} />
              <Text style={popupStyles.detailText}>
                {event.provider === 'google'
                  ? 'Google Calendar'
                  : event.provider === 'outlook'
                    ? 'Outlook Calendar'
                    : 'Calendar'}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={popupStyles.actions}>
            <Pressable style={popupStyles.actionButton} onPress={onEditDuration}>
              <Pencil size={16} color={COLORS.mossGreen} />
              <Text style={popupStyles.actionButtonText}>Edit duration</Text>
            </Pressable>
            <View style={popupStyles.actionDivider} />
            <Pressable style={popupStyles.actionButton} onPress={onHide}>
              <Text style={popupStyles.actionButtonText}>Hide from today</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const popupStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    width: '100%',
    maxWidth: 340,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.charcoalInk,
    marginRight: 12,
  },
  details: {
    padding: 16,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  detailText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.inkSubtle,
    lineHeight: 20,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
    color: COLORS.inkMuted,
  },
  overrideText: {
    color: COLORS.mossGreen,
    fontWeight: '600',
  },
  actions: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.mossGreen,
  },
  actionDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 4,
  },
});

export function TimeBlockSection({
  capacity,
  events,
  tasks,
  onTaskPress,
  onTimePress,
  onHideEvent,
  hiddenEventIds = [],
}: TimeBlockSectionProps) {
  const { block, availableMinutes, isPast } = capacity;
  const config = SECTION_CONFIG[block];

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventPopup, setShowEventPopup] = useState(false);
  const [durationPickerVisible, setDurationPickerVisible] = useState(false);
  const [durationPickerEvent, setDurationPickerEvent] = useState<CalendarEvent | null>(null);

  // Get overrides and actions from store
  const eventDurationOverrides = useGremlyStore((s) => s.eventDurationOverrides ?? {});
  const setEventDurationOverride = useGremlyStore((s) => s.setEventDurationOverride);
  const clearEventDurationOverride = useGremlyStore((s) => s.clearEventDurationOverride);

  if (!config) return null;

  const { label, color, Icon } = config;

  // Filter out all-day events and hidden events
  const hiddenSet = new Set(hiddenEventIds);
  const visibleEvents = events.filter((e) => !e.isAllDay && !hiddenSet.has(getEventId(e)));

  const isEmpty = visibleEvents.length === 0 && tasks.length === 0;

  const handleEventPress = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowEventPopup(true);
  };

  const handleHideEvent = () => {
    if (selectedEvent && onHideEvent) {
      onHideEvent(getEventId(selectedEvent));
    }
    setShowEventPopup(false);
    setSelectedEvent(null);
  };

  const handleEditDuration = () => {
    if (selectedEvent) {
      setDurationPickerEvent(selectedEvent);
      setShowEventPopup(false);
      setDurationPickerVisible(true);
    }
  };

  const handleDurationSave = (eventId: string, minutes: number) => {
    setEventDurationOverride(eventId, minutes);
  };

  const handleDurationReset = (eventId: string) => {
    clearEventDurationOverride(eventId);
  };

  const handleDurationPickerClose = () => {
    setDurationPickerVisible(false);
    setDurationPickerEvent(null);
  };

  // Helper to get original duration in minutes
  const getOriginalDurationMinutes = (event: CalendarEvent): number => {
    return Math.round(
      (new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / (1000 * 60),
    );
  };

  return (
    <View style={[styles.section, isPast && styles.sectionPast]}>
      {/* Section Header */}
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.sectionHeaderAccent, { backgroundColor: color }]} />
        <Icon size={16} color={isPast ? COLORS.inkMuted : color} style={styles.sectionIcon} />
        <Text style={[styles.sectionHeader, { color: isPast ? COLORS.inkMuted : color }]}>
          {label}
        </Text>
        {isPast && <Text style={styles.passedText}>· Passed</Text>}
      </View>

      {/* Calendar Events - 2 lines only */}
      {visibleEvents.map((event, idx) => {
        const eventId = getEventId(event);
        const originalMinutes = getOriginalDurationMinutes(event);
        const overrideMinutes = eventDurationOverrides[eventId];
        const hasOverride = overrideMinutes !== undefined;
        const displayMinutes = hasOverride ? overrideMinutes : originalMinutes;
        const isLast = idx === visibleEvents.length - 1 && tasks.length === 0;
        return (
          <Pressable
            key={eventId}
            style={[styles.eventRow, !isLast && styles.rowBorder]}
            onPress={() => handleEventPress(event)}
          >
            <Calendar size={16} color={COLORS.inkMuted} style={styles.eventIcon} />
            <View style={styles.eventContent}>
              {/* Line 1: Time + Duration */}
              <Text style={[styles.eventTime, isPast && styles.textMuted]}>
                {formatEventTimeCompact(event)}
                {'  ('}
                {hasOverride ? (
                  <>
                    <Text style={styles.durationStrike}>
                      {formatEventDuration(event, originalMinutes)}
                    </Text>
                    {' → '}
                    <Text style={styles.durationOverride}>
                      {formatEventDuration(event, displayMinutes)}
                    </Text>
                  </>
                ) : (
                  formatEventDuration(event, displayMinutes)
                )}
                {')'}
              </Text>
              {/* Line 2: Title */}
              <Text style={[styles.eventTitle, isPast && styles.textMuted]} numberOfLines={1}>
                {event.title}
              </Text>
            </View>
          </Pressable>
        );
      })}

      {/* Assigned Tasks */}
      {tasks.map((task, idx) => {
        const isLast = idx === tasks.length - 1;
        return (
          <View key={task.id} style={[styles.taskRow, !isLast && styles.rowBorder]}>
            <TaskItem
              task={task}
              onPress={onTaskPress}
              onTimePress={onTimePress}
              showEstimate={true}
              dimmed={isPast}
            />
          </View>
        );
      })}

      {/* Empty state */}
      {isEmpty && !isPast && (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>No events or tasks</Text>
        </View>
      )}

      {/* Event Detail Popup */}
      <EventDetailPopup
        event={selectedEvent}
        visible={showEventPopup}
        onClose={() => setShowEventPopup(false)}
        onHide={handleHideEvent}
        onEditDuration={handleEditDuration}
        durationOverride={
          selectedEvent ? eventDurationOverrides[getEventId(selectedEvent)] : undefined
        }
      />

      {/* Event Duration Picker */}
      <EventDurationPicker
        visible={durationPickerVisible}
        eventId={durationPickerEvent ? getEventId(durationPickerEvent) : null}
        eventTitle={durationPickerEvent?.title ?? null}
        originalDuration={
          durationPickerEvent ? getOriginalDurationMinutes(durationPickerEvent) : null
        }
        currentOverride={
          durationPickerEvent
            ? (eventDurationOverrides[getEventId(durationPickerEvent)] ?? null)
            : null
        }
        onClose={handleDurationPickerClose}
        onSave={handleDurationSave}
        onReset={handleDurationReset}
      />
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
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
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
    paddingHorizontal: 0,
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
});
