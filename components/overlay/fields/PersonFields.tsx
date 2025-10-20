/**
 * PersonFields - UI fields for creating/editing a Person (lightweight CRM)
 *
 * Required: Display Name
 * Optional: Email, Important Dates (multi), Notes (with formatting), Reminders, Space, Tags
 *
 * testIDs: person-name, person-email, person-date-add, person-date-row-{id},
 *          person-date-label-{id}, person-notes, person-space, person-reminders
 */
import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, Pressable } from 'react-native';
import { Icon } from '../../../design-system';
import { FormattingToggle, FormattingType } from './FormattingToggle';
import { RemindersList, ReminderRow } from './RemindersList';

// ============================================================================
// Types
// ============================================================================

export interface PersonDate {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  label: 'birthday' | 'anniversary' | 'moving' | 'custom';
}

export interface PersonDetailsState {
  email: string;
  dates: PersonDate[];
  notes: string;
  notesFormatting: FormattingType;
  reminders: ReminderRow[];
  spaceId: string | null;
  tags: string[];
}

interface PersonFieldsProps {
  name: string;
  onNameChange: (text: string) => void;
  details: PersonDetailsState;
  onDetailsChange: (details: PersonDetailsState) => void;
  disabled?: boolean;
}

const DATE_LABELS: Array<{ value: PersonDate['label']; label: string }> = [
  { value: 'birthday', label: 'Birthday' },
  { value: 'anniversary', label: 'Anniversary' },
  { value: 'moving', label: 'Moving' },
  { value: 'custom', label: 'Custom' },
];

// ============================================================================
// Main Component
// ============================================================================

