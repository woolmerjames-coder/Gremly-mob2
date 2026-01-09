/**
 * MultiSplitModal - Modal for handling multi-entity Mind Drops
 *
 * When a user enters multiple items in one drop (e.g., "buy milk and start running habit"),
 * this modal lets them:
 * - Keep as a single note
 * - Split into separate entities
 * - Select which items to split
 */

import React, { useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import type { MultiDropItem } from '../../../lib/minddrop/types';

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────

export interface MultiSplitModalProps {
  visible: boolean;
  items: MultiDropItem[];
  summaryTitle: string;
  onClose: () => void;
  onKeepAsNote: () => void;
  onSplitSelected: (selectedItems: MultiDropItem[]) => void;
}

// ───────────────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────────────

export function MultiSplitModal({
  visible,
  items,
  summaryTitle,
  onClose,
  onKeepAsNote,
  onSplitSelected,
}: MultiSplitModalProps) {
  // Track item count to detect when items array changes
  const itemCount = items.length;
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(items.map((_, i) => i)), // All selected by default
  );

  // Reset selection when item count changes (using key pattern instead of effect)
  const [prevItemCount, setPrevItemCount] = useState(itemCount);
  if (itemCount !== prevItemCount) {
    setPrevItemCount(itemCount);
    setSelectedIndices(new Set(items.map((_, i) => i)));
  }

  const toggleItem = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleSplitSelected = useCallback(() => {
    const selected = items.filter((_, i) => selectedIndices.has(i));
    if (selected.length > 0) {
      onSplitSelected(selected);
    }
  }, [items, selectedIndices, onSplitSelected]);

  const selectedCount = selectedIndices.size;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <Text style={styles.header}>Gremly noticed a few things</Text>
          <Text style={styles.subheader}>{summaryTitle}</Text>

          {/* Item list with checkboxes */}
          <ScrollView style={styles.itemList} contentContainerStyle={styles.itemListContent}>
            {items.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.itemRow, selectedIndices.has(index) && styles.itemRowSelected]}
                onPress={() => toggleItem(index)}
                activeOpacity={0.7}
              >
                {/* Checkbox */}
                <View
                  style={[styles.checkbox, selectedIndices.has(index) && styles.checkboxSelected]}
                >
                  {selectedIndices.has(index) && <Text style={styles.checkmark}>✓</Text>}
                </View>

                {/* Item details */}
                <View style={styles.itemContent}>
                  <Text style={styles.itemTitle}>{item.preview_title || item.text}</Text>
                  <Text style={styles.itemBucket}>
                    {item.bucket === 'todo'
                      ? '📋 Todo'
                      : item.bucket === 'habit'
                        ? '🔄 Habit'
                        : '📝 Note'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Action buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onKeepAsNote}>
              <Text style={styles.secondaryButtonText}>Keep as Note</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, selectedCount === 0 && styles.buttonDisabled]}
              onPress={handleSplitSelected}
              disabled={selectedCount === 0}
            >
              <Text style={styles.primaryButtonText}>
                Split{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.lg,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  header: {
    fontSize: 18,
    ...BRAND.typography.header,
    color: BRAND.colors.charcoalInk,
    marginBottom: 4,
  },
  subheader: {
    fontSize: 14,
    ...BRAND.typography.body,
    color: BRAND.colors.inkMuted,
    marginBottom: 20,
  },
  itemList: {
    marginBottom: 24,
    maxHeight: 300,
  },
  itemListContent: {
    paddingBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  itemRowSelected: {
    backgroundColor: 'rgba(156, 166, 224, 0.1)', // Periwinkle tint
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BRAND.radius.sm,
    borderWidth: 2,
    borderColor: BRAND.colors.sageMist,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: BRAND.colors.mossGreen,
    borderColor: BRAND.colors.mossGreen,
  },
  checkmark: {
    color: BRAND.colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  itemContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 15,
    ...BRAND.typography.bodyMedium,
    color: BRAND.colors.charcoalInk,
    flex: 1,
  },
  itemBucket: {
    fontSize: 12,
    ...BRAND.typography.bodyMedium,
    color: BRAND.colors.periwinkleSmoke,
    textTransform: 'capitalize',
    marginLeft: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    ...BRAND.typography.bodyMedium,
    color: BRAND.colors.inkMuted,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BRAND.radius.md,
    backgroundColor: BRAND.colors.mossGreen,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 15,
    ...BRAND.typography.bodyMedium,
    color: BRAND.colors.linenCream,
  },
});

// ───────────────────────────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────────────────────────

export default MultiSplitModal;
