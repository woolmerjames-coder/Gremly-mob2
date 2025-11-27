/**
 * HabitBreakForm - Phase 6
 * Form for breaking an existing habit
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { overlayStyles } from '../../app/styles/manualAdd.styles';
import { Button } from '../../design-system/Button';
import { HabitBreakSchema } from '../../app/schemas/manualAdd';
import type { ManualAddPayload, TReminderRule } from '../../app/schemas/manualAdd';
import type { AppRecord } from '../../lib/types';

interface HabitBreakFormProps {
  reminders: TReminderRule[];
  onSubmit: (payload: ManualAddPayload) => void;
  mode?: 'create' | 'edit';
  initialValues?: Partial<AppRecord>;
}

export function HabitBreakForm({
  reminders,
  onSubmit,
  mode = 'create',
  initialValues,
}: HabitBreakFormProps) {
  // Initialize state from props (no effects needed)
  const [name, setName] = useState(() =>
    mode === 'edit' && initialValues && 'name' in initialValues ? initialValues.name || '' : '',
  );
  const [showOptional, setShowOptional] = useState(mode === 'edit');
  const [triggerPattern, setTriggerPattern] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('');

  const handleSubmit = () => {
    try {
      const data = HabitBreakSchema.parse({
        name,
        triggerPattern: triggerPattern || undefined,
        notes: notes || undefined,
        category: category || undefined,
        reminders,
      });

      onSubmit({
        type: 'habits',
        subType: 'break',
        data,
      });
    } catch (error) {
      console.error('Validation error:', error);
    }
  };

  const isValid = name.trim().length > 0;

  return (
    <View testID="habit-break-form">
      {/* Required: Name */}
      <View style={overlayStyles.fieldRow}>
        <Text style={overlayStyles.label}>Habit to Break *</Text>
        <TextInput
          style={overlayStyles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Stop checking phone at night"
          maxLength={120}
          testID="habit-break-name"
        />
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
              Trigger Pattern
              <Text style={overlayStyles.labelOptional}> (optional)</Text>
            </Text>
            <TextInput
              style={overlayStyles.textarea}
              value={triggerPattern}
              onChangeText={setTriggerPattern}
              placeholder="What triggers this habit?"
              maxLength={500}
              multiline
              testID="habit-break-trigger"
            />
          </View>

          <View style={overlayStyles.fieldRow}>
            <Text style={overlayStyles.label}>
              Notes
              <Text style={overlayStyles.labelOptional}> (optional)</Text>
            </Text>
            <TextInput
              style={overlayStyles.textarea}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add notes..."
              maxLength={500}
              multiline
              testID="habit-break-notes"
            />
          </View>

          <View style={overlayStyles.fieldRow}>
            <Text style={overlayStyles.label}>
              Category
              <Text style={overlayStyles.labelOptional}> (optional)</Text>
            </Text>
            <TextInput
              style={overlayStyles.input}
              value={category}
              onChangeText={setCategory}
              placeholder="e.g., Health, Productivity"
              testID="habit-break-category"
            />
          </View>
        </>
      )}

      {/* Submit */}
      <View style={{ marginTop: 24 }}>
        <Button
          label={mode === 'edit' ? 'Save changes' : 'Add Habit to Break'}
          variant="primary"
          onPress={handleSubmit}
          disabled={!isValid}
          testID={mode === 'edit' ? 'edit-save' : 'habit-break-submit'}
        />
      </View>
    </View>
  );
}
