/**
 * MorningBriefHeader
 *
 * Displays day overview at top of Morning Brief:
 * - "Your Thursday"
 * - Date and current time
 * - Quick stats: event count + available time + hidden count
 */

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, Image } from 'react-native';
import { X, RotateCcw, Calendar, CheckSquare, Repeat } from 'lucide-react-native';
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
  const hiddenEventCount = useHiddenEventCount();
  const hiddenTodayIds = useGremlyStore((s) => s.hiddenTodayIds);
  const [showHiddenPopup, setShowHiddenPopup] = useState(false);

  // Combined hidden count (events + todos/habits)
  const totalHiddenCount = hiddenEventCount + hiddenTodayIds.length;

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
      <View style={styles.headerRow}>
        <View style={styles.headerContent}>
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
            {totalHiddenCount > 0 && (
              <Pressable
                onPress={() => setShowHiddenPopup(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.hiddenLink}>· {totalHiddenCount} hidden</Text>
              </Pressable>
            )}
          </View>
        </View>
        <Image
          source={require('../../../../assets/mascot/morningbriefgremly.png')}
          style={styles.headerMascot}
        />
      </View>

      {/* Hidden Items Popup - shows hidden events and hidden tasks */}
      {showHiddenPopup && (
        <HiddenItemsPopup visible={showHiddenPopup} onClose={() => setShowHiddenPopup(false)} />
      )}
    </View>
  );
}

/**
 * Popup showing hidden items (events + todos/habits) with option to restore
 */
interface HiddenItemsPopupProps {
  visible: boolean;
  onClose: () => void;
}

function HiddenItemsPopup({ visible, onClose }: HiddenItemsPopupProps) {
  const today = getDateService().getCurrentDate();

  // Hidden events
  const allEvents = useGremlyStore((s) => s.calendarEvents[today] ?? []);
  const hiddenEventIds = useGremlyStore((s) => s.hiddenCalendarEventsByDate[today] ?? []);
  const unhideCalendarEvent = useGremlyStore((s) => s.unhideCalendarEvent);
  const unhideAllCalendarEventsForDate = useGremlyStore((s) => s.unhideAllCalendarEventsForDate);

  // Hidden todos/habits
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const hiddenTodayIds = useGremlyStore((s) => s.hiddenTodayIds);
  const unhideForToday = useGremlyStore((s) => s.unhideForToday);
  const clearHiddenToday = useGremlyStore((s) => s.clearHiddenToday);

  // Get hidden events
  const hiddenEventSet = new Set(hiddenEventIds);
  const hiddenEvents = allEvents.filter((e) =>
    hiddenEventSet.has(`${e.provider}-${e.providerEventId}`),
  );

  // Get hidden todos and habits
  const hiddenTodaySet = useMemo(() => new Set(hiddenTodayIds), [hiddenTodayIds]);
  const hiddenTodos = useMemo(
    () => todos.filter((t) => hiddenTodaySet.has(t.id)),
    [todos, hiddenTodaySet],
  );
  const hiddenHabits = useMemo(
    () => habits.filter((h) => hiddenTodaySet.has(h.id)),
    [habits, hiddenTodaySet],
  );

  const handleUnhideEvent = (event: CalendarEvent) => {
    unhideCalendarEvent(today, `${event.provider}-${event.providerEventId}`);
  };

  const handleUnhideAllEvents = () => {
    unhideAllCalendarEventsForDate(today);
  };

  const handleUnhideTask = (id: string) => {
    unhideForToday(id);
  };

  const handleUnhideAllTasks = () => {
    clearHiddenToday();
  };

  const totalHiddenCount = hiddenEvents.length + hiddenTodos.length + hiddenHabits.length;

  if (totalHiddenCount === 0) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={popupStyles.overlay} onPress={onClose}>
        <Pressable style={popupStyles.container} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={popupStyles.header}>
            <Text style={popupStyles.title}>Hidden Items</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={COLORS.inkMuted} />
            </Pressable>
          </View>

          {/* List */}
          <ScrollView style={popupStyles.list}>
            {/* Hidden Events Section */}
            {hiddenEvents.length > 0 && (
              <>
                <View style={popupStyles.sectionHeader}>
                  <Text style={popupStyles.sectionTitle}>Hidden events</Text>
                  {hiddenEvents.length > 1 && (
                    <Pressable onPress={handleUnhideAllEvents}>
                      <Text style={popupStyles.sectionAction}>Restore all</Text>
                    </Pressable>
                  )}
                </View>
                {hiddenEvents.map((event) => {
                  const eventId = `${event.provider}-${event.providerEventId}`;
                  return (
                    <View key={eventId} style={popupStyles.itemRow}>
                      <Calendar size={16} color={COLORS.inkMuted} style={popupStyles.itemIcon} />
                      <Text style={popupStyles.itemTitle} numberOfLines={1}>
                        {event.title}
                      </Text>
                      <Pressable
                        style={popupStyles.restoreButton}
                        onPress={() => handleUnhideEvent(event)}
                      >
                        <RotateCcw size={14} color={COLORS.mossGreen} />
                        <Text style={popupStyles.restoreText}>Restore</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </>
            )}

            {/* Hidden for Today Section (Todos + Habits) */}
            {(hiddenTodos.length > 0 || hiddenHabits.length > 0) && (
              <>
                <View style={popupStyles.sectionHeader}>
                  <Text style={popupStyles.sectionTitle}>Hidden for today</Text>
                  {hiddenTodos.length + hiddenHabits.length > 1 && (
                    <Pressable onPress={handleUnhideAllTasks}>
                      <Text style={popupStyles.sectionAction}>Restore all</Text>
                    </Pressable>
                  )}
                </View>
                {hiddenTodos.map((todo) => (
                  <View key={todo.id} style={popupStyles.itemRow}>
                    <CheckSquare size={16} color={COLORS.inkMuted} style={popupStyles.itemIcon} />
                    <Text style={popupStyles.itemTitle} numberOfLines={1}>
                      {todo.name || 'Untitled'}
                    </Text>
                    <Pressable
                      style={popupStyles.restoreButton}
                      onPress={() => handleUnhideTask(todo.id)}
                    >
                      <RotateCcw size={14} color={COLORS.mossGreen} />
                      <Text style={popupStyles.restoreText}>Restore</Text>
                    </Pressable>
                  </View>
                ))}
                {hiddenHabits.map((habit) => (
                  <View key={habit.id} style={popupStyles.itemRow}>
                    <Repeat size={16} color={COLORS.inkMuted} style={popupStyles.itemIcon} />
                    <Text style={popupStyles.itemTitle} numberOfLines={1}>
                      {habit.name || 'Untitled'}
                    </Text>
                    <Pressable
                      style={popupStyles.restoreButton}
                      onPress={() => handleUnhideTask(habit.id)}
                    >
                      <RotateCcw size={14} color={COLORS.mossGreen} />
                      <Text style={popupStyles.restoreText}>Restore</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
  },
  headerMascot: {
    width: 60,
    height: 60,
    marginLeft: 12,
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
    maxHeight: 300,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: COLORS.linenCream,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionAction: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.mossGreen,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  itemIcon: {
    marginRight: 10,
  },
  itemTitle: {
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
});
