/**
 * JournalFields - Form fields for creating/editing journal entries
 */
import React from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { Input } from '../../../design-system/Input';
import Chip from '../../ui/Chip';
import { Text } from '../../../ui/Text';

type JournalSubtype = 'reflection' | 'gratitude' | 'dream' | 'review';

interface JournalFieldsProps {
  date: string;
  onDateChange: (value: string) => void;
  entry: string;
  onEntryChange: (value: string) => void;
  subtype?: JournalSubtype | null;
  onSubtypeChange?: (value: JournalSubtype) => void;
  disabled?: boolean;
}

const SUBTYPE_OPTIONS: { value: JournalSubtype; label: string }[] = [
  { value: 'reflection', label: 'Reflection' },
  { value: 'gratitude', label: 'Gratitude' },
  { value: 'dream', label: 'Dream' },
  { value: 'review', label: 'Review' },
];

export function JournalFields({
  date,
  onDateChange,
  entry,
  onEntryChange,
  subtype,
  onSubtypeChange,
  disabled = false,
}: JournalFieldsProps) {
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

      {/* Date field */}
      <View style={styles.section}>
        <Input
          label="Date"
          value={date}
          onChangeText={onDateChange}
          placeholder="YYYY-MM-DD"
          disabled={disabled}
          testID="journal-date-input"
        />
      </View>

      {/* Entry field */}
      <View style={styles.section}>
        <Text style={styles.label}>Entry</Text>
        <TextInput
          value={entry}
          onChangeText={onEntryChange}
          placeholder="Write your thoughts..."
          multiline
          numberOfLines={8}
          editable={!disabled}
          testID="journal-entry-input"
          style={styles.textArea}
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
    minWidth: 90,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 120,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
  },
});
