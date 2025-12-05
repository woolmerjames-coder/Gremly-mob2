/**
 * OverdueSection - Compressed overdue list for Today/Now page
 *
 * Displays overdue todos in a compact, lighter format than main Today cards.
 * Each row is tappable to open the item details.
 */

import React from 'react';
import { View, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import type { SweepCandidate } from '../../lib/today/sweepSelectors';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OverdueSectionProps {
  /** List of overdue sweep candidates */
  items: SweepCandidate[];
  /** Callback when an item row is pressed */
  onPressItem: (item: SweepCandidate) => void;
  /** Optional container style */
  style?: ViewStyle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Overdue accent color - muted red/coral to indicate attention needed
const OVERDUE_ACCENT = '#C45C4A';

// Row height for compact list items
const ROW_HEIGHT = 44;

// Divider color (matching NowFocusRow)
const DIVIDER_COLOR = 'rgba(0, 0, 0, 0.08)';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function OverdueSection({ items, onPressItem, style }: OverdueSectionProps) {
  const tokens = useTokens();

  // Don't render if no items
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      {/* Section header */}
      <View style={styles.header}>
        <Text
          style={[
            styles.headerLabel,
            { color: tokens.colors.text, fontFamily: tokens.typography.fontFamily.medium },
          ]}
        >
          Overdue
        </Text>
        <Text
          style={[
            styles.headerCount,
            { color: tokens.colors.subtle, fontFamily: tokens.typography.fontFamily.regular },
          ]}
        >
          · {items.length}
        </Text>
      </View>

      {/* Item rows */}
      <View style={styles.list}>
        {items.map((item, index) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.row,
              index > 0 && styles.rowWithDivider,
              pressed && styles.rowPressed,
            ]}
            onPress={() => onPressItem(item)}
          >
            {/* Left accent bar */}
            <View style={styles.accentContainer}>
              <View style={[styles.accentBar, { backgroundColor: OVERDUE_ACCENT }]} />
            </View>

            {/* Item title */}
            <Text
              numberOfLines={1}
              style={[
                styles.itemTitle,
                { color: tokens.colors.text, fontFamily: tokens.typography.fontFamily.regular },
              ]}
            >
              {item.name}
            </Text>
          </Pressable>
        ))}
      </View>
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
  list: {
    // Container for rows
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    paddingRight: 16,
  },
  rowWithDivider: {
    borderTopWidth: 1,
    borderTopColor: DIVIDER_COLOR,
    marginLeft: 16,
  },
  rowPressed: {
    opacity: 0.7,
  },
  accentContainer: {
    width: 20,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  accentBar: {
    width: 3,
    height: 24,
    borderRadius: 2,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
});

export default OverdueSection;
