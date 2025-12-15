/**
 * PopularTagsSection - Shows most-used tags with tap to filter
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Tag as TagIcon } from 'lucide-react-native';
import { colors, radii, spacing } from '../../theme/tokens';

export interface PopularTagsSectionProps {
  /** Array of [tagName, count] sorted by count descending */
  tags: [string, number][];
  /** Currently selected tag names */
  selectedTags: string[];
  /** Called when a tag is pressed */
  onTagPress: (tagName: string) => void;
  /** Called when "more" is pressed */
  onMorePress?: () => void;
  /** Maximum number of tags to show (default 5) */
  maxVisible?: number;
}

export default function PopularTagsSection({
  tags,
  selectedTags,
  onTagPress,
  onMorePress,
  maxVisible = 5,
}: PopularTagsSectionProps) {
  const visibleTags = tags.slice(0, maxVisible);
  const remainingCount = Math.max(0, tags.length - maxVisible);

  const isSelected = (tagName: string) => selectedTags.includes(tagName);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Popular Tags</Text>
      {visibleTags.length > 0 ? (
        <View style={styles.tagsContainer}>
          {visibleTags.map(([tagName, count]) => (
            <TouchableOpacity
              key={tagName}
              style={[styles.tagChip, isSelected(tagName) && styles.tagChipSelected]}
              onPress={() => onTagPress(tagName)}
              testID={`popular-tag-${tagName}`}
            >
              <Text style={[styles.tagChipText, isSelected(tagName) && styles.tagChipTextSelected]}>
                #{tagName}
              </Text>
              <Text
                style={[styles.tagChipCount, isSelected(tagName) && styles.tagChipCountSelected]}
              >
                {count}
              </Text>
            </TouchableOpacity>
          ))}
          {remainingCount > 0 && (
            <TouchableOpacity
              style={styles.tagChipMore}
              onPress={onMorePress}
              testID="popular-tags-more"
            >
              <Text style={styles.tagChipMoreText}>+{remainingCount} more</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.tagsEmptyState}>
          <View style={styles.tagsEmptyContent}>
            <TagIcon size={16} color={colors.gray400} style={{ marginRight: spacing.xs }} />
            <Text style={styles.tagsEmptyText}>No tags yet</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing['2xl'],
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.gray600,
    marginBottom: spacing.md,
    letterSpacing: 0.2,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray100,
    gap: spacing.xs,
  },
  tagChipSelected: {
    backgroundColor: colors.deepTeal,
    borderColor: colors.deepTeal,
  },
  tagChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
  },
  tagChipTextSelected: {
    color: colors.white,
  },
  tagChipCount: {
    fontSize: 12,
    color: colors.gray400,
  },
  tagChipCountSelected: {
    color: colors.white,
    opacity: 0.8,
  },
  tagChipMore: {
    backgroundColor: colors.gray100,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  tagChipMoreText: {
    fontSize: 13,
    color: colors.gray600,
    fontWeight: '500',
  },
  tagsEmptyState: {
    paddingVertical: spacing.sm,
  },
  tagsEmptyContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagsEmptyText: {
    fontSize: 14,
    color: colors.gray400,
  },
});
