/**
 * Sweep Flow Screen - Evening Sweep wizard container
 *
 * Full-screen flow for the Evening Sweep ritual:
 * - Step 0: Intro ("Ready to Sweep?")
 * - Step 1: Decision cards
 * - Step 2: Mood check-in
 * - Step 3: Wrap up / habits
 * - Step 4: Summary/celebration
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Animated,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Screen, Text, Button } from '../../ui';
import { Icon } from '../../design-system/Icon';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { BRAND } from '../../design/brand';
import { useTodayEntries, type TodayMergedEntry } from '../../lib/today/hooks/useTodayEntries';
import { useTodayInteractions } from '../../lib/today/useTodayInteractions';
import { supabase } from '../../lib/supabase/client';
import {
  fetchSweepCandidatesForUser,
  applySweepAction,
  markSweepCompleted,
} from '../../lib/sweep/engine';
import type { SweepCandidate, SweepPrimaryActionConfig, SweepSummary } from '../../lib/sweep/types';
import { SweepCard } from '../../components/sweep/SweepCard';
import { useOverlayController } from '../../hooks/useOverlayController';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { OverlayComponent } from '../../components/overlay';
import {
  emitOverlaySaved,
  addOverlaySavedListener,
  type OverlaySavedPayload,
} from '../../lib/events/overlaySaved';
import { emitOverlayClosed, addOverlayClosedListener } from '../../lib/events/overlayClosed';
import { eventBus } from '../../lib/events/EventBus';
import type { AppRecord } from '../../lib/types';

// Gremly mascot for summary step
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../../assets/mascot/ACTUAL GREMLY.png');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

// Navigation props - Sweep is now a full-screen card, not a modal
interface Props {
  navigation?: NativeStackNavigationProp<RootStackParamList, 'Sweep'>;
}

interface StepProps {
  onContinue: () => void;
}

// Mood value type - aligned with existing journal log moods
type MoodValue = 'happy' | 'neutral' | 'sad' | 'ecstatic' | 'low' | 'tired';

// Mood options for Sweep check-in (brand-style chips with icons)
const SWEEP_MOOD_OPTIONS: Array<{ value: MoodValue; label: string; icon: string }> = [
  { value: 'ecstatic', label: 'Great', icon: 'Sun' },
  { value: 'happy', label: 'Good', icon: 'CheckCircle2' },
  { value: 'neutral', label: 'Okay', icon: 'Minus' },
  { value: 'low', label: 'Low', icon: 'TrendingDown' },
  { value: 'tired', label: 'Tired', icon: 'Moon' },
  { value: 'sad', label: 'Rough', icon: 'Cloud' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Step Components
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step 0: Intro ("Ready to Sweep?")
 *
 * Welcome screen that introduces the Sweep ritual.
 * Shows the Gremly mascot and explains what the user will do.
 */
function SweepIntroStep({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.moodStepContainer}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.introScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Gremly mascot - friendly anchor at top */}
        <View style={styles.introMascotContainer}>
          <Image
            source={GREMLY_MASCOT}
            style={styles.introMascotImage}
            resizeMode="contain"
            testID="sweep-intro-mascot"
            accessibilityLabel="Gremly mascot"
          />
        </View>

        {/* Title */}
        <View style={styles.introHeaderSection}>
          <Text variant="title" style={styles.moodStepTitle}>
            Time to Sweep your day
          </Text>
          <Text style={styles.moodStepSubcopy}>
            We'll review what came into your world today. Clear what's done. Keep what still
            matters.
          </Text>
        </View>
      </ScrollView>

      {/* Start Button */}
      <View style={styles.moodButtonContainer}>
        <TouchableOpacity style={styles.moodContinueButton} onPress={onStart} activeOpacity={0.8}>
          <View style={styles.moodContinueButtonContent}>
            <Text style={styles.moodContinueButtonText}>Start Sweeping</Text>
            <Icon name="ArrowRight" size="sm" color={BRAND.colors.mossGreen} strokeWidth={2.5} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Step 1: Decision Cards
 *
 * Shows items that need decisions (keep, clear, skip).
 * This is the core of the Sweep experience.
 */

/**
 * Step 2: Mood Check-in
 *
 * Asks the user how they're feeling during the sweep.
 * Optionally allows a journal entry to reflect on the day.
 *
 * On Continue:
 * - If mood or journal text is provided, creates a journal note
 * - Tags the note with sweep_reflection metadata
 */
