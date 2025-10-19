/**
 * NoteFields - Form fields for creating/editing notes
 */
import React from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { Input } from '../../../design-system/Input';
import Chip from '../../ui/Chip';
import { Text } from '../../../ui/Text';

type NoteSubtype = 'idea' | 'list' | 'reference';

interface NoteFieldsProps {
  title: string;
  onTitleChange: (value: string) => void;
  body: string;
  onBodyChange: (value: string) => void;
  subtype?: NoteSubtype | null;
  onSubtypeChange?: (value: NoteSubtype) => void;
  disabled?: boolean;
}

const SUBTYPE_OPTIONS: { value: NoteSubtype; label: string }[] = [
  { value: 'idea', label: 'Idea' },
  { value: 'list', label: 'List' },
  { value: 'reference', label: 'Reference' },
];

export function NoteFields({
  title,
  onTitleChange,
  body,
  onBodyChange,
  subtype,
  onSubtypeChange,
  disabled = false,
}: NoteFieldsProps) {
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

      {/* Title field */}
      <View style={styles.section}>
        <Input
          label="Title (optional)"
          value={title}
          onChangeText={onTitleChange}
          placeholder="e.g., Project ideas"
          disabled={disabled}
          testID="note-title-input"
        />
      </View>

      {/* Body field */}
      <View style={styles.section}>
        <Text style={styles.label}>Body</Text>
        <TextInput
          value={body}
          onChangeText={onBodyChange}
          placeholder={subtype === 'list' ? 'Enter list items...' : 'Write your note...'}
          multiline
          numberOfLines={8}
          editable={!disabled}
          testID="note-body-input"
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
    minWidth: 80,
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
