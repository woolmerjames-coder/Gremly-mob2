/**
 * NowProgressPopup - Mini calendar popup with date navigation
 *
 * Features:
 * - Navigate between days with chevron arrows
 * - Today: shows completed items with undo capability
 * - Other dates: shows all scheduled items (todos, habits)
 * - Tap item to open edit overlay
 */

import React, { useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, ScrollView, View } from 'react-native';
import { Text } from '../../ui';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useCalendarItemsForDate, type CalendarItem } from '../../lib/store/calendarSelectors';
import type { NowCompletedItem } from '../../lib/now/nowTypes';

// Accent colors - same as NowFocusRow
const ACCENT_COLORS = {
  habit: '#2E5540', // Moss Green
  todo: '#4A7FBF', // Soft blue
  journal: '#8B7355', // Warm brown for journals
} as const;

// Divider color - same as NowFocusRow
const DIVIDER_COLOR = 'rgba(0, 0, 0, 0.08)';

// Moss Green for links and navigation
const MOSS_GREEN = '#2E5540';

// Sage Mist for completed items
const SAGE_MIST = '#BFD8C0';

interface NowProgressPopupProps {
  visible: boolean;
  completed: NowCompletedItem[];
  /** Total tasks for today */
  totalTasksToday: number;
  /** Total completed tasks for today */
  totalCompletedToday: number;
  onClose: () => void;
  onUndoItem?: (item: NowCompletedItem) => void;
  onItemPress?: (item: CalendarItem) => void;
}

export function NowProgressPopup({
  visible,
  completed,
  totalTasksToday: _totalTasksToday,
  totalCompletedToday: _totalCompletedToday,
  onClose,
  onUndoItem,
  onItemPress,
}: NowProgressPopupProps) {
  // Get today's date string
  const getTodayStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  // Date state for navigation - always start at today when visible
  // The key prop on the inner content resets state when visibility changes
  const [selectedDate, setSelectedDate] = useState(getTodayStr);

  const todayStr = getTodayStr();
  const isToday = selectedDate === todayStr;

  // Get items for selected date using calendar selector
  const calendarItems = useCalendarItemsForDate(selectedDate);

  // Navigation handlers
  const goToPreviousDay = () => {
    const current = new Date(selectedDate + 'T12:00:00');
    current.setDate(current.getDate() - 1);
    setSelectedDate(
      `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`,
    );
  };

  const goToNextDay = () => {
    const current = new Date(selectedDate + 'T12:00:00');
    current.setDate(current.getDate() + 1);
    setSelectedDate(
      `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`,
    );
  };

  const goToToday = () => {
    setSelectedDate(todayStr);
  };

  // Format date for header display
  const formatHeaderDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    if (dateStr === todayStr) return 'Today';

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    if (dateStr === yesterdayStr) return 'Yesterday';

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    if (dateStr === tomorrowStr) return 'Tomorrow';

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Format time as "3:19pm" (lowercase am/pm)
  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, '0')}${period}`;
  };

  // Format completed_at timestamp
  const formatCompletedTime = (isoString: string) => {
    const date = new Date(isoString);
    return date
      .toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      .toLowerCase()
      .replace(' ', '');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => setSelectedDate(getTodayStr())}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Header with date navigation */}
          <View style={styles.header}>
            <TouchableOpacity onPress={goToPreviousDay} style={styles.navButton}>
              <ChevronLeft size={24} color={MOSS_GREEN} />
            </TouchableOpacity>

            <TouchableOpacity onPress={goToToday} style={styles.headerCenter}>
              <Text style={styles.title}>{formatHeaderDate(selectedDate)}</Text>
              {!isToday && <Text style={styles.todayHint}>Tap for today</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={goToNextDay} style={styles.navButton}>
              <ChevronRight size={24} color={MOSS_GREEN} />
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          {/* List */}
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={true}
            bounces={true}
          >
            {isToday ? (
              // TODAY: Show completed items with undo
              completed.length === 0 ? (
                <Text style={styles.emptyText}>No items completed yet today</Text>
              ) : (
                completed.map((item, index) => {
                  const accentColor = ACCENT_COLORS[item.type];
                  const metaLabel = item.type === 'habit' ? 'Habit · Daily' : 'Todo';
                  const timeLabel = formatCompletedTime(item.completedAt);
                  const isFirst = index === 0;

                  return (
                    <View key={item.id || index}>
                      {!isFirst && <View style={styles.divider} />}

                      <View style={styles.row}>
                        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
                        <View style={styles.content}>
                          <View style={styles.line1}>
                            <Text style={styles.itemTitle} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={styles.timestamp}>{timeLabel}</Text>
                          </View>
                          <View style={styles.line2}>
                            <Text style={styles.metaLabel}>{metaLabel}</Text>
                            {onUndoItem && (
                              <TouchableOpacity
                                onPress={() => onUndoItem(item)}
                                style={styles.undoButton}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              >
                                <Text style={styles.undoText}>Undo</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })
              )
            ) : // OTHER DATES: Show all items for that date
            calendarItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Nothing scheduled</Text>
                <Text style={styles.emptyHint}>Your day is wide open</Text>
              </View>
            ) : (
              calendarItems.map((item, index) => {
                const accentColor =
                  item.type === 'journal'
                    ? ACCENT_COLORS.journal
                    : item.type === 'habit'
                      ? ACCENT_COLORS.habit
                      : ACCENT_COLORS.todo;
                const isFirst = index === 0;
                const subtitle =
                  item.type === 'journal'
                    ? 'Journal'
                    : item.type === 'habit'
                      ? 'Habit · Daily'
                      : item.time
                        ? `Todo · ${formatTime(item.time)}`
                        : 'Todo';

                return (
                  <View key={item.id}>
                    {!isFirst && <View style={styles.divider} />}
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => onItemPress?.(item)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.accentBar,
                          { backgroundColor: accentColor },
                          item.isCompleted && styles.accentBarCompleted,
                        ]}
                      />
                      <View style={styles.content}>
                        <View style={styles.line1}>
                          <Text
                            style={[
                              styles.itemTitle,
                              item.isCompleted && styles.itemTitleCompleted,
                            ]}
                            numberOfLines={1}
                          >
                            {item.title}
                          </Text>
                        </View>
                        <View style={styles.line2}>
                          <Text style={styles.metaLabel}>{subtitle}</Text>
                          {item.isCompleted && <Text style={styles.completedBadge}>Done</Text>}
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER_COLOR,
  },
  navButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  todayHint: {
    fontSize: 11,
    color: MOSS_GREEN,
    marginTop: 2,
  },
  closeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  closeText: {
    fontSize: 16,
    color: MOSS_GREEN,
    fontWeight: '600',
  },
  list: {
    flexGrow: 1,
    flexShrink: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 34,
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER_COLOR,
    marginLeft: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingTop: 10,
    paddingBottom: 6,
    minHeight: 48,
  },
  accentBar: {
    width: 3,
    borderRadius: 4,
    marginRight: 10,
    marginVertical: 2,
  },
  accentBarCompleted: {
    backgroundColor: SAGE_MIST,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  line1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
    marginRight: 8,
  },
  itemTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#9E9E9E',
  },
  timestamp: {
    fontSize: 13,
    color: '#9E9E9E',
  },
  line2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  metaLabel: {
    fontSize: 12,
    color: '#757575',
  },
  completedBadge: {
    fontSize: 11,
    color: MOSS_GREEN,
    fontWeight: '600',
  },
  undoButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  undoText: {
    fontSize: 13,
    color: MOSS_GREEN,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    paddingVertical: 32,
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: '#9E9E9E',
    marginTop: 4,
  },
});
