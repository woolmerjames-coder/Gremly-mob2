/**
 * GuidesLogsSection - Horizontal pills for notes/logs
 *
 * Features:
 * - Horizontal layout with pills
 * - Document icon on each pill
 * - Max 3 visible, "+X" overflow
 * - Section hides when empty
 */

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import type { Note } from '../../../lib/types';

interface GuidesLogsSectionProps {
  notes: Note[];
  onNotePress: (note: Note) => void;
  maxVisible?: number;
}

const MAX_VISIBLE_DEFAULT = 3;

export function GuidesLogsSection({
  notes,
  onNotePress,
  maxVisible = MAX_VISIBLE_DEFAULT,
}: GuidesLogsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  // Hook must be before any early returns
  const handleToggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const count = notes.length;

  // Hide section if no notes
  if (count === 0) {
    return null;
  }

  const visibleNotes = expanded ? notes : notes.slice(0, maxVisible);
  const moreCount = notes.length - maxVisible;
  const showMore = !expanded && moreCount > 0;

  return (
    <View style={styles.container} testID="guides-logs-section">
      {/* Section Header */}
      <Pressable
        onPress={handleToggleExpand}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={`Guides & Logs section, ${count} items`}
      >
        <Text style={styles.headerText}>
          Guides & Logs <Text style={styles.headerCount}>({count})</Text>
        </Text>
        {notes.length > maxVisible &&
          (expanded ? (
            <ChevronUp size={18} color={BRAND.colors.inkMuted} />
          ) : (
            <ChevronDown size={18} color={BRAND.colors.inkMuted} />
          ))}
      </Pressable>

      {/* Horizontal Pills */}
      <View style={styles.pillsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsContainer}
        >
          {visibleNotes.map((note) => (
            <NotePill key={note.id} note={note} onPress={() => onNotePress(note)} />
          ))}
          {showMore && (
            <Pressable
              onPress={handleToggleExpand}
              style={styles.morePill}
              accessibilityRole="button"
              accessibilityLabel={`Show ${moreCount} more`}
            >
              <Text style={styles.moreText}>+{moreCount}</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {/* Expanded grid view */}
      {expanded && notes.length > maxVisible && (
        <View style={styles.expandedGrid}>
          {notes.slice(maxVisible).map((note) => (
            <NotePill key={note.id} note={note} onPress={() => onNotePress(note)} />
          ))}
        </View>
      )}
    </View>
  );
}

interface NotePillProps {
  note: Note;
  onPress: () => void;
}

function NotePill({ note, onPress }: NotePillProps) {
  // Truncate title for pill display
  const title = note.title || 'Untitled';
  const displayTitle = title.length > 20 ? title.substring(0, 18) + '...' : title;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
      testID={`note-pill-${note.id}`}
    >
      <FileText size={14} color={BRAND.colors.mossGreen} />
      <Text style={styles.pillText} numberOfLines={1}>
        {displayTitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  headerCount: {
    fontWeight: '400',
  },
  pillsWrapper: {
    paddingLeft: 16,
  },
  pillsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(191, 216, 192, 0.3)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  pillPressed: {
    backgroundColor: 'rgba(191, 216, 192, 0.5)',
  },
  pillText: {
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
    fontWeight: '500',
  },
  morePill: {
    backgroundColor: 'rgba(191, 216, 192, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 14,
    color: BRAND.colors.mossGreen,
    fontWeight: '600',
  },
  expandedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});

export default GuidesLogsSection;
