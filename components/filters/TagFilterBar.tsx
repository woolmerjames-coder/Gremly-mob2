/**
 * TagFilterBar
 * Horizontal scrollable list of tag chips for filtering Hub items
 * Phase 7: Read-only filtering (no tag creation/editing)
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';
import type { Tag } from '../../lib/types';

export default function TagFilterBar({
  tags,
  selectedTagIds,
  onToggleTag,
  testID,
}: {
  tags: Tag[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  testID?: string;
}) {
  if (tags.length === 0) {
    return null; // Don't show empty filter bar
  }

  return (
    <View style={styles.container} testID={testID}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {tags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id);
          const tagColor = tag.color || colors.deepTeal;

          return (
            <TouchableOpacity
              key={tag.id}
              style={[
                styles.chip,
                isSelected && styles.chipActive,
                isSelected && { backgroundColor: tagColor, borderColor: tagColor },
              ]}
              onPress={() => onToggleTag(tag.id)}
              testID={`tag-filter-${tag.id}`}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{tag.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.xl,
    backgroundColor: colors.gray100,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  chipActive: {
    // Dynamic background/border set inline based on tag color
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray600,
  },
  chipTextActive: {
    color: colors.white,
  },
});