function SweepMoodStep({ onContinue }: StepProps) {
  const repo = useRepo();
  const [selectedMood, setSelectedMood] = useState<MoodValue | null>(null);
  const [journalText, setJournalText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleContinue = useCallback(async () => {
    // If nothing to save, just continue
    if (!selectedMood && !journalText.trim()) {
      onContinue();
      return;
    }

    setIsSaving(true);
    try {
      // Create a journal note for the sweep reflection
      // Following the same pattern as UnifiedOverlayV2 for journal/log creation
      await repo.create({
        type: 'note',
        subtype: 'journal',
        title: journalText.trim() || `Evening reflection`,
        body: journalText.trim() || undefined,
        mood: selectedMood ?? undefined,
        origin: 'manual', // Using 'manual' since 'sweep' isn't in the union yet
        canonicalType: 'log',
        journal_subtype: 'reflection',
        tags: ['reflection', 'sweep'],
        views: {
          sweep_origin: true, // Mark as created from Sweep flow
          sweep_reflection: true,
          sweep_date: new Date().toISOString().split('T')[0],
        },
      });

      // TODO: Add error handling / retry UI if save fails
    } catch (error) {
      // Fail silent for now - don't block the sweep flow
      // TODO: Consider showing a subtle error indicator
      console.warn('[SweepMoodStep] Failed to save reflection:', error);
    } finally {
      setIsSaving(false);
      onContinue();
    }
  }, [repo, selectedMood, journalText, onContinue]);

  const handleSkip = useCallback(() => {
    // Skip without saving anything
    onContinue();
  }, [onContinue]);

  return (
    <KeyboardAvoidingView
      style={styles.moodStepContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.moodScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View style={styles.moodHeaderSection}>
          <Text variant="title" style={styles.moodStepTitle}>
            How did today feel?
          </Text>
          <Text style={styles.moodStepSubcopy}>
            A quick check-in helps Gremly match your plan to your mood.
          </Text>
        </View>

        {/* Mood Selector - Centered 2x3 Grid */}
        <View style={styles.moodGridContainer}>
          <View style={styles.moodGrid}>
            {SWEEP_MOOD_OPTIONS.map((option) => {
              const isSelected = selectedMood === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={({ pressed }) => [
                    styles.moodButton,
                    isSelected && styles.moodButtonSelected,
                    pressed && styles.moodButtonPressed,
                  ]}
                  onPress={() => setSelectedMood(option.value)}
                >
                  <Icon
                    name={option.icon as any}
                    size="xs"
                    color={BRAND.colors.mossGreen}
                    strokeWidth={1.8}
                  />
                  <Text
                    style={[styles.moodButtonLabel, isSelected && styles.moodButtonLabelSelected]}
                  >
                    {option.label.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Journal Input */}
        <View style={styles.moodJournalContainer}>
          <Text style={styles.moodJournalLabel}>Want to jot anything down?</Text>
          <TextInput
            style={styles.moodJournalInput}
            placeholder="Today felt like…"
            placeholderTextColor={BRAND.colors.inkMuted}
            multiline
            value={journalText}
            onChangeText={setJournalText}
            textAlignVertical="top"
          />
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.moodButtonContainer}>
        <TouchableOpacity
          style={[styles.moodContinueButton, isSaving && styles.moodContinueButtonDisabled]}
          onPress={handleContinue}
          disabled={isSaving}
          activeOpacity={0.8}
        >
          <View style={styles.moodContinueButtonContent}>
            <Text style={styles.moodContinueButtonText}>{isSaving ? 'Saving...' : 'Continue'}</Text>
            {!isSaving && (
              <Icon name="ArrowRight" size="sm" color={BRAND.colors.mossGreen} strokeWidth={2.5} />
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.moodSkipButton} onPress={handleSkip} disabled={isSaving}>
          <Text style={styles.moodSkipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Step 3: Habits Today
 *
 * Habits-only step to mark what the user managed today.
 * Everything resets tomorrow - just a simple checklist.
 */
function SweepWrapUpStep({ onContinue }: StepProps) {
  const { items, loading, reload } = useTodayEntries();
  const interactions = useTodayInteractions({
    onReload: reload,
    celebrationEnabled: false,
    showCelebrationToast: false,
  });

  // Filter to habits only
  const habits = useMemo(() => {
    const habitsList: TodayMergedEntry[] = [];

    for (const item of items) {
      // Skip items that have been optimistically completed
      if (item.type === 'habit' && interactions.completedHabitIds.has(item.id)) continue;
      if (interactions.deletedItemIds.has(item.id)) continue;

      if (item.type === 'habit') {
        habitsList.push(item);
      }
    }

    return habitsList;
  }, [items, interactions.completedHabitIds, interactions.deletedItemIds]);

  // Handle habit completion
  const handleHabitToggle = useCallback(
    async (habit: TodayMergedEntry) => {
      if (habit.type !== 'habit') return;
      await interactions.toggleHabitComplete({
        id: habit.id,
        name: habit.name,
      });
    },
    [interactions],
  );

  // Check if there are no habits
  const isEmpty = habits.length === 0;

  // Count open habits for the reminder message
  const openHabitsCount = habits.length;

  if (loading) {
    return (
      <View style={styles.wrapUpStepContainer}>
        <View style={styles.wrapUpHeaderSection}>
          <Text variant="title" style={styles.wrapUpStepTitle}>
            Habits today
          </Text>
          <Text style={styles.wrapUpStepSubcopy}>
            Mark what you managed today. Everything resets tomorrow.
          </Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapUpStepContainer}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.wrapUpScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View style={styles.wrapUpHeaderSection}>
          <Text variant="title" style={styles.wrapUpStepTitle}>
            Habits today
          </Text>
          <Text style={styles.wrapUpStepSubcopy}>
            Mark what you managed today. Everything resets tomorrow.
          </Text>
        </View>

        {isEmpty ? (
          <View style={styles.wrapUpEmptyContainer}>
            <Text variant="body" style={styles.wrapUpEmptyText}>
              No habits to check off — you're all set!
            </Text>
          </View>
        ) : (
          <View style={styles.wrapUpSection}>
            <View style={styles.wrapUpItemsList}>
              {habits.map((habit, index) => (
                <TouchableOpacity
                  key={habit.id}
                  style={[
                    styles.wrapUpItemRow,
                    index < habits.length - 1 && styles.wrapUpItemRowBorder,
                  ]}
                  onPress={() => handleHabitToggle(habit)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.wrapUpItemName}>{habit.name}</Text>
                  <View style={styles.wrapUpCheckboxContainer}>
                    <View
                      style={[
                        styles.wrapUpCheckbox,
                        interactions.completedHabitIds.has(habit.id) &&
                          styles.wrapUpCheckboxChecked,
                      ]}
                    >
                      {interactions.completedHabitIds.has(habit.id) && (
                        <Text style={styles.wrapUpCheckmark}>✓</Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Action Button */}
      <View style={styles.wrapUpButtonContainer}>
        {/* Open habits reminder */}
        {openHabitsCount > 0 && (
          <Text style={styles.wrapUpOpenItemsReminder}>
            {openHabitsCount} habit{openHabitsCount !== 1 ? 's' : ''} still open.
          </Text>
        )}
        {openHabitsCount === 0 && !isEmpty && (
          <Text style={styles.wrapUpOpenItemsReminder}>All habits checked off!</Text>
        )}
        <TouchableOpacity
          style={styles.wrapUpContinueButton}
          onPress={onContinue}
          activeOpacity={0.8}
        >
          <View style={styles.wrapUpContinueButtonContent}>
            <Text style={styles.wrapUpContinueButtonText}>Continue</Text>
            <Icon name="ArrowRight" size="sm" color="#FFFFFF" strokeWidth={2.5} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Step 2: Decision Cards
 *
 * Shows items that need a decision (keep, defer, archive).
 * This is the main triage step of the Evening Sweep.
 *
 * Fetches candidates from the sweep engine and allows the user
 * to triage each item one at a time.
 */

interface DecisionStepProps {
  onFinished: (summary: SweepSummary) => void;
  onClose?: () => void;
}

function SweepDecisionStep({ onFinished, onClose }: DecisionStepProps) {
  const { userId } = useAuth();
  const repo = useRepo();
  const overlayController = useOverlayController();

  // State for candidates and navigation
  const [candidates, setCandidates] = useState<SweepCandidate[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Track summary stats for the sweep completion screen
  const [stats, setStats] = useState<SweepSummary>({ kept: 0, cleared: 0 });

  // Track the candidate ID currently being edited (for detecting overlay saves)
  const editingCandidateIdRef = useRef<string | null>(null);

  // Animated progress bar width - use useMemo to avoid ref access during render
  const progressWidth = useMemo(() => new Animated.Value(0), []);

  // Fetch candidates on mount
  useEffect(() => {
    let cancelled = false;

    async function loadCandidates() {
      if (!userId) {
        setIsLoading(false);
        return;
      }

      try {
        const items = await fetchSweepCandidatesForUser(userId, supabase);
        if (!cancelled) {
          setCandidates(items ?? []);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('[SweepDecisionStep] Failed to fetch candidates:', error);
        if (!cancelled) {
          setCandidates([]);
          setIsLoading(false);
        }
      }
    }

    loadCandidates();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Animate progress bar when currentIndex or candidates.length changes
  useEffect(() => {
    if (candidates.length === 0) return;
    // Progress: (currentIndex + 1) / total - shows completion of current item
    const progress = (currentIndex + 1) / candidates.length;
    const maxBarWidth = 52; // 52px max width
    const targetWidth = progress * maxBarWidth;

    Animated.timing(progressWidth, {
      toValue: targetWidth,
      duration: 300,
      useNativeDriver: false, // width animation requires JS driver
    }).start();
  }, [currentIndex, candidates.length, progressWidth]);

  // ─────────────────────────────────────────────────────────────────────────
  // Unified Outcome Handler
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Centralized handler for all sweep card outcomes.
   * Any meaningful action advances the card; "peek and close" stays.
   */
  type SweepOutcome = 'keep' | 'clear' | 'changed' | 'stay';

  // Store handleOutcome in a ref so the effect can access the latest version
  const handleOutcomeRef = useRef<(outcome: SweepOutcome) => void>(() => {});

  const handleOutcome = useCallback(
    async (outcome: SweepOutcome) => {
      const candidate = candidates[currentIndex];
      if (!candidate) return;

      switch (outcome) {
        case 'keep': {
          try {
            await applySweepAction(
              { type: 'keep', id: candidate.id, kind: candidate.kind },
              supabase,
            );
            setStats((prev) => ({ ...prev, kept: prev.kept + 1 }));
          } catch (error) {
            console.error('[SweepDecisionStep] handleOutcome keep error:', error);
          }
          setCurrentIndex((prev) => prev + 1);
          break;
        }

        case 'clear': {
          try {
            await applySweepAction(
              { type: 'clear', id: candidate.id, kind: candidate.kind },
              supabase,
            );
            setStats((prev) => ({ ...prev, cleared: prev.cleared + 1 }));
          } catch (error) {
            console.error('[SweepDecisionStep] handleOutcome clear error:', error);
          }
          setCurrentIndex((prev) => prev + 1);
          break;
        }

        case 'changed': {
          // User made a meaningful change (via primary action or edit overlay)
          // Treat as "kept but changed" - count as kept and advance
          try {
            await applySweepAction(
              { type: 'keep', id: candidate.id, kind: candidate.kind },
              supabase,
            );
            setStats((prev) => ({ ...prev, kept: prev.kept + 1 }));
          } catch (error) {
            console.error('[SweepDecisionStep] handleOutcome changed error:', error);
          }
          setCurrentIndex((prev) => prev + 1);
          break;
        }

        case 'stay':
          // Do nothing - keep current card visible
          return;
      }
    },
    [candidates, currentIndex],
  );

  // Keep the ref updated with the latest handleOutcome
  useEffect(() => {
    handleOutcomeRef.current = handleOutcome;
  }, [handleOutcome]);

  // Listen for overlay save events to detect "changed" outcomes from edit/primary actions
  useEffect(() => {
    const unsubscribeSaved = addOverlaySavedListener((payload) => {
      // Check if the saved item matches the candidate we're currently editing
      const editingId = editingCandidateIdRef.current;
      if (editingId && payload.id === editingId) {
        // Clear the editing ref and advance the card
        editingCandidateIdRef.current = null;
        handleOutcomeRef.current('changed');
      }
    });

    // Listen for overlay close events (cancel without save)
    const unsubscribeClosed = addOverlayClosedListener((payload) => {
      // If user cancelled editing the current candidate, just clear the ref (don't advance)
      const editingId = editingCandidateIdRef.current;
      if (editingId && payload.editingId === editingId && !payload.didSave) {
        // Clear the editing ref but DON'T advance - this is "peek and close"
        editingCandidateIdRef.current = null;
      }
    });

    return () => {
      unsubscribeSaved();
      unsubscribeClosed();
    };
  }, []); // Empty deps - uses refs to avoid re-subscribing

  // ─────────────────────────────────────────────────────────────────────────
  // Card Action Handlers (wired to unified outcome handler)
  // ─────────────────────────────────────────────────────────────────────────
  const handleKeep = useCallback(() => {
    handleOutcome('keep');
  }, [handleOutcome]);

  const handleClear = useCallback(() => {
    handleOutcome('clear');
  }, [handleOutcome]);

  const handleOpenEdit = useCallback(async () => {
    const candidate = candidates[currentIndex];
    if (!candidate) return;

    // Track which candidate is being edited so we can detect saves
    editingCandidateIdRef.current = candidate.id;

    try {
      // Fetch the full record from DB to ensure all fields are available
      const fullRecord = await repo.getById(candidate.id);

      if (fullRecord && fullRecord.type === candidate.kind) {
        // Open UnifiedOverlayV2 with the full record
        overlayController.openEdit({ record: fullRecord as AppRecord });
      } else {
        // Fallback: construct a minimal record from the raw data
        console.warn(
          '[SweepDecisionStep] handleOpenEdit: record not found or type mismatch, using raw',
        );
        const fallbackRecord = {
          ...candidate.raw,
          type: candidate.kind,
        } as AppRecord;
        overlayController.openEdit({ record: fallbackRecord });
      }
    } catch (error) {
      console.error('[SweepDecisionStep] handleOpenEdit error:', error);
      // Fallback: construct a minimal record from the raw data
      const fallbackRecord = {
        ...candidate.raw,
        type: candidate.kind,
      } as AppRecord;
      overlayController.openEdit({ record: fallbackRecord });
    }
  }, [candidates, currentIndex, repo, overlayController]);

  const handleConvertToTodo = useCallback(async () => {
    const candidate = candidates[currentIndex];
    if (!candidate || candidate.kind !== 'note') return;

    try {
      // Fetch the full record from DB
      const fullRecord = await repo.getById(candidate.id);
      const record = fullRecord || { ...candidate.raw, type: 'note' };

      // Open overlay in create mode with todo type and prefilled content
      // This mimics the "Turn into a to-do" conversion pattern
      overlayController.openCreate({
        type: 'todo',
        conversionMeta: {
          initialTitle: ((record as Record<string, unknown>).title as string) || '',
          initialNote: ((record as Record<string, unknown>).body as string) || '',
          initialTags: ((record as Record<string, unknown>).tags as string[]) || [],
          sourceNoteId: candidate.id, // Track source for potential archiving
        },
      });
    } catch (error) {
      console.error('[SweepDecisionStep] handleConvertToTodo error:', error);
      // Fallback: open with raw data
      overlayController.openCreate({
        type: 'todo',
        conversionMeta: {
          initialTitle: candidate.raw.title || '',
          initialNote: candidate.raw.body || '',
          initialTags: ((candidate.raw as Record<string, unknown>).tags as string[]) || [],
          sourceNoteId: candidate.id,
        },
      });
    }
  }, [candidates, currentIndex, repo, overlayController]);

  // ─────────────────────────────────────────────────────────────────────────
  // Primary Action Handler
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Handle primary action button press based on action type.
   * Opens the appropriate overlay/picker and returns whether to advance.
   *
   * @returns 'advance' if meaningful change was saved, 'stay' if cancelled
   */
  const handlePrimaryAction = useCallback(
    async (
      config: SweepPrimaryActionConfig,
      candidate: SweepCandidate,
    ): Promise<'advance' | 'stay'> => {
      try {
        // Fetch the full record from DB to ensure all fields are available
        const fullRecord = await repo.getById(candidate.id);
        const record = fullRecord || { ...candidate.raw, type: candidate.kind };

        switch (config.type) {
          case 'todo_add_due_date':
          case 'todo_review_due_date': {
            // Track this candidate for overlay save detection
            editingCandidateIdRef.current = candidate.id;
            // Open the todo in edit mode - the overlay has date picker functionality
            // The user can set/change the due date there
            if (fullRecord && fullRecord.type === 'todo') {
              overlayController.openEdit({ record: fullRecord as AppRecord });
            } else {
              const fallbackRecord = { ...candidate.raw, type: 'todo' } as AppRecord;
              overlayController.openEdit({ record: fallbackRecord });
            }
            // Return 'stay' - the overlay save listener will advance on save
            return 'stay';
          }

          case 'log_idea_to_todo': {
            // For conversion, we don't auto-advance since we're creating a new item
            // The user should explicitly swipe/keep after conversion
            overlayController.openCreate({
              type: 'todo',
              // Note: conversionMeta isn't supported in the current type,
              // so we use the standard create flow. The user will manually
              // copy the content if needed, or we can enhance the overlay later.
            });
            return 'stay';
          }

          case 'log_journal_followup': {
            // For journal follow-up, we're creating a new entry
            // The user should explicitly keep/clear the original after
            overlayController.openCreate({
              type: 'log',
              logSubtype: 'journal',
            });
            return 'stay';
          }

          case 'log_general_decide': {
            // Track this candidate for overlay save detection
            editingCandidateIdRef.current = candidate.id;
            // Open the full edit overlay for the log
            // User can convert to todo/habit, add tags, reminders, etc.
            if (fullRecord && fullRecord.type === 'note') {
              overlayController.openEdit({ record: fullRecord as AppRecord });
            } else {
              const fallbackRecord = { ...candidate.raw, type: 'note' } as AppRecord;
              overlayController.openEdit({ record: fallbackRecord });
            }
            return 'stay';
          }

          default:
            console.warn('[SweepDecisionStep] Unknown primary action type:', config.type);
            return 'stay';
        }
      } catch (error) {
        console.error('[SweepDecisionStep] handlePrimaryAction error:', error);
        return 'stay';
      }
    },
    [repo, overlayController],
  );

  // Auto-advance to summary when all cards are processed
  useEffect(() => {
    if (!isLoading && candidates.length > 0 && currentIndex >= candidates.length) {
      // All cards processed - auto-finish to show summary
      onFinished(stats);
    }
  }, [isLoading, candidates.length, currentIndex, stats, onFinished]);

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.decisionLoadingContainer}>
          <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
          <Text variant="subtle" style={styles.decisionLoadingText}>
            Preparing your Sweep…
          </Text>
        </View>
      </View>
    );
  }

  // Empty state - nothing to sweep
  if (candidates.length === 0) {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.decisionEmptyContainer}>
          <Text variant="title" style={styles.decisionEmptyTitle}>
            ✨
          </Text>
          <Text variant="body" style={styles.decisionEmptyText}>
            Nothing to Sweep right now — you're all clear.
          </Text>
        </View>
        <View style={styles.buttonContainer}>
          <Button
            title="Done"
            variant="primary"
            onPress={() => onFinished({ kept: 0, cleared: 0 })}
          />
        </View>
      </View>
    );
  }

  // All cards processed - show brief transition (auto-advances via useEffect above)
  if (currentIndex >= candidates.length) {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.decisionLoadingContainer}>
          <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
        </View>
      </View>
    );
  }

  // Current candidate to display
  const currentCandidate = candidates[currentIndex];

  return (
    <View style={styles.decisionStepContainer}>
      {/* Decision Step Header - Counter left, pill + close right */}
      <View style={styles.decisionHeader}>
        {/* Left - Item counter with progress bar */}
        <View style={styles.decisionHeaderLeft}>
          <Text style={styles.decisionHeaderCounter}>
            {currentIndex + 1} of {candidates.length} items
          </Text>
          {/* Progress underline - Golden Pear */}
          <View style={styles.progressBarContainer}>
            {/* Base rail - low opacity sage */}
            <View style={styles.progressBarRail} />
            {/* Animated fill - Golden Pear */}
            <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
          </View>
        </View>

        {/* Right - Today's Sweep pill + X icon */}
        <View style={styles.decisionHeaderRight}>
          <View style={styles.decisionContextPill}>
            <Text style={styles.decisionContextPillText}>Today's Sweep</Text>
          </View>
          {onClose && (
            <TouchableOpacity
              style={styles.decisionCloseButton}
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityLabel="Close Sweep"
              accessibilityRole="button"
            >
              <Icon name="X" size="sm" color={BRAND.colors.mossGreen} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Full-screen Card Area */}
      <View style={styles.decisionCardArea}>
        <SweepCard
          candidate={currentCandidate}
          index={currentIndex}
          total={candidates.length}
          onKeep={handleKeep}
          onClear={handleClear}
          onOpenEdit={handleOpenEdit}
          onPrimaryAction={async (config, cand) => {
            // Open the appropriate overlay - save detection is handled
            // by the overlay save listener which will call handleOutcome('changed')
            await handlePrimaryAction(config, cand);
          }}
          onConvertToTodo={handleConvertToTodo}
          onClose={onClose}
        />
      </View>
    </View>
  );
}

/**
 * Step 3: Summary/Celebration
 *
 * Shows the user a calm summary of their sweep session.
 * Displays counts of items kept and cleared.
 * Non-gamified, gentle "you did it" feel.
 */
interface SummaryStepProps {
  keptCount: number;
  clearedCount: number;
  onDone: () => void;
}

function SweepSummaryStep({ keptCount, clearedCount, onDone }: SummaryStepProps) {
  const totalProcessed = keptCount + clearedCount;

  return (
    <View style={styles.stepContainer}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.summaryScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Gremly mascot - friendly anchor at top */}
        <View style={styles.summaryMascotContainer}>
          <Image
            source={GREMLY_MASCOT}
            style={styles.summaryMascotImage}
            resizeMode="contain"
            testID="sweep-summary-mascot"
            accessibilityLabel="Gremly mascot"
          />
        </View>

        {/* Title */}
        <Text variant="title" style={styles.stepTitle}>
          Sweep complete
        </Text>

        {/* Subtitle */}
        <Text variant="subtle" style={styles.stepDescription}>
          You made clear choices about your day. Here's what you just did.
        </Text>

        {/* Stats Summary */}
        {totalProcessed > 0 ? (
          <View style={styles.summaryStatsContainer}>
            <View style={styles.summaryStatRow}>
              <Text variant="body" style={styles.summaryStatLabel}>
                Kept
              </Text>
              <Text variant="body" style={styles.summaryStatValue}>
                {keptCount}
              </Text>
            </View>
            <View style={styles.summaryStatRow}>
              <Text variant="body" style={styles.summaryStatLabel}>
                Cleared
              </Text>
              <Text variant="body" style={styles.summaryStatValue}>
                {clearedCount}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.summaryEmptyContainer}>
            <Text variant="body" style={styles.summaryEmptyText}>
              Nothing needed your attention this time — you're all clear.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Done Button */}
      <View style={styles.buttonContainer}>
        <Button title="Done" variant="primary" onPress={onDone} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SweepFlowScreen - Main container for the Evening Sweep wizard
 *
 * Manages step state and renders the appropriate step component.
 * Steps:
 * - 0: Mood check-in
 * - 1: Wrap up today
 * - 2: Decision cards
 * - 3: Summary/celebration
 */
export default function SweepFlowScreen({ navigation: navProp }: Props) {
  // Use hook for navigation to ensure we always have access
  const navigationHook = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const navigation = navProp || navigationHook;

  const { user } = useAuth();
  const [step, setStep] = useState<number>(0);

  // Track sweep stats across the session
  const [keptCount, setKeptCount] = useState(0);
  const [clearedCount, setClearedCount] = useState(0);

  // ─────────────────────────────────────────────────────────────────────────
  // Global Overlay State - render overlay ON TOP of Sweep modal
  // ─────────────────────────────────────────────────────────────────────────
  const overlay = useGlobalOverlay();
  const {
    state: {
      visible: overlayVisible,
      mode: overlayMode,
      initialEntity: overlayInitialEntity,
      initialSpaceId: overlayInitialSpaceId,
      conversionMeta: overlayConversionMeta,
      initialText: overlayInitialText,
      initialLogPhotoUris: overlayInitialLogPhotoUris,
    },
    close: overlayClose,
  } = overlay;

  // Extract full entity for edit mode pre-fill
  const overlayFullEntity = (overlay.state as unknown as Record<string, unknown>).entity ?? null;
  const overlayEffectiveInitialEntity = overlayFullEntity || overlayInitialEntity;
  const overlayDefaultDueToday =
    ((overlay.state as unknown as Record<string, unknown>)?.defaultDueToday as boolean) ?? false;

  const handleOverlayClose = useCallback(() => {
    if (!overlayVisible) return;
    // Emit close event so SweepDecisionStep knows user cancelled (didn't save)
    const editingId = overlayInitialEntity?.id;
    emitOverlayClosed({
      mode: overlayMode,
      editingId,
      didSave: false,
    });
    overlayClose();
  }, [overlayClose, overlayVisible, overlayMode, overlayInitialEntity]);

  const handleOverlaySaved = useCallback(
    async (result: OverlaySavedPayload) => {
      emitOverlaySaved(result);
      try {
        eventBus.emit('OverlaySaved', {
          id: result.id,
          type: (result as unknown as Record<string, unknown>).type as string | undefined,
        });
      } catch (e) {
        // ignore telemetry failures
      }
      overlayClose();
    },
    [overlayClose],
  );

  const handleIntroStart = () => {
    setStep(1); // go to Decision cards
  };

  const handleMoodContinue = () => {
    setStep(3); // Mood → Wrap-up / Habits
  };

  const handleWrapUpContinue = () => {
    setStep(4); // Wrap-up → Summary
  };

  const handleDecisionFinished = (summary: SweepSummary) => {
    // Update local state for Summary step display
    setKeptCount(summary.kept);
    setClearedCount(summary.cleared);

    // Record completion in DB (best-effort, non-blocking)
    if (user?.id) {
      markSweepCompleted(user.id, supabase, summary).catch((err) => {
        console.error('Failed to mark sweep as completed', err);
      });
    }

    // Advance to Mood step
    setStep(2); // Decision → Mood
  };

  const handleSummaryDone = () => {
    navigation.goBack();
  };

  // Handler for X close button
  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // Handler for back chevron - goes to previous step or closes if on first step
  const handleGoBack = useCallback(() => {
    if (step > 0) {
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  }, [step, navigation]);

  return (
    <>
      <Screen
        edges={['top', 'bottom']}
        padded={false}
        style={step === 1 ? styles.screenBackgroundDecision : styles.screenBackground}
      >
        {/* Conditional Header - Different for decision step */}
        {step !== 1 ? (
          /* Standard Header for Intro, Mood, Wrap-up, Summary steps */
          <View style={styles.header}>
            {/* Left - back chevron */}
            <TouchableOpacity
              style={styles.headerBackButton}
              onPress={handleGoBack}
              activeOpacity={0.7}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Icon name="ChevronLeft" size="md" color={BRAND.colors.charcoalInk} strokeWidth={2} />
            </TouchableOpacity>

            {/* Center - subtle title */}
            <View style={styles.headerCenter}>
              <View style={styles.headerModeIndicator}>
                <Icon name="Sparkles" size="xs" color="rgba(46, 85, 64, 0.50)" strokeWidth={1.5} />
                <Text style={styles.headerModeLabel}>Sweep</Text>
              </View>
            </View>

            {/* Right close button */}
            <TouchableOpacity
              style={styles.headerCloseButton}
              onPress={handleClose}
              activeOpacity={0.7}
              accessibilityLabel="Close Sweep"
              accessibilityRole="button"
            >
              <Icon name="X" size="sm" color={BRAND.colors.charcoalInk} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Step Content - Full-bleed for decision step */}
        <View style={step === 1 ? styles.contentDecision : styles.content}>
          {step === 0 && <SweepIntroStep onStart={handleIntroStart} />}
          {step === 1 && (
            <SweepDecisionStep onFinished={handleDecisionFinished} onClose={handleClose} />
          )}
          {step === 2 && <SweepMoodStep onContinue={handleMoodContinue} />}
          {step === 3 && <SweepWrapUpStep onContinue={handleWrapUpContinue} />}
          {step === 4 && (
            <SweepSummaryStep
              keptCount={keptCount}
              clearedCount={clearedCount}
              onDone={handleSummaryDone}
            />
          )}
        </View>
      </Screen>

      {/* Local Overlay Portal - renders ON TOP of Sweep modal
          Since Sweep is presented as a modal, the global OverlayHost renders
          below it. We render the overlay here so it appears above Sweep. */}
      {overlayVisible ? (
        <View pointerEvents="box-none" style={styles.overlayContainer}>
          <Pressable onPress={handleOverlayClose} style={styles.overlayScrim} />
          <View style={styles.overlayContent}>
            <OverlayComponent
              visible={overlayVisible}
              mode={overlayMode}
              initialEntity={overlayEffectiveInitialEntity as any}
              initialSpaceId={overlayInitialSpaceId}
              conversionMeta={overlayConversionMeta as any}
              initialText={overlayInitialText ?? undefined}
              initialLogPhotoUris={overlayInitialLogPhotoUris}
              defaultDueToday={overlayDefaultDueToday as boolean | undefined}
              onClose={handleOverlayClose}
              onSaved={handleOverlaySaved}
            />
          </View>
        </View>
      ) : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ─────────────────────────────────────────────────────────────────────────
  // Screen & Header - Linen Cream background throughout
  // ─────────────────────────────────────────────────────────────────────────
  screenBackground: {
    backgroundColor: BRAND.colors.linenCream,
  },
  screenBackgroundDecision: {
    backgroundColor: BRAND.colors.linenCream, // Cream background, card has sage
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: BRAND.colors.linenCream,
    // No shadow, no border - pure Linen Cream
  },
  headerBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  headerModeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerModeLabel: {
    fontSize: 14,
    fontWeight: '400', // Regular, not bold
    color: 'rgba(34, 34, 34, 0.75)', // Charcoal at 75% opacity
    letterSpacing: 0.2,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerCloseButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: BRAND.colors.linenCream,
  },
  contentDecision: {
    flex: 1,
    paddingHorizontal: 0, // Full-bleed for decision step
    backgroundColor: BRAND.colors.sageMist, // Match screen background
  },
  stepContainer: {
    flex: 1,
    paddingTop: 24,
    backgroundColor: BRAND.colors.linenCream,
  },
  stepTitle: {
    marginBottom: 8,
  },
  stepDescription: {
    marginBottom: 24,
  },
  // ─────────────────────────────────────────────────────────────────────────
  // SweepIntroStep styles
  // ─────────────────────────────────────────────────────────────────────────
  introScrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
    paddingHorizontal: 4,
  },
  introMascotContainer: {
    alignItems: 'center',
    marginTop: 48,
    marginBottom: 32,
  },
  introMascotImage: {
    width: 120,
    height: 120,
  },
  introHeaderSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  // ─────────────────────────────────────────────────────────────────────────
  // SweepMoodStep styles - Gremly Brand Reskin
  // ─────────────────────────────────────────────────────────────────────────
  moodStepContainer: {
    flex: 1,
    paddingTop: 28, // More space between nav and header
    backgroundColor: BRAND.colors.linenCream,
  },
  scrollContainer: {
    flex: 1,
  },
  moodScrollContent: {
    paddingBottom: 32,
    paddingHorizontal: 4,
  },
  moodHeaderSection: {
    marginBottom: 12, // Reduced by 4-6px from 18 for tighter to chips
    paddingHorizontal: 12,
  },
  moodStepTitle: {
    fontSize: 20, // Reduced one more notch (Today greeting minus 1pt)
    fontWeight: '600', // Semibold
    color: BRAND.colors.charcoalInk,
    marginBottom: 12, // Increased by 8px for header-subheader gap
    letterSpacing: -0.3,
  },
  moodStepSubcopy: {
    fontSize: 13, // 1-2pt smaller
    fontWeight: '400', // Regular
    color: 'rgba(34, 34, 34, 0.75)', // Charcoal at 75%
    lineHeight: 19, // Slightly relaxed
  },
  moodDivider: {
    // Kept for potential future use but not rendered
    height: 1,
    backgroundColor: 'rgba(191, 216, 192, 0.35)',
    marginHorizontal: 12,
    marginTop: 16,
    marginBottom: 28,
  },
  // Mood Grid - Centered 2x3 layout (Group 2)
  moodGridContainer: {
    alignItems: 'center',
    marginBottom: 40, // More space before journal section
    paddingHorizontal: 16,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: 280, // Tighter for 2-col layout
    gap: 10, // Horizontal gap
    rowGap: 6, // Reduced by 4px for compact chip block
  },
  // Mood Button - Gremly Brand Style with icons
  moodButton: {
    width: 130, // Fixed width for 2-col grid
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: BRAND.radius.lg, // 14px - design token for chips
    backgroundColor: 'rgba(191, 216, 192, 0.18)', // Lighter Sage Mist for unselected
    borderWidth: 1,
    borderColor: 'rgba(191, 216, 192, 0.40)', // Light Sage border for unselected
    // Soft shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  moodButtonSelected: {
    backgroundColor: 'rgba(191, 216, 192, 0.50)', // Stronger Sage Mist for selected
    borderColor: BRAND.colors.mossGreen, // Full Moss Green border
    borderWidth: 1.5,
    shadowOpacity: 0.06,
  },
  moodButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  moodButtonLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk, // Charcoal for unselected
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  moodButtonLabelSelected: {
    color: BRAND.colors.mossGreen, // Full Moss Green for selected
    fontWeight: '600',
  },
  // Journal Input - Gremly Brand Style (Group 3)
  moodJournalContainer: {
    marginTop: 0, // Group 2 marginBottom handles gap
    marginBottom: 18, // Reduced by 10px from 28
    marginHorizontal: 12,
  },
  moodJournalLabel: {
    fontSize: 15,
    fontWeight: '500', // Medium weight
    color: BRAND.colors.charcoalInk,
    marginBottom: 12,
  },
  moodJournalInput: {
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.lg, // 14px - design token
    borderWidth: 1,
    borderColor: 'rgba(191, 216, 192, 0.30)', // Sage Mist @ 30%
    padding: 16,
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    minHeight: 120,
    lineHeight: 24,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  moodButtonContainer: {
    paddingTop: 0, // Group 3 marginBottom handles gap
    paddingBottom: 16,
    paddingHorizontal: 12,
    gap: 8, // Tight within Group 4
    backgroundColor: BRAND.colors.linenCream,
  },
  // Continue Button - CTA style with arrow
  moodContinueButton: {
    backgroundColor: BRAND.colors.sageMist, // Solid Sage Mist fill
    borderWidth: 0, // No border
    borderRadius: BRAND.radius.xl, // 18px - design token for buttons
    height: 54, // 52-56px height (chips are ~44px)
    alignItems: 'center',
    justifyContent: 'center',
    // Soft CTA shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, // 10-15% opacity
    shadowRadius: 10, // 8-10px blur
    elevation: 3,
  },
  moodContinueButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moodContinueButtonDisabled: {
    opacity: 0.6,
  },
  moodContinueButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  moodSkipButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4, // Added 4-6px spacing from Continue
  },
  moodSkipButtonText: {
    color: 'rgba(34, 34, 34, 0.60)', // Charcoal at 60-70% - clearly secondary
    fontSize: 15,
    fontWeight: '500',
  },
  // ─────────────────────────────────────────────────────────────────────────
  // SweepWrapUpStep styles - Gremly Brand Reskin (matched to Mood step)
  // ─────────────────────────────────────────────────────────────────────────
  wrapUpStepContainer: {
    flex: 1,
    paddingTop: 28, // Match mood step top padding
    backgroundColor: BRAND.colors.linenCream,
  },
  wrapUpScrollContent: {
    paddingBottom: 48, // Generous bottom spacing
    paddingHorizontal: 4,
  },
  wrapUpHeaderSection: {
    marginBottom: 24, // Gap to first section header
    paddingHorizontal: 12,
  },
  wrapUpStepTitle: {
    fontSize: 20, // Match mood step header size
    fontWeight: '600', // Semibold to match mood step
    color: BRAND.colors.charcoalInk,
    marginBottom: 12, // Space to subheader
    letterSpacing: -0.3,
  },
  wrapUpStepSubcopy: {
    fontSize: 13, // Match mood step subcopy
    fontWeight: '400', // Regular
    color: 'rgba(34, 34, 34, 0.75)', // Charcoal at 75%
    lineHeight: 19,
    marginBottom: 16, // Gap to progress summary
  },
  wrapUpProgressSummary: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(34, 34, 34, 0.65)', // Charcoal at 65%
    lineHeight: 16,
  },
  wrapUpDivider: {
    // Kept but not rendered - airy design
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
    marginHorizontal: 12,
    marginBottom: 28,
  },
  wrapUpEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  wrapUpEmptyText: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 8,
  },
  wrapUpEmptySubtext: {
    textAlign: 'center',
    fontSize: 15,
    color: 'rgba(34, 34, 34, 0.7)',
  },
  wrapUpSection: {
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  wrapUpSectionHeader: {
    marginBottom: 12,
  },
  wrapUpSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(46, 85, 64, 0.80)', // Moss Green at 80%
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  wrapUpSectionAccent: {
    height: 1,
    backgroundColor: 'rgba(191, 216, 192, 0.50)', // Sage Mist @ 50%
  },
  wrapUpItemsList: {
    gap: 12, // Generous spacing between cards
  },
  wrapUpItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(191, 216, 192, 0.18)', // Sage Mist @ 18% (match mood chips)
    borderRadius: BRAND.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(191, 216, 192, 0.40)', // Sage border
  },
  wrapUpItemRowBorder: {
    // No longer used - cards are separate now
  },
  wrapUpItemRowChecked: {
    borderColor: BRAND.colors.mossGreen, // Moss Green when checked
  },
  wrapUpItemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    marginRight: 12,
  },
  wrapUpCheckboxContainer: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wrapUpCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(191, 216, 192, 0.60)', // Sage border
    backgroundColor: BRAND.colors.linenCream,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wrapUpCheckboxChecked: {
    borderColor: BRAND.colors.mossGreen,
    backgroundColor: BRAND.colors.mossGreen,
  },
  wrapUpCheckmark: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  wrapUpButtonContainer: {
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 12,
    backgroundColor: BRAND.colors.linenCream,
  },
  buttonContainer: {
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 12,
    backgroundColor: BRAND.colors.linenCream,
  },
  wrapUpOpenItemsReminder: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(34, 34, 34, 0.60)', // Charcoal at 60%
    textAlign: 'center',
    marginBottom: 12,
  },
  wrapUpContinueButton: {
    backgroundColor: BRAND.colors.mossGreen, // Full Moss Green fill
    borderRadius: BRAND.radius.xl, // Pill shape
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    // Soft CTA shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  wrapUpContinueButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wrapUpContinueButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Legacy styles kept for other steps
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BRAND.colors.linenCream,
  },
  // SweepDecisionStep styles - Linen Cream background with sage card
  decisionStepContainer: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream, // Cream background
  },
  decisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 12,
    backgroundColor: BRAND.colors.linenCream, // Match container
  },
  decisionHeaderLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  decisionHeaderCounter: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(34, 34, 34, 0.70)', // Charcoal @ 70%
    letterSpacing: 0.1,
    marginBottom: 4,
  },
  progressBarContainer: {
    width: 52,
    height: 3,
    position: 'relative',
  },
  progressBarRail: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 52,
    height: 3,
    backgroundColor: 'rgba(191, 216, 192, 0.4)', // Sage Mist @ 40%
    borderRadius: 1.5,
  },
  progressBarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 3,
    backgroundColor: '#E0C47A', // Golden Pear
    borderRadius: 1.5,
  },
  decisionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  decisionContextPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BRAND.radius.pill,
    borderWidth: 1,
    borderColor: BRAND.colors.sageMist,
    backgroundColor: 'transparent',
  },
  decisionContextPillText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(34, 34, 34, 0.70)', // Charcoal @ 70%
    letterSpacing: 0.2,
  },
  decisionCloseButton: {
    padding: 4,
  },
  decisionPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  decisionLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  decisionLoadingText: {
    marginTop: 16,
  },
  decisionEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  decisionEmptyTitle: {
    fontSize: 48,
    marginBottom: 16,
  },
  decisionEmptyText: {
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  decisionCardArea: {
    flex: 1,
    paddingHorizontal: 0,
  },
  decisionCardPlaceholder: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.lg,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    padding: 24,
    alignItems: 'center',
  },
  decisionCardKind: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  decisionCardDate: {
    marginTop: 12,
  },
  decisionActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 16,
  },
  decisionActionButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: BRAND.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decisionActionClear: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  decisionActionKeep: {
    backgroundColor: BRAND.colors.sageMist,
  },
  decisionActionTextClear: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
  },
  decisionActionTextKeep: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  // SweepSummaryStep styles
  summaryScrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  summaryMascotContainer: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  summaryMascotImage: {
    width: 112,
    height: 112,
  },
  summaryStatsContainer: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    padding: 16,
    marginTop: 8,
  },
  summaryStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  summaryStatLabel: {
    fontSize: 15,
    color: BRAND.colors.charcoalInk,
  },
  summaryStatValue: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  summaryEmptyContainer: {
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  summaryEmptyText: {
    fontSize: 15,
    color: BRAND.colors.inkSubtle,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Overlay styles (rendered locally to appear above modal)
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  overlayScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayContent: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
