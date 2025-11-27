/**
 * NowProgressPopup - Shows today's completed items with undo capability
 */

import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Box, Text } from '../../ui';
import type { NowCompletedItem } from '../../lib/now/nowTypes';

interface NowProgressPopupProps {
  visible: boolean;
  completed: NowCompletedItem[];
  onClose: () => void;
  onUndoItem?: (item: NowCompletedItem) => void;
}

export function NowProgressPopup({
  visible,
  completed,
  onClose,
  onUndoItem,
}: NowProgressPopupProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={styles.sheet}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <Box style={styles.header}>
            <Text style={styles.title}>Today's Progress</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </Box>

          <ScrollView style={styles.list}>
            {completed.length === 0 ? (
              <Text style={styles.emptyText}>No items completed yet today</Text>
            ) : (
              completed.map((item, index) => {
                const formattedTime = new Date(item.completedAt).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                });
                const typeEmoji = item.type === 'habit' ? '🔄' : '✓';
                return (
                  <Box key={index} style={styles.item}>
                    <Box style={styles.itemContent}>
                      <Text style={styles.itemText}>
                        {typeEmoji} {item.name} — {formattedTime}
                      </Text>
                      {onUndoItem && (
                        <TouchableOpacity
                          onPress={() => onUndoItem(item)}
                          style={styles.undoButton}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.undoText}>Undo</Text>
                        </TouchableOpacity>
                      )}
                    </Box>
                  </Box>
                );
              })
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
  itemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 16,
    color: '#212121',
    flex: 1,
  },
  undoButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginLeft: 12,
  },
  undoText: {
    fontSize: 14,
    color: '#2E5540',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    paddingVertical: 24,
  },
});
