/**
 * NotificationSettingsSheet - Bottom sheet for notification preferences
 *
 * Allows users to configure Morning Brief and Evening Sweep notification times.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, Platform } from 'react-native';
import ActionSheet, { SheetManager, registerSheet } from 'react-native-actions-sheet';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '../design/tokens';
import { BRAND } from '../design/brand';

export interface NotificationSettingsPayload {
  morningEnabled: boolean;
  morningTime: Date;
  eveningEnabled: boolean;
  eveningTime: Date;
  onSave: (settings: {
    morningEnabled: boolean;
    morningTime: Date;
    eveningEnabled: boolean;
    eveningTime: Date;
  }) => void;
}

interface NotificationSettingsSheetProps {
  sheetId: string;
  payload: NotificationSettingsPayload;
}

/**
 * Format a Date to a time string like "8:00 AM"
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Create a default time for today at the given hour
 */
function createDefaultTime(hour: number): Date {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date;
}

function NotificationSettingsSheetContent({ sheetId, payload }: NotificationSettingsSheetProps) {
  const insets = useSafeAreaInsets();

  // Local state for form values
  const [morningEnabled, setMorningEnabled] = useState(payload.morningEnabled);
  const [morningTime, setMorningTime] = useState(payload.morningTime);
  const [eveningEnabled, setEveningEnabled] = useState(payload.eveningEnabled);
  const [eveningTime, setEveningTime] = useState(payload.eveningTime);

  // Time picker visibility (for Android)
  const [showMorningPicker, setShowMorningPicker] = useState(false);
  const [showEveningPicker, setShowEveningPicker] = useState(false);

  const handleClose = () => {
    SheetManager.hide(sheetId);
  };

  const handleSave = () => {
    payload.onSave({
      morningEnabled,
      morningTime,
      eveningEnabled,
      eveningTime,
    });
    SheetManager.hide(sheetId);
  };

  const handleMorningTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowMorningPicker(false);
    }
    if (selectedDate) {
      setMorningTime(selectedDate);
    }
  };

  const handleEveningTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEveningPicker(false);
    }
    if (selectedDate) {
      setEveningTime(selectedDate);
    }
  };

  return (
    <ActionSheet id={sheetId} gestureEnabled containerStyle={styles.sheetContainer}>
      <View style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Notifications</Text>
          <Pressable
            onPress={handleClose}
            style={styles.closeButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={24} color={BRAND.colors.charcoalInk} />
          </Pressable>
        </View>

        {/* Morning Brief Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Morning Brief</Text>
            <Switch
              value={morningEnabled}
              onValueChange={setMorningEnabled}
              trackColor={{ false: colors.gray, true: BRAND.colors.sageMist }}
              thumbColor={morningEnabled ? BRAND.colors.mossGreen : colors.white}
            />
          </View>
          <Pressable
            style={[styles.timeButton, !morningEnabled && styles.timeButtonDisabled]}
            onPress={() => {
              if (morningEnabled) {
                setShowMorningPicker(true);
              }
            }}
            disabled={!morningEnabled}
          >
            <Text style={[styles.timeButtonText, !morningEnabled && styles.timeButtonTextDisabled]}>
              {formatTime(morningTime)}
            </Text>
          </Pressable>
          {(showMorningPicker || Platform.OS === 'ios') && morningEnabled && (
            <DateTimePicker
              value={morningTime}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleMorningTimeChange}
              style={styles.timePicker}
            />
          )}
        </View>

        {/* Evening Sweep Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Evening Sweep</Text>
            <Switch
              value={eveningEnabled}
              onValueChange={setEveningEnabled}
              trackColor={{ false: colors.gray, true: BRAND.colors.sageMist }}
              thumbColor={eveningEnabled ? BRAND.colors.mossGreen : colors.white}
            />
          </View>
          <Pressable
            style={[styles.timeButton, !eveningEnabled && styles.timeButtonDisabled]}
            onPress={() => {
              if (eveningEnabled) {
                setShowEveningPicker(true);
              }
            }}
            disabled={!eveningEnabled}
          >
            <Text style={[styles.timeButtonText, !eveningEnabled && styles.timeButtonTextDisabled]}>
              {formatTime(eveningTime)}
            </Text>
          </Pressable>
          {(showEveningPicker || Platform.OS === 'ios') && eveningEnabled && (
            <DateTimePicker
              value={eveningTime}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleEveningTimeChange}
              style={styles.timePicker}
            />
          )}
        </View>

        {/* Save Button */}
        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save</Text>
        </Pressable>
      </View>
    </ActionSheet>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    backgroundColor: colors.cream,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 20,
    fontFamily: 'PlusJakartaSans-Bold',
    color: BRAND.colors.charcoalInk,
  },
  closeButton: {
    padding: spacing.xs,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.charcoalInk,
  },
  timeButton: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  timeButtonDisabled: {
    backgroundColor: colors.bg.secondary,
    opacity: 0.6,
  },
  timeButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.charcoalInk,
  },
  timeButtonTextDisabled: {
    color: colors.text.tertiary,
  },
  timePicker: {
    marginTop: spacing.sm,
  },
  saveButton: {
    backgroundColor: colors.deepTeal.DEFAULT,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: colors.white,
  },
});

// Register the sheet with actions-sheet
registerSheet('notification-settings-sheet', NotificationSettingsSheetContent);

// Export the payload type for consumers
export type { NotificationSettingsPayload as NotificationSettingsSheetPayload };

// Export default time helpers
export { createDefaultTime };
