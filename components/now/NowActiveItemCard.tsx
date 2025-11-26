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
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: t.radius[1], // 6px
    borderWidth: 2,
    borderColor: t.colors.subtle,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  typeChip: {
    marginBottom: t.spacing[1],
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
  status: {
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    marginTop: t.spacing[1],
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

  const getFallbackStatusText = () => {
    if ('weeklyStatus' in item && item.weeklyStatus) {
      const statusLabels = {
        week_complete: 'Week complete ✓',
        flexible: 'Flexible this week',
        on_track_today: 'On track',
        last_chance: 'Last chance today',
      } as const;
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

  const statusText = item.statusText ?? getFallbackStatusText();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity style={styles.container} onPress={onPress}>
        <Box style={styles.content}>
          <Box style={[styles.textContainer, future && styles.futureText]}>
            <Box style={styles.typeChip}>
              <NowTypeChip type={item.type} />
            </Box>
            <Text numberOfLines={1} style={styles.itemText}>
              {item.name}
            </Text>
            {statusText && <Text style={styles.status}>{statusText}</Text>}
          </Box>
          <TouchableOpacity onPress={handleToggleComplete} style={styles.checkboxContainer}>
            <Box style={styles.checkbox} />
          </TouchableOpacity>
        </Box>
      </TouchableOpacity>
    </Animated.View>
  );
}
