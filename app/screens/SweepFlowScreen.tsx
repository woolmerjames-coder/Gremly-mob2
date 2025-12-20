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
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Screen, Text, Button } from '../../ui';
import { Icon } from '../../design-system/Icon';
import { useAuth } from '../../providers/AuthProvider';
import { BRAND } from '../../design/brand';
// Zustand store - used for all Sweep data operations
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useIsLoading, useSweepCandidatesUnified } from '../../lib/store/selectors';
import type { Habit } from '../../lib/types';
import { supabase } from '../../lib/supabase/client';
import { markSweepCompleted } from '../../lib/sweep/engine';
import type { SweepCandidate, SweepCardMeta, SweepSummary } from '../../lib/sweep/types';
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
import { addDays, nextMonday } from 'date-fns';
import { toDayString } from '../../lib/date/computeDueDay';
import type { AppRecord } from '../../lib/types';
import { SweepIntroStatsCard } from '../../components/sweep/SweepIntroStatsCard';

// Sweep habit components and helpers
import { SweepHabitRow } from '../../components/sweep/SweepHabitRow';
import {
  groupHabitsForSweep,
  getOpenHabitsCount,
  isHabitsEmpty,
  type HabitWithMeta,
  type GroupedHabits,
} from '../../lib/sweep/habitHelpers';
import { useSweepIntroStats } from '../../lib/sweep/useSweepIntroStats';

