/**
 * NOW Active Item Card Component
 * Displays an active todo or habit in the NOW list
 */

import React, { useMemo } from 'react';
import { Animated, TouchableOpacity, View } from 'react-native';
import { Box, Text } from '../../ui';
import { makeStyles, useTokens } from '../../design/makeStyles';
import { pop } from '../../lib/today/motion';
import { useReducedMotion } from '../../design/animations';
import { triggerMedium } from '../../lib/haptics';
import type { NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';
import { NowTypeChip } from './NowTypeChip';

interface NowActiveItemCardProps {
  item: NowActiveItem | NowFutureItem;
  future?: boolean;
  isCompleted?: boolean;
  onPress?: () => void;
  onToggleComplete?: () => void;
}

/**
 * Compact Today card height: tuned so 7-8 items visible on mid-sized iPhone.
 * Optimized for ADHD/overwhelm - more items at a glance without feeling cramped.
 */
const useStyles = makeStyles((t) => ({
  container: {
    backgroundColor: t.colors.linenCream,
    borderRadius: t.radius[2],
    paddingVertical: 2,
    paddingHorizontal: t.spacing[4],
    marginBottom: 6,
    borderWidth: 1,
    borderColor: t.colors.border,
    ...t.elevation.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: t.radius[1],
    borderWidth: 2,
    borderColor: t.colors.subtle,
    backgroundColor: t.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxCompleted: {
    borderColor: t.colors.mossGreen,
    backgroundColor: t.colors.mossGreen,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  cadenceLabel: {
    marginLeft: t.spacing[1],
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    lineHeight: 13,
  },
  checkboxContainer: {
    marginLeft: t.spacing[2],
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  futureText: {
    opacity: 0.6,
  },
  itemText: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.text,
    lineHeight: t.typography.size.sm * t.typography.lineHeight.tight,
  },
  itemTextCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
}));

export function NowActiveItemCard({
  item,
  future = false,
  isCompleted = false,
  onPress,
  onToggleComplete,
}: NowActiveItemCardProps) {
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const scale = useMemo(() => new Animated.Value(1), []);

  const handleToggleComplete = () => {
    // Trigger haptic feedback
    void triggerMedium();

    // Play pop animation
    if (!reducedMotion) {
      pop(scale, reducedMotion);
    }
    onToggleComplete?.();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity style={styles.container} onPress={onPress}>
        <Box style={styles.content}>
          <Box style={[styles.textContainer, future && styles.futureText]}>
            <Text
              numberOfLines={1}
              style={[styles.itemText, isCompleted && styles.itemTextCompleted]}
            >
              {item.name}
            </Text>
            <Box style={styles.metaRow}>
              <NowTypeChip type={item.type} />
              {item.type === 'habit' && item.cadenceLabel ? (
                <Text numberOfLines={1} style={styles.cadenceLabel}>
                  {item.cadenceLabel}
                </Text>
              ) : null}
            </Box>
          </Box>
          <TouchableOpacity onPress={handleToggleComplete} style={styles.checkboxContainer}>
            <View style={[styles.checkbox, isCompleted && styles.checkboxCompleted]}>
              {isCompleted && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </TouchableOpacity>
        </Box>
      </TouchableOpacity>
    </Animated.View>
  );
}
