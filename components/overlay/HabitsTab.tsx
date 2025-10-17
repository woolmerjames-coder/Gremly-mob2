/**
 * HabitsTab - Phase 6 (Brand Refresh)
 * Toggle between "Start a Habit" and "Break a Habit" forms - smaller 13pt chips
 */

import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { overlayStyles } from '../../app/styles/manualAdd.styles';
import { theme } from '../../app/design/theme';
import { HabitStartForm } from './HabitStartForm';
import { HabitBreakForm } from './HabitBreakForm';
import type { ManualAddPayload, TReminderRule } from '../../app/schemas/manualAdd';

interface HabitsTabProps {
  reminders: TReminderRule[];
  onSubmit: (payload: ManualAddPayload) => void;
}

type SubType = 'start' | 'break';

export function HabitsTab({ reminders, onSubmit }: HabitsTabProps) {
  const [subType, setSubType] = useState<SubType>('start');

  return (
    <View>
      {/* Sub-toggle */}
      <View style={overlayStyles.subToggleRow}>
        <TouchableOpacity
          style={[overlayStyles.chip, subType === 'start' && overlayStyles.chipActive]}
          onPress={() => setSubType('start')}
          testID="habit-toggle-start"
        >
          <Text
            style={[
              overlayStyles.chipText,
              styles.smallerChipText,
              subType === 'start' && overlayStyles.chipTextActive,
            ]}
          >
            Start a Habit
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[overlayStyles.chip, subType === 'break' && overlayStyles.chipActive]}
          onPress={() => setSubType('break')}
          testID="habit-toggle-break"
        >
          <Text
            style={[
              overlayStyles.chipText,
              styles.smallerChipText,
              subType === 'break' && overlayStyles.chipTextActive,
            ]}
          >
            Break a Habit
          </Text>
        </TouchableOpacity>
      </View>

      {/* Form */}
      {subType === 'start' ? (
        <HabitStartForm reminders={reminders} onSubmit={onSubmit} />
      ) : (
        <HabitBreakForm reminders={reminders} onSubmit={onSubmit} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  smallerChipText: {
    fontSize: 13,
  },
});
