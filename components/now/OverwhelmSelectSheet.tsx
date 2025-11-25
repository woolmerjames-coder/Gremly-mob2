/**
 * OverwhelmSelectSheet - Sheet for selecting items when feeling overwhelmed
 */

import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Box, Text } from '../../ui';
import type { NowLockedItem, NowActiveItem } from '../../lib/now/nowTypes';

interface OverwhelmSelectSheetProps {
  visible: boolean;
  items: (NowLockedItem | NowActiveItem)[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function OverwhelmSelectSheet({
  visible,
  items,
  selectedIds,
  onToggleSelect,
  onSubmit,
  onClose,
}: OverwhelmSelectSheetProps) {
  const hasMaxSelection = selectedIds.length >= 3;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={styles.sheet}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <Box style={styles.header}>
            <Text style={styles.title}>Pick your 3 most important items</Text>
            <Text style={styles.subtitle}>{selectedIds.length}/3 selected</Text>
          </Box>

          <ScrollView style={styles.list}>
            {items.length === 0 ? (
              <Text style={styles.emptyText}>No items available</Text>
            ) : (
              items.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const isDisabled = !isSelected && hasMaxSelection;

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.item, isDisabled && styles.itemDisabled]}
                    onPress={() => !isDisabled && onToggleSelect(item.id)}
                    disabled={isDisabled}
                  >
                    <Box style={styles.checkbox}>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </Box>
                    <Text style={[styles.itemText, isDisabled && styles.itemTextDisabled]}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <Box style={styles.buttons}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.submitButton,
                selectedIds.length === 0 && styles.buttonDisabled,
              ]}
              onPress={onSubmit}
              disabled={selectedIds.length === 0}
            >
              <Text style={styles.submitButtonText}>Get starter steps</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </Box>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#757575',
  },
  list: {
    padding: 16,
    maxHeight: 400,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  itemDisabled: {
    opacity: 0.4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#FF9800',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 16,
    color: '#FF9800',
    fontWeight: 'bold',
  },
  itemText: {
    fontSize: 16,
    color: '#212121',
    flex: 1,
  },
  itemTextDisabled: {
    color: '#BDBDBD',
  },
  emptyText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    paddingVertical: 24,
  },
  buttons: {
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  button: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButton: {
    backgroundColor: '#FF9800',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#757575',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
