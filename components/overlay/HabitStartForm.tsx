/**
 * HabitStartForm - Phase 6 (Brand Refresh)
 * Form for starting a new habit - with focus glow and brand colors
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { overlayStyles } from '../../app/styles/manualAdd.styles';
import { theme } from '../../app/design/theme';
import { HabitStartSchema } from '../../app/schemas/manualAdd';
import type { ManualAddPayload, TReminderRule } from '../../app/schemas/manualAdd';

interface HabitStartFormProps {
  reminders: TReminderRule[];
  onSubmit: (payload: ManualAddPayload) => void;
}

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'custom'];

export function HabitStartForm({ reminders, onSubmit }: HabitStartFormProps) {
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [showOptional, setShowOptional] = useState(false);
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('');

  const [nameFocused, setNameFocused] = useState(false);
  const [notesFocused, setNotesFocused] = useState(false);
  const [categoryFocused, setCategoryFocused] = useState(false);

  const handleSubmit = () => {
    try {
      const data = HabitStartSchema.parse({
        name,
        frequency,
        notes: notes || undefined,
        category: category || undefined,
        reminders,
      });

      onSubmit({
        type: 'habits',
        subType: 'start',
        data,
      });
    } catch (error) {
      console.error('Validation error:', error);
    }
  };

  const isValid = name.trim().length > 0 && frequency.trim().length > 0;

  return (
    <View>
      {/* Required: Name */}
      <View style={overlayStyles.fieldRow}>
        <Text style={overlayStyles.label}>Habit Name *</Text>
        <TextInput
          style={[overlayStyles.input, nameFocused && styles.inputFocused]}
          value={name}
          onChangeText={setName}
          onFocus={() => setNameFocused(true)}
          onBlur={() => setNameFocused(false)}
          placeholder="e.g., Meditate every morning"
          placeholderTextColor={theme.colors.grayLine}
          maxLength={120}
          testID="habit-start-name"
        />
      </View>

      {/* Required: Frequency */}
      <View style={overlayStyles.fieldRow}>
        <Text style={overlayStyles.label}>Frequency *</Text>
        <View style={overlayStyles.chipsRow}>
          {FREQUENCIES.map((freq) => (
            <TouchableOpacity
              key={freq}
              style={[overlayStyles.chip, frequency === freq && overlayStyles.chipActive]}
              onPress={() => setFrequency(freq)}
              testID={`freq-${freq}`}
            >
              <Text
                style={[overlayStyles.chipText, frequency === freq && overlayStyles.chipTextActive]}
              >
                {freq}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Show optional toggle */}
      <TouchableOpacity
        style={overlayStyles.showMoreButton}
        onPress={() => setShowOptional(!showOptional)}
        testID="show-optional"
      >
        <Text style={overlayStyles.showMoreText}>
          {showOptional ? '▼ Hide optional fields' : '▶ Show optional fields'}
        </Text>
      </TouchableOpacity>

      {/* Optional fields */}
      {showOptional && (
        <>
          <View style={overlayStyles.fieldRow}>
            <Text style={overlayStyles.label}>
              Notes
              <Text style={overlayStyles.labelOptional}> (optional)</Text>
            </Text>
            <TextInput
              style={[overlayStyles.textarea, notesFocused && styles.inputFocused]}
              value={notes}
              onChangeText={setNotes}
              onFocus={() => setNotesFocused(true)}
              onBlur={() => setNotesFocused(false)}
              placeholder="Add notes..."
              placeholderTextColor={theme.colors.grayLine}
              maxLength={500}
              multiline
              testID="habit-start-notes"
            />
          </View>

          <View style={overlayStyles.fieldRow}>
            <Text style={overlayStyles.label}>
              Category
              <Text style={overlayStyles.labelOptional}> (optional)</Text>
            </Text>
            <TextInput
              style={[overlayStyles.input, categoryFocused && styles.inputFocused]}
              value={category}
              onChangeText={setCategory}
              onFocus={() => setCategoryFocused(true)}
              onBlur={() => setCategoryFocused(false)}
              placeholder="e.g., Health, Productivity"
              placeholderTextColor={theme.colors.grayLine}
              testID="habit-start-category"
            />
          </View>
        </>
      )}

      {/* Submit */}
      <View style={{ marginTop: 24 }}>
        <TouchableOpacity
          style={[styles.submitButton, !isValid && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={!isValid}
          testID="habit-start-submit"
        >
          <Text style={styles.submitText}>Add Habit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputFocused: {
    borderColor: theme.colors.mint,
    shadowColor: theme.colors.mint,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  submitButton: {
    backgroundColor: theme.colors.deepTeal,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radii.md,
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    ...theme.textStyles.label,
    color: '#fff',
  },
});
