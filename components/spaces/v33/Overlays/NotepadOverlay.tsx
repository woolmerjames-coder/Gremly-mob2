import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Keyboard,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { format, formatISO } from 'date-fns';
import { COLORS, RADII, SPACE, ELEV } from '../_tokens';
import {
  X,
  CheckSquare2,
  List as ListIcon,
  ListOrdered,
  NotebookText,
  Save,
  Trash2,
  CalendarClock,
  StickyNote,
} from '../../../icons';
import { useGremlyStore } from '../../../../lib/store/useGremlyStore';
import { useSpaceNotesSelector } from '../../../../lib/store/selectors';
import type { Note as StoreNote } from '../../../../lib/types';

// Local type for UI display (maps from store Note)
type NoteDisplay = {
  id: string;
  title: string | null | undefined;
  content: string;
  type: 'note' | 'journal';
  date: string | null | undefined;
  created_at: string;
  updated_at: string;
};

// Convert store Note to display Note
const toNoteDisplay = (note: StoreNote): NoteDisplay => ({
  id: note.id,
  title: note.title,
  content: note.body || '',
  type: note.subtype === 'journal' ? 'journal' : 'note',
  date: note.date,
  created_at: note.created_at,
  updated_at: note.updated_at,
});

type Tab = 'compose' | 'saved';
type NoteType = 'note' | 'journal';

type Props = {
  spaceId: string;
  isOpen: boolean;
  onClose: () => void;
};

