/**
 * SchedulePreview - Shows upcoming scheduled items for the week
 * Uses getSchedulePreview selector
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { AppRecord } from '../../lib/types';
import { lightTokens } from '../../design/tokens';
import { format, parseISO } from 'date-fns';

interface SchedulePreviewProps {
  items: AppRecord[];
  onViewAll?: () => void;
}

export function SchedulePreview({ items, onViewAll }: SchedulePreviewProps) {
  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📅</Text>
        <Text style={styles.emptyText}>No scheduled items this week</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {items.slice(0, 5).map((item) => {
        const date =
          item.type === 'todo' && item.due_date
            ? item.due_date
            : item.type === 'habit' && item.start_date
              ? item.start_date
              : null;

        return (
          <View key={item.id} style={styles.item}>
            <Text style={styles.itemIcon}>{item.type === 'habit' ? '🔄' : '✓'}</Text>
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {item.type === 'habit' ? item.name : item.type === 'todo' ? item.name : item.title}
              </Text>
              {date && <Text style={styles.itemDate}>{format(parseISO(date), 'EEE, MMM d')}</Text>}
            </View>
          </View>
        );
      })}

      {items.length > 5 && onViewAll && (
        <TouchableOpacity style={styles.viewAllButton} onPress={onViewAll}>
          <Text style={styles.viewAllText}>View all {items.length} items</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: lightTokens.spacing[2],
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: lightTokens.spacing[2],
    backgroundColor: lightTokens.colors.bg,
    borderRadius: lightTokens.radius[2],
  },
  itemIcon: {
    fontSize: 16,
    marginRight: lightTokens.spacing[2],
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: lightTokens.typography.size.md,
    color: lightTokens.colors.text,
    marginBottom: 2,
  },
  itemDate: {
    fontSize: lightTokens.typography.size.xs,
    color: lightTokens.colors.subtle,
  },
  empty: {
    alignItems: 'center',
    padding: lightTokens.spacing[5],
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: lightTokens.spacing[2],
  },
  emptyText: {
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.subtle,
    textAlign: 'center',
  },
  viewAllButton: {
    marginTop: lightTokens.spacing[2],
    padding: lightTokens.spacing[2],
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.primary,
    fontWeight: '600',
  },
});
