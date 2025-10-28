/**
 * NoteFields - UI fields for creating/editing a general Note
 *
 * Required: Body (multiline textarea)
 * Optional: Title, Space, Tags, Formatting (bullets/numbers/checkboxes)
 * NO subtype chips (idea/list/reference are AI-only)
 *
 * testIDs: note-title, note-body, fmt-bullets|fmt-numbers|fmt-checkboxes,
 *          note-space, note-tag-input, note-tag-add, note-tag-chip-{tag}
 */
import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, Pressable } from 'react-native';
import { Icon } from '../../../design-system';
import { FormattingToggle, FormattingType } from './FormattingToggle';

// ============================================================================
// Types
// ============================================================================

export interface NoteDetailsState {
  formatting: FormattingType;
  spaceId: string | null;
  tags: string[];
}

interface NoteFieldsProps {
  title: string;
  onTitleChange: (text: string) => void;
  body: string;
  onBodyChange: (text: string) => void;
  details: NoteDetailsState;
  onDetailsChange: (details: NoteDetailsState) => void;
  disabled?: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

export function NoteFields({
  title,
  onTitleChange,
  body,
  onBodyChange,
  details,
  onDetailsChange,
  disabled = false,
}: NoteFieldsProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleFormattingChange = (formatting: FormattingType) => {
    onDetailsChange({ ...details, formatting });
  };

  const handleSpaceChange = (spaceId: string | null) => {
    onDetailsChange({ ...details, spaceId });
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
      {/* Optional Title */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Title (optional)</Text>
        <TextInput
          testID="note-title"
          value={title}
          onChangeText={onTitleChange}
          placeholder="Untitled note"
          placeholderTextColor="#999999"
          style={[styles.input, disabled && styles.inputDisabled]}
          editable={!disabled}
        />
      </View>

      {/* Required Body */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          Body <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          testID="note-body"
          value={body}
          onChangeText={onBodyChange}
          placeholder="Start writing..."
          placeholderTextColor="#999999"
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          style={[styles.textarea, disabled && styles.inputDisabled]}
          editable={!disabled}
        />
      </View>

      {/* Formatting Toggle */}
      <View style={styles.fieldGroup}>
        <FormattingToggle
          value={details.formatting}
          onChange={handleFormattingChange}
          disabled={disabled}
          label="Formatting (optional)"
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
          {/* Space Selector */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Space (optional)</Text>
            <TextInput
              testID="note-space"
              value={details.spaceId || ''}
              onChangeText={(spaceId) => handleSpaceChange(spaceId || null)}
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
                testID="note-tag-input"
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
                testID="note-tag-add"
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
                  <View key={tag} style={styles.tagChip} testID={`note-tag-chip-${tag}`}>
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
    minHeight: 120,
  },
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#9CA3AF',
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
  spaceScroll: {
    flexGrow: 0,
  },
  spaceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    marginRight: 8,
  },
  spaceChipSelected: {
    borderColor: '#2E7D6A',
    backgroundColor: '#E6F2EF',
  },
  spaceChipDisabled: {
    opacity: 0.5,
  },
  spaceIcon: {
    fontSize: 16,
  },
  spaceChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  spaceChipTextSelected: {
    color: '#2E7D6A',
    fontWeight: '600',
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
