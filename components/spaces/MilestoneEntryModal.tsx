/**
 * MilestoneEntryModal - Modal for creating/editing Space milestones
 *
 * Simple form: milestone name + target date
 */

import React, { useState, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { X, Calendar, Flag, Trash2 } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../../design/brand';

interface MilestoneEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, targetDate: Date) => Promise<void>;
  onRemove?: () => Promise<void>;
  initialName?: string;
  initialDate?: Date;
  isEditing?: boolean;
}

export function MilestoneEntryModal({
  visible,
  onClose,
  onSave,
  onRemove,
  initialName = '',
  initialDate,
  isEditing = false,
}: MilestoneEntryModalProps) {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(initialName);
  const [targetDate, setTargetDate] = useState<Date>(initialDate || getDefaultDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setName(initialName);
      setTargetDate(initialDate || getDefaultDate());
      setShowDatePicker(false);
      setSaving(false);
    }
  }, [visible, initialName, initialDate]);

  function getDefaultDate(): Date {
    // Default to 30 days from now
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date;
  }

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      await onSave(name.trim(), targetDate);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (error) {
      console.error('[MilestoneEntry] Save error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setTargetDate(selectedDate);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;

    Alert.alert(
      'Remove Goal',
      'Are you sure you want to remove this goal? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            try {
              await onRemove();
              onClose();
            } catch (error) {
              console.error('[MilestoneEntry] Remove error:', error);
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const canSave = name.trim().length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={[styles.content, { paddingTop: insets.top + 16 }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Flag size={20} color={BRAND.colors.mossGreen} />
            </View>
            <Text style={styles.title}>{isEditing ? 'Edit Goal' : 'Set a Goal'}</Text>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={24} color={BRAND.colors.inkMuted} />
            </Pressable>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Milestone Name */}
            <View style={styles.field}>
              <Text style={styles.label}>What's your goal?</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Trip to Japan, Launch MVP, Run 5K"
                placeholderTextColor={BRAND.colors.inkMuted}
                autoFocus
                returnKeyType="next"
                maxLength={100}
              />
            </View>

            {/* Target Date */}
            <View style={styles.field}>
              <Text style={styles.label}>Target date</Text>
              <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateButton}>
                <Calendar size={18} color={BRAND.colors.mossGreen} />
                <Text style={styles.dateText}>{formatDate(targetDate)}</Text>
              </Pressable>
            </View>

            {/* Date Picker */}
            {(showDatePicker || Platform.OS === 'ios') && (
              <View style={styles.datePickerContainer}>
                {Platform.OS === 'ios' && <Text style={styles.datePickerLabel}>Select date:</Text>}
                <DateTimePicker
                  value={targetDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                  minimumDate={new Date()}
                  style={styles.datePicker}
                />
              </View>
            )}
          </View>

          {/* Remove option - only when editing */}
          {isEditing && onRemove && (
            <Pressable
              onPress={handleRemove}
              style={({ pressed }) => [styles.removeButton, pressed && styles.buttonPressed]}
            >
              <Trash2 size={16} color="#DC3545" />
              <Text style={styles.removeButtonText}>Remove goal</Text>
            </Pressable>
          )}

          {/* Actions */}
          <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleSave}
              disabled={!canSave || saving}
              style={({ pressed }) => [
                styles.button,
                styles.saveButton,
                !canSave && styles.saveButtonDisabled,
                pressed && canSave && styles.buttonPressed,
              ]}
            >
              <Text style={[styles.saveButtonText, !canSave && styles.saveButtonTextDisabled]}>
                {saving ? 'Saving...' : isEditing ? 'Update' : 'Set Goal'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(191, 216, 192, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  closeButton: {
    padding: 4,
  },
  form: {
    flex: 1,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    marginBottom: 8,
  },
  textInput: {
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dateText: {
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
  },
  datePickerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginTop: -8,
    marginBottom: 16,
  },
  datePickerLabel: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  datePicker: {
    height: 150,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  saveButton: {
    backgroundColor: BRAND.colors.mossGreen,
  },
  saveButtonDisabled: {
    backgroundColor: 'rgba(191, 216, 192, 0.5)',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveButtonTextDisabled: {
    color: 'rgba(255,255,255,0.6)',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginBottom: 8,
  },
  removeButtonText: {
    fontSize: 14,
    color: '#DC3545',
  },
});

export default MilestoneEntryModal;
