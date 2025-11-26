/**
 * NOW Locked Item Card Component
 * Displays a locked/priority item in the NOW list
 */

import React, { useMemo } from 'react';
import { Animated, TouchableOpacity } from 'react-native';
import { Box, Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';
import { pop } from '../../lib/today/motion';
import { useReducedMotion } from '../../design/animations';
import type { NowLockedItem } from '../../lib/now/nowTypes';
import { NowTypeChip } from './NowTypeChip';

interface NowLockedItemCardProps {
  item: NowLockedItem;
  onPress?: () => void;
  onToggleComplete?: () => void;
}

const useStyles = makeStyles((t) => ({
  container: {
    backgroundColor: t.colors.linenCream,
    borderLeftWidth: 3,
    borderLeftColor: t.colors.mossGreen,
    borderRadius: t.radius[2],
    paddingVertical: t.spacing[3],
    paddingHorizontal: t.spacing[4],
    marginBottom: t.spacing[3],
    borderWidth: 1,
    borderColor: t.colors.border,
    minHeight: 72,
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
    width: 20,
    height: 20,
    borderRadius: t.radius[1],
    borderWidth: 2,
    borderColor: t.colors.mossGreen,
    backgroundColor: t.colors.sageMist,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  typeChip: {
    marginBottom: t.spacing[1],
  },
  itemText: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.text,
  },
  status: {
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    marginTop: t.spacing[1],
  },
}));

export function NowLockedItemCard({ item, onPress, onToggleComplete }: NowLockedItemCardProps) {
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const scale = useMemo(() => new Animated.Value(1), []);

  const handleToggleComplete = () => {
    if (!reducedMotion) {
      pop(scale, reducedMotion);
    }
    onToggleComplete?.();
  };

  const getFallbackStatusText = () => {
    if (item.type === 'habit' && item.cadence) {
      return `${item.cadence} habit`;
    }
    if (item.dueAt) {
      const date = new Date(item.dueAt);
      return `Due ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
    return null;
  };

  const statusText = item.statusText ?? getFallbackStatusText();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity style={styles.container} onPress={onPress}>
        <Box style={styles.content}>
          <Box style={styles.textContainer}>
            <Box style={styles.typeChip}>
              <NowTypeChip type={item.type} />
            </Box>
            <Text numberOfLines={1} style={styles.itemText}>
              {item.name}
            </Text>
            {statusText && <Text style={styles.status}>{statusText}</Text>}
          </Box>
          <TouchableOpacity onPress={handleToggleComplete} style={styles.iconContainer}>
            <Box style={styles.checkbox} />
          </TouchableOpacity>
        </Box>
      </TouchableOpacity>
    </Animated.View>
  );
}
