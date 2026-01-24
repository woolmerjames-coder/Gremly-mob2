/**
 * MorningBriefHeader
 *
 * Displays day overview at top of Morning Brief:
 * - "Your Thursday"
 * - Date and current time
 * - Quick stats: event count + available time + hidden count
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { X, RotateCcw, Calendar } from 'lucide-react-native';
import { useGremlyStore } from '../../../../lib/store/useGremlyStore';
import { useTodayCapacity, useHiddenEventCount } from '../../../../lib/store/capacitySelectors';
import { formatDuration } from '../../../../lib/capacity';
import { getDateService } from '../../../../lib/date';
import type { CalendarEvent } from '../../../../lib/calendar/CalendarClient';

const COLORS = {
  linenCream: '#F9F6F1',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  inkSubtle: 'rgba(14, 17, 22, 0.7)',
  divider: '#E8E6E1',
  mossGreen: '#2E5540',
  surface: '#FFFFFF',
  sageMist: '#E8F0EB',
};

export function MorningBriefHeader() {
  const capacity = useTodayCapacity();
  const hiddenCount = useHiddenEventCount();
  const [showHiddenPopup, setShowHiddenPopup] = useState(false);

  // Format current date/time using central date service
  const now = getDateService().now();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateString = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const timeString = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  // Stats
  const eventCount = capacity.totalEventCount;
  const availableTime = formatDuration(capacity.totalAvailableMinutes);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your {dayName}</Text>
      <Text style={styles.subtitle}>
        {dateString} · {timeString}
      </Text>
      <View style={styles.statsRow}>
        <Text style={styles.stats}>
          {eventCount === 0
            ? `No events · ${availableTime} available`
            : `${eventCount} event${eventCount !== 1 ? 's' : ''} · ${availableTime} available`}
        </Text>
        {hiddenCount > 0 && (
          <Pressable
            onPress={() => setShowHiddenPopup(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.hiddenLink}>· {hiddenCount} hidden</Text>
          </Pressable>
        )}
      </View>

      {/* Hidden Events Popup - only mount when visible to avoid hook issues */}
      {showHiddenPopup && (
        <HiddenEventsPopup visible={showHiddenPopup} onClose={() => setShowHiddenPopup(false)} />
      )}
    </View>
  );
}

/**
 * Popup showing hidden events with option to restore
 */
interface HiddenEventsPopupProps {
  visible: boolean;
  onClose: () => void;
}

function HiddenEventsPopup({ visible, onClose }: HiddenEventsPopupProps) {
  const today = getDateService().getCurrentDate();
  const allEvents = useGremlyStore((s) => s.calendarEvents[today] ?? []);
  const hiddenIds = useGremlyStore((s) => s.hiddenCalendarEventsByDate[today] ?? []);
  const unhideCalendarEvent = useGremlyStore((s) => s.unhideCalendarEvent);
  const unhideAllCalendarEventsForDate = useGremlyStore((s) => s.unhideAllCalendarEventsForDate);

  // Get only hidden events
  const hiddenSet = new Set(hiddenIds);
  const hiddenEvents = allEvents.filter((e) => hiddenSet.has(`${e.provider}-${e.providerEventId}`));

  const handleUnhide = (event: CalendarEvent) => {
    unhideCalendarEvent(today, `${event.provider}-${event.providerEventId}`);
  };

  const handleUnhideAll = () => {
    unhideAllCalendarEventsForDate(today);
    onClose();
  };

  if (hiddenEvents.length === 0) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={popupStyles.overlay} onPress={onClose}>
        <Pressable style={popupStyles.container} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={popupStyles.header}>
            <Text style={popupStyles.title}>Hidden Events</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={COLORS.inkMuted} />
            </Pressable>
          </View>

          {/* List */}
          <ScrollView style={popupStyles.list}>
            {hiddenEvents.map((event) => {
              const eventId = `${event.provider}-${event.providerEventId}`;
              return (
                <View key={eventId} style={popupStyles.eventRow}>
                  <Calendar size={16} color={COLORS.inkMuted} style={popupStyles.eventIcon} />
                  <Text style={popupStyles.eventTitle} numberOfLines={1}>
                    {event.title}
                  </Text>
                  <Pressable style={popupStyles.restoreButton} onPress={() => handleUnhide(event)}>
                    <RotateCcw size={14} color={COLORS.mossGreen} />
                    <Text style={popupStyles.restoreText}>Restore</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          {/* Restore All */}
          {hiddenEvents.length > 1 && (
            <View style={popupStyles.footer}>
              <Pressable style={popupStyles.restoreAllButton} onPress={handleUnhideAll}>
                <Text style={popupStyles.restoreAllText}>Restore all</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    backgroundColor: COLORS.linenCream,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.charcoalInk,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.inkSubtle,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  stats: {
    fontSize: 14,
    color: COLORS.inkMuted,
  },
  hiddenLink: {
    fontSize: 14,
    color: COLORS.mossGreen,
    fontWeight: '500',
    marginLeft: 2,
  },
});

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
    maxHeight: '60%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.charcoalInk,
  },
  list: {
    maxHeight: 250,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  eventIcon: {
    marginRight: 10,
  },
  eventTitle: {
    flex: 1,
    fontSize: 15,
    color: COLORS.charcoalInk,
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: COLORS.sageMist,
    borderRadius: 8,
  },
  restoreText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.mossGreen,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  restoreAllButton: {
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.sageMist,
    borderRadius: 10,
  },
  restoreAllText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.mossGreen,
  },
});
