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
  onPressItem?: (item: NowLockedItem | NowActiveItem | NowFutureItem) => void;
  onToggleComplete?: (item: NowLockedItem | NowActiveItem | NowFutureItem) => void;
}

export function NowList({
  lockedItems,
  activeItems,
  futureItems,
  onPressItem,
  onToggleComplete,
}: NowListProps) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.header}>NOW</Text>

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
    paddingBottom: 100, // Space for bottom bars
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
  },
});