// Gremly mascot for summary step
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../../assets/mascot/gremly-mascot.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT_CELEBRATE = require('../../assets/mascot/fistbumpgremly.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_JOURNAL = require('../../assets/mascot/JournalGremly.png');

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

// Extended mood tag type for multi-select (includes new moods not in DB enum)
type MoodTag =
  | 'great'
  | 'good'
  | 'okay'
  | 'low'
  | 'tired'
  | 'anxious'
  | 'grateful'
  | 'scattered'
  | 'hopeful'
  | 'rough';

// Mood chip options for Sweep check-in (multi-select)
const SWEEP_MOOD_CHIPS: Array<{ value: MoodTag; label: string }> = [
  { value: 'great', label: 'Great' },
  { value: 'good', label: 'Good' },
  { value: 'okay', label: 'Okay' },
  { value: 'low', label: 'Low' },
  { value: 'tired', label: 'Tired' },
  { value: 'anxious', label: 'Anxious' },
  { value: 'grateful', label: 'Grateful' },
  { value: 'scattered', label: 'Scattered' },
  { value: 'hopeful', label: 'Hopeful' },
  { value: 'rough', label: 'Rough' },
];

// Map mood tags to DB enum values (for backwards compat)
const MOOD_TAG_TO_DB: Partial<Record<MoodTag, MoodValue>> = {
  great: 'ecstatic',
  good: 'happy',
  okay: 'neutral',
  low: 'low',
  tired: 'tired',
  rough: 'sad',
};

// Journal prompts for inspiration
const JOURNAL_PROMPTS = [
  'What are you grateful for today?',
  'What would have made today better?',
  'What small moment brought you joy?',
  'How is your energy right now?',
  "What's weighing on your mind?",
  'What are you looking forward to tomorrow?',
];

// Legacy mood options (kept for reference)
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
  const { stats, isLoading } = useSweepIntroStats();

  const hasActivity =
    stats &&
    (stats.completed.todos.length > 0 ||
      stats.completed.habits.length > 0 ||
      stats.dropped.todos.length > 0 ||
      stats.dropped.habits.length > 0 ||
      stats.dropped.notes.length > 0);

  // Calculate total completed and captured
  const totalCompleted =
    (stats?.completed.todos.length ?? 0) + (stats?.completed.habits.length ?? 0);
  const totalCaptured =
    (stats?.dropped.todos.length ?? 0) +
    (stats?.dropped.habits.length ?? 0) +
    (stats?.dropped.notes.length ?? 0);

  // Determine headline based on activity level
  let headline = 'Time to Sweep your day';
  let subcopy = 'Quick swipes to decide what stays and what goes.';

  if (stats?.isFirstSweep) {
    headline = 'Your first Sweep';
    subcopy = 'Quick swipes to clear the clutter. Left to archive, right to keep.';
  } else if (totalCompleted >= 5) {
    headline = 'Look at you go';
    subcopy = "You've been productive. Let's tidy up what's left.";
  } else if (totalCompleted >= 1) {
    headline = "You've been busy";
    subcopy = 'Swipe left to clear, right to keep. Takes about a minute.';
  } else if (totalCaptured >= 5) {
    headline = 'Lots on your mind';
    subcopy = 'Quick swipes to decide what stays and what goes.';
  }

  return (
    <View style={styles.moodStepContainer}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.introScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Mascot */}
        <View style={styles.introMascotContainer}>
          <Image
            source={GREMLY_MASCOT_CELEBRATE}
            style={styles.introMascotImage}
            resizeMode="contain"
            testID="sweep-intro-mascot"
            accessibilityLabel="Gremly mascot celebrating"
          />
        </View>

        {/* 2. Section label above card */}
        {(isLoading || hasActivity) && (
          <Text style={styles.achievementLabel}>Achieved since your last Sweep</Text>
        )}

        {/* 3. Stats card - shows loading skeleton then real data */}
        {(isLoading || hasActivity) && <SweepIntroStatsCard stats={stats} isLoading={isLoading} />}

        {/* 4. Title - centered */}
        <Text variant="title" style={styles.introTitle}>
          {headline}
        </Text>

        {/* 6. Underline divider */}
        <View style={styles.introTitleUnderline} />

        {/* 7. Subcopy - centered */}
        <Text style={styles.introSubcopy}>
          Your ritual to close those open tabs. Swipe left to archive, right to keep. Let's do it.
        </Text>
      </ScrollView>

      {/* 8. Button */}
      <View style={styles.moodFooter}>
        <TouchableOpacity style={styles.continueButton} onPress={onStart} activeOpacity={0.8}>
          <View style={styles.continueButtonContent}>
            <Text style={styles.continueButtonText}>Start Sweeping</Text>
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
 *
 * MIGRATED: Now uses Zustand store's createNote instead of useRepo
 */
function SweepMoodStep({ onContinue }: StepProps) {
  // Store mutations and data
  const createNote = useGremlyStore((state) => state.createNote);
  const notes = useGremlyStore((state) => state.notes);
  const overlay = useGlobalOverlay();

  // Get recent entries since last sweep
  const { stats, isLoading: statsLoading } = useSweepIntroStats();

  // State
  const [selectedMoods, setSelectedMoods] = useState<Set<MoodTag>>(new Set());
  const [journalText, setJournalText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEntriesExpanded, setIsEntriesExpanded] = useState(false);
  const [activePrompt, setActivePrompt] = useState<string | null>(null);
  const [promptIndex, setPromptIndex] = useState(0);

  // Animation for chevron rotation
  const chevronRotation = useRef(new Animated.Value(0)).current;

  // Compute recent entries (journals created since last sweep, excluding sweep reflections)
  const recentEntries = useMemo(() => {
    if (!stats?.cutoffTimestamp) return [];
    const cutoff = stats.cutoffTimestamp;
    return notes
      .filter((n) => {
        // Must not be archived and have a created_at after cutoff
        if (n.archived || !n.created_at || n.created_at <= cutoff) return false;
        // Only show journal entries (not log-idea, log-general, etc.)
        if (n.subtype !== 'journal') return false;
        // Exclude previous sweep reflection notes
        if (n.views?.sweep_reflection) return false;
        return true;
      })
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .slice(0, 5); // Limit to 5 entries
  }, [notes, stats?.cutoffTimestamp]);

  const hasRecentEntries = recentEntries.length > 0;

  // Toggle mood selection (multi-select)
  const toggleMood = useCallback((mood: MoodTag) => {
    setSelectedMoods((prev) => {
      const next = new Set(prev);
      if (next.has(mood)) {
        next.delete(mood);
      } else {
        next.add(mood);
      }
      return next;
    });
  }, []);

  // Toggle entries expansion
  const toggleEntriesExpanded = useCallback(() => {
    const toValue = isEntriesExpanded ? 0 : 1;
    Animated.timing(chevronRotation, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setIsEntriesExpanded(!isEntriesExpanded);
  }, [isEntriesExpanded, chevronRotation]);

  // Cycle through prompts
  const handlePromptPress = useCallback(() => {
    if (activePrompt) {
      // Go to next prompt
      const nextIndex = (promptIndex + 1) % JOURNAL_PROMPTS.length;
      setPromptIndex(nextIndex);
      setActivePrompt(JOURNAL_PROMPTS[nextIndex]);
    } else {
      // Show first prompt
      setActivePrompt(JOURNAL_PROMPTS[0]);
      setPromptIndex(0);
    }
  }, [activePrompt, promptIndex]);

  // Format relative time
  const formatRelativeTime = useCallback((isoDate: string): string => {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  }, []);

  // Open entry in overlay view mode
  const handleOpenEntry = useCallback(
    (entry: (typeof notes)[0]) => {
      overlay.openView({ record: entry as any, spaceId: null });
    },
    [overlay],
  );

  // Save and continue
  const handleContinue = useCallback(async () => {
    // If nothing to save, just continue
    if (selectedMoods.size === 0 && !journalText.trim()) {
      onContinue();
      return;
    }

    setIsSaving(true);
    try {
      // Map first selected mood to DB enum for backwards compat
      const moodArray = Array.from(selectedMoods);
      const primaryMood = moodArray[0] ? MOOD_TAG_TO_DB[moodArray[0]] : undefined;

      // Create a journal note for the sweep reflection
      await createNote({
        subtype: 'journal',
        title: journalText.trim() || 'Evening reflection',
        body: journalText.trim() || undefined,
        mood: primaryMood,
        origin: 'manual',
        canonicalType: 'log',
        journal_subtype: 'reflection',
        tags: ['reflection', 'sweep'],
        views: {
          sweep_origin: true,
          sweep_reflection: true,
          sweep_date: new Date().toISOString().split('T')[0],
          sweep_moods: moodArray, // Store all selected moods
        },
      });
    } catch (error) {
      console.warn('[SweepMoodStep] Failed to save reflection:', error);
    } finally {
      setIsSaving(false);
      onContinue();
    }
  }, [createNote, selectedMoods, journalText, onContinue]);

  const handleSkip = useCallback(() => {
    onContinue();
  }, [onContinue]);

  // Chevron rotation interpolation
  const chevronRotateStyle = {
    transform: [
      {
        rotate: chevronRotation.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '180deg'],
        }),
      },
    ],
  };

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
        {/* Header Section with Mascot */}
        <View style={styles.moodHeaderRow}>
          <View style={styles.moodHeaderText}>
            <Text variant="title" style={styles.moodStepTitle}>
              How was your day?
            </Text>
            <Text style={styles.moodStepSubcopy}>
              Everything here is optional,{'\n'}just a moment to pause.
            </Text>
          </View>
          <Image
            source={GREMLY_JOURNAL}
            style={styles.moodMascotImage}
            resizeMode="contain"
            accessibilityLabel="Gremly journal mascot"
          />
        </View>

        {/* Recent Entries Section (Collapsible) */}
        {hasRecentEntries && (
          <View style={styles.recentEntriesSection}>
            <Pressable
              style={styles.recentEntriesHeader}
              onPress={toggleEntriesExpanded}
              accessibilityRole="button"
              accessibilityLabel={`${recentEntries.length} thoughts saved since last sweep. Tap to ${isEntriesExpanded ? 'collapse' : 'expand'}`}
            >
              <View style={styles.recentEntriesHeaderLeft}>
                <Icon name="Check" size="xs" color={BRAND.colors.mossGreen} strokeWidth={2} />
                <Text style={styles.recentEntriesHeaderText}>
                  {recentEntries.length} thought{recentEntries.length !== 1 ? 's' : ''} saved
                </Text>
              </View>
              <Animated.View style={chevronRotateStyle}>
                <Icon name="ChevronDown" size="xs" color={BRAND.colors.inkMuted} strokeWidth={2} />
              </Animated.View>
            </Pressable>

            {isEntriesExpanded && (
              <View style={styles.recentEntriesList}>
                {recentEntries.map((entry) => (
                  <Pressable
                    key={entry.id}
                    style={({ pressed }) => [
                      styles.recentEntryCard,
                      pressed && styles.recentEntryCardPressed,
                    ]}
                    onPress={() => handleOpenEntry(entry)}
                  >
                    <Text style={styles.recentEntryTime}>
                      {formatRelativeTime(entry.created_at)}
                    </Text>
                    <Text style={styles.recentEntryPreview} numberOfLines={1}>
                      {entry.title || entry.body || 'Untitled'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Journal Input Section */}
        <View style={styles.journalSection}>
          {/* Prompt line (optional) */}
          {activePrompt && (
            <View style={styles.promptLine}>
              <Icon name="Lightbulb" size="xs" color={BRAND.colors.mossGreen} strokeWidth={1.8} />
              <Text style={styles.promptText}>{activePrompt}</Text>
            </View>
          )}

          {/* Journal TextInput with prompt button */}
          <View style={styles.journalInputWrapper}>
            <TextInput
              style={styles.journalInput}
              placeholder="Today felt like..."
              placeholderTextColor={BRAND.colors.inkMuted}
              multiline
              value={journalText}
              onChangeText={setJournalText}
              textAlignVertical="top"
            />
            <Pressable
              style={({ pressed }) => [styles.promptButton, pressed && styles.promptButtonPressed]}
              onPress={handlePromptPress}
            >
              <Icon name="Lightbulb" size="xs" color={BRAND.colors.mossGreen} strokeWidth={1.8} />
              <Text style={styles.promptButtonLabel}>{activePrompt ? 'next' : 'prompt'}</Text>
            </Pressable>
          </View>
        </View>

        {/* Mood Chips Section (Multi-select) */}
        <View style={styles.moodChipsSection}>
          <Text style={styles.moodChipsLabel}>Tag a mood</Text>
          <View style={styles.moodChipsGrid}>
            {SWEEP_MOOD_CHIPS.map((chip) => {
              const isSelected = selectedMoods.has(chip.value);
              return (
                <Pressable
                  key={chip.value}
                  style={({ pressed }) => [
                    styles.moodChip,
                    isSelected && styles.moodChipSelected,
                    pressed && styles.moodChipPressed,
                  ]}
                  onPress={() => toggleMood(chip.value)}
                >
                  <Text style={[styles.moodChipLabel, isSelected && styles.moodChipLabelSelected]}>
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {selectedMoods.size > 1 && (
            <Text style={styles.moodChipsHelper}>{selectedMoods.size} moods selected</Text>
          )}
        </View>
      </ScrollView>

      {/* Footer Actions */}
      <View style={styles.moodFooter}>
        <TouchableOpacity
          style={[styles.continueButton, isSaving && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={isSaving}
          activeOpacity={0.8}
        >
          <View style={styles.continueButtonContent}>
            <Text style={styles.continueButtonText}>{isSaving ? 'Saving...' : 'Continue'}</Text>
            {!isSaving && (
              <Icon name="ArrowRight" size="sm" color={BRAND.colors.mossGreen} strokeWidth={2.5} />
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={isSaving}>
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Step 3: Habits Check-in
 *
 * Swipe-to-complete habit rows grouped by cadence (daily/weekly/monthly).
 * Shows streak for daily habits, progress for weekly/monthly.
 * Completed habits shown in muted section at bottom.
 *
 * REDESIGNED: Uses SweepHabitRow with swipe gesture instead of checkboxes.
 */
function SweepHabitsStep({ onContinue }: StepProps) {
  // Get raw data from Zustand store
  const habits = useGremlyStore((state) => state.habits);
  const habitProgress = useGremlyStore((state) => state.habitProgress);
  const completeHabit = useGremlyStore((state) => state.completeHabit);
  const uncompleteHabit = useGremlyStore((state) => state.uncompleteHabit);
  const loading = useIsLoading();

  // ─────────────────────────────────────────────────────────────────────────
  // Session state - tracks toggles during this sweep (not committed yet)
  // ─────────────────────────────────────────────────────────────────────────
  // Habits that were NOT completed before but user toggled ON
  const [sessionCompletions, setSessionCompletions] = useState<Set<string>>(new Set());
  // Habits that WERE completed before but user toggled OFF
  const [sessionUncompletions, setSessionUncompletions] = useState<Set<string>>(new Set());

  // Group habits by cadence and compute metadata
  const groupedHabits = useMemo(() => {
    // Filter to non-archived habits
    const activeHabits = habits.filter((h) => !h.archived);
    return groupHabitsForSweep(activeHabits, habitProgress);
  }, [habits, habitProgress]);

  // Calculate open count considering session toggles
  const openCount = useMemo(() => {
    let count = 0;

    // Count habits in each open section that are visually not completed
    [...groupedHabits.daily, ...groupedHabits.weekly, ...groupedHabits.monthly].forEach((item) => {
      const isVisuallyCompleted =
        sessionCompletions.has(item.habit.id) ||
        (!sessionUncompletions.has(item.habit.id) && item.isCompletedToday);
      if (!isVisuallyCompleted) {
        count++;
      }
    });

    // Also count any from completed section that user toggled OFF
    groupedHabits.completed.forEach((item) => {
      if (sessionUncompletions.has(item.habit.id)) {
        count++;
      }
    });

    return count;
  }, [groupedHabits, sessionCompletions, sessionUncompletions]);
  const isEmpty = useMemo(() => isHabitsEmpty(groupedHabits), [groupedHabits]);

  // Handle toggle from SweepHabitRow - only updates local session state
  const handleToggle = useCallback((habitId: string, completed: boolean) => {
    if (completed) {
      // User toggled ON
      setSessionCompletions((prev) => {
        const next = new Set(prev);
        next.add(habitId);
        return next;
      });
      setSessionUncompletions((prev) => {
        const next = new Set(prev);
        next.delete(habitId);
        return next;
      });
    } else {
      // User toggled OFF
      setSessionUncompletions((prev) => {
        const next = new Set(prev);
        next.add(habitId);
        return next;
      });
      setSessionCompletions((prev) => {
        const next = new Set(prev);
        next.delete(habitId);
        return next;
      });
    }
  }, []);

  // Determine if a habit should visually appear completed
  // Takes into account: original state + session toggles
  const isHabitVisuallyCompleted = useCallback(
    (habitId: string, wasCompletedToday: boolean): boolean => {
      // If user explicitly toggled it ON this session, show as completed
      if (sessionCompletions.has(habitId)) return true;
      // If user explicitly toggled it OFF this session, show as not completed
      if (sessionUncompletions.has(habitId)) return false;
      // Otherwise, use the original state
      return wasCompletedToday;
    },
    [sessionCompletions, sessionUncompletions],
  );

  // Commit all session changes to Zustand and continue
  const handleContinue = useCallback(async () => {
    // Batch complete all newly completed habits
    const completionPromises = Array.from(sessionCompletions).map(async (habitId) => {
      try {
        await completeHabit(habitId);
      } catch (error) {
        console.error('[SweepHabitsStep] Failed to complete habit:', habitId, error);
      }
    });

    // Batch uncomplete all newly uncompleted habits
    const uncompletionPromises = Array.from(sessionUncompletions).map(async (habitId) => {
      try {
        await uncompleteHabit(habitId);
      } catch (error) {
        console.error('[SweepHabitsStep] Failed to uncomplete habit:', habitId, error);
      }
    });

    // Wait for all to complete
    await Promise.all([...completionPromises, ...uncompletionPromises]);

    // Continue to next step
    onContinue();
  }, [sessionCompletions, sessionUncompletions, completeHabit, uncompleteHabit, onContinue]);

  // Render a single habit row
  const renderHabitRow = useCallback(
    (item: HabitWithMeta, index: number, array: HabitWithMeta[]) => (
      <SweepHabitRow
        key={item.habit.id}
        id={item.habit.id}
        name={item.habit.name}
        cadence={item.cadence}
        streakDays={item.streakDays}
        completedThisPeriod={item.completedThisPeriod}
        targetPerPeriod={item.targetPerPeriod}
        frequencyLabel={item.frequencyLabel}
        isCompleted={isHabitVisuallyCompleted(item.habit.id, item.isCompletedToday)}
        onToggle={handleToggle}
        showDivider={index < array.length - 1}
      />
    ),
    [handleToggle, isHabitVisuallyCompleted],
  );

  // Render a section with header
  const renderSection = useCallback(
    (title: string, items: HabitWithMeta[]) => {
      if (items.length === 0) return null;
      return (
        <View style={styles.habitsSection}>
          <View style={styles.habitsSectionHeader}>
            <View style={styles.habitsSectionLine} />
            <Text style={styles.habitsSectionTitle}>{title}</Text>
            <View style={styles.habitsSectionLine} />
          </View>
          {items.map((item, index) => renderHabitRow(item, index, items))}
        </View>
      );
    },
    [renderHabitRow],
  );

  // Loading state
  if (loading) {
    return (
      <View style={styles.wrapUpStepContainer}>
        <View style={styles.wrapUpHeaderSection}>
          <Text variant="title" style={styles.wrapUpStepTitle}>
            Habits today
          </Text>
          <Text style={styles.wrapUpStepSubcopy}>Slide to mark what you managed today.</Text>
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
          <Text style={styles.wrapUpStepSubcopy}>Slide to mark what you managed today.</Text>
        </View>

        {isEmpty ? (
          <View style={styles.wrapUpEmptyContainer}>
            <Text variant="body" style={styles.wrapUpEmptyText}>
              No habits to check off — you're all set!
            </Text>
          </View>
        ) : (
          <View style={styles.habitsContainer}>
            {/* Daily Habits */}
            {renderSection('Daily', groupedHabits.daily)}

            {/* Weekly Habits */}
            {renderSection('Weekly', groupedHabits.weekly)}

            {/* Monthly Habits */}
            {renderSection('Monthly', groupedHabits.monthly)}

            {/* Completed Section */}
            {groupedHabits.completed.length > 0 && (
              <View style={styles.habitsCompletedSection}>
                <View style={styles.habitsSectionHeader}>
                  <View style={styles.habitsSectionLine} />
                  <Text style={styles.habitsCompletedTitle}>Already done</Text>
                  <View style={styles.habitsSectionLine} />
                </View>
                {groupedHabits.completed.map((item, index) => (
                  <View
                    key={item.habit.id}
                    style={[
                      styles.completedHabitRow,
                      index < groupedHabits.completed.length - 1 && styles.completedHabitRowBorder,
                    ]}
                  >
                    <Icon name="Check" size="xs" color={BRAND.colors.mossGreen} strokeWidth={2.5} />
                    <Text style={styles.completedHabitName} numberOfLines={1}>
                      {item.habit.name}
                    </Text>
                    <Text style={styles.completedHabitMeta}>
                      {item.cadence === 'daily'
                        ? 'today'
                        : `${item.completedThisPeriod}/${item.targetPerPeriod} ${item.cadence === 'weekly' ? 'wk' : 'mo'}`}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Action Button */}
      <View style={styles.wrapUpButtonContainer}>
        {/* Open habits reminder */}
        {openCount > 0 && (
          <Text style={styles.wrapUpOpenItemsReminder}>
            {openCount} habit{openCount !== 1 ? 's' : ''} still open.
          </Text>
        )}
        {openCount === 0 && !isEmpty && (
          <Text style={styles.wrapUpOpenItemsReminder}>All habits done! 🎉</Text>
        )}
        <TouchableOpacity
          style={styles.wrapUpContinueButton}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <View style={styles.wrapUpContinueButtonContent}>
            <Text style={styles.wrapUpContinueButtonText}>Continue</Text>
            <Icon name="ArrowRight" size="sm" color={BRAND.colors.mossGreen} strokeWidth={2.5} />
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

/**
 * Hook to snapshot sweep candidates on initial load.
 * Prevents items from disappearing mid-sweep when they're archived/skipped.
 */
function useSweepSnapshot(
  allCandidates: Array<{ candidate: SweepCandidate; meta: SweepCardMeta }>,
  storeIsLoading: boolean,
) {
  const [snapshot, setSnapshot] = useState<Array<{
    candidate: SweepCandidate;
    meta: SweepCardMeta;
  }> | null>(null);

  // Take snapshot once when store finishes loading
  // This is intentional initialization, not a cascading update
  if (!storeIsLoading && snapshot === null) {
    // Using conditional setState is acceptable for one-time initialization
    // when the condition is based on loading state
    setSnapshot(allCandidates);
  }

  return {
    candidatesWithMeta: snapshot ?? [],
    isLoading: storeIsLoading || snapshot === null,
  };
}

function SweepDecisionStep({ onFinished, onClose }: DecisionStepProps) {
  // Get candidates from unified store selector (single source of truth)
  const allCandidates = useSweepCandidatesUnified();
  const storeIsLoading = useIsLoading();

  // Snapshot candidates at session start (prevents items disappearing mid-sweep)
  const { candidatesWithMeta, isLoading } = useSweepSnapshot(allCandidates, storeIsLoading);

  // Store mutations for sweep actions
  const updateTodo = useGremlyStore((state) => state.updateTodo);
  const archiveTodo = useGremlyStore((state) => state.archiveTodo);
  const updateNote = useGremlyStore((state) => state.updateNote);
  const archiveNote = useGremlyStore((state) => state.archiveNote);
  const updateHabit = useGremlyStore((state) => state.updateHabit);
  const archiveHabit = useGremlyStore((state) => state.archiveHabit);

  // Use store data for overlay lookups
  const todos = useGremlyStore((state) => state.todos);
  const notes = useGremlyStore((state) => state.notes);
  const overlayController = useOverlayController();

  // Local state for navigation
  const [currentIndex, setCurrentIndex] = useState(0);

  // Track summary stats for the sweep completion screen
  const [stats, setStats] = useState<SweepSummary>({ kept: 0, cleared: 0 });

  // Track the candidate ID currently being edited (for detecting overlay saves)
  const editingCandidateIdRef = useRef<string | null>(null);

  // Log candidates for debugging (using snapshot)
  useEffect(() => {
    if (!isLoading && candidatesWithMeta.length > 0) {
      console.log('[SweepFlow] Candidates from store:', {
        total: candidatesWithMeta.length,
        todos: candidatesWithMeta.filter((c) => c.candidate.kind === 'todo').length,
        notes: candidatesWithMeta.filter((c) => c.candidate.kind === 'note').length,
        ids: candidatesWithMeta.map((c) => ({
          id: c.candidate.id.slice(0, 8),
          kind: c.candidate.kind,
          title: (c.candidate.raw as any)?.name || (c.candidate.raw as any)?.title,
        })),
      });
    }
  }, [isLoading, candidatesWithMeta]);

  // ─────────────────────────────────────────────────────────────────────────
  // Unified Outcome Handler
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Centralized handler for all sweep card outcomes.
   * Any meaningful action advances the card; "peek and close" stays.
   */
  type SweepOutcome = 'skip' | 'clear' | 'changed' | 'stay';

  // Store handleOutcome in a ref so the effect can access the latest version
  const handleOutcomeRef = useRef<(outcome: SweepOutcome) => void>(() => {});

  const handleOutcome = useCallback(
    async (outcome: SweepOutcome) => {
      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const candidate = candidateWithMeta.candidate;

      switch (outcome) {
        case 'skip': {
          // User swiped RIGHT - defer this item to next sweep session
          // Sets skipped_in_sweep_at = NOW() so it reappears next time
          try {
            const now = new Date().toISOString();
            if (candidate.kind === 'todo') {
              await updateTodo(candidate.id, { skipped_in_sweep_at: now } as any);
            } else {
              await updateNote(candidate.id, { skipped_in_sweep_at: now } as any);
            }
            setStats((prev) => ({ ...prev, kept: prev.kept + 1 }));
          } catch (error) {
            console.error('[SweepDecisionStep] handleOutcome skip error:', error);
          }
          setCurrentIndex((prev) => prev + 1);
          break;
        }

        case 'clear': {
          // Archive the candidate
          try {
            // Archive with reason 'swept'
            if (candidate.kind === 'todo') {
              await archiveTodo(candidate.id, 'swept');
              // EventBus emission handled by store mutation
            } else if (candidate.kind === 'note') {
              await archiveNote(candidate.id, 'swept');
            } else if (candidate.kind === 'habit') {
              await archiveHabit(candidate.id, 'swept');
            }

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
          // Clear skipped_in_sweep_at to mark as reviewed
          try {
            if (candidate.kind === 'todo') {
              await updateTodo(candidate.id, { skipped_in_sweep_at: null } as any);
            } else {
              await updateNote(candidate.id, { skipped_in_sweep_at: null } as any);
            }
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
    [candidatesWithMeta, currentIndex, updateTodo, updateNote, archiveTodo, archiveNote],
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
  const handleSkip = useCallback(() => {
    handleOutcome('skip');
  }, [handleOutcome]);

  const handleClear = useCallback(() => {
    handleOutcome('clear');
  }, [handleOutcome]);

  const handleOpenEdit = useCallback(() => {
    const candidateWithMeta = candidatesWithMeta[currentIndex];
    if (!candidateWithMeta) return;
    const candidate = candidateWithMeta.candidate;

    // Track which candidate is being edited so we can detect saves
    editingCandidateIdRef.current = candidate.id;

    // Look up full record from store (faster than DB fetch)
    let fullRecord: AppRecord | undefined;
    if (candidate.kind === 'todo') {
      const todo = todos.find((t) => t.id === candidate.id);
      if (todo) fullRecord = { ...todo, type: 'todo' } as AppRecord;
    } else if (candidate.kind === 'note') {
      const note = notes.find((n) => n.id === candidate.id);
      if (note) fullRecord = { ...note, type: 'note' } as AppRecord;
    }

    if (fullRecord) {
      // Open UnifiedOverlayV2 with the full record from store
      overlayController.openEdit({ record: fullRecord });
    } else {
      // Fallback: construct a minimal record from the raw data
      console.warn('[SweepDecisionStep] handleOpenEdit: record not found in store, using raw');
      const fallbackRecord = {
        ...candidate.raw,
        type: candidate.kind,
      } as AppRecord;
      overlayController.openEdit({ record: fallbackRecord });
    }
  }, [candidatesWithMeta, currentIndex, todos, notes, overlayController]);

  const handleConvertToTodo = useCallback(() => {
    const candidateWithMeta = candidatesWithMeta[currentIndex];
    if (!candidateWithMeta || candidateWithMeta.candidate.kind !== 'note') return;
    const candidate = candidateWithMeta.candidate;

    // Look up full record from store
    const note = notes.find((n) => n.id === candidate.id);
    const record = note ? { ...note, type: 'note' } : { ...candidate.raw, type: 'note' };

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
  }, [candidatesWithMeta, currentIndex, notes, overlayController]);

  /**
   * Handle confirmed quick date (user selected + swiped right)
   * This is when we actually save the date
   */
  const handleConfirmQuickDate = useCallback(
    async (option: 'tomorrow' | '2days' | 'nextweek') => {
      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta || candidateWithMeta.candidate.kind !== 'todo') return;
      const candidate = candidateWithMeta.candidate;

      // Calculate the target date
      const today = new Date();
      let targetDate: Date;
      switch (option) {
        case 'tomorrow':
          targetDate = addDays(today, 1);
          break;
        case '2days':
          targetDate = addDays(today, 2);
          break;
        case 'nextweek':
          targetDate = nextMonday(today);
          break;
      }

      try {
        // Get current reschedule count and increment
        const currentCount = candidate.raw.sweep_reschedule_count ?? 0;

        // Update todo with new due_day and clear skipped_in_sweep_at
        await updateTodo(candidate.id, {
          due_day: toDayString(targetDate),
          skipped_in_sweep_at: null,
          sweep_reschedule_count: currentCount + 1,
        } as any);
        // Advance to next card (counts as "changed")
        handleOutcome('changed');
      } catch (error) {
        console.error('[SweepDecisionStep] handleConfirmQuickDate error:', error);
      }
    },
    [candidatesWithMeta, currentIndex, updateTodo, handleOutcome],
  );

  /**
   * Handle confirmed custom date (user picked date in date picker + swiped right)
   * This is when we actually save the custom date
   */
  const handleConfirmCustomDate = useCallback(
    async (date: Date) => {
      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta || candidateWithMeta.candidate.kind !== 'todo') return;
      const candidate = candidateWithMeta.candidate;

      try {
        // Get current reschedule count and increment
        const currentCount = candidate.raw.sweep_reschedule_count ?? 0;

        // Update todo with new due_day and clear skipped_in_sweep_at
        await updateTodo(candidate.id, {
          due_day: toDayString(date),
          skipped_in_sweep_at: null,
          sweep_reschedule_count: currentCount + 1,
        } as any);
        // Advance to next card (counts as "changed")
        handleOutcome('changed');
      } catch (error) {
        console.error('[SweepDecisionStep] handleConfirmCustomDate error:', error);
      }
    },
    [candidatesWithMeta, currentIndex, updateTodo, handleOutcome],
  );

  /**
   * Confirm Habit Start Handler - Sets start date and confirms habit
   * Used for unconfirmed habits that appear in Sweep
   */
  const handleConfirmHabitStart = useCallback(
    async (
      action: 'asktomorrow' | 'starttomorrow' | 'startmonday',
      customDate?: Date,
    ) => {
      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta || candidateWithMeta.candidate.kind !== 'habit') return;
      const habit = candidateWithMeta.candidate;

      try {
        if (action === 'asktomorrow') {
          // Don't confirm, just skip to next card - habit stays in sweep
          handleOutcome('skip');
          return;
        }

        // Calculate start date based on action
        let startDate: Date;
        if (action === 'starttomorrow') {
          startDate = addDays(new Date(), 1);
        } else if (action === 'startmonday') {
          startDate = nextMonday(new Date());
        } else if (customDate) {
          startDate = customDate;
        } else {
          return;
        }

        // Update habit with start_date and start_date_confirmed
        await updateHabit(habit.id, {
          start_date: startDate.toISOString().split('T')[0], // YYYY-MM-DD format
          start_date_confirmed: true,
        });

        handleOutcome('changed');
      } catch (error) {
        console.error('[SweepDecisionStep] handleConfirmHabitStart error:', error);
      }
    },
    [candidatesWithMeta, currentIndex, updateHabit, handleOutcome],
  );

  /**
   * Add to Space Handler - Opens edit overlay for space assignment
   * Used for logs that user wants to organize into a Space
   */
  const handleAddToSpace = useCallback(() => {
    const candidateWithMeta = candidatesWithMeta[currentIndex];
    if (!candidateWithMeta) return;
    const candidate = candidateWithMeta.candidate;

    // Track that we're editing this candidate
    editingCandidateIdRef.current = candidate.id;

    // Look up full record from store
    if (candidate.kind === 'note') {
      const note = notes.find((n) => n.id === candidate.id);
      if (note) {
        overlayController.openEdit({ record: { ...note, type: 'note' } });
      }
    } else {
      const todo = todos.find((t) => t.id === candidate.id);
      if (todo) {
        overlayController.openEdit({ record: { ...todo, type: 'todo' } });
      }
    }
  }, [candidatesWithMeta, currentIndex, notes, todos, overlayController]);

  // Auto-advance to summary when all cards are processed
  useEffect(() => {
    if (!isLoading && candidatesWithMeta.length > 0 && currentIndex >= candidatesWithMeta.length) {
      // All cards processed - auto-finish to show summary
      onFinished(stats);
    }
  }, [isLoading, candidatesWithMeta.length, currentIndex, stats, onFinished]);

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
  if (candidatesWithMeta.length === 0) {
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
  if (currentIndex >= candidatesWithMeta.length) {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.decisionLoadingContainer}>
          <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
        </View>
      </View>
    );
  }

  // Current candidate to display
  const currentCandidateWithMeta = candidatesWithMeta[currentIndex];
  const currentCandidate = currentCandidateWithMeta.candidate;

  return (
    <View style={styles.decisionStepContainer}>
      {/* Decision Step Header - X close button at top right only */}
      <View style={styles.decisionHeader}>
        <View style={styles.decisionHeaderSpacer} />
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
          meta={currentCandidateWithMeta.meta}
          index={currentIndex}
          total={candidatesWithMeta.length}
          onSkip={handleSkip}
          onClear={handleClear}
          onOpenEdit={handleOpenEdit}
          onConvertToTodo={handleConvertToTodo}
          onConfirmQuickDate={handleConfirmQuickDate}
          onConfirmCustomDate={handleConfirmCustomDate}
          onAddToSpace={handleAddToSpace}
          onConfirmHabitStart={handleConfirmHabitStart}
          onClose={onClose}
          hideBottomSaveExit={true}
        />
      </View>

      {/* Bottom section - Progress + Save and exit */}
      <View style={styles.bottomSection}>
        {/* Progress + counter */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${((currentIndex + 1) / candidatesWithMeta.length) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.counterText}>
            {currentIndex + 1} of {candidatesWithMeta.length} items
          </Text>
        </View>

        {/* Save and exit */}
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.saveExitButton}>
            <Text style={styles.saveExitText}>Need a break? Save and exit</Text>
          </TouchableOpacity>
        )}
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
    setStep(4); // Mood → Summary
  };

  const handleWrapUpContinue = () => {
    setStep(3); // Habits → Mood
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

    // Advance to Habits step
    setStep(2); // Decision → Habits
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
          {step === 2 && <SweepHabitsStep onContinue={handleWrapUpContinue} />}
          {step === 3 && <SweepMoodStep onContinue={handleMoodContinue} />}
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
    backgroundColor: '#FFFFFF', // White background for decision step
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
    paddingTop: 16,
  },
  introMascotContainer: {
    alignItems: 'center',
    marginBottom: 0,
  },
  introMascotImage: {
    width: 140,
    height: 140,
  },
  achievementLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
    marginHorizontal: 24,
    marginTop: 20,
    marginBottom: 8,
    textAlign: 'left',
  },
  introTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginHorizontal: 24,
  },
  introTitleUnderline: {
    width: '40%',
    height: 2,
    backgroundColor: BRAND.colors.borderSubtle,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  introSubcopy: {
    fontSize: 15,
    color: BRAND.colors.inkSubtle,
    textAlign: 'center',
    marginHorizontal: 32,
    lineHeight: 22,
    marginBottom: 24,
  },
  introHeaderSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  introStatsContainer: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  // ─────────────────────────────────────────────────────────────────────────
  // SweepMoodStep styles - Journal-First Redesign
  // ─────────────────────────────────────────────────────────────────────────
  moodStepContainer: {
    flex: 1,
    paddingTop: 8,
    backgroundColor: BRAND.colors.linenCream,
  },
  scrollContainer: {
    flex: 1,
  },
  moodScrollContent: {
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 48,
  },
  // Header Row with Mascot
  moodHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  moodHeaderText: {
    flex: 1,
  },
  moodMascotImage: {
    width: 86,
    height: 86,
    opacity: 0.9,
    marginLeft: 8,
    marginTop: -12,
  },
  moodStepTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(191, 216, 192, 0.5)',
    letterSpacing: -0.3,
  },
  moodStepSubcopy: {
    fontSize: 15,
    fontWeight: '400',
    color: 'rgba(34, 34, 34, 0.75)',
    lineHeight: 22,
  },
  // Recent Entries Section (Collapsible)
  recentEntriesSection: {
    marginBottom: 16,
    borderRadius: BRAND.radius.lg,
    backgroundColor: 'rgba(191, 216, 192, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(191, 216, 192, 0.30)',
    overflow: 'hidden',
  },
  recentEntriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  recentEntriesHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recentEntriesHeaderText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  recentEntriesList: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 6,
  },
  recentEntryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BRAND.radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  recentEntryCardPressed: {
    backgroundColor: 'rgba(191, 216, 192, 0.25)',
  },
  recentEntryTime: {
    fontSize: 11,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
    width: 60,
  },
  recentEntryPreview: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    color: BRAND.colors.charcoalInk,
  },
  // Journal Input Section
  journalSection: {
    marginBottom: 28,
  },
  promptLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingLeft: 4,
  },
  promptText: {
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
    color: BRAND.colors.mossGreen,
  },
  journalInputWrapper: {
    position: 'relative',
  },
  journalInput: {
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(191, 216, 192, 0.30)',
    padding: 16,
    paddingBottom: 44, // Room for prompt button
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    minHeight: 120,
    lineHeight: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  promptButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BRAND.radius.md,
    backgroundColor: 'rgba(191, 216, 192, 0.25)',
  },
  promptButtonPressed: {
    backgroundColor: 'rgba(191, 216, 192, 0.40)',
  },
  promptButtonLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
    textTransform: 'lowercase',
  },
  // Mood Chips Section (Multi-select)
  moodChipsSection: {
    marginBottom: 24,
    marginTop: 8,
  },
  moodChipsLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    marginBottom: 14,
    textAlign: 'center',
  },
  moodChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 5,
  },
  moodChip: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: BRAND.radius.sm,
    backgroundColor: 'rgba(191, 216, 192, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(191, 216, 192, 0.40)',
  },
  moodChipSelected: {
    backgroundColor: 'rgba(191, 216, 192, 0.50)',
    borderColor: BRAND.colors.mossGreen,
    borderWidth: 1.5,
  },
  moodChipPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  moodChipLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  moodChipLabelSelected: {
    color: BRAND.colors.mossGreen,
    fontWeight: '600',
  },
  moodChipsHelper: {
    fontSize: 12,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    marginTop: 8,
  },
  // Footer Actions
  moodFooter: {
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: BRAND.colors.linenCream,
  },
  continueButton: {
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: BRAND.radius.xl,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  continueButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  skipButtonText: {
    color: 'rgba(34, 34, 34, 0.60)',
    fontSize: 15,
    fontWeight: '500',
  },
  // ─────────────────────────────────────────────────────────────────────────
  // SweepHabitsStep styles - Gremly Brand Reskin (matched to Mood step)
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
    backgroundColor: BRAND.colors.sageMist, // Soft sage fill
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
    color: BRAND.colors.mossGreen,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Habits Step Styles (Phase 3 redesign)
  // ─────────────────────────────────────────────────────────────────────────
  habitsContainer: {
    paddingHorizontal: 12,
  },
  habitsSection: {
    marginBottom: 8,
  },
  habitsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 16,
    paddingHorizontal: 8,
  },
  habitsSectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
  },
  habitsSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 12,
  },
  habitsCompletedSection: {
    marginTop: 24,
    opacity: 0.7,
  },
  habitsCompletedTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 12,
  },
  completedHabitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  completedHabitRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  completedHabitName: {
    flex: 1,
    fontSize: 14,
    color: BRAND.colors.inkSubtle,
    textDecorationLine: 'line-through',
  },
  completedHabitMeta: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
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
    position: 'relative', // For absolute positioned behindCardTextContainer
    backgroundColor: '#FFFFFF', // White background for contrast
  },
  decisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  decisionHeaderSpacer: {
    flex: 1,
  },
  decisionCloseButton: {
    padding: 8,
  },
  // Bottom section styles - Compact chrome at bottom, clearly separated from card
  bottomSection: {
    alignItems: 'center',
    paddingBottom: 12,
    paddingTop: 16,
    marginTop: 8,
  },
  progressContainer: {
    alignItems: 'center',
    marginBottom: 4,
  },
  progressBar: {
    width: 100,
    height: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    borderRadius: 1,
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 1,
  },
  counterText: {
    fontSize: 11,
    color: BRAND.colors.inkSubtle,
    fontWeight: '500',
    opacity: 0.8,
  },
  saveExitButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  saveExitText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(34, 34, 34, 0.45)',
    letterSpacing: 0.1,
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
