/**
 * SweepIntroStatsCard - Branded card showing activity since last sweep
 *
 * Shows completed and captured counts with a golden accent bar,
 * with tap-to-expand functionality to see individual item names.
 */

import React, { useState } from 'react';
import { View, StyleSheet, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Text } from '../../ui';
import { Icon } from '../../design-system/Icon';
import { BRAND } from '../../design/brand';
import { type SweepIntroStats } from '../../lib/sweep/introStats';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SweepIntroStatsCardProps {
  stats: SweepIntroStats | null;
  isLoading?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SweepIntroStatsCard({ stats, isLoading }: SweepIntroStatsCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Show loading skeleton while fetching
  if (isLoading || !stats) {
    return (
      <View style={styles.container}>
        {/* Golden accent bar on left */}
        <View style={styles.accentBar} />
        <View style={styles.content}>
          <View style={styles.statRow}>
            <View style={styles.skeletonIcon} />
            <View style={styles.skeletonText} />
          </View>
          <View style={[styles.statRow, styles.statRowSpaced]}>
            <View style={styles.skeletonIcon} />
            <View style={styles.skeletonText} />
          </View>
        </View>
      </View>
    );
  }

  // Calculate counts
  const completedCount = stats.completed.todos.length + stats.completed.habits.length;
  const caughtCount =
    stats.dropped.todos.length + stats.dropped.habits.length + stats.dropped.notes.length;
  const allCompletedItems = [...stats.completed.todos, ...stats.completed.habits];
  const allCapturedItems = [
    ...stats.dropped.todos,
    ...stats.dropped.habits,
    ...stats.dropped.notes,
  ];

  // Return null if nothing to show (after loading)
  if (completedCount === 0 && caughtCount === 0) {
    return null;
  }

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <Pressable style={styles.container} onPress={handleToggle}>
      {/* Golden accent bar on left */}
      <View style={styles.accentBar} />

      <View style={styles.content}>
        {/* Completed row */}
        {completedCount > 0 && (
          <View style={styles.statRow}>
            <Icon name="Check" size="xs" color={BRAND.colors.mossGreen} strokeWidth={2.5} />
            <Text style={styles.statText}>
              <Text style={styles.statNumber}>{completedCount}</Text>
              <Text style={styles.statLabel}>
                {' '}
                {completedCount === 1 ? 'todo' : 'todos'} checked off
              </Text>
            </Text>
          </View>
        )}

        {/* Caught row */}
        {caughtCount > 0 && (
          <View style={[styles.statRow, completedCount > 0 && styles.statRowSpaced]}>
            <Icon name="Plus" size="xs" color="#E0C47A" strokeWidth={2.5} />
            <Text style={styles.statText}>
              <Text style={styles.statNumber}>{caughtCount}</Text>
              <Text style={styles.statLabel}> {caughtCount === 1 ? 'item' : 'items'} caught</Text>
            </Text>
          </View>
        )}

        {/* Expanded lists */}
        {expanded && (
          <View style={styles.expandedContainer}>
            {allCompletedItems.length > 0 && (
              <View style={styles.itemSection}>
                {allCompletedItems.slice(0, 8).map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={[styles.itemDot, styles.itemDotGreen]} />
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                ))}
                {allCompletedItems.length > 8 && (
                  <Text style={styles.moreText}>+{allCompletedItems.length - 8} more</Text>
                )}
              </View>
            )}

            {allCapturedItems.length > 0 && (
              <View
                style={[
                  styles.itemSection,
                  allCompletedItems.length > 0 && styles.itemSectionSpaced,
                ]}
              >
                {allCapturedItems.slice(0, 8).map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={[styles.itemDot, styles.itemDotGold]} />
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                ))}
                {allCapturedItems.length > 8 && (
                  <Text style={styles.moreText}>+{allCapturedItems.length - 8} more</Text>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 72,
    backgroundColor: 'rgba(191, 216, 192, 0.35)', // Sage mist tint
    borderRadius: BRAND.radius.lg,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  accentBar: {
    width: 4,
    backgroundColor: '#E0C47A', // Golden pear
  },
  content: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statRowSpaced: {
    marginTop: 10,
  },
  statText: {
    marginLeft: 10,
    flexDirection: 'row',
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  statLabel: {
    fontSize: 16,
    fontWeight: '400',
    color: BRAND.colors.charcoalInk,
  },
  expandedContainer: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(46, 85, 64, 0.15)',
  },
  itemSection: {},
  itemSectionSpaced: {
    marginTop: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  itemDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 10,
  },
  itemDotGreen: {
    backgroundColor: BRAND.colors.mossGreen,
  },
  itemDotGold: {
    backgroundColor: '#E0C47A',
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
  },
  moreText: {
    fontSize: 13,
    color: BRAND.colors.inkSubtle,
    marginLeft: 16,
    marginTop: 2,
  },
  // Loading skeleton styles
  skeletonIcon: {
    width: 14,
    height: 14,
    borderRadius: 2,
    backgroundColor: 'rgba(46, 85, 64, 0.15)',
  },
  skeletonText: {
    marginLeft: 10,
    width: 140,
    height: 16,
    borderRadius: 4,
    backgroundColor: 'rgba(46, 85, 64, 0.12)',
  },
});
