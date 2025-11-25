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

interface NowActiveItemCardProps {
  item: NowActiveItem | NowFutureItem;
  future?: boolean;
  onPress?: () => void;
  onToggleComplete?: () => void;
}

const useStyles = makeStyles((t) => ({
  container: {
    backgroundColor: t.colors.linenCream, // Linen Cream for active items
    borderRadius: t.radius[2], // 12px
    marginBottom: t.spacing[2],
    borderWidth: 1,
    borderColor: t.colors.border,
    ...t.elevation.sm,
  },
  content: {
    flexDirection: 'row',
    padding: t.spacing[3],
    alignItems: 'center',
  },
  checkboxContainer: {
    marginRight: t.spacing[3],
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: t.radius[1], // 6px
    borderWidth: 2,
    borderColor: t.colors.subtle,
  },
  textContainer: {
    flex: 1,
  },
  futureText: {
    opacity: 0.5,
  },
  itemText: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.text,
    marginBottom: t.spacing[1],
  },
  status: {
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    fontStyle: 'italic',
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

  const getStatusText = () => {
    if ('weeklyStatus' in item && item.weeklyStatus) {
      const statusLabels = {
        week_complete: 'Week complete ✓',
        flexible: 'Flexible this week',
        on_track_today: 'On track',
        last_chance: 'Last chance today',
      };
      return statusLabels[item.weeklyStatus];
    }
    if ('dueTime' in item && item.dueTime) {
      return item.dueTime;
    }
    if ('dueAt' in item && item.dueAt) {
      return new Date(item.dueAt).toLocaleDateString();
    }
    return null;
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity style={styles.container} onPress={onPress}>
        <Box style={styles.content}>
          <TouchableOpacity onPress={handleToggleComplete} style={styles.checkboxContainer}>
            <Box style={styles.checkbox} />
          </TouchableOpacity>
          <Box style={[styles.textContainer, future && styles.futureText]}>
            <Text style={styles.itemText}>{item.name}</Text>
            {getStatusText() && <Text style={styles.status}>{getStatusText()}</Text>}
          </Box>
        </Box>
      </TouchableOpacity>
    </Animated.View>
  );
}
