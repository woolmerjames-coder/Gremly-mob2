/**
 * NOW Active Item Card Component
 * Displays an active todo or habit in the NOW list
 */

import React, { useMemo } from 'react';
import { Animated, TouchableOpacity } from 'react-native';
import { Box, Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';
import { pop } from '../../lib/today/motion';
import { useReducedMotion } from '../../design/animations';
import type { NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';
import { NowTypeChip } from './NowTypeChip';

interface NowActiveItemCardProps {
  item: NowActiveItem | NowFutureItem;
  future?: boolean;
  onPress?: () => void;
  onToggleComplete?: () => void;
}

const useStyles = makeStyles((t) => ({
  container: {
    backgroundColor: t.colors.linenCream,
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
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: t.radius[1],
    borderWidth: 2,
    borderColor: t.colors.subtle,
    backgroundColor: t.colors.surface,
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
  checkboxContainer: {
    marginLeft: t.spacing[3],
    justifyContent: 'center',
    alignItems: 'center',
  },
  futureText: {
    opacity: 0.6,
  },
  itemText: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.text,
  },
}));

export function NowActiveItemCard({
  item,
  future = false,
  onPress,
  onToggleComplete,
}: NowActiveItemCardProps) {
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const scale = useMemo(() => new Animated.Value(1), []);

  const handleToggleComplete = () => {
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
            <Text numberOfLines={1} style={styles.itemText}>
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
            <Box style={styles.checkbox} />
          </TouchableOpacity>
        </Box>
      </TouchableOpacity>
    </Animated.View>
  );
}
