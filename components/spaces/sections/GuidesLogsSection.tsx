/**
 * GuidesLogsSection - 2x2 grid of note pills
 *
 * Features:
 * - 2-column grid layout
 * - Max 4 visible, "+X more" expansion
 * - Section hides when empty
 */

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import type { Note } from '../../../lib/types';

interface GuidesLogsSectionProps {
  notes: Note[];
  onNotePress: (note: Note) => void;
  onNoteLongPress?: (note: Note) => void;
  maxVisible?: number;
}

export function GuidesLogsSection({
  notes,
  onNotePress,
  onNoteLongPress,
  maxVisible = 4,
}: GuidesLogsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (notes.length === 0) return null;

  const visibleNotes = expanded ? notes : notes.slice(0, maxVisible);
  const hiddenCount = notes.length - maxVisible;
  const showExpandButton = hiddenCount > 0;

  return (
    <View testID="guides-logs-section">
      {/* Section Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Guides & Logs ({notes.length})</Text>
        {showExpandButton && (
          <Pressable onPress={() => setExpanded(!expanded)} hitSlop={8}>
            {expanded ? (
              <ChevronUp size={20} color={BRAND.colors.inkMuted} />
            ) : (
              <ChevronDown size={20} color={BRAND.colors.inkMuted} />
            )}
          </Pressable>
        )}
      </View>

      {/* 2x2 Grid */}
      <View style={styles.grid}>
        {visibleNotes.map((note) => (
          <Pressable
            key={note.id}
            onPress={() => onNotePress(note)}
            onLongPress={() => onNoteLongPress?.(note)}
            delayLongPress={500}
            style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}
            testID={`note-pill-${note.id}`}
          >
            <FileText size={16} color={BRAND.colors.mossGreen} style={{ marginTop: 2 }} />
            <Text style={styles.pillText} numberOfLines={2}>
              {note.title || note.name || 'Untitled'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* +X more button (when collapsed) */}
      {!expanded && hiddenCount > 0 && (
        <Pressable onPress={() => setExpanded(true)}>
          <Text style={styles.moreText}>+{hiddenCount} more...</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(191, 216, 192, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
    width: '48%',
    minHeight: 56,
  },
  pillText: {
    fontSize: 14,
    lineHeight: 18,
    color: BRAND.colors.charcoalInk,
    flex: 1,
  },
  moreText: {
    fontSize: 14,
    color: BRAND.colors.mossGreen,
    fontWeight: '500',
    marginTop: 8,
    paddingHorizontal: 16,
  },
});

export default React.memo(GuidesLogsSection);
