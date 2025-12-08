// LEGACY: no longer used by SpaceHomeScreen. Kept for reference.
/**
 * NotesResourcesPreview - Shows notes and resources for a space
 * Uses listNotesForSpace selector with subtype filtering
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { Note } from '../../../lib/types';
import { lightTokens } from '../../../design/tokens';
import { getNoteLabel } from '../../../lib/canonicalTypes';

interface NotesResourcesPreviewProps {
  notes: Note[];
  onViewAll?: () => void;
}

export function NotesResourcesPreview({ notes, onViewAll }: NotesResourcesPreviewProps) {
  const noteLabel = getNoteLabel();
  const noteLabelPluralLower = getNoteLabel({ plural: true, lowercase: true });

  if (notes.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📝</Text>
        <Text style={styles.emptyText}>No {noteLabelPluralLower} or resources yet</Text>
      </View>
    );
  }

  const getIcon = (subtype: string) => {
    switch (subtype) {
      case 'idea':
        return '💡';
      case 'list':
        return '📋';
      case 'reference':
        return '📚';
      default:
        return '📝';
    }
  };

  return (
    <View style={styles.container}>
      {notes.slice(0, 5).map((note) => (
        <View key={note.id} style={styles.item}>
          <Text style={styles.itemIcon}>{getIcon(note.subtype)}</Text>
          <View style={styles.itemContent}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {note.title || `Untitled ${noteLabel}`}
            </Text>
            {note.body && (
              <Text style={styles.itemBody} numberOfLines={1}>
                {note.body}
              </Text>
            )}
          </View>
        </View>
      ))}

      {notes.length > 5 && onViewAll && (
        <TouchableOpacity style={styles.viewAllButton} onPress={onViewAll}>
          <Text style={styles.viewAllText}>
            View all {notes.length} {noteLabelPluralLower}
          </Text>
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
    alignItems: 'flex-start',
    padding: lightTokens.spacing[2],
    backgroundColor: lightTokens.colors.bg,
    borderRadius: lightTokens.radius[2],
  },
  itemIcon: {
    fontSize: 16,
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
  itemBody: {
    fontSize: lightTokens.typography.size.sm,
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
