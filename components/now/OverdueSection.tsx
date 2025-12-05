/**
 * OverdueSection - Compressed overdue list for Today/Now page
 *
 * Displays overdue todos in a compact, lighter format than main Today cards.
 * Each row is tappable to open the item details.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import type { SweepCandidate } from '../../lib/today/sweepSelectors';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OverdueSectionProps {
  /** List of overdue sweep candidates */
  items: SweepCandidate[];
  /** Callback when an item row is pressed */
  onPressItem: (item: SweepCandidate) => void;
  /** Callback when an item's checkbox is toggled */
  onToggleComplete?: (item: SweepCandidate) => void;
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

export function OverdueSection({
  items,
  onPressItem,
  onToggleComplete,
  style,
}: OverdueSectionProps) {
  const tokens = useTokens();
  const [collapsed, setCollapsed] = useState(false);

  const toggleCollapsed = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => !prev);
  };

  // Don't render if no items
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      {/* Section header - pressable to toggle collapse */}
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        onPress={toggleCollapsed}
        testID="overdue-section-header"
      >
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
        {/* Chevron indicator */}
        <Text
          style={[
            styles.chevron,
            { color: tokens.colors.subtle, fontFamily: tokens.typography.fontFamily.regular },
          ]}
        >
          {collapsed ? '▸' : '▾'}
        </Text>
      </Pressable>

      {/* Item rows - only rendered when not collapsed */}
      {!collapsed && (
        <View style={styles.list}>
          {items.map((item, index) => (
            <React.Fragment key={item.id}>
              {/* Divider between header and first row, or between rows */}
              <View style={styles.divider} />

              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onPressItem(item)}
                testID={`overdue-row-${index}`}
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

                {/* Checkbox */}
                <TouchableOpacity
                  onPress={() => onToggleComplete?.(item)}
                  style={styles.checkboxContainer}
                  activeOpacity={0.7}
                  testID={`overdue-checkbox-${index}`}
                >
                  <View style={[styles.checkbox, { borderColor: tokens.colors.subtle }]} />
                </TouchableOpacity>
              </Pressable>
            </React.Fragment>
          ))}
        </View>
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
    fontSize: 12,
    lineHeight: 16,
    marginLeft: 'auto',
  },
  list: {
    // Container for rows
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER_COLOR,
    marginLeft: 16, // Aligns with content, not accent bar
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    paddingRight: 16,
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
  checkboxContainer: {
    marginLeft: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default OverdueSection;
