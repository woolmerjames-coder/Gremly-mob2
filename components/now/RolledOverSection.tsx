/**
 * RolledOverSection - Compressed rolled over list for Today/Now page
 *
 * Displays rolled over (overdue) todos in a compact, lighter format than main Today cards.
 * Each row is tappable to open the item details.
 * Uses animated OverdueRow component for completion animation matching Today's Focus.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ViewStyle,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import { OverdueRow } from './OverdueRow';
import type { SweepCandidate } from '../../lib/today/sweepSelectors';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Maximum items to show before "Show more"
const MAX_VISIBLE = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RolledOverSectionProps {
  /** List of rolled over sweep candidates */
  items: SweepCandidate[];
  /** Callback when an item row is pressed */
  onPressItem: (item: SweepCandidate) => void;
  /** Callback when an item's checkbox is toggled */
  onToggleComplete?: (item: SweepCandidate) => void;
  /** Optional container style */
  style?: ViewStyle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function RolledOverSection({
  items,
  onPressItem,
  onToggleComplete,
  style,
}: RolledOverSectionProps) {
  const tokens = useTokens();
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const toggleCollapsed = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => !prev);
  }, []);

  const handleShowMore = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAll(true);
  }, []);

  // Don't render if no items
  if (items.length === 0) {
    return null;
  }

  const hasMore = items.length > MAX_VISIBLE;
  const visibleItems = showAll ? items : items.slice(0, MAX_VISIBLE);
  const hiddenCount = items.length - MAX_VISIBLE;

  return (
    <View style={[styles.container, style]}>
      {/* Section header - pressable to toggle collapse */}
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        onPress={toggleCollapsed}
        testID="rolled-over-section-header"
      >
        <Text
          style={[
            styles.headerLabel,
            { color: tokens.colors.text, fontFamily: tokens.typography.fontFamily.medium },
          ]}
        >
          Rolled Over
        </Text>
        <Text
          style={[
            styles.headerCount,
            { color: tokens.colors.subtle, fontFamily: tokens.typography.fontFamily.regular },
          ]}
        >
          · {items.length}
        </Text>
        {/* Chevron indicator */}
        <Text style={[styles.chevron, { color: tokens.colors.subtle }]}>
          {collapsed ? '>' : 'v'}
        </Text>
      </Pressable>

      {/* Item rows - only rendered when not collapsed */}
      {!collapsed && (
        <>
          <View style={styles.list}>
            {visibleItems.map((item, index) => (
              <OverdueRow
                key={item.id}
                item={item}
                index={index}
                onPressItem={onPressItem}
                onToggleComplete={onToggleComplete}
              />
            ))}
          </View>

          {/* Show more button */}
          {hasMore && !showAll && (
            <Pressable
              style={({ pressed }) => [styles.showMoreButton, pressed && styles.showMorePressed]}
              onPress={handleShowMore}
              testID="rolled-over-show-more"
            >
              <Text
                style={[
                  styles.showMoreText,
                  { color: tokens.colors.subtle, fontFamily: tokens.typography.fontFamily.regular },
                ]}
              >
                Show {hiddenCount} more rolled over
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    // No card background - lighter than main cards
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerPressed: {
    opacity: 0.7,
  },
  headerLabel: {
    fontSize: 13,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerCount: {
    fontSize: 13,
    lineHeight: 16,
    marginLeft: 4,
  },
  chevron: {
    fontSize: 16,
    lineHeight: 20,
    marginLeft: 'auto',
  },
  list: {
    // Container for rows
  },
  showMoreButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  showMorePressed: {
    opacity: 0.6,
  },
  showMoreText: {
    fontSize: 13,
    lineHeight: 16,
  },
});

export default RolledOverSection;
