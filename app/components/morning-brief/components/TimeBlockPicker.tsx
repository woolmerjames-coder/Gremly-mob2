/**
 * TimeBlockPicker
 *
 * Modal for assigning a task to a time block.
 * Includes option to lock-in the task.
 */

import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { BRAND } from '../../../../design/brand';
import { TIME_BLOCK_BOUNDARIES } from '../../../../lib/capacity';
import type { TimeBlock } from '../../../../lib/capacity';
import type { TaskItemData } from './TaskItem';

type TimeBlockOption = TimeBlock | 'flexible';

interface TimeBlockPickerProps {
  visible: boolean;
  task: TaskItemData | null;
  onClose: () => void;
  onAssign: (
    taskId: string,
    taskType: 'todo' | 'habit',
    timeWindow: TimeBlock | 'any',
    lockIn: boolean,
  ) => void;
}

export function TimeBlockPicker({ visible, task, onClose, onAssign }: TimeBlockPickerProps) {
  // Initialize lock toggle from task's current state
  const [lockIn, setLockIn] = useState(task?.isLockedIn ?? false);

  // Reset lock state when task changes
  React.useEffect(() => {
    if (task) {
      setLockIn(task.isLockedIn);
    }
  }, [task?.id, task?.isLockedIn]);

  if (!task) return null;

  const handleSelect = (option: TimeBlockOption) => {
    const timeWindow = option === 'flexible' ? 'any' : option;
    onAssign(task.id, task.type, timeWindow, lockIn);
    onClose();
  };

  // Determine current selection for checkmark
  const currentTimeWindow = task.timeWindow ?? 'any';

  const timeBlockOptions: { key: TimeBlockOption; icon: string; label: string }[] = [
    { key: 'morning', icon: TIME_BLOCK_BOUNDARIES.morning.icon, label: 'Morning' },
    { key: 'day', icon: TIME_BLOCK_BOUNDARIES.day.icon, label: 'Afternoon' },
    { key: 'evening', icon: TIME_BLOCK_BOUNDARIES.evening.icon, label: 'Evening' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Assign to time block</Text>

          {/* Time block options */}
          {timeBlockOptions.map((option) => {
            const isSelected = currentTimeWindow === option.key;
            return (
              <Pressable
                key={option.key}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => handleSelect(option.key)}
              >
                <Text style={styles.optionIcon}>{option.icon}</Text>
                <Text style={styles.optionLabel}>{option.label}</Text>
                {isSelected && <Text style={styles.checkmark}>✓</Text>}
              </Pressable>
            );
          })}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Keep flexible option */}
          <Pressable
            style={[styles.option, currentTimeWindow === 'any' && styles.optionSelected]}
            onPress={() => handleSelect('flexible')}
          >
            <Text style={styles.optionIcon}>↔</Text>
            <Text style={styles.optionLabel}>Keep flexible</Text>
            {currentTimeWindow === 'any' && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Lock-in toggle */}
          <Pressable style={styles.lockRow} onPress={() => setLockIn(!lockIn)}>
            <Text style={styles.lockIcon}>◇</Text>
            <Text style={styles.lockLabel}>Lock this in</Text>
            <View style={[styles.toggle, lockIn && styles.toggleOn]}>
              <View style={[styles.toggleKnob, lockIn && styles.toggleKnobOn]} />
            </View>
          </Pressable>

          {/* Cancel button */}
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.lg,
    padding: 20,
    width: '80%',
    maxWidth: 300,
    ...BRAND.elevation.two,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 16,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: BRAND.radius.md,
    marginBottom: 6,
    backgroundColor: BRAND.colors.linenCream,
  },
  optionSelected: {
    backgroundColor: BRAND.colors.sageMist,
  },
  optionIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    flex: 1,
  },
  checkmark: {
    fontSize: 16,
    color: BRAND.colors.mossGreen,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
    marginVertical: 8,
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  lockIcon: {
    fontSize: 18,
    color: BRAND.colors.mossGreen,
    marginRight: 12,
  },
  lockLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    flex: 1,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: BRAND.colors.borderSubtle,
    padding: 2,
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: BRAND.colors.mossGreen,
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BRAND.colors.surface,
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelText: {
    fontSize: 16,
    color: BRAND.colors.mossGreen,
    fontWeight: '500',
  },
});
