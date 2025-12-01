/**
 * NowFocusRow - Divider-style row for Today focus items
 *
 * Layout:
 * - Left accent bar (green for habits, blue for todos) for ALL items
 * - Title text with optional "◇ Locked in" indicator inline
 * - Clean divider lines between items
 * - No background fill or card borders
 */

import React, { useMemo } from 'react';
import { Animated, TouchableOpacity, View, StyleSheet, Image } from 'react-native';
import { Box, Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import { pop } from '../../lib/today/motion';
import { useReducedMotion } from '../../design/animations';
import { triggerMedium } from '../../lib/haptics';
import type { NowLockedItem, NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';
import { NowTypeChip } from './NowTypeChip';

// Lock-in diamond icon
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LOCKIN_ICON = require('../../assets/lockin icon.png');

// Accent colors for item types
const ACCENT_COLORS = {
  habit: '#2E5540', // Moss Green
  todo: '#4A7FBF', // Soft blue matching Todo chip background tone
} as const;

// Brand green for lock-in elements
const BRAND_GREEN = '#2E5540';

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
        {/* Left accent bar - always shown for all items */}
        <View style={styles.leftIndicatorContainer}>
          <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        </View>

        {/* Content area */}
        <Box style={styles.content}>
          {/* Text block */}
          <Box style={[styles.textContainer, isFuture && styles.futureText]}>
            {/* Title row with optional locked-in indicator */}
            <View style={styles.titleRow}>
              <Text
                numberOfLines={1}
                style={[
                  styles.itemText,
                  { color: tokens.colors.text, fontFamily: tokens.typography.fontFamily.medium },
                  isCompleted && styles.itemTextCompleted,
                  isLocked && styles.itemTextWithLock, // Limit width when locked
                ]}
              >
                {item.name}
              </Text>
              {isLocked && (
                <View style={styles.lockedInIndicator}>
                  <Image source={LOCKIN_ICON} style={styles.lockinIcon} resizeMode="contain" />
                  <Text style={styles.lockedInText}>Locked in</Text>
                </View>
              )}
            </View>
            {/* Subtitle row */}
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
    paddingTop: 8,
    paddingBottom: 6,
    paddingRight: 4,
    minHeight: 48,
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER_COLOR,
    marginLeft: 20,
  },
  leftIndicatorContainer: {
    width: 20,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  accentBar: {
    width: 3,
    height: 32,
    borderRadius: 4,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
  },
  itemTextWithLock: {
    maxWidth: '60%', // Leave room for locked-in indicator
  },
  itemTextCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  lockedInIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    flexShrink: 0,
  },
  lockinIcon: {
    width: 14,
    height: 14,
  },
  lockedInText: {
    fontSize: 11,
    lineHeight: 13,
    color: BRAND_GREEN,
    marginLeft: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  cadenceLabel: {
    marginLeft: 4,
    fontSize: 11,
    lineHeight: 13,
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
