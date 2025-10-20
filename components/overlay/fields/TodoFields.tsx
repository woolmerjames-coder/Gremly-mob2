/**
 * TodoFields - Form fields for creating/editing todos
 * Follows the Habits UX pattern with required fields and "Add details" section
 */
import React, { useState } from 'react';
import { View, StyleSheet, Pressable, TextInput, Text } from 'react-native';
import { Input } from '../../../design-system/Input';
import { Textarea } from '../../../design-system/Textarea';
import { RemindersList, type ReminderRow } from './RemindersList';

// Note: No front-end subtype chips - subtype is AI-only
export interface TodoDetailsState {
  reminders?: ReminderRow[];
  spaceId?: string | null;
  notes?: string | null;
  tags?: string[];
}

interface TodoFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  dueDate?: string | null;
  onDueDateChange: (value: string | null) => void;
  dueTime?: string | null;
  onDueTimeChange?: (value: string | null) => void;
  details?: TodoDetailsState;
  onDetailsChange?: (details: TodoDetailsState) => void;
  disabled?: boolean;
}

export function TodoFields({
  name,
  onNameChange,
  dueDate,
  onDueDateChange,
  dueTime,
  onDueTimeChange,
  details = {},
  onDetailsChange,
  disabled = false,
}: TodoFieldsProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const updateDetails = (patch: Partial<TodoDetailsState>) => {
    if (onDetailsChange) {
      onDetailsChange({ ...details, ...patch });
    }
  };

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    const currentTags = details.tags || [];
    if (!currentTags.includes(tagInput.trim())) {
      updateDetails({ tags: [...currentTags, tagInput.trim()] });
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    const currentTags = details.tags || [];
    updateDetails({ tags: currentTags.filter((t) => t !== tag) });
  };

  return (
    <View style={styles.container}>
      {/* Required: Name */}
      <View style={styles.section}>
        <Input
          label="Name *"
          value={name}
          onChangeText={onNameChange}
          placeholder="e.g., Buy groceries"
          disabled={disabled}
          testID="todo-name"
        />
      </View>

      {/* Required: Due date */}
      <View style={styles.section}>
        <Input
          label="Due date *"
          value={dueDate || ''}
          onChangeText={onDueDateChange}
          placeholder="YYYY-MM-DD"
          disabled={disabled}
          testID="todo-due-date"
        />
      </View>

      {/* Optional: Due time */}
      {onDueTimeChange && (
        <View style={styles.section}>
          <Input
            label="Time due (optional)"
            value={dueTime || ''}
            onChangeText={onDueTimeChange}
            placeholder="HH:MM"
            disabled={disabled}
            testID="todo-due-time"
          />
        </View>
      )}

      {/* Optional: Reminders */}
      {onDetailsChange && details.reminders !== undefined && (
        <View style={styles.section}>
          <RemindersList
            reminders={details.reminders || []}
            onChange={(reminders) => updateDetails({ reminders })}
            disabled={disabled}
          />
        </View>
      )}

      {/* Add details toggle */}
      {onDetailsChange && (
        <>
          <Pressable
            onPress={() => setShowDetails(!showDetails)}
            disabled={disabled}
            testID="add-details-toggle"
            style={styles.detailsToggle}
          >
            <Text style={styles.detailsToggleText}>
              {showDetails ? 'Hide details ▴' : 'Add details ▾'}
            </Text>
          </Pressable>

          {/* Details section */}
          {showDetails && (
            <View style={styles.detailsSection}>
              {/* Additional notes */}
              <View style={styles.detailField}>
                <Textarea
                  label="Additional info"
                  value={details.notes || ''}
                  onChangeText={(notes) => updateDetails({ notes })}
                  placeholder="Any other details..."
                  disabled={disabled}
                  testID="todo-notes"
                  rows={3}
                />
              </View>

              {/* Space selector */}
              <View style={styles.detailField}>
                <Input
                  label="Space"
                  value={details.spaceId || ''}
                  onChangeText={(spaceId) => updateDetails({ spaceId: spaceId || null })}
                  placeholder="Select space"
                  disabled={disabled}
                  testID="todo-space"
                />
              </View>

              {/* Tags/Categories */}
              <View style={styles.detailField}>
                <Text style={styles.label}>Categories (Tags)</Text>
                <View style={styles.tagInputRow}>
                  <TextInput
                    value={tagInput}
                    onChangeText={setTagInput}
                    placeholder="Add tag..."
                    style={styles.tagInput}
                    editable={!disabled}
                    testID="todo-tag-input"
                  />
                  <Pressable
                    onPress={handleAddTag}
                    disabled={disabled || !tagInput.trim()}
                    style={[
                      styles.tagAddButton,
                      (!tagInput.trim() || disabled) && styles.tagAddButtonDisabled,
                    ]}
                    testID="todo-tag-add"
                  >
                    <Text style={styles.tagAddButtonText}>+</Text>
                  </Pressable>
                </View>
                {details.tags && details.tags.length > 0 && (
                  <View style={styles.tagsRow}>
                    {details.tags.map((tag) => (
                      <Pressable
                        key={tag}
                        onPress={() => handleRemoveTag(tag)}
                        disabled={disabled}
                        style={styles.tagChip}
                        testID={`todo-tag-chip-${tag}`}
                      >
                        <Text style={styles.tagChipText}>{tag}</Text>
                        <Text style={styles.tagChipRemove}>✕</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}
        </>
      )}
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
  detailsToggle: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  detailsToggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4CAF93',
  },
  detailsSection: {
    gap: 16,
    paddingTop: 8,
  },
  detailField: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
  },
  tagInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tagInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
  },
  tagAddButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4CAF93',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagAddButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  tagAddButtonText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#E8F5F3',
    borderWidth: 1,
    borderColor: '#4CAF93',
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#2E7D6A',
  },
  tagChipRemove: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2E7D6A',
  },
});
