/**
 * NowWeekPopup - Shows weekly habit summaries
 */

import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Box, Text } from '../../ui';
import type { NowWeeklyHabitSummary, HabitWeeklyStatus } from '../../lib/now/nowTypes';

interface NowWeekPopupProps {
  visible: boolean;
  summaries: NowWeeklyHabitSummary[];
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

export function NowWeekPopup({ visible, summaries, onClose }: NowWeekPopupProps) {
  const totalCompleted = summaries.reduce((sum, s) => sum + s.completionsThisWeek, 0);
  const totalTarget = summaries.reduce((sum, s) => sum + s.targetPerWeek, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={styles.sheet}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <Box style={styles.header}>
            <Text style={styles.title}>Your week so far</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </Box>

          <ScrollView style={styles.list}>
            {summaries.length === 0 ? (
              <Text style={styles.emptyText}>No habits to track this week</Text>
            ) : (
              <>
                {summaries.map((summary, index) => (
                  <Box key={index} style={styles.item}>
                    <Text style={styles.habitName}>{summary.name}</Text>
                    <Text style={styles.habitProgress}>
                      {summary.completionsThisWeek}/{summary.targetPerWeek}
                    </Text>
                    <Text style={styles.habitStatus}>{getStatusLabel(summary.status)}</Text>
                  </Box>
                ))}

                {summaries.length > 0 && (
                  <Box style={styles.overall}>
                    <Text style={styles.overallText}>
                      Overall: {totalCompleted}/{totalTarget} on track
                    </Text>
                  </Box>
                )}
              </>
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
