/**
 * Sweep Flow Screen - Evening Sweep wizard container
 *
 * This is a full-screen flow that guides users through their Evening Sweep.
 * Currently implements:
 * - Step 0: Mood check-in
 * - Step 1: Wrap up today
 * - Step 2: Decision cards
 * - Step 3: Summary/celebration
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Pressable,
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
import type { SweepCandidate } from '../../lib/sweep/types';
import { SweepCard } from '../../components/sweep/SweepCard';
import { useOverlayController } from '../../hooks/useOverlayController';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { OverlayComponent } from '../../components/overlay';
import { emitOverlaySaved, type OverlaySavedPayload } from '../../lib/events/overlaySaved';
import { eventBus } from '../../lib/events/EventBus';
import type { AppRecord } from '../../lib/types';

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

// Mood options for Sweep check-in (brand-style chips, no emojis)
const SWEEP_MOOD_OPTIONS: Array<{ value: MoodValue; label: string }> = [
  { value: 'ecstatic', label: 'Great' },
  { value: 'happy', label: 'Good' },
  { value: 'neutral', label: 'Okay' },
  { value: 'low', label: 'Low' },
  { value: 'tired', label: 'Tired' },
  { value: 'sad', label: 'Rough' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Step Components
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step 0: Mood Check-in
 *
 * Asks the user how they're feeling before starting the sweep.
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
            How are you feeling?
          </Text>
          <Text style={styles.moodStepSubcopy}>
            A quick check-in helps you understand your day a little better.
          </Text>
        </View>

        {/* Divider */}
        <View style={styles.moodDivider} />

        {/* Mood Selector - Centered 2x3 Grid */}
        <View style={styles.moodGridContainer}>
          <View style={styles.moodGrid}>
            {SWEEP_MOOD_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.moodButton,
                  selectedMood === option.value && styles.moodButtonSelected,
                ]}
                onPress={() => setSelectedMood(option.value)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.moodButtonLabel,
                    selectedMood === option.value && styles.moodButtonLabelSelected,
                  ]}
                >
                  {option.label.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Journal Input */}
        <View style={styles.moodJournalContainer}>
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
        <Button
          title={isSaving ? 'Saving...' : 'Continue'}
          variant="primary"
          onPress={handleContinue}
          disabled={isSaving}
        />
        <TouchableOpacity style={styles.moodSkipButton} onPress={handleSkip} disabled={isSaving}>
          <Text style={styles.moodSkipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Step 1: Wrap Up Today
 *
 * Shows items from today that need review/action.
 * Allows user to complete habits/todos and handle overdue items.
 */
function SweepWrapUpStep({ onContinue }: StepProps) {
  const repo = useRepo();
  const { items, doneItems, loading, reload } = useTodayEntries();
  const interactions = useTodayInteractions({
    onReload: reload,
    celebrationEnabled: false,
    showCelebrationToast: false,
  });

  // Separate items into habits, todos, and overdue
  const { habits, todos, overdue } = useMemo(() => {
    const todayDay = new Date().toISOString().split('T')[0];

    const habitsList: TodayMergedEntry[] = [];
    const todosList: TodayMergedEntry[] = [];
    const overdueList: TodayMergedEntry[] = [];

    for (const item of items) {
      // Skip items that have been optimistically completed
      if (item.type === 'habit' && interactions.completedHabitIds.has(item.id)) continue;
      if (item.type === 'todo' && interactions.completedTodoIds.has(item.id)) continue;
      if (interactions.deletedItemIds.has(item.id)) continue;

      if (item.type === 'habit') {
        habitsList.push(item);
      } else if (item.type === 'todo') {
        // Check if overdue
        const dueDay = item.due_day ?? item.due_date?.split('T')[0];
        if (dueDay && dueDay < todayDay) {
          overdueList.push(item);
        } else {
          todosList.push(item);
        }
      }
    }

    return { habits: habitsList, todos: todosList, overdue: overdueList };
  }, [
    items,
    interactions.completedHabitIds,
    interactions.completedTodoIds,
    interactions.deletedItemIds,
  ]);

  // Count completed items for context
  const completedCount =
    doneItems.length + interactions.completedHabitIds.size + interactions.completedTodoIds.size;

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

  // Handle todo completion
  const handleTodoToggle = useCallback(
    async (todo: TodayMergedEntry) => {
      if (todo.type !== 'todo') return;
      await interactions.toggleTodoComplete({
        id: todo.id,
        name: todo.name,
        overdue: todo.overdue,
      });
    },
    [interactions],
  );

  // Handle overdue item actions
  const handleOverdueAction = useCallback(
    async (todo: TodayMergedEntry, action: 'today' | 'tomorrow' | 'clear') => {
      if (todo.type !== 'todo') return;

      try {
        if (action === 'clear') {
          // Archive the todo
          // TODO: Tighten typing once sweepApplyAction is added to repo type exports
          await (repo as any).sweepApplyAction(todo.id, 'todo', 'archive', {
            archived_reason: 'swept',
          });
          interactions.markItemDeleted(todo.id);
        } else if (action === 'today') {
          // Set due_day to today
          const todayDay = new Date().toISOString().split('T')[0];
          await repo.update({
            id: todo.id,
            patch: { due_day: todayDay, carry_forward: false } as any,
          });
        } else if (action === 'tomorrow') {
          // Set due_day to tomorrow
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowDay = tomorrow.toISOString().split('T')[0];
          await repo.update({
            id: todo.id,
            patch: { due_day: tomorrowDay, carry_forward: false } as any,
          });
        }
        await reload();
      } catch (error) {
        // TODO: Add error handling UI
        console.warn('[SweepWrapUpStep] Action failed:', error);
      }
    },
    [repo, reload, interactions],
  );

  // Check if there's nothing to wrap up
  const isEmpty = habits.length === 0 && todos.length === 0 && overdue.length === 0;

  if (loading) {
    return (
      <View style={styles.wrapUpStepContainer}>
        <View style={styles.wrapUpHeaderSection}>
          <Text variant="title" style={styles.wrapUpStepTitle}>
            Wrap up today
          </Text>
          <Text style={styles.wrapUpStepSubcopy}>Let's close out your day before we Sweep.</Text>
        </View>
        <View style={styles.wrapUpDivider} />
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
            Wrap up today
          </Text>
          <Text style={styles.wrapUpStepSubcopy}>Let's close out your day before we Sweep.</Text>
        </View>

        {/* Divider */}
        <View style={styles.wrapUpDivider} />

        {isEmpty ? (
          <View style={styles.wrapUpEmptyContainer}>
            <Text variant="body" style={styles.wrapUpEmptyText}>
              Nothing to wrap up — you're all set!
            </Text>
            {completedCount > 0 && (
              <Text style={styles.wrapUpEmptySubtext}>
                You completed {completedCount} {completedCount === 1 ? 'item' : 'items'} today.
              </Text>
            )}
          </View>
        ) : (
          <>
            {/* Today's Habits Section */}
            {habits.length > 0 && (
              <View style={styles.wrapUpSection}>
                <View style={styles.wrapUpSectionHeader}>
                  <Text style={styles.wrapUpSectionTitle}>Today's Habits</Text>
                  <View style={styles.wrapUpSectionAccent} />
                </View>
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

            {/* Today's Todos Section */}
            {todos.length > 0 && (
              <View style={styles.wrapUpSection}>
                <View style={styles.wrapUpSectionHeader}>
                  <Text style={styles.wrapUpSectionTitle}>Today's To-Dos</Text>
                  <View style={styles.wrapUpSectionAccent} />
                </View>
                <View style={styles.wrapUpItemsList}>
                  {todos.map((todo, index) => (
                    <TouchableOpacity
                      key={todo.id}
                      style={[
                        styles.wrapUpItemRow,
                        index < todos.length - 1 && styles.wrapUpItemRowBorder,
                      ]}
                      onPress={() => handleTodoToggle(todo)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.wrapUpItemName}>{todo.name}</Text>
                      <View style={styles.wrapUpCheckboxContainer}>
                        <View
                          style={[
                            styles.wrapUpCheckbox,
                            interactions.completedTodoIds.has(todo.id) &&
                              styles.wrapUpCheckboxChecked,
                          ]}
                        >
                          {interactions.completedTodoIds.has(todo.id) && (
                            <Text style={styles.wrapUpCheckmark}>✓</Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Overdue Section */}
            {overdue.length > 0 && (
              <View style={styles.wrapUpSection}>
                <View style={styles.wrapUpSectionHeader}>
                  <Text style={styles.wrapUpSectionTitle}>Still Waiting</Text>
                  <View style={styles.wrapUpSectionAccent} />
                </View>
                <View style={styles.wrapUpItemsList}>
                  {overdue.map((item, index) => (
                    <View
                      key={item.id}
                      style={[
                        styles.wrapUpOverdueRow,
                        index < overdue.length - 1 && styles.wrapUpItemRowBorder,
                      ]}
                    >
                      <Text style={styles.wrapUpOverdueItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={styles.wrapUpOverdueActions}>
                        <TouchableOpacity
                          style={styles.wrapUpOverdueButton}
                          onPress={() => handleOverdueAction(item, 'today')}
                        >
                          <Text style={styles.wrapUpOverdueButtonText}>Today</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.wrapUpOverdueButton}
                          onPress={() => handleOverdueAction(item, 'tomorrow')}
                        >
                          <Text style={styles.wrapUpOverdueButtonText}>Tomorrow</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.wrapUpOverdueButton, styles.wrapUpOverdueButtonClear]}
                          onPress={() => handleOverdueAction(item, 'clear')}
                        >
                          <Text style={styles.wrapUpOverdueButtonTextClear}>Clear</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Action Button */}
      <View style={styles.wrapUpButtonContainer}>
        <Button title="Start Sweep" variant="primary" onPress={onContinue} />
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
interface SweepSummary {
  kept: number;
  cleared: number;
  skipped: number;
}

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
  const [stats, setStats] = useState<SweepSummary>({ kept: 0, cleared: 0, skipped: 0 });

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

  // Handlers for card actions
  const handleKeep = useCallback(async () => {
    const candidate = candidates[currentIndex];
    if (!candidate) return;

    try {
      // Apply keep action
      await applySweepAction({ type: 'keep', id: candidate.id, kind: candidate.kind }, supabase);
      setStats((prev) => ({ ...prev, kept: prev.kept + 1 }));
    } catch (error) {
      console.error('[SweepDecisionStep] handleKeep error:', error);
    }

    // Move to next card (completion screen shows when currentIndex >= candidates.length)
    setCurrentIndex((prev) => prev + 1);
  }, [candidates, currentIndex]);

  const handleClear = useCallback(async () => {
    const candidate = candidates[currentIndex];
    if (!candidate) return;

    try {
      // Apply clear action
      await applySweepAction({ type: 'clear', id: candidate.id, kind: candidate.kind }, supabase);
      setStats((prev) => ({ ...prev, cleared: prev.cleared + 1 }));
    } catch (error) {
      console.error('[SweepDecisionStep] handleClear error:', error);
    }

    // Move to next card (completion screen shows when currentIndex >= candidates.length)
    setCurrentIndex((prev) => prev + 1);
  }, [candidates, currentIndex]);

  const handleSkip = useCallback(async () => {
    const candidate = candidates[currentIndex];
    if (!candidate) return;

    try {
      // Apply skip action
      await applySweepAction({ type: 'skip', id: candidate.id, kind: candidate.kind }, supabase);
      setStats((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
    } catch (error) {
      console.error('[SweepDecisionStep] handleSkip error:', error);
    }

    // Move to next card (completion screen shows when currentIndex >= candidates.length)
    setCurrentIndex((prev) => prev + 1);
  }, [candidates, currentIndex]);

  const handleOpenEdit = useCallback(async () => {
    const candidate = candidates[currentIndex];
    if (!candidate) return;

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
          initialTitle: (record as any).title || '',
          initialNote: (record as any).body || '',
          initialTags: (record as any).tags || [],
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
          initialTags: (candidate.raw as any).tags || [],
          sourceNoteId: candidate.id,
        },
      });
    }
  }, [candidates, currentIndex, repo, overlayController]);

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
            onPress={() => onFinished({ kept: 0, cleared: 0, skipped: 0 })}
          />
        </View>
      </View>
    );
  }

  // All cards processed - sweep complete
  if (currentIndex >= candidates.length) {
    // Stats are finalized and markSweepCompleted is called in the parent when onFinished is invoked.
    return (
      <View style={styles.stepContainer}>
        <View style={styles.decisionEmptyContainer}>
          <Text variant="title" style={styles.decisionEmptyTitle}>
            🎉
          </Text>
          <Text variant="body" style={styles.decisionEmptyText}>
            Sweep complete!
          </Text>
        </View>
        <View style={styles.buttonContainer}>
          <Button title="Finish Sweep" variant="primary" onPress={() => onFinished(stats)} />
        </View>
      </View>
    );
  }

  // Current candidate to display
  const currentCandidate = candidates[currentIndex];

  return (
    <View style={styles.decisionStepContainer}>
      {/* Decision Step Header - Single line with close button */}
      <View style={styles.decisionHeader}>
        <Text style={styles.decisionHeaderTitle}>
          Reviewing captured items: {currentIndex + 1}/{candidates.length}
        </Text>
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

      {/* Full-screen Card Area */}
      <View style={styles.decisionCardArea}>
        <SweepCard
          candidate={currentCandidate}
          index={currentIndex}
          total={candidates.length}
          onKeep={handleKeep}
          onClear={handleClear}
          onSkip={handleSkip}
          onOpenEdit={handleOpenEdit}
          onConvertToTodo={handleConvertToTodo}
        />
      </View>
    </View>
  );
}

/**
 * Step 3: Summary/Celebration
 *
 * Shows the user a calm summary of their sweep session.
 * Displays counts of items kept, cleared, and skipped.
 * Non-gamified, gentle "you did it" feel.
 */
interface SummaryStepProps {
  keptCount: number;
  clearedCount: number;
  skippedCount: number;
  onDone: () => void;
}

function SweepSummaryStep({ keptCount, clearedCount, skippedCount, onDone }: SummaryStepProps) {
  const totalProcessed = keptCount + clearedCount + skippedCount;

  return (
    <View style={styles.stepContainer}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.summaryScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* TODO: Replace with calm/completed Gremly illustration if available */}
        {/* For now, using a gentle leaf emoji as placeholder */}
        <Text style={styles.summaryEmoji}>🌿</Text>

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
            <View style={styles.summaryStatRow}>
              <Text variant="body" style={styles.summaryStatLabel}>
                Skipped for later
              </Text>
              <Text variant="body" style={styles.summaryStatValue}>
                {skippedCount}
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
  const [skippedCount, setSkippedCount] = useState(0);

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
  const overlayFullEntity = (overlay.state as Record<string, unknown>).entity ?? null;
  const overlayEffectiveInitialEntity = overlayFullEntity || overlayInitialEntity;
  const overlayDefaultDueToday =
    (overlay.state as Record<string, unknown>)?.defaultDueToday ?? false;

  const handleOverlayClose = useCallback(() => {
    if (!overlayVisible) return;
    overlayClose();
  }, [overlayClose, overlayVisible]);

  const handleOverlaySaved = useCallback(
    async (result: OverlaySavedPayload) => {
      emitOverlaySaved(result);
      try {
        eventBus.emit('OverlaySaved', {
          id: result.id,
          type: (result as Record<string, unknown>).type,
        });
      } catch (e) {
        // ignore telemetry failures
      }
      overlayClose();
    },
    [overlayClose],
  );

  const handleMoodContinue = () => {
    setStep(1);
  };

  const handleWrapUpContinue = () => {
    setStep(2);
  };

  const handleDecisionFinished = (summary: SweepSummary) => {
    // Update local state for Summary step display
    setKeptCount(summary.kept);
    setClearedCount(summary.cleared);
    setSkippedCount(summary.skipped);

    // Record completion in DB (best-effort, non-blocking)
    if (user?.id) {
      markSweepCompleted(user.id, supabase, summary).catch((err) => {
        console.error('Failed to mark sweep as completed', err);
      });
    }

    // Advance to Summary step
    setStep(3);
  };

  const handleSummaryDone = () => {
    navigation.goBack();
  };

  // Handler for X close button
  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <>
      <Screen
        edges={['top', 'bottom']}
        padded={false}
        style={step === 2 ? styles.screenBackgroundDecision : styles.screenBackground}
      >
        {/* Conditional Header - Different for decision step */}
        {step !== 2 ? (
          /* Standard Header for Mood, Wrap-up, Summary steps */
          <View style={styles.header}>
            {/* Left spacer for symmetry */}
            <View style={styles.headerLeft} />

            {/* Center title */}
            <Text variant="title" style={styles.headerTitle}>
              Sweep
            </Text>

            {/* Right close button */}
            <TouchableOpacity
              style={styles.headerCloseButton}
              onPress={handleClose}
              activeOpacity={0.7}
              accessibilityLabel="Close Sweep"
              accessibilityRole="button"
            >
              <Icon name="X" size="md" color={BRAND.colors.charcoalInk} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Step Content - Full-bleed for decision step */}
        <View style={step === 2 ? styles.contentDecision : styles.content}>
          {step === 0 && <SweepMoodStep onContinue={handleMoodContinue} />}
          {step === 1 && <SweepWrapUpStep onContinue={handleWrapUpContinue} />}
          {step === 2 && (
            <SweepDecisionStep onFinished={handleDecisionFinished} onClose={handleClose} />
          )}
          {step === 3 && (
            <SweepSummaryStep
              keptCount={keptCount}
              clearedCount={clearedCount}
              skippedCount={skippedCount}
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
              initialEntity={overlayEffectiveInitialEntity}
              initialSpaceId={overlayInitialSpaceId}
              conversionMeta={overlayConversionMeta}
              initialText={overlayInitialText ?? undefined}
              initialLogPhotoUris={overlayInitialLogPhotoUris}
              defaultDueToday={overlayDefaultDueToday}
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
    backgroundColor: BRAND.colors.sageMist,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BRAND.colors.linenCream,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  headerLeft: {
    width: 40,
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
  // SweepMoodStep styles - Gremly Brand Reskin
  // ─────────────────────────────────────────────────────────────────────────
  moodStepContainer: {
    flex: 1,
    paddingTop: 28,
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
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  moodStepTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  moodStepSubcopy: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(34, 34, 34, 0.85)', // Charcoal at 85%
    lineHeight: 24,
  },
  moodDivider: {
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
    marginHorizontal: 12,
    marginBottom: 28,
  },
  // Mood Grid - Centered 2x3 layout
  moodGridContainer: {
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 12,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 340,
    gap: 12,
    rowGap: 24,
  },
  // Mood Button - Gremly Brand Style
  moodButton: {
    width: 100,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BRAND.radius.md,
    backgroundColor: 'rgba(191, 216, 192, 0.30)', // Sage Mist @ 30%
    borderWidth: 1.5,
    borderColor: 'rgba(156, 166, 224, 0.40)', // Periwinkle @ 40%
    // Soft shadow like "Add to Today" pill
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  moodButtonSelected: {
    backgroundColor: BRAND.colors.sageMist, // Full Sage Mist
    borderColor: BRAND.colors.mossGreen, // Moss Green border
    borderWidth: 2,
    shadowOpacity: 0.1,
  },
  moodButtonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  moodButtonLabelSelected: {
    color: BRAND.colors.mossGreen,
    fontWeight: '700',
  },
  // Journal Input - Gremly Brand Style
  moodJournalContainer: {
    minHeight: 150,
    marginBottom: 20,
    marginHorizontal: 12,
  },
  moodJournalInput: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.lg,
    borderWidth: 2,
    borderColor: BRAND.colors.sageMist,
    padding: 20,
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    minHeight: 150,
    lineHeight: 26,
    // Soft shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  moodButtonContainer: {
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 12,
    gap: 12,
    backgroundColor: BRAND.colors.linenCream,
  },
  moodSkipButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  moodSkipButtonText: {
    color: BRAND.colors.inkSubtle,
    fontSize: 15,
    fontWeight: '500',
  },
  // ─────────────────────────────────────────────────────────────────────────
  // SweepWrapUpStep styles - Gremly Brand Reskin
  // ─────────────────────────────────────────────────────────────────────────
  wrapUpStepContainer: {
    flex: 1,
    paddingTop: 28,
    backgroundColor: BRAND.colors.linenCream,
  },
  wrapUpScrollContent: {
    paddingBottom: 32,
    paddingHorizontal: 4,
  },
  wrapUpHeaderSection: {
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  wrapUpStepTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  wrapUpStepSubcopy: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(34, 34, 34, 0.85)', // Charcoal at 85%
    lineHeight: 24,
  },
  wrapUpDivider: {
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
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  wrapUpSectionHeader: {
    marginBottom: 14,
  },
  wrapUpSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.colors.inkSubtle,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  wrapUpSectionAccent: {
    width: 40,
    height: 3,
    backgroundColor: BRAND.colors.periwinkleSmoke, // Periwinkle accent
    borderRadius: 2,
  },
  wrapUpItemsList: {
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.lg,
    borderWidth: 1,
    borderColor: BRAND.colors.sageMist,
    overflow: 'hidden',
    // Soft shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  wrapUpItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(191, 216, 192, 0.15)', // Sage Mist wash @ 15%
  },
  wrapUpItemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
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
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: BRAND.colors.sageMist,
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
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  wrapUpOverdueRow: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(191, 216, 192, 0.15)', // Sage Mist wash @ 15%
  },
  wrapUpOverdueItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    marginBottom: 12,
  },
  wrapUpOverdueActions: {
    flexDirection: 'row',
    gap: 10,
  },
  wrapUpOverdueButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BRAND.radius.md,
    backgroundColor: 'rgba(191, 216, 192, 0.5)', // Sage Mist @ 50%
    // Soft shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  wrapUpOverdueButtonClear: {
    backgroundColor: 'rgba(156, 166, 224, 0.25)', // Periwinkle @ 25%
  },
  wrapUpOverdueButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  wrapUpOverdueButtonTextClear: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  wrapUpButtonContainer: {
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 12,
    backgroundColor: BRAND.colors.linenCream,
  },
  // Legacy styles kept for other steps
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BRAND.colors.linenCream,
  },
  // SweepDecisionStep styles - Sage Mist full-screen layout
  decisionStepContainer: {
    flex: 1,
    backgroundColor: BRAND.colors.sageMist, // Brand Sage Mist background
  },
  decisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: BRAND.colors.sageMist, // Match container
  },
  decisionHeaderTitle: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(46, 85, 64, 0.7)', // Moss Green @ 70% - softer
    letterSpacing: 0.2,
  },
  decisionCloseButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(46, 85, 64, 0.12)', // Moss Green @ 12%
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
  decisionActionSkip: {
    backgroundColor: BRAND.colors.surface,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
  },
  decisionActionKeep: {
    backgroundColor: BRAND.colors.sageMist,
  },
  decisionActionTextClear: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
  },
  decisionActionTextSkip: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
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
  summaryEmoji: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 16,
    marginTop: 24,
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
