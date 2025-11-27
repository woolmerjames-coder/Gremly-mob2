/**
 * OverwhelmSelectSheet - Sheet for selecting items when feeling overwhelmed
 */

import React from 'react';
import { Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Box, Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';
import type { NowLockedItem, NowActiveItem } from '../../lib/now/nowTypes';

interface OverwhelmSelectSheetProps {
  visible: boolean;
  items: (NowLockedItem | NowActiveItem)[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const useStyles = makeStyles((t) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: t.colors.surface,
    borderTopLeftRadius: t.radius[3], // 16px
    borderTopRightRadius: t.radius[3],
    maxHeight: '80%',
    ...t.elevation.lg,
  },
  header: {
    padding: t.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  title: {
    fontSize: t.typography.size.lg,
    fontFamily: t.typography.fontFamily.bold,
    color: t.colors.text,
    marginBottom: t.spacing[1],
  },
  subtitle: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
  },
  list: {
    padding: t.spacing[4],
    maxHeight: 400,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: t.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.sageMist,
  },
  itemDisabled: {
    opacity: 0.4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: t.radius[1], // 6px
    borderWidth: 2,
    borderColor: t.colors.mossGreen,
    marginRight: t.spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 16,
    color: t.colors.mossGreen,
    fontWeight: 'bold',
  },
  itemText: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.text,
    flex: 1,
  },
  itemTextDisabled: {
    color: t.colors.subtle,
  },
  emptyText: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    textAlign: 'center',
    paddingVertical: t.spacing[6],
  },
  buttons: {
    padding: t.spacing[4],
    gap: t.spacing[2],
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  button: {
    paddingVertical: t.spacing[3],
    borderRadius: t.radius[2], // 12px
    alignItems: 'center',
  },
  submitButton: {
    backgroundColor: t.colors.mossGreen,
  },
  submitButtonText: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.medium,
    color: '#FFFFFF',
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
}));

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
  const styles = useStyles();
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
