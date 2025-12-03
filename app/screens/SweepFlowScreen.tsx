/**
 * Sweep Flow Screen - Evening Sweep wizard container
 *
 * This is a full-screen flow that guides users through their Evening Sweep.
 * Currently implements:
 * - Step 0: Mood check-in
 * - Step 1: Wrap up today
 * - Step 2: Decision cards
 *
 * Future steps will be added as the feature evolves.
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
} from 'react-native';
import { Screen, Text, Button } from '../../ui';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { BRAND } from '../../design/brand';
import { useTodayEntries, type TodayMergedEntry } from '../../lib/today/hooks/useTodayEntries';
import { useTodayInteractions } from '../../lib/today/useTodayInteractions';
import { supabase } from '../../lib/supabase/client';
import { fetchSweepCandidatesForUser, applySweepAction } from '../../lib/sweep/engine';
import type { SweepCandidate } from '../../lib/sweep/types';
import { SweepCard } from '../../components/sweep/SweepCard';
import { useOverlayController } from '../../hooks/useOverlayController';
import type { AppRecord } from '../../lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

// Navigation props will be typed properly when SweepFlow is added to RootStackParamList
// For now, we use a minimal interface that matches NativeStackScreenProps shape
interface Props {
  navigation?: {
    goBack: () => void;
  };
}

interface StepProps {
  onContinue: () => void;
}

// Mood value type - aligned with existing journal log moods
type MoodValue = 'happy' | 'neutral' | 'sad' | 'ecstatic' | 'low' | 'tired';

// Mood options for Sweep check-in (extended from journal moods)
const SWEEP_MOOD_OPTIONS: Array<{ value: MoodValue; emoji: string; label: string }> = [
  { value: 'ecstatic', emoji: '🤩', label: 'Great' },
  { value: 'happy', emoji: '😊', label: 'Good' },
  { value: 'neutral', emoji: '😐', label: 'Okay' },
  { value: 'low', emoji: '😔', label: 'Low' },
  { value: 'tired', emoji: '😴', label: 'Tired' },
  { value: 'sad', emoji: '😢', label: 'Rough' },
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
      style={styles.stepContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text variant="title" style={styles.stepTitle}>
          How are you feeling?
        </Text>
        <Text variant="subtle" style={styles.stepDescription}>
          A quick check-in helps you understand your day a little better.
        </Text>

        {/* Mood Selector */}
        <View style={styles.moodGrid}>
          {SWEEP_MOOD_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.moodPill, selectedMood === option.value && styles.moodPillSelected]}
              onPress={() => setSelectedMood(option.value)}
              activeOpacity={0.7}
            >
              <Text style={styles.moodEmoji}>{option.emoji}</Text>
              <Text
                style={[
                  styles.moodLabel,
                  selectedMood === option.value && styles.moodLabelSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Journal Input */}
        <View style={styles.journalContainer}>
          <TextInput
            style={styles.journalInput}
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
      <View style={styles.buttonContainer}>
        <Button
          title={isSaving ? 'Saving...' : 'Continue'}
          variant="primary"
          onPress={handleContinue}
          disabled={isSaving}
        />
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={isSaving}>
          <Text style={styles.skipButtonText}>Skip for now</Text>
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
      <View style={styles.stepContainer}>
        <Text variant="title" style={styles.stepTitle}>
          Wrap up today
        </Text>
        <Text variant="subtle" style={styles.stepDescription}>
          Let's close out your day before we Sweep.
        </Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stepContainer}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text variant="title" style={styles.stepTitle}>
          Wrap up today
        </Text>
        <Text variant="subtle" style={styles.stepDescription}>
          Let's close out your day before we Sweep.
        </Text>

        {isEmpty ? (
          <View style={styles.emptyContainer}>
            <Text variant="body" style={styles.emptyText}>
              Nothing to wrap up — you're all set! ✨
            </Text>
            {completedCount > 0 && (
              <Text variant="subtle" style={styles.emptySubtext}>
                You completed {completedCount} {completedCount === 1 ? 'item' : 'items'} today.
              </Text>
            )}
          </View>
        ) : (
          <>
            {/* Today's Habits Section */}
            {habits.length > 0 && (
              <View style={styles.section}>
                <Text variant="label" style={styles.sectionTitle}>
                  Today's habits
                </Text>
                {habits.map((habit) => (
                  <TouchableOpacity
                    key={habit.id}
                    style={styles.itemRow}
                    onPress={() => handleHabitToggle(habit)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.checkbox}>
                      {interactions.completedHabitIds.has(habit.id) && (
                        <View style={styles.checkboxInner} />
                      )}
                    </View>
                    <Text variant="body" style={styles.itemName}>
                      {habit.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Today's Todos Section */}
            {todos.length > 0 && (
              <View style={styles.section}>
                <Text variant="label" style={styles.sectionTitle}>
                  Today's to-dos
                </Text>
                {todos.map((todo) => (
                  <TouchableOpacity
                    key={todo.id}
                    style={styles.itemRow}
                    onPress={() => handleTodoToggle(todo)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.checkbox}>
                      {interactions.completedTodoIds.has(todo.id) && (
                        <View style={styles.checkboxInner} />
                      )}
                    </View>
                    <Text variant="body" style={styles.itemName}>
                      {todo.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Overdue Section */}
            {overdue.length > 0 && (
              <View style={styles.section}>
                <Text variant="label" style={styles.sectionTitle}>
                  Still waiting for you
                </Text>
                {overdue.map((item) => (
                  <View key={item.id} style={styles.overdueRow}>
                    <Text variant="body" style={styles.overdueItemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.overdueActions}>
                      <TouchableOpacity
                        style={styles.overdueActionButton}
                        onPress={() => handleOverdueAction(item, 'today')}
                      >
                        <Text style={styles.overdueActionText}>Today</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.overdueActionButton}
                        onPress={() => handleOverdueAction(item, 'tomorrow')}
                      >
                        <Text style={styles.overdueActionText}>Tomorrow</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.overdueActionButton, styles.overdueActionClear]}
                        onPress={() => handleOverdueAction(item, 'clear')}
                      >
                        <Text style={styles.overdueActionTextClear}>Clear</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Action Button */}
      <View style={styles.buttonContainer}>
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
interface DecisionStepProps {
  onFinished: () => void;
}

function SweepDecisionStep({ onFinished }: DecisionStepProps) {
  const { userId } = useAuth();
  const repo = useRepo();
  const overlayController = useOverlayController();

  // State for candidates and navigation
  const [candidates, setCandidates] = useState<SweepCandidate[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // TODO: Track summary stats for the sweep completion screen
  // const [stats, setStats] = useState({ kept: 0, cleared: 0, skipped: 0 });

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
      // TODO: Update stats.kept
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
      // TODO: Update stats.cleared
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
      // TODO: Update stats.skipped
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
          <Button title="Done" variant="primary" onPress={onFinished} />
        </View>
      </View>
    );
  }

  // All cards processed - sweep complete
  if (currentIndex >= candidates.length) {
    // TODO: Call markSweepCompleted with stats
    return (
      <View style={styles.stepContainer}>
        <View style={styles.decisionEmptyContainer}>
          <Text variant="title" style={styles.decisionEmptyTitle}>
            🎉
          </Text>
          <Text variant="body" style={styles.decisionEmptyText}>
            Sweep complete!
          </Text>
          {/* TODO: Show summary stats (kept, cleared, skipped) */}
        </View>
        <View style={styles.buttonContainer}>
          <Button title="Finish Sweep" variant="primary" onPress={onFinished} />
        </View>
      </View>
    );
  }

  // Current candidate to display
  const currentCandidate = candidates[currentIndex];

  return (
    <View style={styles.stepContainer}>
      {/* Header */}
      <Text variant="title" style={styles.stepTitle}>
        Review your items
      </Text>
      <Text variant="subtle" style={styles.stepDescription}>
        Decide what to keep, defer, or let go.
      </Text>

      {/* Progress indicator */}
      <Text variant="subtle" style={styles.decisionProgress}>
        Item {currentIndex + 1} of {candidates.length}
      </Text>

      {/* Card area */}
      <View style={styles.decisionCardArea}>
        <SweepCard
          candidate={currentCandidate}
          index={currentIndex}
          total={candidates.length}
          onKeep={handleKeep}
          onClear={handleClear}
          onSkip={handleSkip}
          onOpenEdit={handleOpenEdit}
        />
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
 */
export default function SweepFlowScreen({ navigation }: Props) {
  const [step, setStep] = useState<number>(0);

  const handleMoodContinue = () => {
    setStep(1);
  };

  const handleWrapUpContinue = () => {
    setStep(2);
  };

  const handleDecisionFinished = () => {
    // TODO: Navigate to summary step or exit Sweep
    // For now, go back to previous screen
    navigation?.goBack();
  };

  return (
    <Screen edges={['top', 'bottom']} padded={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="title">Sweep</Text>
      </View>

      {/* Step Content */}
      <View style={styles.content}>
        {step === 0 && <SweepMoodStep onContinue={handleMoodContinue} />}
        {step === 1 && <SweepWrapUpStep onContinue={handleWrapUpContinue} />}
        {step === 2 && <SweepDecisionStep onFinished={handleDecisionFinished} />}
      </View>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  stepContainer: {
    flex: 1,
    paddingTop: 24,
  },
  stepTitle: {
    marginBottom: 8,
  },
  stepDescription: {
    marginBottom: 24,
  },
  // SweepMoodStep styles
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  moodPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: BRAND.radius.lg,
    backgroundColor: BRAND.colors.surface,
    borderWidth: 2,
    borderColor: BRAND.colors.borderSubtle,
    minWidth: 90,
  },
  moodPillSelected: {
    backgroundColor: BRAND.colors.sageMist,
    borderColor: BRAND.colors.mossGreen,
  },
  moodEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  moodLabel: {
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
    fontWeight: '500',
  },
  moodLabelSelected: {
    color: BRAND.colors.mossGreen,
    fontWeight: '600',
  },
  journalContainer: {
    flex: 1,
    minHeight: 120,
    marginBottom: 16,
  },
  journalInput: {
    flex: 1,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    padding: 16,
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    minHeight: 120,
  },
  buttonContainer: {
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipButtonText: {
    color: BRAND.colors.inkSubtle,
    fontSize: 15,
    fontWeight: '500',
  },
  // SweepWrapUpStep styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BRAND.colors.mossGreen,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxInner: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: BRAND.colors.mossGreen,
  },
  itemName: {
    flex: 1,
    fontSize: 15,
  },
  overdueRow: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    padding: 12,
  },
  overdueItemName: {
    fontSize: 15,
    marginBottom: 10,
  },
  overdueActions: {
    flexDirection: 'row',
    gap: 8,
  },
  overdueActionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BRAND.radius.sm,
    backgroundColor: BRAND.colors.sageMist,
  },
  overdueActionClear: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  overdueActionText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
  overdueActionTextClear: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
  },
  // SweepDecisionStep styles
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
  decisionProgress: {
    textAlign: 'center',
    marginBottom: 16,
  },
  decisionCardArea: {
    flex: 1,
    justifyContent: 'center',
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
});
