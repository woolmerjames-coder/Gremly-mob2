/**
 * RecentDropsSection - Compressed recent drops list for Today/Now page
 *
 * Displays recently captured items that need sorting/triage.
 * Each row is tappable to open item details, with an "Add to Today" action.
 * Supports collapsible "Show more" for lists longer than maxVisible.
 * Uses animated RecentDropRow for smooth removal animation.
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
import { RecentDropRow } from './RecentDropRow';
import type { SweepCandidate } from '../../lib/today/sweepSelectors';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RecentDropsSectionProps {
  /** List of recent drop candidates */
  items: SweepCandidate[];
  /** Callback when an item row is pressed */
  onPressItem: (item: SweepCandidate) => void;
  /** Callback when "Add to Today" is pressed for an item */
  onAddToToday: (item: SweepCandidate) => void;
  /** Maximum items to show before "Show more" (default 5) */
  maxVisible?: number;
  /** Optional container style */
  style?: ViewStyle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Default max visible items before "Show more"
const DEFAULT_MAX_VISIBLE = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function RecentDropsSection({
  items,
  onPressItem,
  onAddToToday,
  maxVisible = DEFAULT_MAX_VISIBLE,
  style,
}: RecentDropsSectionProps) {
  const tokens = useTokens();
  const [showAll, setShowAll] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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

  const hasMore = items.length > maxVisible;
  const visibleItems = showAll ? items : items.slice(0, maxVisible);
  const hiddenCount = items.length - maxVisible;

  return (
    <View style={[styles.container, style]}>
      {/* Section header - pressable to toggle collapse */}
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        onPress={toggleCollapsed}
        testID="recent-drops-section-header"
      >
        <Text
          style={[
            styles.headerLabel,
            { color: tokens.colors.text, fontFamily: tokens.typography.fontFamily.medium },
          ]}
        >
          Recent Drops
        </Text>
        <Text
          style={[
            styles.headerCount,
            { color: tokens.colors.subtle, fontFamily: tokens.typography.fontFamily.regular },
          ]}
        >
          ({items.length})
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
              <RecentDropRow
                key={item.id}
                item={item}
                index={index}
                onPressItem={onPressItem}
                onAddToToday={onAddToToday}
              />
            ))}
          </View>

          {/* Show more button */}
          {hasMore && !showAll && (
            <Pressable
              style={({ pressed }) => [styles.showMoreButton, pressed && styles.showMorePressed]}
              onPress={handleShowMore}
            >
              <Text
                style={[
                  styles.showMoreText,
                  { color: tokens.colors.subtle, fontFamily: tokens.typography.fontFamily.regular },
                ]}
              >
                Show {hiddenCount} more
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

export default RecentDropsSection;
