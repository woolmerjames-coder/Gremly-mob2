/**
 * LockInPicker
 *
 * Modal for selecting up to 3 items to lock in for the day.
 * Shows all non-locked items from the current brief.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Diamond, Check, Repeat, Circle } from 'lucide-react-native';
import type { TaskItemData } from './TaskItem';

const COLORS = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  divider: '#E8E6E1',
  surface: '#FFFFFF',
  selectedBg: 'rgba(46, 85, 64, 0.1)',
};

const MAX_LOCK_INS = 3;

interface LockInPickerProps {
  visible: boolean;
  items: TaskItemData[];
  onClose: () => void;
  onConfirm: (selectedIds: Array<{ id: string; type: 'todo' | 'habit' }>) => void;
}

export function LockInPicker({ visible, items, onClose, onConfirm }: LockInPickerProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_LOCK_INS) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const selected = items
      .filter((item) => selectedIds.has(item.id))
      .map((item) => ({ id: item.id, type: item.type }));
    onConfirm(selected);
    setSelectedIds(new Set());
    onClose();
  }, [items, selectedIds, onConfirm, onClose]);

  const handleClose = useCallback(() => {
    setSelectedIds(new Set());
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          <Diamond size={24} color={COLORS.mossGreen} style={styles.headerIcon} />
          <Text style={styles.title}>Lock in for today</Text>
          <Text style={styles.subtitle}>
            Pick up to {MAX_LOCK_INS} — these become your non-negotiables
          </Text>

          <ScrollView style={styles.list} bounces={false}>
            {items.map((item) => {
              const isSelected = selectedIds.has(item.id);
              const isDisabled = !isSelected && selectedIds.size >= MAX_LOCK_INS;
              const Icon = item.type === 'habit' ? Repeat : Circle;

              return (
                <Pressable
                  key={item.id}
                  style={[
                    styles.item,
                    isSelected && styles.itemSelected,
                    isDisabled && styles.itemDisabled,
                  ]}
                  onPress={() => handleToggle(item.id)}
                  disabled={isDisabled}
                >
                  <Icon size={16} color={isSelected ? COLORS.mossGreen : COLORS.inkMuted} />
                  <Text
                    style={[styles.itemTitle, isDisabled && styles.itemTitleDisabled]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  {isSelected && <Check size={18} color={COLORS.mossGreen} />}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Selection count */}
          <Text style={styles.countText}>
            {selectedIds.size} of {MAX_LOCK_INS} selected
          </Text>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={styles.skipButton} onPress={handleClose}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, selectedIds.size === 0 && styles.confirmDisabled]}
              onPress={handleConfirm}
              disabled={selectedIds.size === 0}
            >
              <Diamond size={16} color="#FFFFFF" />
              <Text style={styles.confirmText}>Lock in</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  content: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    maxHeight: '70%',
  },
  headerIcon: {
    alignSelf: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.charcoalInk,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.inkMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  list: {
    maxHeight: 300,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 2,
    gap: 10,
  },
  itemSelected: {
    backgroundColor: COLORS.selectedBg,
  },
  itemDisabled: {
    opacity: 0.4,
  },
  itemTitle: {
    flex: 1,
    fontSize: 15,
    color: COLORS.charcoalInk,
  },
  itemTitleDisabled: {
    color: COLORS.inkMuted,
  },
  countText: {
    fontSize: 12,
    color: COLORS.inkMuted,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.inkMuted,
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: COLORS.mossGreen,
  },
  confirmDisabled: {
    opacity: 0.4,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
