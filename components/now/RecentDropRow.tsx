/**
 * RecentDropRow - Animated row for recent drops with removal animation
 *
 * Uses the removal animation when "+ Today" is pressed:
 * - Row elevates slightly
 * - Row fades out
 * - Row height collapses
 * - Callback fires after animation
 */

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import { useRemoveRowAnimation } from './useRemoveRowAnimation';
import type { SweepCandidate } from '../../lib/today/sweepSelectors';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Row height for compact list items
const ROW_HEIGHT = 44;

// Divider color (matching NowFocusRow)
const DIVIDER_COLOR = 'rgba(0, 0, 0, 0.08)';

// Page background color
const PAGE_BACKGROUND = '#FDF8F3';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RecentDropRowProps {
  item: SweepCandidate;
  index: number;
  onPressItem: (item: SweepCandidate) => void;
  onAddToToday?: (item: SweepCandidate) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function RecentDropRow({ item, index, onPressItem, onAddToToday }: RecentDropRowProps) {
  const tokens = useTokens();

  const {
    isDone,
    isAnimating,
    animateAndRemove,
    handleLayout,
    rowAnimatedStyle,
    contentAnimatedStyle,
  } = useRemoveRowAnimation({
    initialHeight: ROW_HEIGHT + 1, // +1 for divider
    onRemove: () => onAddToToday?.(item),
  });

  // Don't render if animation is complete
  if (isDone) {
    return null;
  }

  const handleAddToTodayPress = () => {
    animateAndRemove();
  };

  return (
    <Animated.View
      style={[styles.rowWrapper, rowAnimatedStyle]}
      onLayout={handleLayout}
      testID={`recent-drop-animated-row-${index}`}
    >
      <Animated.View style={[styles.contentContainer, contentAnimatedStyle]}>
        {/* Divider */}
        <View style={styles.divider} testID={`recent-drops-divider-${index}`} />

        <Pressable
          style={({ pressed }) => [styles.row, pressed && !isAnimating && styles.rowPressed]}
          onPress={() => !isAnimating && onPressItem(item)}
          testID={`recent-drops-row-${index}`}
          disabled={isAnimating}
        >
          {/* Item title */}
          <Text
            numberOfLines={1}
            style={[
              styles.itemTitle,
              {
                color: tokens.colors.text,
                fontFamily: tokens.typography.fontFamily.regular,
              },
            ]}
          >
            {item.name}
          </Text>

          {/* Add to Today action */}
          <Pressable
            testID={`add-to-today-${item.id}`}
            style={({ pressed }) => [
              styles.addButton,
              pressed && !isAnimating && styles.addButtonPressed,
            ]}
            onPress={handleAddToTodayPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            disabled={isAnimating}
          >
            <Text
              style={[
                styles.addButtonText,
                {
                  color: tokens.colors.mossGreen,
                  fontFamily: tokens.typography.fontFamily.medium,
                },
              ]}
            >
              + Today
            </Text>
          </Pressable>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  rowWrapper: {
    backgroundColor: PAGE_BACKGROUND,
  },
  contentContainer: {
    backgroundColor: PAGE_BACKGROUND,
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER_COLOR,
    marginLeft: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    paddingLeft: 16,
    paddingRight: 16,
  },
  rowPressed: {
    opacity: 0.7,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  addButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginLeft: 8,
  },
  addButtonPressed: {
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: 12,
    lineHeight: 14,
  },
});

export default RecentDropRow;
