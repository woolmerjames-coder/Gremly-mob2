/**
 * UnifiedCreateOverlay - Phase 7 unified create/edit overlay
 * Single overlay for all entity types with type pills, subtypes, and AI freeform mode
 */
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TextInput,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../ui/Text';
import { Button } from '../../design-system/Button';
import Chip from '../ui/Chip';
import { HabitFields } from './fields/HabitFields';
import { TodoFields } from './fields/TodoFields';
import { JournalFields } from './fields/JournalFields';
import { NoteFields } from './fields/NoteFields';
import { PersonFields } from './fields/PersonFields';
import { useRepo } from '../../providers/RepoProvider';
import { useCortex } from '../../providers/CortexProvider';
import type { AppRecord, Frequency, NoteSubtype } from '../../lib/types';
import type { CreateRecordInput, UpdateRecordInput } from '../../lib/repo/IRepo';

type EntityType = 'habit' | 'todo' | 'journal' | 'note' | 'person';

export type UnifiedCreateOverlayProps = {
  visible: boolean;
  mode: 'create' | 'edit';
  initialEntity?: {
    type: EntityType | null;
    id?: string;
    subtype?: string | null;
  };
  initialSpaceId?: string | null; // from scope
  onClose: () => void;
  onSaved?: (result: { type: string; id: string }) => void;
};

const TYPE_OPTIONS: { value: EntityType; label: string; emoji: string }[] = [
  { value: 'habit', label: 'Habit', emoji: '🔄' },
  { value: 'todo', label: 'To-Do', emoji: '✓' },
  { value: 'journal', label: 'Journal', emoji: '📔' },
  { value: 'note', label: 'Note', emoji: '📝' },
  { value: 'person', label: 'Person', emoji: '👤' },
];

