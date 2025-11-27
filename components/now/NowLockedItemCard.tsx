/**
 * NOW Locked Item Card Component
 * Displays a locked/priority item in the NOW list
 */

import React, { useMemo } from 'react';
import { Animated, TouchableOpacity, View } from 'react-native';
import { Box, Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';
import { pop } from '../../lib/today/motion';
import { useReducedMotion } from '../../design/animations';
import { triggerMedium } from '../../lib/haptics';
import type { NowLockedItem } from '../../lib/now/nowTypes';
import { NowTypeChip } from './NowTypeChip';

interface NowLockedItemCardProps {
  item: NowLockedItem;
  isCompleted?: boolean;
  onPress?: () => void;
  onToggleComplete?: () => void;
}

const useStyles = makeStyles((t) => ({
  container: {
    backgroundColor: t.colors.linenCream,
    borderLeftWidth: 3,
    borderLeftColor: t.colors.mossGreen,
    borderRadius: t.radius[2],
    paddingVertical: t.spacing[2],
    paddingHorizontal: t.spacing[4],
    marginBottom: t.spacing[3],
    borderWidth: 1,
    borderColor: t.colors.border,
    ...t.elevation.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconContainer: {
    marginLeft: t.spacing[3],
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: t.radius[1],
    borderWidth: 2,
    borderColor: t.colors.mossGreen,
    backgroundColor: t.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxCompleted: {
    backgroundColor: t.colors.mossGreen,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: t.spacing[1],
  },
  cadenceLabel: {
    marginLeft: t.spacing[2],
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
  },
  itemText: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.text,
  },
  itemTextCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
}));

export function NowLockedItemCard({
  item,
  isCompleted = false,
  onPress,
  onToggleComplete,
}: NowLockedItemCardProps) {
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
          <Box style={styles.textContainer}>
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
          <TouchableOpacity onPress={handleToggleComplete} style={styles.iconContainer}>
            <View style={[styles.checkbox, isCompleted && styles.checkboxCompleted]}>
              {isCompleted && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </TouchableOpacity>
        </Box>
      </TouchableOpacity>
    </Animated.View>
  );
}