export default function NotepadOverlay({ spaceId, isOpen, onClose }: Props) {
  // Store-based data
  const spaceNotes = useSpaceNotesSelector(spaceId);
  const createNote = useGremlyStore((s) => s.createNote);
  const updateNote = useGremlyStore((s) => s.updateNote);
  const deleteNote = useGremlyStore((s) => s.deleteNote);

  // Map store notes to display format
  const notes = useMemo(() => spaceNotes.map(toNoteDisplay), [spaceNotes]);
  const journals = useMemo(() => notes.filter((n) => n.type === 'journal'), [notes]);

  const [tab, setTab] = useState<Tab>('compose');
  const [noteType, setNoteType] = useState<NoteType>('note');
  const [content, setContent] = useState('');
  const [date, setDate] = useState<string>(formatISO(new Date(), { representation: 'date' }));
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const backdropOpacity = useMemo(() => new Animated.Value(0), []);
  const sheetY = useMemo(() => new Animated.Value(800), []);
  const toolbarOpacity = useMemo(() => new Animated.Value(0), []);

  // Animation
  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(sheetY, {
          toValue: 0,
          damping: 25,
          useNativeDriver: true,
        }),
      ]).start();
      // Fade in toolbar after mount
      setTimeout(() => {
        Animated.timing(toolbarOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();
      }, 100);
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(sheetY, {
          toValue: 800,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen, backdropOpacity, sheetY, toolbarOpacity]);

  // Autosave on content change (debounced 700ms)
  useEffect(() => {
    if (!content.trim()) return;
    if (!hasUnsavedChanges) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 700);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, hasUnsavedChanges]);

  const handleSave = useCallback(async () => {
    if (!content.trim()) return;

    try {
      if (currentNoteId) {
        // Update existing note
        await updateNote(currentNoteId, {
          body: content,
          title: content.split('\n')[0]?.trim().slice(0, 60) || 'Untitled',
          date: noteType === 'journal' ? date : null,
          subtype: noteType === 'journal' ? 'journal' : 'catchall',
        });
      } else {
        // Create new note
        const title = content.split('\n')[0]?.trim().slice(0, 60) || 'Untitled';
        const newNote = await createNote({
          space_id: spaceId,
          title,
          body: content,
          subtype: noteType === 'journal' ? 'journal' : 'catchall',
          date: noteType === 'journal' ? date : null,
          origin: 'manual',
          ai_placed: false,
        });
        setCurrentNoteId(newNote.id);
      }
      setHasUnsavedChanges(false);
      setLastSavedAt(Date.now());
    } catch (error) {
      console.error('[NotepadOverlay] save failed', error);
    }
  }, [content, currentNoteId, createNote, updateNote, noteType, date, spaceId]);

  const handleContentChange = useCallback((text: string) => {
    setContent(text);
    setHasUnsavedChanges(true);
  }, []);

  const handleInsert = useCallback((snippet: string) => {
    setContent((prev) => prev + (prev.endsWith('\n') || !prev ? '' : '\n') + snippet + '\n');
    setHasUnsavedChanges(true);
  }, []);

  const handleNewNote = useCallback(() => {
    setContent('');
    setCurrentNoteId(null);
    setHasUnsavedChanges(false);
    setNoteType('note');
    setDate(formatISO(new Date(), { representation: 'date' }));
    setTab('compose');
  }, []);

  const handleLoadNote = useCallback((note: NoteDisplay) => {
    setCurrentNoteId(note.id);
    setContent(note.content);
    setNoteType(note.type);
    setDate(note.date || formatISO(new Date(), { representation: 'date' }));
    setHasUnsavedChanges(false);
    setTab('compose');
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      Alert.alert('Delete note?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNote(id);
              if (currentNoteId === id) {
                handleNewNote();
              }
            } catch (error) {
              console.error('[NotepadOverlay] delete failed', error);
            }
          },
        },
      ]);
    },
    [deleteNote, currentNoteId, handleNewNote],
  );

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges && content.trim()) {
      handleSave();
    }
    Keyboard.dismiss();
    onClose();
  }, [hasUnsavedChanges, content, handleSave, onClose]);

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter(
      (n) => n.title?.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q),
    );
  }, [notes, searchQuery]);

  const notesList = filteredNotes.filter((n) => n.type === 'note');
  const journalsList = filteredNotes.filter((n) => n.type === 'journal');

  if (!isOpen) return null;

  const savedTimeAgo = lastSavedAt && Date.now() - lastSavedAt < 2000;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose}>
          <BlurView intensity={12} style={StyleSheet.absoluteFill} tint="dark" />
        </TouchableOpacity>
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [{ translateY: sheetY }],
          },
        ]}
        testID="NotepadOverlay"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.segmentControl} testID="SegmentControl">
            <TouchableOpacity
              style={[styles.segment, tab === 'compose' && styles.segmentActive]}
              onPress={() => setTab('compose')}
              accessibilityRole="button"
              testID="ComposeToggle"
            >
              <Text style={[styles.segmentText, tab === 'compose' && styles.segmentTextActive]}>
                Compose
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, tab === 'saved' && styles.segmentActive]}
              onPress={() => setTab('saved')}
              accessibilityRole="button"
            >
              <Text style={[styles.segmentText, tab === 'saved' && styles.segmentTextActive]}>
                Saved
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X color={COLORS.Sage} size={24} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Compose Tab */}
        {tab === 'compose' && (
          <View style={styles.composeContainer}>
            {/* Type toggle */}
            <View style={styles.typeToggle}>
              <TouchableOpacity
                style={[styles.typeChip, noteType === 'note' && styles.typeChipActive]}
                onPress={() => setNoteType('note')}
                accessibilityRole="button"
              >
                <StickyNote
                  size={14}
                  color={noteType === 'note' ? COLORS.Deep : COLORS.Moss}
                  strokeWidth={2}
                />
                <Text
                  style={[styles.typeChipText, noteType === 'note' && styles.typeChipTextActive]}
                >
                  Notepad
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeChip, noteType === 'journal' && styles.typeChipActive]}
                onPress={() => setNoteType('journal')}
                accessibilityRole="button"
                testID="JournalToggle"
              >
                <NotebookText
                  size={14}
                  color={noteType === 'journal' ? COLORS.Deep : COLORS.Moss}
                  strokeWidth={2}
                />
                <Text
                  style={[styles.typeChipText, noteType === 'journal' && styles.typeChipTextActive]}
                >
                  Journal
                </Text>
              </TouchableOpacity>
              {noteType === 'journal' && (
                <View style={styles.datePill}>
                  <CalendarClock size={12} color={COLORS.Moss} strokeWidth={2} />
                  <Text style={styles.datePillText}>{format(new Date(date), 'MMM d, yyyy')}</Text>
                </View>
              )}
            </View>

            {/* Journal date heading */}
            {noteType === 'journal' && (
              <Text style={styles.journalHeading}>{format(new Date(date), 'EEEE, MMMM d')}</Text>
            )}

            {/* Text input */}
            <ScrollView
              style={styles.inputScroll}
              contentContainerStyle={styles.inputScrollContent}
              keyboardDismissMode="interactive"
            >
              <TextInput
                style={styles.input}
                placeholder={
                  noteType === 'journal'
                    ? "What's on your mind today?"
                    : 'Write a thought, a plan, or a list…'
                }
                placeholderTextColor="rgba(46,85,64,0.4)"
                value={content}
                onChangeText={handleContentChange}
                multiline
                textAlignVertical="top"
                autoFocus={tab === 'compose'}
              />
            </ScrollView>

            {/* Toolbar */}
            <Animated.View style={[styles.toolbar, { opacity: toolbarOpacity }]}>
              <View style={styles.toolbarLeft}>
                <TouchableOpacity
                  onPress={() => handleInsert('- [ ] ')}
                  accessibilityRole="button"
                  accessibilityLabel="Insert checklist"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <CheckSquare2 size={20} color={COLORS.Moss} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleInsert('• ')}
                  accessibilityRole="button"
                  accessibilityLabel="Insert bullet"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <ListIcon size={20} color={COLORS.Moss} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleInsert('1. ')}
                  accessibilityRole="button"
                  accessibilityLabel="Insert numbered list"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <ListOrdered size={20} color={COLORS.Moss} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNoteType((t) => (t === 'note' ? 'journal' : 'note'))}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle journal mode"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <NotebookText size={20} color={COLORS.Moss} strokeWidth={2} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={handleSave}
                disabled={!hasUnsavedChanges || !content.trim()}
                accessibilityRole="button"
                accessibilityLabel={savedTimeAgo ? 'Saved' : 'Save note'}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Save
                  size={20}
                  color={hasUnsavedChanges ? COLORS.Pear : COLORS.Sage}
                  strokeWidth={2}
                />
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* Saved Tab */}
        {tab === 'saved' && (
          <View style={styles.savedContainer} testID="NotesSavedList">
            {/* Search input */}
            <TextInput
              style={styles.searchInput}
              placeholder="Find a note or journal…"
              placeholderTextColor="rgba(46,85,64,0.4)"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            <ScrollView
              style={styles.savedScroll}
              contentContainerStyle={styles.savedScrollContent}
            >
              {/* Notes section */}
              {notesList.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Notes</Text>
                  {notesList.map((note) => (
                    <SavedNoteRow
                      key={note.id}
                      note={note}
                      onPress={() => handleLoadNote(note)}
                      onDelete={() => handleDelete(note.id)}
                    />
                  ))}
                </>
              )}

              {/* Journals section */}
              {journalsList.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Journals</Text>
                  {journalsList.map((note) => (
                    <SavedNoteRow
                      key={note.id}
                      note={note}
                      onPress={() => handleLoadNote(note)}
                      onDelete={() => handleDelete(note.id)}
                    />
                  ))}
                </>
              )}

              {/* Empty states */}
              {notesList.length === 0 && journalsList.length === 0 && !searchQuery && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    {notes.length === 0
                      ? 'Blank page, clear mind.'
                      : 'No entries yet — want to start one?'}
                  </Text>
                </View>
              )}
              {notesList.length === 0 && journalsList.length === 0 && searchQuery && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No matches found</Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

function SavedNoteRow({
  note,
  onPress,
  onDelete,
}: {
  note: NoteDisplay;
  onPress: () => void;
  onDelete: () => void;
}) {
  const snippet = note.content.split('\n').slice(0, 2).join(' ').slice(0, 80) + '…';
  return (
    <TouchableOpacity style={styles.noteRow} onPress={onPress} accessibilityRole="button">
      <View style={styles.noteRowContent}>
        <Text style={styles.noteTitle} numberOfLines={1}>
          {note.title || 'Untitled'}
        </Text>
        <Text style={styles.noteSnippet} numberOfLines={1}>
          {snippet}
        </Text>
        <Text style={styles.noteDate}>{format(new Date(note.updated_at), 'MMM d, yyyy')}</Text>
      </View>
      <TouchableOpacity
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel="Delete"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Trash2 size={18} color={COLORS.Moss} strokeWidth={2} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '75%',
    backgroundColor: COLORS.Linen,
    borderTopLeftRadius: RADII.overlay,
    borderTopRightRadius: RADII.overlay,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(46,85,64,0.1)',
  },
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(191,216,192,0.2)',
    borderRadius: RADII.btn,
    padding: 2,
  },
  segment: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 6,
    borderRadius: RADII.btn - 2,
  },
  segmentActive: {
    backgroundColor: COLORS.Sage,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.Moss,
  },
  segmentTextActive: {
    color: COLORS.Deep,
  },
  composeContainer: {
    flex: 1,
  },
  typeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    gap: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADII.btn,
    backgroundColor: 'rgba(46,85,64,0.06)',
  },
  typeChipActive: {
    backgroundColor: 'rgba(191,216,192,0.3)',
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.Moss,
  },
  typeChipTextActive: {
    color: COLORS.Deep,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(191,216,192,0.2)',
    borderRadius: RADII.btn,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.Moss,
  },
  journalHeading: {
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.xs,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.Deep,
    letterSpacing: 0.3,
  },
  inputScroll: {
    flex: 1,
  },
  inputScrollContent: {
    padding: SPACE.md,
  },
  input: {
    fontSize: 16,
    lineHeight: 22.4,
    color: COLORS.Deep,
    fontWeight: '400',
    minHeight: 200,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(46,85,64,0.1)',
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  savedContainer: {
    flex: 1,
  },
  searchInput: {
    margin: SPACE.md,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: RADII.btn,
    fontSize: 14,
    color: COLORS.Deep,
  },
  savedScroll: {
    flex: 1,
  },
  savedScrollContent: {
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.Moss,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: SPACE.sm,
    marginBottom: SPACE.xs,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingVertical: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(46,85,64,0.08)',
  },
  noteRowContent: {
    flex: 1,
  },
  noteTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.Deep,
    marginBottom: 2,
  },
  noteSnippet: {
    fontSize: 13,
    color: COLORS.Moss,
    marginBottom: 2,
  },
  noteDate: {
    fontSize: 11,
    color: 'rgba(46,85,64,0.6)',
  },
  emptyState: {
    paddingVertical: SPACE.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.Moss,
    textAlign: 'center',
  },
});
