/**
 * JournalForm - Phase 6
 * Form for adding a journal entry
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { overlayStyles } from '../../app/styles/manualAdd.styles';
import { Button } from '../../design-system/Button';
import { JournalSchema } from '../../app/schemas/manualAdd';
import { getTodayISO } from '../../app/utils/recurrence';
import type { ManualAddPayload, TReminderRule } from '../../app/schemas/manualAdd';

interface JournalFormProps {
  reminders: TReminderRule[];
  onSubmit: (payload: ManualAddPayload) => void;
}

export function JournalForm({ reminders, onSubmit }: JournalFormProps) {
  const [date, setDate] = useState(getTodayISO());
  const [entry, setEntry] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [category, setCategory] = useState('');

  console.log('[JournalForm] RENDER');

  const handleSubmit = () => {
    try {
      const data = JournalSchema.parse({
        date,
        entry,
        category: category || undefined,
        reminders,
      });

      onSubmit({
        type: 'journal',
        data,
      });
    } catch (error) {
      console.error('Validation error:', error);
    }
  };

  const isValid = date.trim().length > 0 && entry.trim().length > 0;

  return (
    <View testID="journal-form">
      {/* Required: Date */}
      <View style={overlayStyles.fieldRow}>
        <Text style={overlayStyles.label}>Date *</Text>
        <TextInput
          style={overlayStyles.input}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          testID="journal-date"
        />
      </View>

      {/* Required: Entry */}
      <View style={overlayStyles.fieldRow}>
        <Text style={overlayStyles.label}>Journal Entry *</Text>
        <TextInput
          style={[overlayStyles.textarea, { minHeight: 120 }]}
          value={entry}
          onChangeText={setEntry}
          placeholder="Write your thoughts..."
          maxLength={5000}
          multiline
          testID="journal-entry"
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
        <View style={overlayStyles.fieldRow}>
          <Text style={overlayStyles.label}>
            Category
            <Text style={overlayStyles.labelOptional}> (optional)</Text>
          </Text>
          <TextInput
            style={overlayStyles.input}
            value={category}
            onChangeText={setCategory}
            placeholder="e.g., Gratitude, Reflection"
            testID="journal-category"
          />
        </View>
      )}

      {/* Submit */}
      <View style={{ marginTop: 24 }}>
        <Button
          label="Add Journal Entry"
          variant="primary"
          onPress={handleSubmit}
          disabled={!isValid}
          testID="journal-submit"
        />
      </View>
    </View>
  );
}
