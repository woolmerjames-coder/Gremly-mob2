/**
 * EntityNotesModal - Modal to display saved notes from entity chat
 * Shows checklist items with completion tracking, supports multiple notes navigation
 * Includes edit mode, delete functionality, and checkbox persistence
 * Supports "Make checklist" conversion for bulleted content
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import {
  X,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ListChecks,
} from 'lucide-react-native';
import type { EntityChatNote } from '../../lib/types';
import { lightTokens } from '../../design/tokens';
import { contentHasBullets, convertContentToChecklist } from '../../lib/chat/extractChecklist';
import { renderFormattedContent } from '../../lib/markdown/renderFormattedContent';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EntityNotesModalProps {
  visible: boolean;
  notes: EntityChatNote[];
  onClose: () => void;
  onChecklistToggle?: (noteId: string, itemId: string, completed: boolean) => void;
  onUpdateNote?: (noteId: string, content: string) => void;
  onDeleteNote?: (noteId: string) => void;
  onConvertToChecklist?: (
    noteId: string,
    checklistData: {
      is_checklist: true;
      checklist_items: Array<{ id: string; label: string; completed: boolean }>;
      preamble?: string;
      postamble?: string;
    },
  ) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown Styles
// ─────────────────────────────────────────────────────────────────────────────

const markdownStyles = {
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: lightTokens.colors.text,
    fontFamily: lightTokens.typography.fontFamily.regular,
  },
  strong: {
    fontWeight: '700' as const,
  },
  em: {
    fontStyle: 'italic' as const,
  },
  bullet_list: {
    marginVertical: 8,
  },
  ordered_list: {
    marginVertical: 8,
  },
  list_item: {
    marginVertical: 4,
  },
  paragraph: {
    marginVertical: 4,
  },
  link: {
    color: '#4A7C59',
  },
  heading1: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginVertical: 8,
    color: lightTokens.colors.text,
  },
  heading2: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginVertical: 6,
    color: lightTokens.colors.text,
  },
  heading3: {
    fontSize: 15,
    fontWeight: '600' as const,
    marginVertical: 4,
    color: lightTokens.colors.text,
  },
  code_inline: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: 'monospace',
    fontSize: 14,
  },
  fence: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  code_block: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EntityNotesModal({
  visible,
  notes,
  onClose,
  onChecklistToggle,
  onUpdateNote,
  onDeleteNote,
  onConvertToChecklist,
}: EntityNotesModalProps) {
  // Clamp index to valid range
  const clampedIndex = Math.min(Math.max(0, 0), Math.max(0, notes.length - 1));
  const [currentNoteIndex, setCurrentNoteIndex] = useState(clampedIndex);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState('');

  // Derive safe index - if notes shrink, clamp to valid range
  const safeIndex = notes.length === 0 ? 0 : Math.min(currentNoteIndex, notes.length - 1);

  // Don't render if no notes
  if (notes.length === 0) {
    return null;
  }

  const currentNote = notes[safeIndex];

  // Guard against undefined currentNote (shouldn't happen but safety check)
  if (!currentNote) {
    console.warn('[EntityNotesModal] currentNote is undefined at index', safeIndex);
    return null;
  }

  // Debug logging
  if (__DEV__) {
    console.log('[EntityNotesModal] Render:', {
      notesCount: notes.length,
      currentNoteIndex: safeIndex,
      currentNote: {
        id: currentNote.id,
        content: currentNote.content?.substring(0, 100),
        contentLength: currentNote.content?.length,
        is_checklist: currentNote.is_checklist,
        checklist_items: currentNote.checklist_items?.length,
      },
    });
  }

  const hasMultipleNotes = notes.length > 1;
  const isChecklist = currentNote?.is_checklist && currentNote?.checklist_items;

  // Check if note content contains bullet points (can be converted to checklist)
  const hasBulletPoints = !isChecklist && contentHasBullets(currentNote?.content);

  const handleMakeChecklist = () => {
    if (!currentNote || !hasBulletPoints || !onConvertToChecklist) return;

    const checklistData = convertContentToChecklist(currentNote.content);

    if (!checklistData) {
      Alert.alert('No Items Found', 'Could not find any bullet points to convert.');
      return;
    }

    onConvertToChecklist(currentNote.id, checklistData);
  };

  const handlePrevNote = () => {
    // Save any pending edits before navigating
    if (isEditMode && !isChecklist) {
      handleSaveEdit();
    }
    setIsEditMode(false);
    setCurrentNoteIndex((prev) => (prev > 0 ? prev - 1 : notes.length - 1));
  };

  const handleNextNote = () => {
    // Save any pending edits before navigating
    if (isEditMode && !isChecklist) {
      handleSaveEdit();
    }
    setIsEditMode(false);
    setCurrentNoteIndex((prev) => (prev < notes.length - 1 ? prev + 1 : 0));
  };

  const handleChecklistItemPress = (itemId: string, currentCompleted: boolean) => {
    onChecklistToggle?.(currentNote.id, itemId, !currentCompleted);
  };

  const toggleEditMode = () => {
    if (isEditMode) {
      // Exiting edit mode - save changes
      handleSaveEdit();
    } else {
      // Entering edit mode - populate editedContent
      if (!isChecklist) {
        setEditedContent(currentNote.content || '');
      }
    }
    setIsEditMode(!isEditMode);
  };

  const handleSaveEdit = () => {
    if (!currentNote || isChecklist) return;
    if (editedContent !== currentNote.content) {
      onUpdateNote?.(currentNote.id, editedContent);
    }
  };

  const handleDeleteNote = () => {
    if (!currentNote) return;

    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onDeleteNote?.(currentNote.id);
          setIsEditMode(false);
          // If this was the last note, modal will close via the notes.length === 0 check
          if (notes.length === 1) {
            onClose();
          }
        },
      },
    ]);
  };

  const handleClose = () => {
    // Save any pending edits before closing
    if (isEditMode && !isChecklist) {
      handleSaveEdit();
    }
    setIsEditMode(false);
    onClose();
  };

  const screenHeight = Dimensions.get('window').height;
  const maxCardHeight = screenHeight * 0.6; // 60% of screen

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      {/* Backdrop - covers full screen */}
      <View style={styles.backdrop}>
        {/* Tap area to close */}
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        {/* Content Card - positioned at top */}
        <View style={[styles.card, { maxHeight: maxCardHeight }]}>
          {/* Header - clean with just title, trash, and close */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Notes from Chat</Text>
            <View style={styles.headerActions}>
              {/* Delete button */}
              <TouchableOpacity
                onPress={handleDeleteNote}
                style={styles.deleteButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Trash2 size={20} color="#E57373" />
              </TouchableOpacity>

              {/* Close X */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={lightTokens.colors.subtle} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Navigation (if multiple notes) */}
          {hasMultipleNotes && (
            <View style={styles.navigation}>
              <TouchableOpacity
                style={styles.navButton}
                onPress={handlePrevNote}
                activeOpacity={0.7}
              >
                <ChevronLeft size={20} color={lightTokens.colors.mossGreen} />
              </TouchableOpacity>
              <Text style={styles.navIndicator}>
                Note {safeIndex + 1} of {notes.length}
              </Text>
              <TouchableOpacity
                style={styles.navButton}
                onPress={handleNextNote}
                activeOpacity={0.7}
              >
                <ChevronRight size={20} color={lightTokens.colors.mossGreen} />
              </TouchableOpacity>
            </View>
          )}

          {/* Note Content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            bounces={true}
          >
            {isChecklist ? (
              // Render checklist with preamble, items, and postamble
              <>
                {/* Preamble (text before bullets) */}
                {currentNote.preamble && (
                  <View style={styles.preambleContainer}>
                    <Markdown style={markdownStyles}>{currentNote.preamble}</Markdown>
                  </View>
                )}

                {/* Checklist items with toggleable checkboxes */}
                {currentNote.checklist_items!.map((item, index) => {
                  const isLast = index === currentNote.checklist_items!.length - 1;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.checklistItem, !isLast && styles.checklistItemBorder]}
                      onPress={() => handleChecklistItemPress(item.id, item.completed)}
                      activeOpacity={0.7}
                    >
                      {item.completed ? (
                        <CheckSquare size={22} color={lightTokens.colors.mossGreen} />
                      ) : (
                        <Square size={22} color={lightTokens.colors.subtle} />
                      )}
                      <View
                        style={[
                          styles.checklistTextContainer,
                          item.completed && styles.checklistTextContainerCompleted,
                        ]}
                      >
                        {renderFormattedContent(item.label, {
                          textColor: item.completed
                            ? lightTokens.colors.subtle
                            : lightTokens.colors.text,
                          fontSize: 15,
                          lineHeight: 22,
                        })}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* Postamble (text after bullets) */}
                {currentNote.postamble && (
                  <View style={styles.postambleContainer}>
                    <Markdown style={markdownStyles}>{currentNote.postamble}</Markdown>
                  </View>
                )}
              </>
            ) : isEditMode ? (
              // Edit mode - show TextInput
              <TextInput
                style={styles.editInput}
                value={editedContent}
                onChangeText={setEditedContent}
                multiline
                autoFocus
                textAlignVertical="top"
                placeholder="Edit your note..."
                placeholderTextColor={lightTokens.colors.subtle}
              />
            ) : currentNote.content ? (
              // View mode - show formatted content
              <Markdown style={markdownStyles}>{currentNote.content}</Markdown>
            ) : (
              // Fallback for empty content
              <Text style={styles.noteText}>No content saved</Text>
            )}
          </ScrollView>

          {/* Action Bar - Edit and Make checklist buttons */}
          {!isChecklist && (
            <View style={styles.actionBar}>
              {/* Make checklist button (only if content has bullet points) */}
              {hasBulletPoints && onConvertToChecklist && !isEditMode && (
                <TouchableOpacity
                  onPress={handleMakeChecklist}
                  style={styles.actionButton}
                  activeOpacity={0.7}
                >
                  <ListChecks size={16} color={lightTokens.colors.mossGreen} />
                  <Text style={styles.actionButtonText}>Make checklist</Text>
                </TouchableOpacity>
              )}

              {/* Edit/Done toggle */}
              <TouchableOpacity
                onPress={toggleEditMode}
                style={[styles.actionButton, isEditMode && styles.actionButtonActive]}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.actionButtonText, isEditMode && styles.actionButtonTextActive]}
                >
                  {isEditMode ? 'Done' : 'Edit'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    paddingTop: 100, // Fixed distance from top
  },
  card: {
    backgroundColor: '#FFFDF8',
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    padding: 20,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: lightTokens.typography.fontFamily.medium,
    fontWeight: '600',
    color: lightTokens.colors.text,
    flexShrink: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteButton: {
    padding: 4,
  },
  closeButton: {
    padding: 4,
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 12,
  },
  navButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(191, 216, 192, 0.2)',
  },
  navIndicator: {
    fontSize: 14,
    fontFamily: lightTokens.typography.fontFamily.medium,
    color: lightTokens.colors.subtle,
  },
  scrollView: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 100,
  },
  scrollContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
  },
  checklistItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: lightTokens.colors.border,
  },
  checklistTextContainer: {
    flex: 1,
  },
  checklistTextContainerCompleted: {
    opacity: 0.6,
  },
  checklistText: {
    flex: 1,
    fontSize: 15,
    fontFamily: lightTokens.typography.fontFamily.regular,
    color: lightTokens.colors.text,
    lineHeight: 22,
  },
  checklistTextCompleted: {
    textDecorationLine: 'line-through',
    color: lightTokens.colors.subtle,
  },
  noteText: {
    fontSize: 15,
    fontFamily: lightTokens.typography.fontFamily.regular,
    color: lightTokens.colors.text,
    lineHeight: 22,
  },
  editInput: {
    fontSize: 15,
    fontFamily: lightTokens.typography.fontFamily.regular,
    lineHeight: 22,
    color: lightTokens.colors.text,
    minHeight: 150,
    padding: 0,
    backgroundColor: 'transparent',
  },
  preambleContainer: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: lightTokens.colors.border,
  },
  postambleContainer: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: lightTokens.colors.border,
  },
  actionBar: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: lightTokens.colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(191, 216, 192, 0.2)',
    borderRadius: 8,
    gap: 6,
  },
  actionButtonActive: {
    backgroundColor: lightTokens.colors.mossGreen,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: lightTokens.colors.mossGreen,
  },
  actionButtonTextActive: {
    color: '#fff',
  },
});

export default EntityNotesModal;
