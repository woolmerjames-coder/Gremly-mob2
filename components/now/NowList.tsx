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

export function NowList() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.header}>NOW</Text>

      {/* Locked items section */}
      <NowLockedItemCard />

      {/* Active items section */}
      <NowActiveItemCard />

      {/* Future divider */}
      <NowFutureDivider />

      {/* Future items section */}
      <NowActiveItemCard />
      <NowActiveItemCard />
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
