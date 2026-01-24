/**
 * EventDurationPicker
 *
 * Quick picker for overriding calendar event duration locally.
 * Does NOT sync back to calendar — only affects Gremly's capacity calculation.
 */

import React, { useState } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, TextInput } from 'react-native';
import { Clock, Check, RotateCcw } from 'lucide-react-native';

const COLORS = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  divider: '#E8E6E1',
  surface: '#FFFFFF',
};

// Preset duration options in minutes
const PRESET_OPTIONS = [
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '45m', value: 45 },
  { label: '1h', value: 60 },
  { label: '1.5h', value: 90 },
  { label: '2h', value: 120 },
];

interface EventDurationPickerProps {
  visible: boolean;
  eventId: string | null;
  eventTitle: string | null;
  originalDuration: number | null; // Original calendar duration in minutes
  currentOverride: number | null; // Current override if set
  onClose: () => void;
  onSave: (eventId: string, minutes: number) => void;
  onReset: (eventId: string) => void;
}

export function EventDurationPicker({
  visible,
  eventId,
  eventTitle,
  originalDuration,
  currentOverride,
  onClose,
  onSave,
  onReset,
}: EventDurationPickerProps) {
  const [customMinutes, setCustomMinutes] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);

  // Current effective duration (override or original)
  const effectiveDuration = currentOverride ?? originalDuration ?? 60;
  const hasOverride = currentOverride !== null;

  // Track previous visibility to reset state when picker opens
  const [prevVisible, setPrevVisible] = useState(visible);
  const [prevEffectiveDuration, setPrevEffectiveDuration] = useState(effectiveDuration);

  // Reset state when visibility or effective duration changes (derived state pattern)
  if (visible !== prevVisible || effectiveDuration !== prevEffectiveDuration) {
    setPrevVisible(visible);
    setPrevEffectiveDuration(effectiveDuration);

    if (visible) {
      const matchingPreset = PRESET_OPTIONS.find((p) => p.value === effectiveDuration);
      if (matchingPreset) {
        setSelectedPreset(effectiveDuration);
        setCustomMinutes('');
      } else {
        setSelectedPreset(null);
        setCustomMinutes(String(effectiveDuration));
      }
    }
  }

  if (!eventId) return null;

  const handlePresetSelect = (value: number) => {
    setSelectedPreset(value);
    setCustomMinutes('');
  };

  const handleCustomChange = (text: string) => {
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

    if (minutes !== null) {
      onSave(eventId, minutes);
    }
    onClose();
  };

  const handleReset = () => {
    onReset(eventId);
    onClose();
  };

  // Format duration for display
  const formatDuration = (mins: number): string => {
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remaining = mins % 60;
    return remaining > 0 ? `${hrs}h ${remaining}m` : `${hrs}h`;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={styles.header}>
            <Clock size={20} color={COLORS.mossGreen} />
            <Text style={styles.title}>Edit duration</Text>
          </View>

          {/* Event name */}
          <Text style={styles.eventName} numberOfLines={2}>
            {eventTitle}
          </Text>

          {/* Original duration note */}
          <Text style={styles.originalNote}>
            Calendar duration: {formatDuration(originalDuration ?? 0)}
            {hasOverride && (
              <Text style={styles.overrideNote}>
                {' '}
                (currently set to {formatDuration(currentOverride)})
              </Text>
            )}
          </Text>

          {/* Info text */}
          <Text style={styles.infoText}>
            This only affects Gremly's time calculation — your calendar stays unchanged.
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
            {hasOverride && (
              <Pressable style={styles.resetButton} onPress={handleReset}>
                <RotateCcw size={16} color={COLORS.inkMuted} />
                <Text style={styles.resetText}>Reset to original</Text>
              </Pressable>
            )}
            <View style={styles.actionsSpacer} />
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
  eventName: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.charcoalInk,
    textAlign: 'center',
    marginBottom: 4,
  },
  originalNote: {
    fontSize: 13,
    color: COLORS.inkMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  overrideNote: {
    color: COLORS.mossGreen,
    fontWeight: '500',
  },
  infoText: {
    fontSize: 12,
    color: COLORS.inkMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 16,
    paddingHorizontal: 8,
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
    alignItems: 'center',
    marginBottom: 12,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  resetText: {
    fontSize: 13,
    color: COLORS.inkMuted,
    marginLeft: 6,
  },
  actionsSpacer: {
    flex: 1,
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
