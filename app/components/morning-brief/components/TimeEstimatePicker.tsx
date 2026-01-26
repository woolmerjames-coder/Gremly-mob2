/**
 * TimeEstimatePicker
 *
 * Quick picker for editing task time estimates.
 * Updates the time_estimate_minutes field on todos/habits.
 */

import React, { useState } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, TextInput } from 'react-native';
import { Clock, Check } from 'lucide-react-native';

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

// Preset time options in minutes
const PRESET_OPTIONS = [
  { label: '5m', value: 5 },
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '45m', value: 45 },
  { label: '1h', value: 60 },
  { label: '1.5h', value: 90 },
  { label: '2h', value: 120 },
];

interface TimeEstimatePickerProps {
  visible: boolean;
  taskId: string | null;
  taskType: 'todo' | 'habit' | null;
  taskTitle: string | null;
  currentEstimate: number | null;
  onClose: () => void;
  onSave: (taskId: string, taskType: 'todo' | 'habit', minutes: number | null) => void;
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
  const [customMinutes, setCustomMinutes] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);

  // Track previous values to reset state when task changes
  const [prevVisible, setPrevVisible] = useState(visible);
  const [prevEstimate, setPrevEstimate] = useState(currentEstimate);

  // Reset state when visibility or estimate changes (using derived state pattern)
  if (visible !== prevVisible || currentEstimate !== prevEstimate) {
    setPrevVisible(visible);
    setPrevEstimate(currentEstimate);

    if (visible && currentEstimate) {
      const matchingPreset = PRESET_OPTIONS.find((p) => p.value === currentEstimate);
      if (matchingPreset) {
        setSelectedPreset(currentEstimate);
        setCustomMinutes('');
      } else {
        setSelectedPreset(null);
        setCustomMinutes(String(currentEstimate));
      }
    } else if (visible) {
      setSelectedPreset(null);
      setCustomMinutes('');
    }
  }

  if (!taskId || !taskType) return null;

  const handlePresetSelect = (value: number) => {
    setSelectedPreset(value);
    setCustomMinutes('');
  };

  const handleCustomChange = (text: string) => {
    // Only allow numbers
    const numericText = text.replace(/[^0-9]/g, '');
    setCustomMinutes(numericText);
    setSelectedPreset(null);
  };

  const handleSave = () => {
    let minutes: number | null = null;

    if (selectedPreset !== null) {
      minutes = selectedPreset;
    } else if (customMinutes) {
      const parsed = parseInt(customMinutes, 10);
      if (!isNaN(parsed) && parsed > 0) {
        minutes = parsed;
      }
    }

    onSave(taskId, taskType, minutes);
    onClose();
  };

  const handleClear = () => {
    onSave(taskId, taskType, null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={styles.header}>
            <Clock size={20} color={COLORS.mossGreen} />
            <Text style={styles.title}>Time estimate</Text>
          </View>

          {/* Task name for context */}
          <Text style={styles.taskName} numberOfLines={1}>
            {taskTitle}
          </Text>

          {/* Preset Options Grid */}
          <View style={styles.presetsGrid}>
            {PRESET_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.presetButton,
                  selectedPreset === option.value && styles.presetButtonSelected,
                ]}
                onPress={() => handlePresetSelect(option.value)}
              >
                <Text
                  style={[
                    styles.presetText,
                    selectedPreset === option.value && styles.presetTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Custom Input */}
          <View style={styles.customRow}>
            <Text style={styles.customLabel}>Custom:</Text>
            <TextInput
              style={styles.customInput}
              value={customMinutes}
              onChangeText={handleCustomChange}
              placeholder="mins"
              placeholderTextColor={COLORS.inkMuted}
              keyboardType="number-pad"
              maxLength={3}
            />
            <Text style={styles.customSuffix}>minutes</Text>
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
    fontSize: 18,
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
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  presetButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: COLORS.linenCream,
    minWidth: 56,
    alignItems: 'center',
  },
  presetButtonSelected: {
    backgroundColor: COLORS.mossGreen,
  },
  presetText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.charcoalInk,
  },
  presetTextSelected: {
    color: COLORS.surface,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  customLabel: {
    fontSize: 14,
    color: COLORS.inkMuted,
    marginRight: 8,
  },
  customInput: {
    width: 60,
    height: 40,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: COLORS.charcoalInk,
    textAlign: 'center',
  },
  customSuffix: {
    fontSize: 14,
    color: COLORS.inkMuted,
    marginLeft: 8,
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
