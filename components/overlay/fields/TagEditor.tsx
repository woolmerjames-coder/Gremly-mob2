/**
 * TagEditor - Tag management component for overlay
 * Phase 8: Add/remove tags for habits, todos, notes, journals
 */

import React, { useState, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { Text } from '../../../ui/Text';
import { colors, spacing, radii } from '../../../theme/tokens';
import type { Tag } from '../../../lib/repo/types';

export interface TagEditorProps {
  userId: string;
  itemId: string | null; // null for new items
  itemType: 'habit' | 'todo' | 'journal' | 'note' | 'catchall' | 'space';
  currentTags: Tag[];
  allTags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
  onAddTag: (tagName: string) => Promise<Tag>;
  onLinkTag: (tagId: string) => Promise<void>;
  onUnlinkTag: (tagId: string) => Promise<void>;
}

export function TagEditor({
  currentTags,
  allTags,
  onTagsChange,
  onAddTag,
  onLinkTag,
  onUnlinkTag,
}: TagEditorProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Update suggestions based on input
  useEffect(() => {
    if (!inputValue.trim()) {
      setSuggestions([]);
      return;
    }

    const filtered = allTags.filter(
      (tag) =>
        tag.name.toLowerCase().includes(inputValue.toLowerCase()) &&
        !currentTags.some((t) => t.id === tag.id),
    );
    setSuggestions(filtered.slice(0, 5));
  }, [inputValue, allTags, currentTags]);

  const handleAddTag = async (tagName: string) => {
    if (!tagName.trim() || isLoading) return;

    setIsLoading(true);
    try {
      const tag = await onAddTag(tagName.trim());
      await onLinkTag(tag.id);
      onTagsChange([...currentTags, tag]);
      setInputValue('');
      setSuggestions([]);
    } catch (error) {
      console.error('Failed to add tag:', error);
      // Could show toast here
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSuggestion = async (tag: Tag) => {
    setIsLoading(true);
    try {
      await onLinkTag(tag.id);
      onTagsChange([...currentTags, tag]);
      setInputValue('');
      setSuggestions([]);
    } catch (error) {
      console.error('Failed to link tag:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveTag = async (tag: Tag) => {
    try {
      await onUnlinkTag(tag.id);
      onTagsChange(currentTags.filter((t) => t.id !== tag.id));
    } catch (error) {
      console.error('Failed to unlink tag:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Tags</Text>

      {/* Current tags */}
      {currentTags.length > 0 && (
        <View style={styles.tagsContainer}>
          {currentTags.map((tag) => (
            <View key={tag.id} style={styles.chip}>
              <Text style={styles.chipText}>{tag.name}</Text>
              <TouchableOpacity
                onPress={() => handleRemoveTag(tag)}
                style={styles.chipRemove}
                testID={`tag-remove-${tag.id}`}
              >
                <Text style={styles.chipRemoveText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Input */}
      <TextInput
        style={styles.input}
        placeholder="Add tag..."
        placeholderTextColor={colors.gray400}
        value={inputValue}
        onChangeText={setInputValue}
        onSubmitEditing={() => handleAddTag(inputValue)}
        returnKeyType="done"
        editable={!isLoading}
        testID="tag-input"
      />

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((tag) => (
            <TouchableOpacity
              key={tag.id}
              style={styles.suggestionItem}
              onPress={() => handleSelectSuggestion(tag)}
              testID={`tag-suggestion-${tag.id}`}
            >
              <Text style={styles.suggestionText}>{tag.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Create new hint */}
      {inputValue.trim() && suggestions.length === 0 && (
        <TouchableOpacity
          style={styles.createNew}
          onPress={() => handleAddTag(inputValue)}
          testID="tag-create-new"
        >
          <Text style={styles.createNewText}>+ Create "{inputValue}"</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.deepTeal,
    borderRadius: 999, // fully rounded
    paddingVertical: spacing.xs,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  chipRemove: {
    marginLeft: spacing.xs,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRemoveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.ink,
  },
  suggestions: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radii.md,
    backgroundColor: '#FFFFFF',
  },
  suggestionItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  suggestionText: {
    fontSize: 14,
    color: colors.ink,
  },
  createNew: {
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
  },
  createNewText: {
    fontSize: 14,
    color: colors.deepTeal,
    fontWeight: '500',
  },
});