export function PersonFields({
  name,
  onNameChange,
  details,
  onDetailsChange,
  disabled = false,
}: PersonFieldsProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleAddDate = () => {
    const newDate: PersonDate = {
      id: `date-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      label: 'birthday',
    };
    onDetailsChange({
      ...details,
      dates: [...details.dates, newDate],
    });
  };

  const handleDateChange = (id: string, field: 'date' | 'label', value: string) => {
    onDetailsChange({
      ...details,
      dates: details.dates.map((d) => (d.id === id ? { ...d, [field]: value } : d)),
    });
  };

  const handleRemoveDate = (id: string) => {
    onDetailsChange({
      ...details,
      dates: details.dates.filter((d) => d.id !== id),
    });
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !details.tags.includes(trimmed)) {
      onDetailsChange({
        ...details,
        tags: [...details.tags, trimmed],
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    onDetailsChange({
      ...details,
      tags: details.tags.filter((t) => t !== tag),
    });
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <View style={styles.container}>
      {/* Required Name */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          Name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          testID="person-name"
          value={name}
          onChangeText={onNameChange}
          placeholder="Enter name"
          placeholderTextColor="#999999"
          style={[styles.input, disabled && styles.inputDisabled]}
          editable={!disabled}
        />
      </View>

      {/* Optional Email */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Email (optional)</Text>
        <TextInput
          testID="person-email"
          value={details.email}
          onChangeText={(email) => onDetailsChange({ ...details, email })}
          placeholder="email@example.com"
          placeholderTextColor="#999999"
          keyboardType="email-address"
          autoCapitalize="none"
          style={[styles.input, disabled && styles.inputDisabled]}
          editable={!disabled}
        />
      </View>

      {/* Important Dates */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Important Dates (optional)</Text>
        {details.dates.map((dateEntry) => (
          <View
            key={dateEntry.id}
            style={styles.dateRow}
            testID={`person-date-row-${dateEntry.id}`}
          >
            <TextInput
              value={dateEntry.date}
              onChangeText={(date) => handleDateChange(dateEntry.id, 'date', date)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#999999"
              style={[styles.dateInput, disabled && styles.inputDisabled]}
              editable={!disabled}
            />
            <View style={styles.dateLabelRow}>
              {DATE_LABELS.map((label) => (
                <Pressable
                  key={label.value}
                  testID={`person-date-label-${dateEntry.id}-${label.value}`}
                  onPress={() => handleDateChange(dateEntry.id, 'label', label.value)}
                  disabled={disabled}
                  style={[
                    styles.labelChip,
                    dateEntry.label === label.value && styles.labelChipSelected,
                    disabled && styles.labelChipDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.labelChipText,
                      dateEntry.label === label.value && styles.labelChipTextSelected,
                    ]}
                  >
                    {label.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => handleRemoveDate(dateEntry.id)}
              disabled={disabled}
              hitSlop={8}
            >
              <Icon name="X" size="xs" color="#DC2626" />
            </Pressable>
          </View>
        ))}
        <Pressable
          testID="person-date-add"
          onPress={handleAddDate}
          disabled={disabled}
          style={[styles.addButton, disabled && styles.addButtonDisabled]}
        >
          <Icon name="Plus" size="xs" color="#2E7D6A" />
          <Text style={styles.addButtonText}>Add date</Text>
        </Pressable>
      </View>

      {/* Notes with Formatting */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Notes (optional)</Text>
        <Text style={styles.helperText}>Gift ideas, last connect, etc.</Text>
        <TextInput
          testID="person-notes"
          value={details.notes}
          onChangeText={(notes) => onDetailsChange({ ...details, notes })}
          placeholder="Add notes..."
          placeholderTextColor="#999999"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          style={[styles.textarea, disabled && styles.inputDisabled]}
          editable={!disabled}
        />
        <FormattingToggle
          value={details.notesFormatting}
          onChange={(notesFormatting) => onDetailsChange({ ...details, notesFormatting })}
          disabled={disabled}
        />
      </View>

      {/* Reminders */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Reminders (optional)</Text>
        <Text style={styles.helperText}>Set check-in reminders</Text>
        <RemindersList
          reminders={details.reminders}
          onChange={(reminders) => onDetailsChange({ ...details, reminders })}
          disabled={disabled}
        />
      </View>

      {/* Add Details Toggle */}
      <Pressable
        onPress={() => setShowDetails(!showDetails)}
        disabled={disabled}
        style={styles.detailsToggle}
      >
        <Icon name={showDetails ? 'ChevronUp' : 'ChevronDown'} size="xs" color="#666666" />
        <Text style={styles.detailsToggleText}>{showDetails ? 'Hide details' : 'Add details'}</Text>
      </Pressable>

      {/* Optional Details Section */}
      {showDetails && (
        <View style={styles.detailsSection}>
          {/* Space */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Space (optional)</Text>
            <TextInput
              testID="person-space"
              value={details.spaceId || ''}
              onChangeText={(spaceId) => onDetailsChange({ ...details, spaceId: spaceId || null })}
              placeholder="Enter space ID"
              placeholderTextColor="#999999"
              style={[styles.input, disabled && styles.inputDisabled]}
              editable={!disabled}
            />
          </View>

          {/* Tags */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Tags</Text>
            <View style={styles.tagInputRow}>
              <TextInput
                testID="person-tag-input"
                value={tagInput}
                onChangeText={setTagInput}
                placeholder="Add a tag..."
                placeholderTextColor="#999999"
                style={[styles.tagInput, disabled && styles.inputDisabled]}
                editable={!disabled}
                onSubmitEditing={handleAddTag}
                returnKeyType="done"
              />
              <Pressable
                testID="person-tag-add"
                onPress={handleAddTag}
                disabled={disabled || !tagInput.trim()}
                style={[
                  styles.tagAddButton,
                  (!tagInput.trim() || disabled) && styles.tagAddButtonDisabled,
                ]}
              >
                <Icon name="Plus" size="xs" color="#FFFFFF" />
              </Pressable>
            </View>

            {/* Tag Chips */}
            {details.tags.length > 0 && (
              <View style={styles.tagChips}>
                {details.tags.map((tag) => (
                  <View key={tag} style={styles.tagChip} testID={`person-tag-chip-${tag}`}>
                    <Text style={styles.tagChipText}>{tag}</Text>
                    <Pressable onPress={() => handleRemoveTag(tag)} disabled={disabled} hitSlop={8}>
                      <Icon name="X" size="xs" color="#666666" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
  },
  required: {
    color: '#DC2626',
  },
  helperText: {
    fontSize: 12,
    color: '#666666',
    marginTop: -4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333333',
    backgroundColor: '#FFFFFF',
  },
  textarea: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333333',
    backgroundColor: '#FFFFFF',
    minHeight: 100,
  },
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#9CA3AF',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#333333',
    backgroundColor: '#FFFFFF',
  },
  dateLabelRow: {
    flexDirection: 'row',
    gap: 4,
  },
  labelChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  labelChipSelected: {
    borderColor: '#2E7D6A',
    backgroundColor: '#E6F2EF',
  },
  labelChipDisabled: {
    opacity: 0.5,
  },
  labelChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666666',
  },
  labelChipTextSelected: {
    color: '#2E7D6A',
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2E7D6A',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  detailsToggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  detailsSection: {
    gap: 16,
    paddingTop: 8,
  },
  tagInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tagInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333333',
    backgroundColor: '#FFFFFF',
  },
  tagAddButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#2E7D6A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagAddButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  tagChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333333',
  },
});
