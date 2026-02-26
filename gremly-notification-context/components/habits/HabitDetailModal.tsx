/**
 * HabitDetailModal - Stub screen/modal for habit details
 *
 * Currently just displays the habit ID.
 * TODO: Add full habit detail view with editing capabilities.
 */

import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Box, Text } from '../../ui';

export interface HabitDetailModalProps {
  visible: boolean;
  habitId: string | null;
  habitName?: string;
  onClose: () => void;
}

export function HabitDetailModal({ visible, habitId, habitName, onClose }: HabitDetailModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={styles.sheet}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <Box style={styles.header}>
            <Text style={styles.title}>Habit Detail</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </Box>

          <View style={styles.content}>
            <Text style={styles.label}>Habit ID:</Text>
            <Text style={styles.value}>{habitId ?? '(none)'}</Text>

            {habitName && (
              <>
                <Text style={[styles.label, { marginTop: 16 }]}>Name:</Text>
                <Text style={styles.value}>{habitName}</Text>
              </>
            )}

            <Text style={styles.placeholder}>Full habit detail view coming soon...</Text>
          </View>
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
    maxHeight: '60%',
    minHeight: 200,
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
  content: {
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: '#212121',
    fontFamily: 'monospace',
  },
  placeholder: {
    marginTop: 32,
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default HabitDetailModal;
