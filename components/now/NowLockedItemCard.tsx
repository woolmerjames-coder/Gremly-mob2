/**
 * NOW Locked Item Card Component
 * Displays a locked/priority item in the NOW list
 */

import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Box, Text } from '../../ui';
import type { NowLockedItem } from '../../lib/now/nowTypes';

interface NowLockedItemCardProps {
  item: NowLockedItem;
}

export function NowLockedItemCard({ item }: NowLockedItemCardProps) {
  const getStatusText = () => {
    if (item.type === 'habit' && item.cadence) {
      return `${item.cadence} habit`;
    }
    if (item.dueAt) {
      return `Due ${new Date(item.dueAt).toLocaleDateString()}`;
    }
    return null;
  };

  return (
    <TouchableOpacity style={styles.container}>
      <Box style={styles.content}>
        <Box style={styles.iconContainer}>
          <Text style={styles.icon}>⚡</Text>
        </Box>
        <Box style={styles.textContainer}>
          <Text style={styles.itemText}>{item.name}</Text>
          {getStatusText() && <Text style={styles.tag}>{getStatusText()}</Text>}
        </Box>
      </Box>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF9E6',
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
    borderRadius: 8,
    marginBottom: 8,
  },
  content: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  itemText: {
    fontSize: 15,
    color: '#212121',
    fontWeight: '500',
    marginBottom: 4,
  },
  tag: {
    fontSize: 12,
    color: '#F57C00',
    fontWeight: '500',
  },
});
