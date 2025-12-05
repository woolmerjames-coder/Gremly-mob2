/**
 * OverdueRow - Animated row for overdue items with completion animation
 *
 * Uses the same completion animation as Today's Focus rows:
 * - Checkbox fill with scale pop
 * - Strikethrough text
 * - Undo window
 * - Swipe-out to reveal message
 * - Row collapse
 */

import React from 'react';
import { View, Pressable, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import { useCompletionAnimation } from './useCompletionAnimation';
import type { SweepCandidate } from '../../lib/today/sweepSelectors';

// Gremly face icon for completion messages
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_FACE = require('../../assets/buttonforHP.png');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Overdue accent color - muted red/coral to indicate attention needed
const OVERDUE_ACCENT = '#C45C4A';

// Brand green for completion message
const BRAND_GREEN = '#2E5540';

// Row height for compact list items
const ROW_HEIGHT = 44;

// Divider color (matching NowFocusRow)
const DIVIDER_COLOR = 'rgba(0, 0, 0, 0.08)';

// Page background color
const PAGE_BACKGROUND = '#FDF8F3';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OverdueRowProps {
  item: SweepCandidate;
  index: number;
  onPressItem: (item: SweepCandidate) => void;
  onToggleComplete?: (item: SweepCandidate) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function OverdueRow({ item, index, onPressItem, onToggleComplete }: OverdueRowProps) {
  const tokens = useTokens();

  const {
    localChecked,
    showStrikethrough,
    completionMessage,
    isDone,
    handleToggleComplete,
    handleLayout,
    rowAnimatedStyle,
    cardAnimatedStyle,
    messageAnimatedStyle,
    checkboxAnimatedStyle,
  } = useCompletionAnimation({
    initialHeight: ROW_HEIGHT,
    onComplete: () => onToggleComplete?.(item),
  });

  // Don't render if animation is complete
  if (isDone) {
    return null;
  }

  return (
    <Animated.View style={[styles.rowWrapper, rowAnimatedStyle]} onLayout={handleLayout}>
      {/* Message revealed underneath - positioned absolutely behind the card */}
      <Animated.View style={[styles.messageContainer, messageAnimatedStyle]}>
        <Image source={GREMLY_FACE} style={styles.gremlyFace} resizeMode="contain" />
        <Text style={styles.messageText}>{completionMessage}</Text>
      </Animated.View>

      {/* Main card content - slides out to the right */}
      <Animated.View style={[styles.cardContainer, cardAnimatedStyle]}>
        {/* Divider */}
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
              showStrikethrough && styles.itemTitleCompleted,
            ]}
          >
            {item.name}
          </Text>

          {/* Checkbox */}
          <TouchableOpacity
            onPress={handleToggleComplete}
            style={styles.checkboxContainer}
            activeOpacity={0.7}
            testID={`overdue-checkbox-${index}`}
          >
            <Animated.View
              style={[
                styles.checkbox,
                { borderColor: localChecked ? tokens.colors.mossGreen : tokens.colors.subtle },
                localChecked && { backgroundColor: tokens.colors.mossGreen },
                checkboxAnimatedStyle,
              ]}
            >
              {localChecked && <Text style={styles.checkmark}>✓</Text>}
            </Animated.View>
          </TouchableOpacity>
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
    position: 'relative',
    backgroundColor: PAGE_BACKGROUND,
    overflow: 'hidden',
  },
  cardContainer: {
    backgroundColor: PAGE_BACKGROUND,
    zIndex: 1,
  },
  messageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 0,
    backgroundColor: PAGE_BACKGROUND,
  },
  gremlyFace: {
    width: 26,
    height: 26,
    marginRight: 8,
  },
  messageText: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND_GREEN,
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
  itemTitleCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
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
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
});

export default OverdueRow;
