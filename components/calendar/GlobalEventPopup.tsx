/**
 * GlobalEventPopup - Global modal for calendar event details
 *
 * Rendered at app root level, controlled by Zustand eventPopup state.
 * Allows tapping calendar events anywhere (CalendarScreen, MorningBriefSheet)
 * to show details and actions (Edit time, Hide from today).
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { X, MapPin, Clock, Calendar } from 'lucide-react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';

const COLORS = {
  linenCream: '#F9F6F1',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  inkSubtle: 'rgba(14, 17, 22, 0.7)',
  divider: '#E8E6E1',
  mossGreen: '#2E5540',
  surface: '#FFFFFF',
};

function formatEventDuration(startAt: string, endAt: string): string | null {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const mins = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hrs} hr ${remainingMins} min` : `${hrs} hr`;
}

export function GlobalEventPopup() {
  const { isOpen, event } = useGremlyStore((s) => s.eventPopup);
  const closeEventPopup = useGremlyStore((s) => s.closeEventPopup);
  const hideEventFromPopup = useGremlyStore((s) => s.hideEventFromPopup);
  const openEventTimePicker = useGremlyStore((s) => s.openEventTimePicker);

  console.log('[GlobalEventPopup] render:', { isOpen, hasEvent: !!event });

  if (!event) return null;

  const handleEditTime = () => {
    openEventTimePicker(event);
    closeEventPopup();
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const timeRange = event.isAllDay ? 'All day' : `${formatTime(start)} - ${formatTime(end)}`;
  const duration = event.isAllDay ? null : formatEventDuration(event.startAt, event.endAt);

  const providerLabel =
    event.provider === 'google'
      ? 'Google Calendar'
      : event.provider === 'outlook'
        ? 'Outlook Calendar'
        : 'Calendar';

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={closeEventPopup}>
      <Pressable style={styles.overlay} onPress={closeEventPopup}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2}>
              {event.title}
            </Text>
            <Pressable onPress={closeEventPopup} hitSlop={8}>
              <X size={20} color={COLORS.inkMuted} />
            </Pressable>
          </View>

          {/* Details */}
          <View style={styles.details}>
            <View style={styles.detailRow}>
              <Clock size={16} color={COLORS.inkMuted} />
              <Text style={styles.detailText}>
                {timeRange}
                {duration ? ` (${duration})` : ''}
              </Text>
            </View>

            {event.location && (
              <View style={styles.detailRow}>
                <MapPin size={16} color={COLORS.inkMuted} />
                <Text style={styles.detailText}>{event.location}</Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <Calendar size={16} color={COLORS.inkMuted} />
              <Text style={styles.detailText}>{providerLabel}</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={styles.actionButton} onPress={handleEditTime}>
              <Clock size={16} color={COLORS.mossGreen} />
              <Text style={styles.actionButtonText}>Edit time</Text>
            </Pressable>
            <View style={styles.actionDivider} />
            <Pressable style={styles.actionButton} onPress={hideEventFromPopup}>
              <Text style={styles.actionButtonText}>Hide from today</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.mossGreen,
  },
  actionDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginHorizontal: 16,
  },
});
