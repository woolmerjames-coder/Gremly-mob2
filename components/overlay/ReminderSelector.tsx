/**
 * ReminderSelector - Phase 6 (Brand Refresh)
 * Add/remove reminders with time and frequency - mint chip style
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { PlusCircle } from 'lucide-react-native';
import { overlayStyles } from '../../app/styles/manualAdd.styles';
import { theme } from '../../app/design/theme';
import { formatTime } from '../../app/utils/recurrence';
import type { TReminderRule } from '../../app/schemas/manualAdd';

interface ReminderSelectorProps {
  value: TReminderRule[];
  onChange: (reminders: TReminderRule[]) => void;
}

export function ReminderSelector({ value, onChange }: ReminderSelectorProps) {
  const handleAdd = () => {
    const newReminder: TReminderRule = {
      id: `reminder-${Date.now()}`,
      timeISO: '08:00',
      frequency: 'daily',
    };
    onChange([...value, newReminder]);
  };

  const handleRemove = (id: string) => {
    onChange(value.filter((r) => r.id !== id));
  };

  return (
    <View>
      <Text style={overlayStyles.pinnedRemindersTitle}>Reminders</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipsRow}>
          {value.map((reminder) => (
            <View key={reminder.id} style={overlayStyles.reminderItem}>
              <View>
                <Text style={overlayStyles.reminderTime}>{formatTime(reminder.timeISO)}</Text>
                <Text style={overlayStyles.reminderFrequency}>{reminder.frequency}</Text>
              </View>
              <TouchableOpacity onPress={() => handleRemove(reminder.id)}>
                <Text style={{ fontSize: 18, color: theme.colors.deepTeal, marginLeft: 8 }}>×</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={overlayStyles.reminderAddButton}
            onPress={handleAdd}
            testID="reminder-add"
          >
            <PlusCircle size={16} color={theme.colors.deepTeal} />
            <Text style={overlayStyles.reminderAddText}>Add Reminder</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chipsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
});
