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
import { Sunrise, Sun, Sunset, Calendar, X, MapPin, Clock } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { formatBlockRemaining } from '../../../../lib/capacity';
import type { TimeBlockCapacity, TimeBlock } from '../../../../lib/capacity';
import type { CalendarEvent } from '../../../../lib/calendar/CalendarClient';
import { TaskItem, type TaskItemData } from './TaskItem';

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
function formatEventDuration(event: CalendarEvent): string | null {
  if (event.isAllDay) return null;
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const mins = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
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
}

function EventDetailPopup({ event, visible, onClose, onHide }: EventDetailPopupProps) {
  if (!event) return null;

  const duration = formatEventDuration(event);
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
                {duration ? ` (${duration})` : ''}
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
            <Pressable style={popupStyles.hideButton} onPress={onHide}>
              <Text style={popupStyles.hideButtonText}>Hide from today</Text>
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
  actions: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  hideButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  hideButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.mossGreen,
  },
});

export function TimeBlockSection({
  capacity,
  events,
  tasks,
  onTaskPress,
  onHideEvent,
  hiddenEventIds = [],
}: TimeBlockSectionProps) {
  const { block, availableMinutes, isPast } = capacity;
  const config = SECTION_CONFIG[block];

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventPopup, setShowEventPopup] = useState(false);

  if (!config) return null;

  const { label, color, Icon } = config;
  const remainingText = formatBlockRemaining(availableMinutes, isPast);

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
        const duration = formatEventDuration(event);
        const isLast = idx === visibleEvents.length - 1 && tasks.length === 0;
        return (
          <Pressable
            key={getEventId(event)}
            style={[styles.eventRow, !isLast && styles.rowBorder]}
            onPress={() => handleEventPress(event)}
          >
            <Calendar size={16} color={COLORS.inkMuted} style={styles.eventIcon} />
            <View style={styles.eventContent}>
              {/* Line 1: Time + Duration */}
              <Text style={[styles.eventTime, isPast && styles.textMuted]}>
                {formatEventTimeCompact(event)}
                {duration ? `  (${duration})` : ''}
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
            <TaskItem task={task} onPress={onTaskPress} showEstimate={true} dimmed={isPast} />
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