export function UnifiedCreateOverlay({
  visible,
  mode,
  initialEntity,
  initialSpaceId,
  onClose,
  onSaved,
}: UnifiedCreateOverlayProps) {
  const insets = useSafeAreaInsets();
  const repo = useRepo();
  const cortex = useCortex();

  // State
  const [selectedType, setSelectedType] = useState<EntityType | null>(null);
  const [aiMode, setAiMode] = useState(false);
  const [spaceId] = useState<string | null | undefined>(initialSpaceId); // TODO: Add space selector UI
  const [isLoading, setIsLoading] = useState(false);

  // Freeform (AI mode)
  const [freeformText, setFreeformText] = useState('');

  // Habit fields
  const [habitName, setHabitName] = useState('');
  const [habitFrequency, setHabitFrequency] = useState<Frequency>('daily');
  const [habitSubtype, setHabitSubtype] = useState<string | null>(null);

  // Todo fields
  const [todoName, setTodoName] = useState('');
  const [todoDueDate, setTodoDueDate] = useState('');
  const [todoSubtype, setTodoSubtype] = useState<string | null>(null);

  // Journal fields
  const [journalDate, setJournalDate] = useState(new Date().toISOString().split('T')[0]);
  const [journalEntry, setJournalEntry] = useState('');
  const [journalSubtype, setJournalSubtype] = useState<string | null>(null);

  // Note fields
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteSubtype, setNoteSubtype] = useState<string | null>(null);

  // Person fields
  const [personName, setPersonName] = useState('');
  const [personEmail, setPersonEmail] = useState('');

  const loadEntity = React.useCallback(
    async (id: string) => {
      try {
        const entity = await repo.getById(id);
        if (!entity) return;

        // Populate fields based on type
        switch (entity.type) {
          case 'habit':
            setHabitName(entity.title || '');
            setHabitFrequency(entity.frequency || 'daily');
            break;
          case 'todo':
            setTodoName(entity.title || '');
            setTodoDueDate(entity.due_date || '');
            break;
          case 'note':
            if (entity.subtype === 'journal') {
              setSelectedType('journal');
              setJournalEntry(entity.body || '');
              setJournalDate(
                entity.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
              );
              setJournalSubtype(entity.subtype);
            } else {
              setNoteTitle(entity.title || '');
              setNoteBody(entity.body || '');
              setNoteSubtype(entity.subtype || null);
            }
            break;
        }
      } catch (error) {
        console.error('[UnifiedCreateOverlay] Failed to load entity:', error);
      }
    },
    [repo],
  );

  // Initialize from initialEntity in edit mode
  useEffect(() => {
    if (mode === 'edit' && initialEntity && initialEntity.type) {
      setSelectedType(initialEntity.type);
      setAiMode(false); // No AI mode in edit

      // Load entity data
      if (initialEntity.id) {
        loadEntity(initialEntity.id);
      }
    } else if (mode === 'create' && initialEntity?.type) {
      setSelectedType(initialEntity.type);
    }
  }, [mode, initialEntity, loadEntity]);

  const resetForm = () => {
    setSelectedType(null);
    setAiMode(false);
    setFreeformText('');
    setHabitName('');
    setHabitFrequency('daily');
    setHabitSubtype(null);
    setTodoName('');
    setTodoDueDate('');
    setTodoSubtype(null);
    setJournalDate(new Date().toISOString().split('T')[0]);
    setJournalEntry('');
    setJournalSubtype(null);
    setNoteTitle('');
    setNoteBody('');
    setNoteSubtype(null);
    setPersonName('');
    setPersonEmail('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleTypeSelect = (type: EntityType) => {
    setSelectedType(type);
    setAiMode(false);
  };

  const handleAiModeToggle = () => {
    if (mode === 'edit') return; // No AI mode in edit
    setAiMode(!aiMode);
    if (!aiMode) {
      setSelectedType(null);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // AI mode - freeform catchall
      if (aiMode && freeformText.trim()) {
        const classifyFlag =
          (process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL ?? 'false') === 'true';
        let cortexResult = null;

        if (classifyFlag) {
          try {
            cortexResult = await cortex.classify({ text: freeformText.trim(), spaceId: null });
          } catch (error) {
            console.error('[UnifiedCreateOverlay] Cortex classification failed:', error);
          }
        }

        const input: CreateRecordInput = {
          type: 'note',
          title: '',
          body: freeformText.trim(),
          subtype: 'catchall',
          space_id: spaceId !== undefined ? spaceId : null,
          ai_placed: true,
          why_string: cortexResult?.whyString || 'AI freeform mode',
          origin: 'catchall',
        };

        const result = await repo.create(input);
        onSaved?.({ type: 'note', id: result.id });
        handleClose();
        return;
      }

      // Edit mode
      if (mode === 'edit' && initialEntity?.id && selectedType) {
        const patch = buildUpdatePatch(selectedType);
        const input: UpdateRecordInput = {
          id: initialEntity.id,
          patch,
        };

        const result = await repo.update(input);
        onSaved?.({ type: selectedType, id: result.id });
        handleClose();
        return;
      }

      // Create mode - structured
      if (selectedType) {
        const input = buildCreateInput(selectedType);
        const result = await repo.create(input);
        onSaved?.({ type: selectedType, id: result.id });
        handleClose();
      }
    } catch (error) {
      console.error('[UnifiedCreateOverlay] Save failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const buildCreateInput = (type: EntityType): CreateRecordInput => {
    const baseInput = {
      space_id: spaceId !== undefined ? spaceId : null,
      ai_placed: false,
    };

    switch (type) {
      case 'habit':
        return {
          ...baseInput,
          type: 'habit',
          title: habitName,
          frequency: habitFrequency,
        };
      case 'todo':
        return {
          ...baseInput,
          type: 'todo',
          title: todoName,
          due_date: todoDueDate || null,
        };
      case 'journal':
        return {
          ...baseInput,
          type: 'note',
          subtype: 'journal',
          title: '',
          body: journalEntry,
        };
      case 'note':
        return {
          ...baseInput,
          type: 'note',
          subtype: (noteSubtype as NoteSubtype) || 'idea',
          title: noteTitle,
          body: noteBody,
        };
      case 'person':
        // For now, store as a note until we have proper Person table
        return {
          ...baseInput,
          type: 'note',
          subtype: 'reference',
          title: personName,
          body: `Email: ${personEmail}`,
        };
      default:
        throw new Error('Unknown type');
    }
  };

  const buildUpdatePatch = (type: EntityType): Partial<AppRecord> => {
    switch (type) {
      case 'habit':
        return {
          title: habitName,
          frequency: habitFrequency,
        };
      case 'todo':
        return {
          title: todoName,
          due_date: todoDueDate || null,
        };
      case 'journal':
        return {
          body: journalEntry,
        };
      case 'note':
        return {
          title: noteTitle,
          body: noteBody,
          subtype: (noteSubtype as NoteSubtype) || 'idea',
        };
      case 'person':
        return {
          title: personName,
          body: `Email: ${personEmail}`,
        };
      default:
        return {};
    }
  };

  const isSaveDisabled = () => {
    if (isLoading) return true;
    if (aiMode) return !freeformText.trim();
    if (!selectedType) return true;

    switch (selectedType) {
      case 'habit':
        return !habitName.trim();
      case 'todo':
        return !todoName.trim();
      case 'journal':
        return !journalEntry.trim();
      case 'note':
        return !noteBody.trim();
      case 'person':
        return !personName.trim();
      default:
        return true;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={styles.backdrop}>
          <View style={[styles.card, { paddingBottom: insets.bottom + 20 }]}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{mode === 'edit' ? 'Edit Item' : 'Add or Edit Item'}</Text>
              <TouchableOpacity onPress={handleClose} testID="close-button">
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Type row */}
              <View style={styles.section}>
                <View style={styles.chipRow}>
                  {TYPE_OPTIONS.map((opt) => (
                    <Chip
                      key={opt.value}
                      label={`${opt.emoji} ${opt.label}`}
                      selected={selectedType === opt.value && !aiMode}
                      onPress={() => handleTypeSelect(opt.value)}
                      testID={`type-pill-${opt.value}`}
                      disabled={mode === 'edit'}
                      style={styles.typeChip}
                    />
                  ))}
                </View>
              </View>

              {/* AI mode button */}
              {mode === 'create' && (
                <View style={styles.section}>
                  <Pressable
                    onPress={handleAiModeToggle}
                    style={[styles.aiButton, aiMode && styles.aiButtonActive]}
                    testID="ai-mode-button"
                  >
                    <Text style={[styles.aiButtonText, aiMode && styles.aiButtonTextActive]}>
                      🧠 Let Gremly decide
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* AI freeform input */}
              {aiMode && (
                <View style={styles.section}>
                  <TextInput
                    value={freeformText}
                    onChangeText={setFreeformText}
                    placeholder="Tell me what's on your mind…"
                    multiline
                    numberOfLines={8}
                    testID="freeform-input"
                    style={styles.freeformInput}
                  />
                </View>
              )}

              {/* Structured fields */}
              {!aiMode && selectedType && (
                <View style={styles.fieldsContainer}>
                  {selectedType === 'habit' && (
                    <HabitFields
                      name={habitName}
                      onNameChange={setHabitName}
                      frequency={habitFrequency}
                      onFrequencyChange={setHabitFrequency}
                      subtype={habitSubtype as 'start_habit' | 'break_habit' | 'routine' | null}
                      onSubtypeChange={setHabitSubtype}
                      disabled={false}
                    />
                  )}
                  {selectedType === 'todo' && (
                    <TodoFields
                      name={todoName}
                      onNameChange={setTodoName}
                      dueDate={todoDueDate}
                      onDueDateChange={setTodoDueDate}
                      subtype={todoSubtype as 'reminder' | 'microproject' | null}
                      onSubtypeChange={setTodoSubtype}
                      disabled={false}
                    />
                  )}
                  {selectedType === 'journal' && (
                    <JournalFields
                      date={journalDate}
                      onDateChange={setJournalDate}
                      entry={journalEntry}
                      onEntryChange={setJournalEntry}
                      subtype={
                        journalSubtype as 'reflection' | 'gratitude' | 'dream' | 'review' | null
                      }
                      onSubtypeChange={setJournalSubtype}
                      disabled={false}
                    />
                  )}
                  {selectedType === 'note' && (
                    <NoteFields
                      title={noteTitle}
                      onTitleChange={setNoteTitle}
                      body={noteBody}
                      onBodyChange={setNoteBody}
                      subtype={noteSubtype as 'idea' | 'list' | 'reference' | null}
                      onSubtypeChange={setNoteSubtype}
                      disabled={false}
                    />
                  )}
                  {selectedType === 'person' && (
                    <PersonFields
                      name={personName}
                      onNameChange={setPersonName}
                      email={personEmail}
                      onEmailChange={setPersonEmail}
                      disabled={false}
                    />
                  )}
                </View>
              )}

              {/* Space selector placeholder */}
              {/* TODO: Add ScopeSelector integration */}
            </ScrollView>

            {/* CTA bar */}
            <View style={styles.footer}>
              <Button
                label={isLoading ? 'Saving...' : 'Save to Hub'}
                onPress={handleSave}
                disabled={isSaveDisabled()}
                fullWidth
                testID="save-to-hub"
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#FFF9F0', // warm cream
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  section: {
    marginBottom: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    minWidth: 90,
  },
  aiButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  aiButtonActive: {
    backgroundColor: '#E0E7FF',
    borderColor: '#6366F1',
  },
  aiButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  aiButtonTextActive: {
    color: '#4F46E5',
  },
  freeformInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    minHeight: 160,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
  },
  fieldsContainer: {
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
});
