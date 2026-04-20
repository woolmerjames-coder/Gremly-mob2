/**
 * JournalFullScreen - Immersive full-screen journal view/editor
 *
 * Features:
 * - View and edit existing journals
 * - Create new journals in create mode
 * - Date navigation between entries
 * - Cycling writing prompts (FIX 2)
 * - Auto-save on Done with enrichment (FIX 3)
 * - Open overlay button (FIX 4)
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
import { MoreHorizontal } from 'lucide-react-native';
import { format, addDays, subDays, parseISO, isToday, isSameDay } from 'date-fns';

import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { getDateService } from '../../lib/date';
import { env, getEnv } from '../../lib/env';
import { getSessionToken } from '../../lib/cortex/getSessionToken';

// ─────────────────────────────────────────────────────────────────────────────
// Cortex URL helper (same pattern as useEventQuickAdd.ts)
// ─────────────────────────────────────────────────────────────────────────────
const safeGetEnv = typeof getEnv === 'function' ? getEnv : undefined;

const readCortexUrl = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_CORTEX_URL');
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

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

// Goal check-in focused prompts (FIX 2: expanded list)
const GOAL_CHECKIN_PROMPTS = [
  'What progress have you made since last time?',
  "What's the biggest thing in the way right now?",
  'How are you feeling about this goal today?',
  "What's one small thing you could do next?",
  'Has anything changed about what you want here?',
  'What would make you feel good about this week?',
  'What obstacles am I facing?',
  'What would help me move forward?',
  "What's working well?",
  'What have I learned so far?',
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Context for goal check-in journals */
export interface GoalContext {
  type: 'goal_checkin';
  goal_id: string;
  goal_name: string;
  space_id: string;
  space_name: string;
}

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
  /** Optional goal context for check-in journals */
  goalContext?: GoalContext;
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
  goalContext,
}: JournalFullScreenProps) {
  const insets = useSafeAreaInsets();
  const repo = useRepo();
  const { user } = useAuth();
  const inputRef = useRef<TextInput>(null);

  // Zustand store for creating notes (FIX 3)
  const createNote = useGremlyStore((s) => s.createNote);
  const updateNote = useGremlyStore((s) => s.updateNote);

  // Global overlay for opening full note editor (FIX 4)
  const { openEdit } = useGlobalOverlay();

  // Determine which prompts to use based on context
  const prompts = goalContext?.type === 'goal_checkin' ? GOAL_CHECKIN_PROMPTS : JOURNAL_PROMPTS;

  // State
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [currentDate, setCurrentDate] = useState<Date>(getDateService().now());
  const [currentJournalId, setCurrentJournalId] = useState<string | null>(null);
  // FIX 2: Use index-based prompt cycling instead of random
  const [promptIndex, setPromptIndex] = useState(-1); // -1 means no prompt shown yet
  const [promptShown, setPromptShown] = useState(false);

  // Current prompt based on index (FIX 2)
  const currentPrompt = promptIndex >= 0 ? prompts[promptIndex % prompts.length] : null;

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
        const sinceIso = subDays(getDateService().now(), 365).toISOString();
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
      // Reset prompt state (FIX 2)
      setPromptIndex(-1);
      setPromptShown(false);
      if (createMode) {
        // Create mode: start fresh with today's date
        setContent('');
        setOriginalContent('');
        setCurrentDate(getDateService().now());
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
        // Update existing journal via repo
        await repo.updateNote(currentJournalId, {
          content: content.trim(),
        });
        setOriginalContent(content);
        onSave();
        onClose();
      } else if (user?.id) {
        // FIX 3: Create new journal via Zustand store (not repo) for proper persistence
        // Create immediately, then run enrichment async (fire-and-forget)
        const isGoalCheckin = goalContext?.type === 'goal_checkin';

        console.log(
          '[JournalFullScreen] goalContext received:',
          JSON.stringify(goalContext, null, 2),
        );

        // Build note data for Zustand store
        const notePayload: any = {
          title: isGoalCheckin
            ? `Check-in: ${goalContext.goal_name}`
            : format(currentDate, 'MMMM d, yyyy'),
          body: content.trim(),
          subtype: 'journal',
          space_id: goalContext?.space_id || '',
          origin: isGoalCheckin ? 'goal_checkin' : 'manual',
          tags: isGoalCheckin ? [goalContext.goal_name.toLowerCase()] : [],
        };

        // Add goal check-in metadata
        if (isGoalCheckin) {
          notePayload.views = {
            goal_checkin: {
              goal_id: goalContext.goal_id,
              goal_name: goalContext.goal_name,
            },
          };
        }

        console.log(
          '[JournalFullScreen] Creating note with payload:',
          JSON.stringify(notePayload, null, 2),
        );

        // Create note immediately (this is what matters for check-in count)
        const newNote = await createNote(notePayload);
        const newNoteId = newNote?.id;

        console.log(
          '[JournalFullScreen] Created journal note:',
          newNoteId,
          'full response:',
          JSON.stringify(newNote, null, 2),
        );

        // Navigate back immediately - don't wait for enrichment
        setOriginalContent(content);
        setCurrentJournalId(newNoteId || null);
        onSave();
        onClose();

        // FIX 3: Run enrichment async (fire-and-forget) - don't block navigation
        if (newNoteId) {
          enrichGoalCheckin(newNoteId, content.trim(), goalContext).catch((err) => {
            console.warn('[JournalFullScreen] Enrichment failed:', err);
          });
        }
      }
    } catch (error) {
      console.error('[JournalFullScreen] Failed to save journal:', error);
      Alert.alert('Error', 'Failed to save journal entry');
      setSaving(false);
    }
  }, [
    content,
    currentJournalId,
    currentDate,
    repo,
    onSave,
    onClose,
    goalContext,
    user?.id,
    createNote,
  ]);

  // FIX 3: Async enrichment function (fire-and-forget)
  const enrichGoalCheckin = useCallback(
    async (noteId: string, text: string, context: GoalContext | undefined) => {
      try {
        const cortexUrl = readCortexUrl();
        if (!cortexUrl) {
          console.warn('[JournalFullScreen] Missing cortex URL, skipping enrichment');
          return;
        }
        const sessionToken = await getSessionToken();

        const ds = getDateService();
        const currentDateStr = ds.today();
        const dayOfWeek = ds.getDayOfWeek();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

        console.log('[JournalFullScreen] Running Phase 1.5a + Phase 2 enrichment');

        // Run Phase 1.5a and Phase 2 in parallel
        const [phase15aResult, phase2Result] = await Promise.all([
          // Phase 1.5a: Smart title + confirmation message
          (async () => {
            try {
              const res = await fetch(cortexUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${sessionToken}`,
                },
                body: JSON.stringify({
                  type: 'enrich-phase1-5a',
                  text,
                  bucket: 'log',
                  subtype: 'journal',
                }),
              });
              if (!res.ok) return null;
              return await res.json();
            } catch (err) {
              console.warn('[JournalFullScreen] Phase 1.5a failed:', err);
              return null;
            }
          })(),
          // Phase 2: Tags, mood, etc.
          (async () => {
            try {
              const res = await fetch(cortexUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${sessionToken}`,
                },
                body: JSON.stringify({
                  type: 'enrich-phase2',
                  text,
                  bucket: 'log',
                  subtype: 'journal',
                  currentDate: currentDateStr,
                  dayOfWeek,
                  timezone,
                }),
              });
              if (!res.ok) return null;
              return await res.json();
            } catch (err) {
              console.warn('[JournalFullScreen] Phase 2 failed:', err);
              return null;
            }
          })(),
        ]);

        console.log(
          '[JournalFullScreen] Phase 1.5a result:',
          JSON.stringify(phase15aResult, null, 2),
        );
        console.log('[JournalFullScreen] Phase 2 result:', JSON.stringify(phase2Result, null, 2));

        // Build update payload
        const smartTitle = phase15aResult?.smart_title || text.substring(0, 60);
        const goalName = context?.goal_name?.toLowerCase();
        const extractedTags = phase2Result?.tags || [];
        const allTags = goalName ? [...new Set([goalName, ...extractedTags])] : extractedTags;

        const updatePayload: any = {
          title: smartTitle,
          tags: allTags,
        };

        // Add enrichment data to views - ALWAYS preserve goal_checkin if it was set
        if (
          context?.type === 'goal_checkin' ||
          phase15aResult?.confirmation_message ||
          phase2Result?.mood
        ) {
          updatePayload.views = {
            // Always include goal_checkin if this is a goal check-in
            ...(context?.type === 'goal_checkin' && {
              goal_checkin: {
                goal_id: context.goal_id,
                goal_name: context.goal_name,
              },
            }),
            confirmation_message: phase15aResult?.confirmation_message || null,
            mood: phase2Result?.mood || null,
          };
        }

        console.log(
          '[JournalFullScreen] Updating note with payload:',
          JSON.stringify(updatePayload, null, 2),
        );

        // Update the note with enriched data
        await updateNote(noteId, updatePayload);
        console.log('[JournalFullScreen] Enrichment complete for note:', noteId);
      } catch (err) {
        console.error('[JournalFullScreen] Enrichment error:', err);
      }
    },
    [updateNote],
  );

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
    if (nextDate <= getDateService().now()) {
      void loadJournalForDate(nextDate);
    }
  }, [currentDate, loadJournalForDate]);

  // FIX 2: Handle prompt cycling (not random)
  const handleGetPrompt = useCallback(() => {
    setPromptIndex((prev) => prev + 1);
    setPromptShown(true);
    inputRef.current?.focus();
  }, []);

  // FIX 4: Handle opening full overlay editor
  const handleOpenOverlay = useCallback(async () => {
    // If we have an existing note, open it directly
    if (currentJournalId) {
      openEdit({
        id: currentJournalId,
        type: 'note',
      } as any);
      return;
    }

    // If no note exists yet but user has content, save first then open
    if (content.trim() && user?.id) {
      setSaving(true);
      try {
        const isGoalCheckin = goalContext?.type === 'goal_checkin';
        const notePayload: any = {
          title: isGoalCheckin
            ? `Check-in: ${goalContext.goal_name}`
            : format(currentDate, 'MMMM d, yyyy'),
          body: content.trim(),
          subtype: 'journal',
          space_id: goalContext?.space_id || '',
          origin: isGoalCheckin ? 'goal_checkin' : 'manual',
          tags: isGoalCheckin ? [goalContext.goal_name.toLowerCase()] : [],
        };

        if (isGoalCheckin) {
          notePayload.views = {
            goal_checkin: {
              goal_id: goalContext.goal_id,
              goal_name: goalContext.goal_name,
            },
          };
        }

        const newNote = await createNote(notePayload);
        if (newNote?.id) {
          setCurrentJournalId(newNote.id);
          setOriginalContent(content);
          // Open the overlay with the new note
          openEdit({
            id: newNote.id,
            type: 'note',
          } as any);
        }
      } catch (error) {
        console.error('[JournalFullScreen] Failed to save before overlay:', error);
        Alert.alert('Error', 'Failed to save journal entry');
      } finally {
        setSaving(false);
      }
    }
  }, [currentJournalId, content, user?.id, goalContext, currentDate, createNote, openEdit]);

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

          {/* FIX 4: Header right side with overlay button and Done */}
          <View style={styles.headerRight}>
            {/* Overlay button - opens full note editor */}
            <TouchableOpacity
              onPress={handleOpenOverlay}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.overlayButton}
              disabled={saving || (!currentJournalId && !content.trim())}
            >
              <MoreHorizontal
                size={20}
                color={
                  saving || (!currentJournalId && !content.trim()) ? LIGHT_BORDER : SUBTLE_GREY
                }
              />
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

              {/* Goal Context - if checking in on a goal */}
              {goalContext?.type === 'goal_checkin' && (
                <Text style={styles.goalContext}>Check-in: {goalContext.goal_name}</Text>
              )}

              {/* FIX 2: Writing prompt displayed above input */}
              {currentPrompt && <Text style={styles.promptDisplay}>{currentPrompt}</Text>}

              {/* Journal Text Input */}
              <TextInput
                ref={inputRef}
                style={styles.journalInput}
                placeholder="Start writing..."
                placeholderTextColor={SUBTLE_GREY}
                value={content}
                onChangeText={setContent}
                multiline
                textAlignVertical="top"
                autoFocus={createMode}
              />

              {/* Get Prompt Button - FIX 2: Updated text */}
              <TouchableOpacity
                style={[styles.promptButton, content.trim() && styles.promptButtonSubtle]}
                onPress={handleGetPrompt}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.promptButtonText, content.trim() && styles.promptButtonTextSubtle]}
                >
                  {promptShown ? 'Get another prompt' : 'Get a prompt'}
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
  // FIX 4: Header right section
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  overlayButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: 8,
  },
  goalContext: {
    fontSize: 14,
    fontWeight: '500',
    color: SUBTLE_GREY,
    textAlign: 'center',
    marginBottom: 8,
  },
  // FIX 2: Prompt display above input
  promptDisplay: {
    fontSize: 15,
    fontStyle: 'italic',
    color: MOSS_GREEN,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
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
