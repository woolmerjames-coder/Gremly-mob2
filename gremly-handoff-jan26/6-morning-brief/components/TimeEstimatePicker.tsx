/**
 * TimeEstimatePicker
 *
 * Hybrid grid + stepper picker for editing task time estimates.
 * Supports 5-minute increments from 5 to 240 minutes.
 * Updates the time_estimate_minutes field on todos/habits.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { Clock, Check, Minus, Plus } from 'lucide-react-native';

// Colors matching app patterns
const COLORS = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  divider: '#E8E6E1',
  surface: '#FFFFFF',
  selectedBg: 'rgba(46, 85, 64, 0.1)',
};

// Quick-select options for common values
const QUICK_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90];

// Stepper constraints
const MIN_MINUTES = 5;
const MAX_MINUTES = 240;
const STEP_INCREMENT = 5;

interface TimeEstimatePickerProps {
  visible: boolean;
  taskId: string | null;
  taskType: 'todo' | 'habit' | null;
  taskTitle: string | null;
  currentEstimate: number | null;
  onClose: () => void;
  onSave: (taskId: string, taskType: 'todo' | 'habit', minutes: number | null) => void;
}

// Utility function for consistent time formatting
function formatTimeEstimate(minutes: number | null | undefined): string {
  if (!minutes) return '';

  if (minutes < 60) {
    return `${minutes} min`;
  } else if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hr${hours > 1 ? 's' : ''}`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
}

export function TimeEstimatePicker({
  visible,
  taskId,
  taskType,
  taskTitle,
  currentEstimate,
  onClose,
  onSave,
}: TimeEstimatePickerProps) {
  const [selectedMinutes, setSelectedMinutes] = useState<number>(currentEstimate ?? 30);

  // Track previous values to reset state when task changes
  const [prevVisible, setPrevVisible] = useState(visible);
  const [prevEstimate, setPrevEstimate] = useState(currentEstimate);

  // Reset state when visibility or estimate changes (using derived state pattern)
  if (visible !== prevVisible || currentEstimate !== prevEstimate) {
    setPrevVisible(visible);
    setPrevEstimate(currentEstimate);

    if (visible) {
      setSelectedMinutes(currentEstimate ?? 30);
    }
  }

  const handleQuickSelect = useCallback((minutes: number) => {
    setSelectedMinutes(minutes);
  }, []);

  const handleIncrement = useCallback(() => {
    setSelectedMinutes((prev) => Math.min(MAX_MINUTES, prev + STEP_INCREMENT));
  }, []);

  const handleDecrement = useCallback(() => {
    setSelectedMinutes((prev) => Math.max(MIN_MINUTES, prev - STEP_INCREMENT));
  }, []);

  const handleSave = useCallback(() => {
    if (taskId && taskType) {
      onSave(taskId, taskType, selectedMinutes);
    }
    onClose();
  }, [taskId, taskType, selectedMinutes, onSave, onClose]);

  const handleClear = useCallback(() => {
    if (taskId && taskType) {
      onSave(taskId, taskType, null);
    }
    onClose();
  }, [taskId, taskType, onSave, onClose]);

  if (!taskId || !taskType) return null;

  const isQuickOptionSelected = QUICK_OPTIONS.includes(selectedMinutes);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={styles.header}>
            <Clock size={20} color={COLORS.mossGreen} />
            <Text style={styles.title}>How long will this take?</Text>
          </View>

          {/* Task name for context */}
          {taskTitle && (
            <Text style={styles.taskName} numberOfLines={1}>
              {taskTitle}
            </Text>
          )}

          {/* Quick Select Grid */}
          <View style={styles.quickGrid}>
            {QUICK_OPTIONS.map((minutes) => (
              <Pressable
                key={minutes}
                style={[
                  styles.quickOption,
                  selectedMinutes === minutes && styles.quickOptionSelected,
                ]}
                onPress={() => handleQuickSelect(minutes)}
              >
                <Text
                  style={[
                    styles.quickOptionText,
                    selectedMinutes === minutes && styles.quickOptionTextSelected,
                  ]}
                >
                  {formatTimeEstimate(minutes)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Stepper for custom values */}
          <View style={styles.stepperContainer}>
            <Text style={styles.stepperLabel}>Custom</Text>
            <View style={styles.stepper}>
              <Pressable
                style={[
                  styles.stepperButton,
                  selectedMinutes <= MIN_MINUTES && styles.stepperButtonDisabled,
                ]}
                onPress={handleDecrement}
                disabled={selectedMinutes <= MIN_MINUTES}
              >
                <Minus
                  size={20}
                  color={selectedMinutes <= MIN_MINUTES ? '#CCCCCC' : COLORS.mossGreen}
                />
              </Pressable>

              <View style={styles.stepperValue}>
                <Text
                  style={[
                    styles.stepperValueText,
                    !isQuickOptionSelected && styles.stepperValueTextActive,
                  ]}
                >
                  {formatTimeEstimate(selectedMinutes)}
                </Text>
              </View>

              <Pressable
                style={[
                  styles.stepperButton,
                  selectedMinutes >= MAX_MINUTES && styles.stepperButtonDisabled,
                ]}
                onPress={handleIncrement}
                disabled={selectedMinutes >= MAX_MINUTES}
              >
                <Plus
                  size={20}
                  color={selectedMinutes >= MAX_MINUTES ? '#CCCCCC' : COLORS.mossGreen}
                />
              </Pressable>
            </View>
            <Text style={styles.stepperHint}>5 min – 4 hrs</Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={styles.clearButton} onPress={handleClear}>
              <Text style={styles.clearText}>Clear estimate</Text>
            </Pressable>
            <Pressable style={styles.saveButton} onPress={handleSave}>
              <Check size={18} color={COLORS.surface} />
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>

          {/* Cancel */}
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.charcoalInk,
    marginLeft: 8,
  },
  taskName: {
    fontSize: 14,
    color: COLORS.inkMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  quickOption: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: COLORS.linenCream,
    minWidth: 64,
    alignItems: 'center',
  },
  quickOptionSelected: {
    backgroundColor: COLORS.mossGreen,
  },
  quickOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.charcoalInk,
  },
  quickOptionTextSelected: {
    color: COLORS.surface,
  },
  stepperContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  stepperLabel: {
    fontSize: 13,
    color: COLORS.inkMuted,
    marginBottom: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.linenCream,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperButtonDisabled: {
    opacity: 0.5,
  },
  stepperValue: {
    minWidth: 80,
    alignItems: 'center',
  },
  stepperValueText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.charcoalInk,
  },
  stepperValueTextActive: {
    color: COLORS.mossGreen,
  },
  stepperHint: {
    fontSize: 12,
    color: COLORS.inkMuted,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  clearButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  clearText: {
    fontSize: 14,
    color: COLORS.inkMuted,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.mossGreen,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.surface,
    marginLeft: 6,
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.mossGreen,
  },
});
