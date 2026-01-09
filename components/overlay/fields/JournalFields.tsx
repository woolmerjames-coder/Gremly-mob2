/**
 * JournalFields - Form fields for creating/editing journal entries
 * Calm & expressive UI with mood tracking, formatting, and inspiration prompts
 */
import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text, TextInput } from 'react-native';
import { Input } from '../../../design-system/Input';
import { Textarea } from '../../../design-system/Textarea';
import { Icon } from '../../../design-system/Icon';
import { RemindersList, type ReminderRow } from './RemindersList';
import { FormattingToggle, type FormattingType } from './FormattingToggle';
import { type Mood, ALL_MOODS, MOOD_CONFIG, getMoodsByCategory } from '../../../lib/shared/moods';

// 10-15 inspiring prompts for journal entries
const JOURNAL_PROMPTS = [
  'What made me smile today?',
  'What am I grateful for right now?',
  'What challenged me today and what did I learn?',
  'What would I do if I had no fear?',
  'Who inspires me and why?',
  'What does success look like for me today?',
  'What am I looking forward to?',
  "What did I accomplish today that I'm proud of?",
  'How did I show kindness today?',
  'What surprised me today?',
  'What would I tell my younger self?',
  'What energizes me?',
  'What do I need to let go of?',
  'How can I be more present tomorrow?',
  'What dream am I nurturing?',
];

// Re-export Mood type for backwards compatibility
export type { Mood };
// Legacy type alias for backwards compatibility
export type MoodType = Mood;

export interface JournalDetailsState {
  reminders?: ReminderRow[];
  spaceId?: string | null;
  tags?: string[];
  formatting?: FormattingType;
}

interface JournalFieldsProps {
  date: string;
  onDateChange: (value: string) => void;
  entry: string;
  onEntryChange: (value: string) => void;
  mood: Mood[] | null; // Multi-select mood array
  onMoodChange: (value: Mood[]) => void; // Multi-select callback
  details?: JournalDetailsState;
  onDetailsChange?: (details: JournalDetailsState) => void;
  disabled?: boolean;
}

export function JournalFields({
  date,
  onDateChange,
  entry,
  onEntryChange,
  mood,
  onMoodChange,
  details = {},
  onDetailsChange,
  disabled = false,
}: JournalFieldsProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const updateDetails = (patch: Partial<JournalDetailsState>) => {
    if (onDetailsChange) {
      onDetailsChange({ ...details, ...patch });
    }
  };

  const handleInspiration = () => {
    // Pick a random prompt
    const randomPrompt = JOURNAL_PROMPTS[Math.floor(Math.random() * JOURNAL_PROMPTS.length)];
    // Insert at the end with a newline
    const newEntry = entry ? `${entry}\n\n${randomPrompt}\n` : `${randomPrompt}\n`;
    onEntryChange(newEntry);
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

  // Toggle mood selection (multi-select)
  const toggleMood = (moodValue: Mood) => {
    const currentMoods = mood || [];
    if (currentMoods.includes(moodValue)) {
      onMoodChange(currentMoods.filter((m) => m !== moodValue));
    } else {
      onMoodChange([...currentMoods, moodValue]);
    }
  };

  return (
    <View style={styles.container}>
      {/* Required: Date */}
      <View style={styles.section}>
        <Input
          label="Date *"
          value={date}
          onChangeText={onDateChange}
          placeholder="YYYY-MM-DD"
          disabled={disabled}
          testID="journal-date"
        />
      </View>

      {/* Required: Mood (Multi-select) */}
      <View style={styles.section}>
        <Text style={styles.label}>How are you feeling? *</Text>
        <View style={styles.moodChipsRow}>
          {ALL_MOODS.map((moodValue) => {
            const config = MOOD_CONFIG[moodValue];
            const isSelected = mood?.includes(moodValue) ?? false;
            return (
              <Pressable
                key={moodValue}
                onPress={() => toggleMood(moodValue)}
                disabled={disabled}
                style={[
                  styles.moodChip,
                  isSelected && styles.moodChipSelected,
                  disabled && styles.moodChipDisabled,
                ]}
                testID={`mood-${moodValue}`}
              >
                <Text style={[styles.moodLabel, isSelected && styles.moodLabelSelected]}>
                  {config.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Required: Entry */}
      <View style={styles.section}>
        <Textarea
          label="What's on your mind? *"
          value={entry}
          onChangeText={onEntryChange}
          placeholder="Start writing..."
          disabled={disabled}
          testID="journal-entry"
          rows={8}
        />
      </View>

      {/* Need Inspiration? Button */}
      <View style={styles.section}>
        <Pressable
          onPress={handleInspiration}
          disabled={disabled}
          style={[styles.inspireButton, disabled && styles.inspireButtonDisabled]}
          testID="journal-inspire"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="Sparkles" size="xs" color="#4B5563" />
            <Text style={styles.inspireButtonText}>Need Inspiration?</Text>
          </View>
        </Pressable>
      </View>

      {/* Optional: Formatting */}
      {onDetailsChange && (
        <View style={styles.section}>
          <FormattingToggle
            label="Formatting (optional)"
            value={details.formatting || null}
            onChange={(fmt) => updateDetails({ formatting: fmt })}
            disabled={disabled}
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
              {/* Space selector */}
              <View style={styles.detailField}>
                <Input
                  label="Space"
                  value={details.spaceId || ''}
                  onChangeText={(spaceId) => updateDetails({ spaceId: spaceId || null })}
                  placeholder="Select space"
                  disabled={disabled}
                  testID="journal-space"
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
                    testID="journal-tag-input"
                  />
                  <Pressable
                    onPress={handleAddTag}
                    disabled={disabled || !tagInput.trim()}
                    style={[
                      styles.tagAddButton,
                      (!tagInput.trim() || disabled) && styles.tagAddButtonDisabled,
                    ]}
                    testID="journal-tag-add"
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
                        testID={`journal-tag-chip-${tag}`}
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
  },
  moodChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  moodChipSelected: {
    borderColor: '#4CAF93',
    backgroundColor: '#E8F5F3',
  },
  moodChipDisabled: {
    opacity: 0.5,
  },
  moodEmoji: {
    fontSize: 18,
  },
  moodLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666666',
  },
  moodLabelSelected: {
    color: '#2E7D6A',
    fontWeight: '600',
  },
  inspireButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4CAF93',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  inspireButtonDisabled: {
    opacity: 0.5,
  },
  inspireButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF93',
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
