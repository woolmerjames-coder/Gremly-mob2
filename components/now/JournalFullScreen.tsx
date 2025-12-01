/**
 * JournalFullScreen - Immersive full-screen journal view/editor
 *
 * Features:
 * - View and edit existing journals
 * - Create new journals in create mode
 * - Date navigation between entries
 * - Random writing prompts
 * - Auto-save on Done
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, addDays, subDays, parseISO, isToday, isSameDay } from 'date-fns';

import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';

// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens
// ─────────────────────────────────────────────────────────────────────────────
const WARM_CREAM = '#FDF8F3';
const MOSS_GREEN = '#2E5540';
const CHARCOAL_INK = '#333333';
const SUBTLE_GREY = '#888888';
const LIGHT_BORDER = 'rgba(0,0,0,0.08)';

// ─────────────────────────────────────────────────────────────────────────────
// Writing Prompts
// ─────────────────────────────────────────────────────────────────────────────
const JOURNAL_PROMPTS = [
  'What am I grateful for today?',
  'One thing on my mind...',
  "Today's small win was...",
  "I'm feeling...",
  'Something I learned today...',
  'Tomorrow I want to...',
  'A challenge I faced...',
  'What made me smile?',
  'A moment I want to remember...',
  "Right now I'm thinking about...",
  'One thing I accomplished today...',
  'Something I noticed today...',
];

function getRandomPrompt(): string {
  return JOURNAL_PROMPTS[Math.floor(Math.random() * JOURNAL_PROMPTS.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface JournalFullScreenProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** ID of existing journal to view/edit (ignored in create mode) */
  logId?: string;
  /** Called when user closes the modal */
  onClose: () => void;
  /** Called after save completes */
  onSave: () => void;
  /** When true, creates a new journal instead of editing */
  createMode?: boolean;
}

