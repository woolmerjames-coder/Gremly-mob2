/**
 * NOW Active Item Card Component
 * Displays an active todo or habit in the NOW list
 */

import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Box, Text } from '../../ui';
import type { NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';

interface NowActiveItemCardProps {
  item: NowActiveItem | NowFutureItem;
  future?: boolean;
  onPress?: () => void;
  onToggleComplete?: () => void;
}

export function NowActiveItemCard({
  item,
  future = false,
  onPress,
  onToggleComplete,
}: NowActiveItemCardProps) {
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
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <Box style={styles.content}>
        <TouchableOpacity onPress={onToggleComplete} style={styles.checkboxContainer}>
          <Box style={styles.checkbox} />
        </TouchableOpacity>
        <Box style={[styles.textContainer, future && styles.futureText]}>
          <Text style={styles.itemText}>{item.name}</Text>
          {getStatusText() && <Text style={styles.status}>{getStatusText()}</Text>}
        </Box>
      </Box>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  content: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#9E9E9E',
  },
  textContainer: {
    flex: 1,
  },
  futureText: {
    opacity: 0.5,
  },
  itemText: {
    fontSize: 15,
    color: '#212121',
    marginBottom: 4,
  },
  status: {
    fontSize: 12,
    color: '#757575',
    fontStyle: 'italic',
  },
});
