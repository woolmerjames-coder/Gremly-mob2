import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import type { ListItem } from '../../lib/lists';

interface ChecklistProgressProps {
  items: ListItem[];
}

export function ChecklistProgress({ items }: ChecklistProgressProps) {
  const total = items.length;
  const completed = items.filter((item) => item.checked).length;
  const percentage = total > 0 ? (completed / total) * 100 : 0;

  return (
    <View style={styles.container}>
      <View style={styles.barBackground}>
        <View style={[styles.barFill, { width: `${percentage}%` }]} />
      </View>
      <Text style={styles.text}>
        {completed} / {total} done
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  barBackground: {
    flex: 1,
    height: 6,
    backgroundColor: '#E5E5E5',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: lightTokens.colors.mossGreen,
    borderRadius: 3,
  },
  text: {
    fontSize: 13,
    color: '#888',
    minWidth: 60,
  },
});
