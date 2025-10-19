/**
 * HabitFields - Form fields for creating/editing habits
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Input } from '../../../design-system/Input';
import Chip from '../../ui/Chip';
import { Text } from '../../../ui/Text';
import type { Frequency } from '../../../lib/types';

type HabitSubtype = 'start_habit' | 'break_habit' | 'routine';

interface HabitFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  frequency: Frequency;
  onFrequencyChange: (value: Frequency) => void;
  subtype?: HabitSubtype | null;
  onSubtypeChange?: (value: HabitSubtype) => void;
  disabled?: boolean;
}

const FREQUENCY_OPTIONS: Frequency[] = ['daily', 'weekly', 'monthly'];
const SUBTYPE_OPTIONS: { value: HabitSubtype; label: string }[] = [
  { value: 'start_habit', label: 'Start habit' },
  { value: 'break_habit', label: 'Break habit' },
  { value: 'routine', label: 'Routine' },
];

export function HabitFields({
  name,
  onNameChange,
  frequency,
  onFrequencyChange,
  subtype,
  onSubtypeChange,
  disabled = false,
}: HabitFieldsProps) {
  return (
    <View style={styles.container}>
      {/* Subtype chips */}
      {onSubtypeChange && (
        <View style={styles.section}>
          <View style={styles.chipRow}>
            {SUBTYPE_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={subtype === opt.value}
                onPress={() => onSubtypeChange(opt.value)}
                testID={`subtype-pill-${opt.value}`}
                disabled={disabled}
                style={styles.chip}
              />
            ))}
          </View>
        </View>
      )}

      {/* Name field */}
      <View style={styles.section}>
        <Input
          label="Name"
          value={name}
          onChangeText={onNameChange}
          placeholder="e.g., Morning meditation"
          disabled={disabled}
          testID="habit-name-input"
        />
      </View>

      {/* Frequency chips */}
      <View style={styles.section}>
        <Text style={styles.label}>Frequency</Text>
        <View style={styles.chipRow}>
          {FREQUENCY_OPTIONS.map((freq) => (
            <Chip
              key={freq}
              label={freq.charAt(0).toUpperCase() + freq.slice(1)}
              selected={frequency === freq}
              onPress={() => onFrequencyChange(freq)}
              testID={`frequency-chip-${freq}`}
              disabled={disabled}
              style={styles.chip}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
  },
  section: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minWidth: 80,
  },
});
