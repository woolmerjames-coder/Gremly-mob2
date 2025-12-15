/**
 * BrowseBySpaceSection - Grid of spaces with item counts
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FolderOpen } from 'lucide-react-native';
import { colors, radii, spacing } from '../../theme/tokens';
import type { Space } from '../../lib/types';

export interface BrowseBySpaceSectionProps {
  spaces: Space[];
  /** Map of space ID to item count */
  spaceCounts: Map<string, number>;
  onSpacePress: (spaceId: string) => void;
}

export default function BrowseBySpaceSection({
  spaces,
  spaceCounts,
  onSpacePress,
}: BrowseBySpaceSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitleSecondary}>Browse by Space</Text>
      {spaces.length > 0 ? (
        <View style={styles.spacesGrid}>
          {spaces.map((space) => (
            <TouchableOpacity
              key={space.id}
              style={styles.spaceCard}
              onPress={() => onSpacePress(space.id)}
              testID={`hub-space-card-${space.id}`}
            >
              <Text style={styles.spaceCardName} numberOfLines={1}>
                {space.name}
              </Text>
              <Text style={styles.spaceCardCount}>{spaceCounts.get(space.id) || 0} items</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.spacesEmptyState}>
          <View style={styles.spacesEmptyContent}>
            <FolderOpen size={14} color={colors.gray400} style={{ marginRight: spacing.xs }} />
            <Text style={styles.spacesEmptyText}>No spaces yet</Text>
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
  sectionTitleSecondary: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.gray400,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  spacesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  spaceCard: {
    backgroundColor: 'transparent',
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 80,
  },
  spaceCardName: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.gray400,
  },
  spaceCardCount: {
    fontSize: 10,
    color: colors.gray400,
  },
  spacesEmptyState: {
    paddingVertical: spacing.xs,
  },
  spacesEmptyContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spacesEmptyText: {
    fontSize: 12,
    color: colors.gray400,
  },
});
