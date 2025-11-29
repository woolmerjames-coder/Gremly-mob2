/**
 * NowFocusRow - Divider-style row for Today focus items
 *
 * Replaces card-style layout with:
 * - Left accent bar (green for habits, blue for todos)
 * - Clean divider lines between items
 * - No background fill or card borders
 */

import React, { useMemo } from 'react';
import { Animated, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Box, Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import { pop } from '../../lib/today/motion';
import { useReducedMotion } from '../../design/animations';
import { triggerMedium } from '../../lib/haptics';
import type { NowLockedItem, NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';
import { NowTypeChip } from './NowTypeChip';

// Accent colors for item types
const ACCENT_COLORS = {
  habit: '#2E5540', // Moss Green
  todo: '#4A7FBF', // Soft blue matching Todo chip background tone
} as const;

// Divider color
const DIVIDER_COLOR = 'rgba(0, 0, 0, 0.08)';

type NowItem = NowLockedItem | NowActiveItem | NowFutureItem;

interface NowFocusRowProps {
  item: NowItem;
  isCompleted?: boolean;
  isFuture?: boolean;
  isLocked?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onPress?: () => void;
  onToggleComplete?: () => void;
}

export function NowFocusRow({
  item,
  isCompleted = false,
  isFuture = false,
  isLocked = false,
  isFirst = false,
  isLast = false,
  onPress,
  onToggleComplete,
}: NowFocusRowProps) {
  const tokens = useTokens();
  const reducedMotion = useReducedMotion();
  const scale = useMemo(() => new Animated.Value(1), []);

  const accentColor = ACCENT_COLORS[item.type];

  const handleToggleComplete = () => {
    void triggerMedium();
    if (!reducedMotion) {
      pop(scale, reducedMotion);
    }
    onToggleComplete?.();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      {/* Top divider - only show if not first item */}
      {!isFirst && <View style={styles.divider} />}

      <TouchableOpacity style={styles.rowContainer} onPress={onPress} activeOpacity={0.7}>
        {/* Left accent bar */}
        <View
          style={[
            styles.accentBar,
            { backgroundColor: accentColor },
            isLocked && styles.accentBarLocked,
          ]}
        />

        {/* Content area */}
        <Box style={styles.content}>
          {/* Text block */}
          <Box style={[styles.textContainer, isFuture && styles.futureText]}>
            <Text
              numberOfLines={1}
              style={[
                styles.itemText,
                { color: tokens.colors.text, fontFamily: tokens.typography.fontFamily.medium },
                isCompleted && styles.itemTextCompleted,
              ]}
            >
              {item.name}
            </Text>
            <Box style={styles.metaRow}>
              <NowTypeChip type={item.type} />
              {item.type === 'habit' && 'cadenceLabel' in item && item.cadenceLabel ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.cadenceLabel,
                    {
                      color: tokens.colors.subtle,
                      fontFamily: tokens.typography.fontFamily.regular,
                    },
                  ]}
                >
                  {item.cadenceLabel}
                </Text>
              ) : null}
            </Box>
          </Box>

          {/* Checkbox */}
          <TouchableOpacity onPress={handleToggleComplete} style={styles.checkboxContainer}>
            <View
              style={[
                styles.checkbox,
                { borderColor: isCompleted ? tokens.colors.mossGreen : tokens.colors.subtle },
                isCompleted && { backgroundColor: tokens.colors.mossGreen },
              ]}
            >
              {isCompleted && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </TouchableOpacity>
        </Box>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    paddingRight: 4,
    minHeight: 52, // Maintain comfortable touch target
    // No background - uses page background
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER_COLOR,
    marginLeft: 13, // Align with title text (accent bar 3px + marginRight 10px)
  },
  accentBar: {
    width: 3,
    borderRadius: 4,
    alignSelf: 'stretch',
    marginVertical: 2, // Slight inset from row edges
    marginRight: 10,
  },
  accentBarLocked: {
    // Slightly more prominent for locked items
    width: 3,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  futureText: {
    opacity: 0.6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4, // Gap between title and meta row
  },
  cadenceLabel: {
    marginLeft: 4,
    fontSize: 11,
    lineHeight: 13,
  },
  itemText: {
    fontSize: 14,
    lineHeight: 18,
  },
  itemTextCompleted: {
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

export default NowFocusRow;
