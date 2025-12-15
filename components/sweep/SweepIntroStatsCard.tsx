/**
 * SweepIntroStatsCard - Hero number stats that expand to show item details
 *
 * Shows big prominent numbers for completed and captured items,
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
  stats: SweepIntroStats;
  isLoading?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SweepIntroStatsCard({ stats, isLoading }: SweepIntroStatsCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Calculate totals
  const totalCompleted = stats.completed.todos.length + stats.completed.habits.length;
  const totalCaptured =
    stats.dropped.todos.length + stats.dropped.habits.length + stats.dropped.notes.length;
  const allCompletedItems = [...stats.completed.todos, ...stats.completed.habits];
  const allCapturedItems = [
    ...stats.dropped.todos,
    ...stats.dropped.habits,
    ...stats.dropped.notes,
  ];

  // Return null if nothing to show
  if (!isLoading && totalCompleted === 0 && totalCaptured === 0) {
    return null;
  }

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <Pressable style={styles.container} onPress={handleToggle}>
      {/* Stats row */}
      <View style={styles.statsRow}>
        {totalCompleted > 0 && (
          <View style={styles.statColumn}>
            <Text style={styles.statNumber}>{totalCompleted}</Text>
            <Text style={styles.statLabel}>checked off</Text>
          </View>
        )}

        {totalCompleted > 0 && totalCaptured > 0 && <View style={styles.verticalDivider} />}

        {totalCaptured > 0 && (
          <View style={styles.statColumn}>
            <Text style={styles.statNumber}>{totalCaptured}</Text>
            <Text style={styles.statLabel}>caught</Text>
          </View>
        )}
      </View>

      {/* Chevron indicator */}
      <View style={styles.chevronRow}>
        <Icon
          name={expanded ? 'ChevronUp' : 'ChevronDown'}
          size="sm"
          color={BRAND.colors.inkSubtle}
          strokeWidth={2}
        />
      </View>

      {/* Expanded item lists */}
      {expanded && (
        <View style={styles.expandedContainer}>
          {allCompletedItems.length > 0 && (
            <View style={styles.itemSection}>
              <Text style={styles.sectionLabel}>Checked off</Text>
              {allCompletedItems.slice(0, 10).map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={[styles.itemDot, styles.itemDotCompleted]} />
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
              ))}
              {allCompletedItems.length > 10 && (
                <Text style={styles.moreText}>+{allCompletedItems.length - 10} more</Text>
              )}
            </View>
          )}

          {allCapturedItems.length > 0 && (
            <View style={styles.itemSection}>
              <Text style={styles.sectionLabel}>Caught</Text>
              {allCapturedItems.slice(0, 10).map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={[styles.itemDot, styles.itemDotCaptured]} />
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
              ))}
              {allCapturedItems.length > 10 && (
                <Text style={styles.moreText}>+{allCapturedItems.length - 10} more</Text>
              )}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 24,
    marginTop: 28,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.lg,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    paddingVertical: 20,
    paddingHorizontal: 16,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 36,
  },
  statColumn: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 40,
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
    lineHeight: 48,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  verticalDivider: {
    width: 1,
    height: 44,
    backgroundColor: BRAND.colors.borderSubtle,
  },
  chevronRow: {
    alignItems: 'center',
    marginTop: 12,
  },
  expandedContainer: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
    paddingTop: 16,
  },
  itemSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  itemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  itemDotCompleted: {
    backgroundColor: BRAND.colors.mossGreen,
  },
  itemDotCaptured: {
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
    fontStyle: 'italic',
    marginTop: 4,
    marginLeft: 20,
  },
});
