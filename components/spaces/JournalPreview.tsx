/**
 * JournalPreview - Shows recent journal entries for a space
 * Uses countJournalForSpace selector
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { Note } from '../../lib/types';
import { lightTokens } from '../../design/tokens';
import { format, parseISO } from 'date-fns';

interface JournalPreviewProps {
  journals: Note[];
  count: number;
  onViewAll?: () => void;
}

export function JournalPreview({ journals, count, onViewAll }: JournalPreviewProps) {
  if (journals.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📖</Text>
        <Text style={styles.emptyText}>No journal entries yet</Text>
        <Text style={styles.emptySubtext}>Start journaling to track your thoughts</Text>
      </View>
    );
  }

  const getMoodIcon = (mood?: string | null) => {
    switch (mood) {
      case 'ecstatic':
        return '🤩';
      case 'happy':
        return '😊';
      case 'neutral':
        return '😐';
      case 'low':
        return '😔';
      case 'sad':
        return '😢';
      case 'tired':
        return '😴';
      default:
        return '📖';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.countBadge}>
        <Text style={styles.countText}>{count} entries total</Text>
      </View>

      {journals.slice(0, 3).map((journal) => {
        const date = journal.date || journal.created_at;
        return (
          <View key={journal.id} style={styles.item}>
            <Text style={styles.itemIcon}>{getMoodIcon(journal.mood)}</Text>
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {journal.title || 'Journal Entry'}
              </Text>
              <Text style={styles.itemDate}>{format(parseISO(date), 'MMM d, yyyy')}</Text>
              {journal.body && (
                <Text style={styles.itemBody} numberOfLines={2}>
                  {journal.body}
                </Text>
              )}
            </View>
          </View>
        );
      })}

      {journals.length > 3 && onViewAll && (
        <TouchableOpacity style={styles.viewAllButton} onPress={onViewAll}>
          <Text style={styles.viewAllText}>View all entries</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: lightTokens.spacing[2],
  },
  countBadge: {
    backgroundColor: lightTokens.colors.accentMint,
    paddingVertical: lightTokens.spacing[1],
    paddingHorizontal: lightTokens.spacing[3],
    borderRadius: lightTokens.radius[4],
    alignSelf: 'flex-start',
    marginBottom: lightTokens.spacing[2],
  },
  countText: {
    fontSize: lightTokens.typography.size.sm,
    fontWeight: '600',
    color: lightTokens.colors.primary,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: lightTokens.spacing[3],
    backgroundColor: lightTokens.colors.bg,
    borderRadius: lightTokens.radius[2],
  },
  itemIcon: {
    fontSize: 20,
    marginRight: lightTokens.spacing[2],
    marginTop: 2,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: lightTokens.typography.size.md,
    fontWeight: '600',
    color: lightTokens.colors.text,
    marginBottom: 2,
  },
  itemDate: {
    fontSize: lightTokens.typography.size.xs,
    color: lightTokens.colors.subtle,
    marginBottom: 4,
  },
  itemBody: {
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.subtle,
    lineHeight: 18,
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
    fontSize: lightTokens.typography.size.md,
    fontWeight: '600',
    color: lightTokens.colors.text,
    marginBottom: lightTokens.spacing[1],
  },
  emptySubtext: {
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