interface JournalEntry {
  id: string;
  title: string;
  body: string;
  date: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export function JournalFullScreen({
  visible,
  logId,
  onClose,
  onSave,
  createMode = false,
}: JournalFullScreenProps) {
  const insets = useSafeAreaInsets();
  const repo = useRepo();
  const { user } = useAuth();
  const inputRef = useRef<TextInput>(null);

  // State
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [currentJournalId, setCurrentJournalId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);

  // Check if content has changed
  const hasChanges = content !== originalContent;

  // Format date for display
  const formattedDate = useMemo(() => {
    return format(currentDate, 'EEEE, MMMM d');
  }, [currentDate]);

  // Load journal entry
  const loadJournal = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const entry = await repo.getById(id);
        if (entry && entry.type === 'note') {
          setContent(entry.body || '');
          setOriginalContent(entry.body || '');
          setCurrentJournalId(entry.id);
          // Parse date from entry
          if (entry.date) {
            setCurrentDate(parseISO(entry.date));
          } else if (entry.created_at) {
            setCurrentDate(parseISO(entry.created_at));
          }
        }
      } catch (error) {
        console.error('[JournalFullScreen] Failed to load journal:', error);
        Alert.alert('Error', 'Failed to load journal entry');
      } finally {
        setLoading(false);
      }
    },
    [repo],
  );

  // Load journal for a specific date
  const loadJournalForDate = useCallback(
    async (date: Date) => {
      setLoading(true);
      try {
        // Query for journals from the past year and find one matching this date
        const sinceIso = subDays(new Date(), 365).toISOString();
        const recentDrops = await repo.listRecentDrops(sinceIso);

        // Filter to find journals for this specific date
        const journalForDate = recentDrops.find((drop: any) => {
          // Check if it's a journal by looking for subtype or body content
          const entryDate = drop.created_at;
          if (!entryDate) return false;
          return isSameDay(parseISO(entryDate), date);
        });

        if (journalForDate) {
          setContent(journalForDate.body || '');
          setOriginalContent(journalForDate.body || '');
          setCurrentJournalId(journalForDate.id);
        } else {
          // No journal for this date
          setContent('');
          setOriginalContent('');
          setCurrentJournalId(null);
        }
        setCurrentDate(date);
      } catch (error) {
        console.error('[JournalFullScreen] Failed to load journal for date:', error);
      } finally {
        setLoading(false);
      }
    },
    [repo],
  );

  // Initialize on open
  useEffect(() => {
    if (visible) {
      setPrompt(null);
      if (createMode) {
        // Create mode: start fresh with today's date
        setContent('');
        setOriginalContent('');
        setCurrentDate(new Date());
        setCurrentJournalId(null);
        // Focus input after mount
        setTimeout(() => inputRef.current?.focus(), 300);
      } else if (logId) {
        // Edit mode: load existing journal
        void loadJournal(logId);
      }
    }
  }, [visible, createMode, logId, loadJournal]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!content.trim() && !currentJournalId) {
      // Nothing to save
      onClose();
      return;
    }

    setSaving(true);
    try {
      if (currentJournalId) {
        // Update existing journal
        await repo.updateNote(currentJournalId, {
          content: content.trim(),
        });
      } else if (user?.id) {
        // Create new journal
        await repo.createNote({
          space_id: '', // No space for personal journals
          user_id: user.id,
          type: 'journal',
          content: content.trim(),
          title: format(currentDate, 'MMMM d, yyyy'),
          date: format(currentDate, 'yyyy-MM-dd'),
        });
      }
      setOriginalContent(content);
      onSave();
      onClose();
    } catch (error) {
      console.error('[JournalFullScreen] Failed to save journal:', error);
      Alert.alert('Error', 'Failed to save journal entry');
    } finally {
      setSaving(false);
    }
  }, [content, currentJournalId, currentDate, repo, onSave, onClose]);

  // Handle back with unsaved changes warning
  const handleBack = useCallback(() => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Do you want to save before leaving?',
        [
          { text: 'Discard', style: 'destructive', onPress: onClose },
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: handleSave },
        ],
      );
    } else {
      onClose();
    }
  }, [hasChanges, onClose, handleSave]);

  // Handle date navigation
  const goToPreviousDay = useCallback(() => {
    const prevDate = subDays(currentDate, 1);
    void loadJournalForDate(prevDate);
  }, [currentDate, loadJournalForDate]);

  const goToNextDay = useCallback(() => {
    const nextDate = addDays(currentDate, 1);
    // Don't go past today
    if (nextDate <= new Date()) {
      void loadJournalForDate(nextDate);
    }
  }, [currentDate, loadJournalForDate]);

  // Handle prompt
  const handleGetPrompt = useCallback(() => {
    const newPrompt = getRandomPrompt();
    setPrompt(newPrompt);
    // If content is empty, insert prompt as starter
    if (!content.trim()) {
      setContent(newPrompt + ' ');
      inputRef.current?.focus();
    }
  }, [content]);

  // Format nav dates
  const prevDateLabel = format(subDays(currentDate, 1), 'MMM d');
  const nextDateLabel = format(addDays(currentDate, 1), 'MMM d');
  const canGoNext = !isToday(currentDate);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleBack}
    >
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={MOSS_GREEN} />
            ) : (
              <Text style={[styles.doneButton, !hasChanges && styles.doneButtonDisabled]}>
                Done
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Content Area */}
        <View style={styles.contentArea}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={MOSS_GREEN} />
            </View>
          ) : (
            <>
              {/* Date Display */}
              <Text style={styles.dateDisplay}>{formattedDate}</Text>

              {/* Journal Text Input */}
              <TextInput
                ref={inputRef}
                style={styles.journalInput}
                placeholder={prompt || 'Start writing...'}
                placeholderTextColor={SUBTLE_GREY}
                value={content}
                onChangeText={setContent}
                multiline
                textAlignVertical="top"
                autoFocus={createMode}
              />

              {/* Get Prompt Button */}
              <TouchableOpacity
                style={[styles.promptButton, content.trim() && styles.promptButtonSubtle]}
                onPress={handleGetPrompt}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.promptButtonText, content.trim() && styles.promptButtonTextSubtle]}
                >
                  {prompt ? 'Get another prompt' : 'Get a prompt'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Date Navigation Footer */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={goToPreviousDay} style={styles.navButton}>
            <Text style={styles.navButtonText}>← {prevDateLabel}</Text>
          </TouchableOpacity>
          <Text style={styles.navDot}>·</Text>
          <TouchableOpacity onPress={goToNextDay} style={styles.navButton} disabled={!canGoNext}>
            <Text style={[styles.navButtonText, !canGoNext && styles.navButtonDisabled]}>
              {nextDateLabel} →
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WARM_CREAM,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    fontSize: 16,
    color: MOSS_GREEN,
    fontWeight: '500',
  },
  doneButton: {
    fontSize: 16,
    color: MOSS_GREEN,
    fontWeight: '600',
  },
  doneButtonDisabled: {
    opacity: 0.5,
  },
  // Content
  contentArea: {
    flex: 1,
    paddingHorizontal: 28,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateDisplay: {
    fontSize: 16,
    fontWeight: '600',
    color: MOSS_GREEN,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  journalInput: {
    flex: 1,
    fontSize: 18,
    lineHeight: 28, // 1.55 line height for readability
    color: CHARCOAL_INK,
    textAlignVertical: 'top',
    paddingTop: 0,
    paddingBottom: 24,
  },
  // Prompt Button
  promptButton: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(46, 85, 64, 0.1)',
    borderRadius: 24,
    marginBottom: 24,
  },
  promptButtonSubtle: {
    backgroundColor: 'transparent',
  },
  promptButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: MOSS_GREEN,
  },
  promptButtonTextSubtle: {
    color: SUBTLE_GREY,
  },
  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: LIGHT_BORDER,
  },
  navButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navButtonText: {
    fontSize: 14,
    color: MOSS_GREEN,
    fontWeight: '500',
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navDot: {
    fontSize: 16,
    color: SUBTLE_GREY,
    marginHorizontal: 8,
  },
});

export default JournalFullScreen;
