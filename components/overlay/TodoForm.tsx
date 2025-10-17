/**
 * TodoForm - Phase 6
 * Form for adding a to-do item
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { overlayStyles } from '../../app/styles/manualAdd.styles';
import { Button } from '../../design-system/Button';
import { TodoSchema } from '../../app/schemas/manualAdd';
import type { ManualAddPayload, TReminderRule } from '../../app/schemas/manualAdd';

interface TodoFormProps {
  reminders: TReminderRule[];
  onSubmit: (payload: ManualAddPayload) => void;
}

export function TodoForm({ reminders, onSubmit }: TodoFormProps) {
  const [name, setName] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');

  console.log('[TodoForm] RENDER');

  const handleSubmit = () => {
    try {
      const data = TodoSchema.parse({
        name,
        deadline: deadline || undefined,
        notes: notes || undefined,
        reminders,
      });

      onSubmit({
        type: 'todos',
        data,
      });
    } catch (error) {
      console.error('Validation error:', error);
    }
  };

  const isValid = name.trim().length > 0;

  return (
    <View testID="todo-form">
      {/* Required: Name */}
      <View style={overlayStyles.fieldRow}>
        <Text style={overlayStyles.label}>Task Name *</Text>
        <TextInput
          style={overlayStyles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Finish project report"
          maxLength={120}
          testID="todo-name"
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
              Deadline
              <Text style={overlayStyles.labelOptional}> (optional)</Text>
            </Text>
            <TextInput
              style={overlayStyles.input}
              value={deadline}
              onChangeText={setDeadline}
              placeholder="YYYY-MM-DD"
              testID="todo-deadline"
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
              testID="todo-notes"
            />
          </View>
        </>
      )}

      {/* Submit */}
      <View style={{ marginTop: 24 }}>
        <Button
          label="Add To-Do"
          variant="primary"
          onPress={handleSubmit}
          disabled={!isValid}
          testID="todo-submit"
        />
      </View>
    </View>
  );
}
