/**
 * NOW List Component
 * Main scrollable list of NOW items
 */

import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Box, Text } from '../../ui';
import { NowLockedItemCard } from './NowLockedItemCard';
import { NowActiveItemCard } from './NowActiveItemCard';
import { NowFutureDivider } from './NowFutureDivider';
import type { NowLockedItem, NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';

interface NowListProps {
  lockedItems: NowLockedItem[];
  activeItems: NowActiveItem[];
  futureItems: NowFutureItem[];
  progressPercent?: number;
  onPressItem?: (item: NowLockedItem | NowActiveItem | NowFutureItem) => void;
  onToggleComplete?: (item: NowLockedItem | NowActiveItem | NowFutureItem) => void;
}

export function NowList({
  lockedItems,
  activeItems,
  futureItems,
  progressPercent = 0,
  onPressItem,
  onToggleComplete,
}: NowListProps) {
  const hasNoItems = lockedItems.length === 0 && activeItems.length === 0;
  const isAllComplete = progressPercent === 100;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* All done banner */}
      {isAllComplete && !hasNoItems && (
        <Box style={styles.banner}>
          <Text style={styles.bannerText}>🎉 All done for today!</Text>
        </Box>
      )}

      {/* Empty state */}
      {hasNoItems && (
        <Box style={styles.emptyState}>
          <Text style={styles.emptyText}>Nothing scheduled for today.</Text>
          <Text style={styles.emptySubtext}>Enjoy a calmer day — or try a Sweep.</Text>
        </Box>
      )}

      {/* Locked items section */}
      {lockedItems.map((item) => (
        <NowLockedItemCard
          key={item.id}
          item={item}
          onPress={() => onPressItem?.(item)}
          onToggleComplete={() => onToggleComplete?.(item)}
        />
      ))}

      {/* Active items section */}
      {activeItems.map((item) => (
        <NowActiveItemCard
          key={item.id}
          item={item}
          onPress={() => onPressItem?.(item)}
          onToggleComplete={() => onToggleComplete?.(item)}
        />
      ))}

      {/* Future divider */}
      {futureItems.length > 0 && <NowFutureDivider />}

      {/* Future items section */}
      {futureItems.map((item) => (
        <NowActiveItemCard
          key={item.id}
          item={item}
          future
          onPress={() => onPressItem?.(item)}
          onToggleComplete={() => onToggleComplete?.(item)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 140, // Extra breathing room for bottom actions
  },
  banner: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
});
