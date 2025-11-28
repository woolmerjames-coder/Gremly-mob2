/**
 * NowWeekPopup - Shows today's habit progress and weekly summaries
 *
 * Uses useTodayStats as single source of truth for today's habits,
 * ensuring the counts match what's shown in the Today cards.
 */

import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Box, Text } from '../../ui';
import type {
  NowWeeklyHabitSummary,
  HabitWeeklyStatus,
  NowLockedItem,
  NowActiveItem,
  NowCompletedItem,
} from '../../lib/now/nowTypes';

interface NowWeekPopupProps {
  visible: boolean;
  /** Today's habits from useTodayStats (locked + active) */
  habitsToday: Array<NowLockedItem | NowActiveItem>;
  /** Today's completed habits from useTodayStats */
  completedHabitsToday: NowCompletedItem[];
  /** Weekly summaries for habit tracking */
  weeklySummaries: NowWeeklyHabitSummary[];
  onClose: () => void;
}

function getStatusLabel(status: HabitWeeklyStatus): string {
  switch (status) {
    case 'week_complete':
      return '✓ Completed for the week';
    case 'flexible':
      return 'Flexible – days left';
    case 'on_track_today':
      return 'Do today to stay on track';
    case 'last_chance':
      return 'Last chance today';
    default:
      return '';
  }
}

export function NowWeekPopup({
  visible,
  habitsToday,
  completedHabitsToday,
  weeklySummaries,
  onClose,
}: NowWeekPopupProps) {
  // Today's habit counts - derived from useTodayStats
  const totalHabitsToday = habitsToday.length;
  const completedHabitsCount = completedHabitsToday.length;
  const allHabitsCompletedToday = totalHabitsToday > 0 && completedHabitsCount >= totalHabitsToday;

  // Weekly totals
  const weeklyCompleted = weeklySummaries.reduce((sum, s) => sum + s.completionsThisWeek, 0);
  const weeklyTarget = weeklySummaries.reduce((sum, s) => sum + s.targetPerWeek, 0);

  // Determine today's status message
  let todayStatusMessage: string;
  let todayStatusStyle: object;

  if (totalHabitsToday === 0) {
    todayStatusMessage = 'No habits scheduled for today';
    todayStatusStyle = styles.todayStatusNeutral;
  } else if (allHabitsCompletedToday) {
    todayStatusMessage = '✓ All habits done for today!';
    todayStatusStyle = styles.todayStatusComplete;
  } else {
    todayStatusMessage = `${completedHabitsCount} of ${totalHabitsToday} habits done today`;
    todayStatusStyle = styles.todayStatusInProgress;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={styles.sheet}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <Box style={styles.header}>
            <Text style={styles.title}>Habits</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </Box>

          <ScrollView style={styles.list}>
            {/* Today's Status Banner */}
            <Box style={styles.todayBanner}>
              <Text style={styles.todayLabel}>TODAY</Text>
              <Text style={[styles.todayStatus, todayStatusStyle]}>{todayStatusMessage}</Text>
            </Box>

            {/* Weekly Summary Section */}
            {weeklySummaries.length > 0 && (
              <>
                <Box style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>This Week</Text>
                </Box>

                {weeklySummaries.map((summary, index) => (
                  <Box key={index} style={styles.item}>
                    <Text style={styles.habitName}>{summary.name}</Text>
                    <Text style={styles.habitProgress}>
                      {summary.completionsThisWeek}/{summary.targetPerWeek}
                    </Text>
                    <Text style={styles.habitStatus}>{getStatusLabel(summary.status)}</Text>
                  </Box>
                ))}

                <Box style={styles.overall}>
                  <Text style={styles.overallText}>
                    Weekly: {weeklyCompleted}/{weeklyTarget} completed
                  </Text>
                </Box>
              </>
            )}

            {weeklySummaries.length === 0 && totalHabitsToday === 0 && (
              <Text style={styles.emptyText}>No habits to track</Text>
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
    color: '#1976D2',
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  // Today's status banner
  todayBanner: {
    backgroundColor: '#F5F3EE',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  todayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 4,
    letterSpacing: 1,
  },
  todayStatus: {
    fontSize: 16,
    fontWeight: '600',
  },
  todayStatusComplete: {
    color: '#2E5540', // mossGreen
  },
  todayStatusInProgress: {
    color: '#424242',
  },
  todayStatusNeutral: {
    color: '#757575',
  },
  // Weekly section
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  item: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  habitName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  habitProgress: {
    fontSize: 14,
    color: '#424242',
    marginBottom: 2,
  },
  habitStatus: {
    fontSize: 14,
    color: '#757575',
  },
  overall: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: '#E0E0E0',
  },
  overallText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    paddingVertical: 24,
  },
});
