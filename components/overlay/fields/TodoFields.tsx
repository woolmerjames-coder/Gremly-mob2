/**
 * TodoFields - Form fields for creating/editing todos
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Input } from '../../../design-system/Input';
import Chip from '../../ui/Chip';

type TodoSubtype = 'reminder' | 'microproject';

interface TodoFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  dueDate?: string;
  onDueDateChange: (value: string) => void;
  subtype?: TodoSubtype | null;
  onSubtypeChange?: (value: TodoSubtype) => void;
  disabled?: boolean;
}

const SUBTYPE_OPTIONS: { value: TodoSubtype; label: string }[] = [
  { value: 'reminder', label: 'Reminder' },
  { value: 'microproject', label: 'Microproject' },
];

export function TodoFields({
  name,
  onNameChange,
  dueDate,
  onDueDateChange,
  subtype,
  onSubtypeChange,
  disabled = false,
}: TodoFieldsProps) {
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
          placeholder="e.g., Buy groceries"
          disabled={disabled}
          testID="todo-name-input"
        />
      </View>

      {/* Due date field */}
      <View style={styles.section}>
        <Input
          label="Due date (optional)"
          value={dueDate}
          onChangeText={onDueDateChange}
          placeholder="YYYY-MM-DD"
          disabled={disabled}
          testID="todo-due-date-input"
        />
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minWidth: 100,
  },
});
