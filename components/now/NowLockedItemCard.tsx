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

interface NowLockedItemCardProps {
  item: NowLockedItem;
  onPress?: () => void;
  onToggleComplete?: () => void;
}

const useStyles = makeStyles((t) => ({
  container: {
    backgroundColor: t.colors.sageMist, // Sage Mist for locked/priority items
    borderLeftWidth: 4,
    borderLeftColor: t.colors.mossGreen,
    borderRadius: t.radius[2], // 12px
    marginBottom: t.spacing[2],
    ...t.elevation.sm,
  },
  content: {
    flexDirection: 'row',
    padding: t.spacing[3],
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: t.spacing[3],
  },
  icon: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  itemText: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.text,
    marginBottom: t.spacing[1],
  },
  tag: {
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.mossGreen,
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

  const getStatusText = () => {
    if (item.type === 'habit' && item.cadence) {
      return `${item.cadence} habit`;
    }
    if (item.dueAt) {
      const date = new Date(item.dueAt);
      return `Due ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
    return null;
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity style={styles.container} onPress={onPress}>
        <Box style={styles.content}>
          <TouchableOpacity onPress={handleToggleComplete} style={styles.iconContainer}>
            <Text style={styles.icon}>⚡</Text>
          </TouchableOpacity>
          <Box style={styles.textContainer}>
            <Text style={styles.itemText}>{item.name}</Text>
            {getStatusText() && <Text style={styles.tag}>{getStatusText()}</Text>}
          </Box>
        </Box>
      </TouchableOpacity>
    </Animated.View>
  );
}
