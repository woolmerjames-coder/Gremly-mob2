/**
 * EntityNotesSection - Displays saved notes from entity chat conversations
 * Shows checklist items with completion tracking, collapsible by default
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronDown, ChevronRight, CheckSquare, Square } from 'lucide-react-native';
import type { EntityChatNote } from '../../lib/types';
import { lightTokens } from '../../design/tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EntityNotesSectionProps {
  notes: EntityChatNote[];
  onChecklistToggle?: (noteId: string, itemId: string, completed: boolean) => void;
  collapsed?: boolean; // Start collapsed by default
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EntityNotesSection({
  notes,
  onChecklistToggle,
  collapsed: initialCollapsed = true,
}: EntityNotesSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  // Don't render anything if no notes
  if (notes.length === 0) {
    return null;
  }

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => !prev);
  };

  const handleChecklistItemPress = (noteId: string, itemId: string, currentCompleted: boolean) => {
    onChecklistToggle?.(noteId, itemId, !currentCompleted);
  };

  return (
    <View style={styles.container}>
      {/* Header - always visible */}
      <TouchableOpacity style={styles.header} onPress={handleToggleCollapse} activeOpacity={0.7}>
        {isCollapsed ? (
          <ChevronRight size={18} color={lightTokens.colors.subtle} />
        ) : (
          <ChevronDown size={18} color={lightTokens.colors.subtle} />
        )}
        <Text style={styles.headerText}>Notes from chat ({notes.length})</Text>
      </TouchableOpacity>

      {/* Expanded content */}
      {!isCollapsed && (
        <View style={styles.content}>
          {notes.map((note) => (
            <View key={note.id} style={styles.noteContainer}>
              {note.is_checklist && note.checklist_items ? (
                // Render checklist items
                note.checklist_items.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.checklistItem}
                    onPress={() => handleChecklistItemPress(note.id, item.id, item.completed)}
                    activeOpacity={0.7}
                  >
                    {item.completed ? (
                      <CheckSquare size={18} color={lightTokens.colors.mossGreen} />
                    ) : (
                      <Square size={18} color={lightTokens.colors.subtle} />
                    )}
                    <Text
                      style={[
                        styles.checklistText,
                        item.completed && styles.checklistTextCompleted,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                // Render plain text note
                <Text style={styles.noteText}>{note.content}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  headerText: {
    fontSize: 14,
    fontFamily: lightTokens.typography.fontFamily.medium,
    color: lightTokens.colors.subtle,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  noteContainer: {
    marginBottom: 8,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 16,
    gap: 10,
  },
  checklistText: {
    flex: 1,
    fontSize: 14,
    fontFamily: lightTokens.typography.fontFamily.regular,
    color: lightTokens.colors.text,
    lineHeight: 20,
  },
  checklistTextCompleted: {
    textDecorationLine: 'line-through',
    color: lightTokens.colors.subtle,
  },
  noteText: {
    fontSize: 14,
    fontFamily: lightTokens.typography.fontFamily.regular,
    color: lightTokens.colors.text,
    lineHeight: 20,
    paddingLeft: 16,
  },
});

export default EntityNotesSection;
