/**
 * SchedulePreview - Shows upcoming scheduled items for the week
 * Uses getSchedulePreview selector
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { getDateService } from '../../lib/date';
import { lightTokens } from '../../design/tokens';

export type UpcomingItem = {
  id: string;
  type: 'habit' | 'todo' | 'note' | 'event';
  title: string;
  dueAt?: string | null;
  dateLabel?: string;
  progressPct?: number; // 0..1 optional
};

interface SchedulePreviewProps {
  items: UpcomingItem[];
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
      {items.slice(0, 3).map((item) => {
        const icon =
          item.type === 'habit'
            ? '🔄'
            : item.type === 'todo'
              ? '✓'
              : item.type === 'note'
                ? '📝'
                : '📅';
        const isSoon = (() => {
          if (!item.dueAt) return false;
          const now = getDateService().now().getTime();
          const ts = new Date(item.dueAt).getTime();
          return ts - now <= 48 * 60 * 60 * 1000; // within 48h
        })();

        return (
          <View key={item.id} style={styles.item}>
            <Text style={styles.itemIcon}>{icon}</Text>
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {item.title}
              </Text>
              {!!item.dateLabel && (
                <Text
                  style={[
                    styles.itemDate,
                    {
                      color: isSoon
                        ? lightTokens.colors.sageMist
                        : lightTokens.colors.periwinkleSmoke,
                    },
                  ]}
                >
                  {item.dateLabel}
                </Text>
              )}
              {typeof item.progressPct === 'number' && item.progressPct >= 0 && (
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(100, Math.max(0, Math.round(item.progressPct * 100)))}%`,
                      },
                    ]}
                  />
                </View>
              )}
            </View>
          </View>
        );
      })}

      {items.length > 3 && onViewAll && (
        <TouchableOpacity style={styles.viewAllButton} onPress={onViewAll}>
          <Text style={styles.viewAllText}>View all upcoming</Text>
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
  progressTrack: {
    marginTop: 4,
    height: 4,
    backgroundColor: lightTokens.colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: lightTokens.colors.primary,
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
