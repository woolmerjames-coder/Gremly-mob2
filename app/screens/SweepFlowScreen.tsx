/**
 * Sweep Flow Screen - Evening Sweep wizard container
 *
 * Full-screen flow for the Evening Sweep ritual:
 * - Step 0: Intro ("Ready to Sweep?")
 * - Step 0.5: Lock-In Checkpoint (if user has locked items)
 * - Step 1: Decision cards
 * - Step 2: Habits check-in
 * - Step 3: Mood check-in
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
  Easing,
  TouchableOpacity,
  Image,
  Modal,
} from 'react-native';
import Reanimated, {
  FadeIn,
  FadeInUp,
  FadeOutDown,
  Layout,
  Easing as ReanimatedEasing,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Screen, Text, Button } from '../../ui';
import { Icon } from '../../design-system/Icon';
import {
  Flame,
  Sparkles,
  Sprout,
  CheckCircle,
  Leaf,
  Moon,
  Check,
  Lightbulb,
  Repeat,
  ArrowRight,
} from 'lucide-react-native';
import { useAuth } from '../../providers/AuthProvider';
import { BRAND } from '../../design/brand';
import { triggerLight, triggerSuccess } from '../../lib/haptics';
import { getDateService } from '../../lib/date';
// Zustand store - used for all Sweep data operations
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import {
  useActiveSpaces,
  useIsLoading,
  useSweepCandidatesUnified,
} from '../../lib/store/selectors';
import type { Habit } from '../../lib/types';
import { supabase } from '../../lib/supabase/client';
import { markSweepCompleted } from '../../lib/sweep/engine';
import type {
  SweepCandidate,
  SweepCandidateTodo,
  SweepCandidateHabit,
  SweepCardMeta,
  SweepSummary,
  SweepSummaryItem,
} from '../../lib/sweep/types';
import { computeSweepCardMeta } from '../../lib/sweep/computeSweepCardMeta';
import { SweepCard } from '../../components/sweep/SweepCard';
import { SweepGremlyHeader } from '../../components/sweep/SweepGremlyHeader';
import { SweepSectionTransition } from '../../src/components/sweep/SweepSectionTransition';
import { EntityChatScreen } from '../../components/chat/EntityChatScreen';
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
import AgeUpCelebrationModal from '../../components/ritual/AgeUpCelebrationModal';
import { LockInCheckpointStep } from '../components/sweep/LockInCheckpointStep';
import {
  selectTodayLockedItems,
  selectTodayLockedItemsIncludingCompleted,
} from '../../lib/store/selectors';

// Sweep habit components and helpers
import { SweepHabitRow } from '../../src/sweep/SweepHabitRow';
import {
  groupHabitsForSweep,
  getOpenHabitsCount,
  isHabitsEmpty,
  type HabitWithMeta,
  type GroupedHabits,
} from '../../lib/sweep/habitHelpers';
import { useSweepIntroStats } from '../../lib/sweep/useSweepIntroStats';
import { ALL_MOODS, MOOD_CONFIG, getMoodsByCategory, type Mood } from '../../lib/shared/moods';
import { CompletionBadges } from '../../components/sweep/CompletionBadges';
import { SweepCelebrationTransition } from '../../components/sweep/SweepCelebrationTransition';
import { SweepInstructionsModal } from '../../components/sweep/SweepInstructionsModal';
import { SweepCompletedModal } from '../../components/sweep/SweepCompletedModal';
import { SweepEndCard } from '../../components/sweep/SweepEndCard';
import { SweepEndItemList } from '../../components/sweep/SweepEndItemList';

// Gremly mascot for summary step
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../../assets/mascot/gremly-mascot.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT_CELEBRATE = require('../../assets/mascot/sweepcomplete.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_JOURNAL = require('../../assets/mascot/JournalGremly.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_HABIT = require('../../assets/mascot/habitgremly.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_SWEEP_INTRO = require('../../assets/mascot/sweepintrogremly.png');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

// Navigation props - Sweep is now a full-screen card, not a modal
interface Props {
  navigation?: NativeStackNavigationProp<RootStackParamList, 'Sweep'>;
}

interface StepProps {
  onContinue: (data?: { habitsChecked?: number; journalWritten?: boolean }) => void;
}

// Decision tracking for sweep (stores decisions before committing)
type SweepDecision = {
  candidateId: string;
  candidateKind: 'todo' | 'habit' | 'note';
  action: 'keep' | 'clear' | 'skip';
  // For todos with dates:
  dueDate?: Date;
  // For habits with start dates:
  startDate?: Date;
  // For "Remind Me Later" - resurfaces in sweep on this date:
  resurfaceDate?: Date;
  habitAction?: 'asktomorrow' | 'starttomorrow' | 'startmonday';
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

// ─────────────────────────────────────────────────────────────────────────────
// Step Components
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step 0: Intro ("Ready to Sweep?")
 *
 * Welcome screen that introduces the Sweep ritual.
 * Shows what's ahead with a secondary link to see completed items.
 */
function SweepIntroStep({
  onStart,
  onHelpPress,
  onClose,
}: {
  onStart: () => void;
  onHelpPress?: () => void;
  onClose?: () => void;
}) {
  const { stats, isLoading } = useSweepIntroStats();
  const gremlyAge = useGremlyStore.getState().gremlyAge;
  const lastSweepCompletedAt = useGremlyStore((state) => state.lastSweepCompletedAt);
  const candidates = useSweepCandidatesUnified();

  // Count items by type
  const todoCount = candidates.filter((c) => c.candidate.kind === 'todo').length;
  const habitCount = candidates.filter((c) => c.candidate.kind === 'habit').length;
  const noteCount = candidates.filter((c) => c.candidate.kind === 'note').length;
  const totalCount = todoCount + habitCount + noteCount;

  // Time estimate
  const getTimeEstimate = () => {
    if (totalCount <= 4) return '~ 1 min ~';
    if (totalCount <= 8) return '~ 2 min ~';
    if (totalCount <= 15) return '~ 3 min ~';
    return '~ 5 min ~';
  };

  // Build breakdown string
  const buildBreakdown = () => {
    const parts: string[] = [];
    if (todoCount > 0) parts.push(`${todoCount} ${todoCount === 1 ? 'todo' : 'todos'}`);
    if (noteCount > 0) parts.push(`${noteCount} ${noteCount === 1 ? 'idea' : 'ideas'}`);
    if (habitCount > 0) parts.push(`${habitCount} ${habitCount === 1 ? 'habit' : 'habits'}`);
    return parts.join(' · ');
  };

  // First time user
  const isFirstTime = stats?.isFirstSweep || gremlyAge === 0;

  // Last sweep text
  const getLastSweepText = () => {
    if (!lastSweepCompletedAt) {
      return 'Your first sweep!';
    }

    const now = new Date();
    const last = new Date(lastSweepCompletedAt);
    const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Last sweep: earlier today';
    } else if (diffDays === 1) {
      return 'Last sweep: yesterday';
    } else {
      return `Last sweep: ${diffDays} days ago`;
    }
  };

  // Edge case: nothing to sweep
  if (totalCount === 0 && !isLoading) {
    return (
      <View style={styles.introContainer}>
        <Pressable onPress={onHelpPress} style={styles.introMascotContainerNew}>
          <Image source={GREMLY_SWEEP_INTRO} style={styles.introMascotNew} resizeMode="contain" />
        </Pressable>

        <Text style={styles.introCelebrationTitle}>All clear! 🎉</Text>
        <Text style={styles.introCelebrationSubtitle}>
          Nothing to sweep — you're caught up.{'\n'}Enjoy the mental clarity.
        </Text>

        <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
          <Text style={styles.secondaryButtonText}>Back to Today</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.introContainer}>
      {/* Gremly - tappable for help */}
      <Pressable onPress={onHelpPress} style={styles.introMascotContainerNew}>
        <Image source={GREMLY_SWEEP_INTRO} style={styles.introMascotNew} resizeMode="contain" />
      </Pressable>

      {/* Main title - simple and direct */}
      <Text style={styles.introPhrase}>{isFirstTime ? 'Welcome to Sweep!' : 'A quick sweep'}</Text>

      {/* Subtitle with time estimate */}
      <Text style={styles.introSubtitle}>
        {isFirstTime
          ? "Let's clear the path for tomorrow"
          : `Clear your mind in ${getTimeEstimate().replace(/~/g, '').trim()}`}
      </Text>

      {/* Breakdown Card */}
      {totalCount > 0 && (
        <View style={styles.breakdownCard}>
          {todoCount > 0 && (
            <View style={styles.breakdownColumn}>
              <Check size={22} color={BRAND.colors.mossGreen} strokeWidth={2} />
              <Text style={styles.breakdownNumber}>{todoCount}</Text>
              <Text style={styles.breakdownLabel}>{todoCount === 1 ? 'todo' : 'todos'}</Text>
            </View>
          )}
          {noteCount > 0 && (
            <View style={styles.breakdownColumn}>
              <Lightbulb size={22} color={BRAND.colors.mossGreen} strokeWidth={2} />
              <Text style={styles.breakdownNumber}>{noteCount}</Text>
              <Text style={styles.breakdownLabel}>{noteCount === 1 ? 'idea' : 'ideas'}</Text>
            </View>
          )}
          {habitCount > 0 && (
            <View style={styles.breakdownColumn}>
              <Repeat size={22} color={BRAND.colors.mossGreen} strokeWidth={2} />
              <Text style={styles.breakdownNumber}>{habitCount}</Text>
              <Text style={styles.breakdownLabel}>{habitCount === 1 ? 'habit' : 'habits'}</Text>
            </View>
          )}
        </View>
      )}

      {/* CTA */}
      <TouchableOpacity style={styles.primaryButton} onPress={onStart} activeOpacity={0.8}>
        <Text style={styles.primaryButtonText}>Let's do this</Text>
        <ArrowRight size={18} color="white" style={{ marginLeft: 8 }} />
      </TouchableOpacity>

      {/* Last sweep footer */}
      <Text style={styles.lastSweepText}>{getLastSweepText()}</Text>
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
  const [selectedMoods, setSelectedMoods] = useState<Mood[]>([]);
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
  const toggleMood = useCallback((mood: Mood) => {
    setSelectedMoods((prev) => {
      if (prev.includes(mood)) {
        return prev.filter((m) => m !== mood);
      } else {
        return [...prev, mood];
      }
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
    const hasContent = selectedMoods.length > 0 || journalText.trim().length > 0;

    // If nothing to save, just continue
    if (!hasContent) {
      onContinue({ journalWritten: false });
      return;
    }

    setIsSaving(true);
    try {
      // Create a journal note for the sweep reflection
      await createNote({
        subtype: 'journal',
        title: journalText.trim() || 'Evening reflection',
        body: journalText.trim() || undefined,
        mood: selectedMoods.length > 0 ? selectedMoods : null,
        origin: 'manual',
        canonicalType: 'log',
        journal_subtype: 'reflection',
        tags: ['reflection', 'sweep'],
        views: {
          sweep_origin: true,
          sweep_reflection: true,
          sweep_date: getDateService().getCurrentDate(),
          sweep_moods: selectedMoods,
        },
      });
      onContinue({ journalWritten: true });
    } catch (error) {
      console.warn('[SweepMoodStep] Failed to save reflection:', error);
      onContinue({ journalWritten: false });
    } finally {
      setIsSaving(false);
    }
  }, [createNote, selectedMoods, journalText, onContinue]);

  const handleSkip = useCallback(() => {
    onContinue({ journalWritten: false });
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
            {ALL_MOODS.map((mood) => {
              const config = MOOD_CONFIG[mood];
              const isSelected = selectedMoods.includes(mood);
              return (
                <Pressable
                  key={mood}
                  style={({ pressed }) => [
                    styles.moodChip,
                    isSelected && styles.moodChipSelected,
                    pressed && styles.moodChipPressed,
                  ]}
                  onPress={() => toggleMood(mood)}
                >
                  <Text style={[styles.moodChipLabel, isSelected && styles.moodChipLabelSelected]}>
                    {config.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {selectedMoods.length > 1 && (
            <Text style={styles.moodChipsHelper}>{selectedMoods.length} moods selected</Text>
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
 * Uses Reanimated Layout animations for smooth card transitions between sections.
 */

// Animation config for habit row transitions - calm, intentional feel
const HABIT_ANIM_DURATION = 450;
const HABIT_ANIM_EASING = ReanimatedEasing.bezier(0.4, 0, 0.2, 1); // Material Design standard

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
  // Habits that are "pending" move - showing completion animation before moving to Already Done
  const [pendingMoves, setPendingMoves] = useState<Set<string>>(new Set());
  // Ref to track pending timeouts for cleanup
  const pendingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

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

  // Handle toggle from SweepHabitRow - adds delay before moving to Already Done
  const handleToggle = useCallback((habitId: string, completed: boolean) => {
    // Clear any existing timeout for this habit
    const existingTimeout = pendingTimeoutsRef.current.get(habitId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      pendingTimeoutsRef.current.delete(habitId);
    }

    if (completed) {
      // User toggled ON - immediately update completion state but delay the move
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

      // Add to pending moves (habit stays in place during animation)
      setPendingMoves((prev) => {
        const next = new Set(prev);
        next.add(habitId);
        return next;
      });

      // After delay, remove from pending - Reanimated Layout handles the animation
      const timeout = setTimeout(() => {
        setPendingMoves((prev) => {
          const next = new Set(prev);
          next.delete(habitId);
          return next;
        });
        pendingTimeoutsRef.current.delete(habitId);
      }, 1500); // 1.5 second delay to show completion animation

      pendingTimeoutsRef.current.set(habitId, timeout);
    } else {
      // User toggled OFF - Reanimated handles the animation automatically
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
      // Remove from pending if it was there
      setPendingMoves((prev) => {
        const next = new Set(prev);
        next.delete(habitId);
        return next;
      });
    }
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      pendingTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      pendingTimeoutsRef.current.clear();
    };
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

  // Computed sections that react to session state
  // Habits from "completed" that were toggled OFF move to their cadence section
  // Habits from active sections that were toggled ON move to completed (after delay)
  const displaySections = useMemo(() => {
    // Helper to adjust completedThisPeriod based on session state
    const adjustProgress = (item: HabitWithMeta): HabitWithMeta => {
      const wasCompletedBefore = item.isCompletedToday;
      const isNowCompleted = isHabitVisuallyCompleted(item.habit.id, wasCompletedBefore);

      // If completion state changed, adjust the count
      if (isNowCompleted && !wasCompletedBefore) {
        // Newly completed this session - increment count
        return { ...item, completedThisPeriod: item.completedThisPeriod + 1 };
      } else if (!isNowCompleted && wasCompletedBefore) {
        // Uncompleted this session - decrement count
        return { ...item, completedThisPeriod: Math.max(0, item.completedThisPeriod - 1) };
      }
      return item;
    };

    // Start with items that were uncompleted from the completed section
    const uncompletedFromDone = groupedHabits.completed
      .filter((item) => sessionUncompletions.has(item.habit.id))
      .map(adjustProgress);

    // Filter each section: remove items toggled ON (unless pending), add items toggled OFF from completed
    const filterSection = (items: HabitWithMeta[], cadence: 'daily' | 'weekly' | 'monthly') => {
      // Keep items that aren't visually completed OR are pending move (still showing animation)
      const remaining = items.filter(
        (item) =>
          !isHabitVisuallyCompleted(item.habit.id, item.isCompletedToday) ||
          pendingMoves.has(item.habit.id),
      );
      // Add back any uncompleted items from the completed section that belong to this cadence
      const restored = uncompletedFromDone.filter((item) => item.cadence === cadence);
      return [...remaining.map(adjustProgress), ...restored];
    };

    // Get items that are now visually completed (either originally or newly toggled ON)
    // BUT exclude items that are still pending (waiting for animation delay)
    const allItems = [
      ...groupedHabits.daily,
      ...groupedHabits.weekly,
      ...groupedHabits.monthly,
      ...groupedHabits.completed,
    ];
    const visuallyCompleted = allItems
      .filter(
        (item) =>
          isHabitVisuallyCompleted(item.habit.id, item.isCompletedToday) &&
          !pendingMoves.has(item.habit.id),
      )
      .map(adjustProgress);

    return {
      daily: filterSection(groupedHabits.daily, 'daily'),
      weekly: filterSection(groupedHabits.weekly, 'weekly'),
      monthly: filterSection(groupedHabits.monthly, 'monthly'),
      completed: visuallyCompleted,
      needsSetup: groupedHabits.needsSetup,
    };
  }, [groupedHabits, sessionUncompletions, isHabitVisuallyCompleted, pendingMoves]);

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

    // Continue to next step with count of habits checked
    onContinue({ habitsChecked: sessionCompletions.size });
  }, [sessionCompletions, sessionUncompletions, completeHabit, uncompleteHabit, onContinue]);

  // Render a single habit row with layout animations
  const renderHabitRow = useCallback(
    (item: HabitWithMeta, index: number, array: HabitWithMeta[]) => (
      <Reanimated.View
        key={item.habit.id}
        entering={FadeInUp.duration(HABIT_ANIM_DURATION).easing(HABIT_ANIM_EASING)}
        exiting={FadeOutDown.duration(HABIT_ANIM_DURATION).easing(HABIT_ANIM_EASING)}
        layout={Layout.duration(HABIT_ANIM_DURATION).easing(HABIT_ANIM_EASING)}
      >
        <SweepHabitRow
          id={item.habit.id}
          name={item.habit.name}
          cadence={item.cadence}
          streakDays={item.streakDays}
          completedThisPeriod={item.completedThisPeriod}
          targetPerPeriod={item.targetPerPeriod}
          isAheadOfTarget={item.isAheadOfTarget}
          frequencyLabel={item.frequencyLabel}
          isCompleted={isHabitVisuallyCompleted(item.habit.id, item.isCompletedToday)}
          onToggle={handleToggle}
          showDivider={index < array.length - 1}
          isBreakHabit={item.isBreakHabit}
          lastCompletedAt={item.lastCompletedAt}
        />
      </Reanimated.View>
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
          <View style={styles.habitsHeaderRow}>
            <View style={styles.habitsHeaderText}>
              <Text variant="title" style={styles.wrapUpStepTitle}>
                Habits today
              </Text>
              <Text style={styles.wrapUpStepSubcopy}>Slide to mark what you managed today.</Text>
            </View>
            <Image source={GREMLY_HABIT} style={styles.habitsMascot} />
          </View>
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
            {renderSection('Daily', displaySections.daily)}

            {/* Weekly Habits */}
            {renderSection('Weekly', displaySections.weekly)}

            {/* Monthly Habits */}
            {renderSection('Monthly', displaySections.monthly)}

            {/* Completed Section */}
            {displaySections.completed.length > 0 && (
              <View style={styles.habitsCompletedSection}>
                <View style={styles.habitsSectionHeader}>
                  <View style={styles.habitsSectionLine} />
                  <Text style={styles.habitsCompletedTitle}>Already done</Text>
                  <View style={styles.habitsSectionLine} />
                </View>
                {displaySections.completed.map((item, index) => (
                  <Reanimated.View
                    key={item.habit.id}
                    entering={FadeIn.duration(HABIT_ANIM_DURATION).easing(HABIT_ANIM_EASING)}
                    exiting={FadeOutDown.duration(HABIT_ANIM_DURATION).easing(HABIT_ANIM_EASING)}
                    layout={Layout.duration(HABIT_ANIM_DURATION).easing(HABIT_ANIM_EASING)}
                  >
                    <TouchableOpacity
                      style={[
                        styles.completedHabitRow,
                        index < displaySections.completed.length - 1 &&
                          styles.completedHabitRowBorder,
                      ]}
                      onPress={() => handleToggle(item.habit.id, false)}
                      activeOpacity={0.7}
                    >
                      <Icon
                        name="Check"
                        size="xs"
                        color={BRAND.colors.mossGreen}
                        strokeWidth={2.5}
                      />
                      <Text style={styles.completedHabitName} numberOfLines={1}>
                        {item.habit.name}
                      </Text>
                      <View style={styles.completedHabitRight}>
                        <Text style={styles.completedHabitMeta}>
                          {item.cadence === 'daily'
                            ? 'today'
                            : `${item.completedThisPeriod}/${item.targetPerPeriod} ${item.cadence === 'weekly' ? 'wk' : 'mo'}`}
                        </Text>
                        <Icon
                          name="RotateCcw"
                          size="xs"
                          color={BRAND.colors.inkMuted}
                          strokeWidth={2}
                        />
                      </View>
                    </TouchableOpacity>
                  </Reanimated.View>
                ))}
              </View>
            )}

            {/* Needs Setup Section */}
            {displaySections.needsSetup.length > 0 && (
              <View style={styles.habitsNeedsSetupSection}>
                <View style={styles.habitsSectionHeader}>
                  <View style={styles.habitsSectionLine} />
                  <Text style={styles.habitsNeedsSetupTitle}>Needs setup</Text>
                  <View style={styles.habitsSectionLine} />
                </View>
                <Text style={styles.needsSetupSubtext}>Set a start date to begin tracking</Text>
                {displaySections.needsSetup.map((item, index) => (
                  <Reanimated.View
                    key={item.habit.id}
                    entering={FadeIn.duration(HABIT_ANIM_DURATION).easing(HABIT_ANIM_EASING)}
                    layout={Layout.duration(HABIT_ANIM_DURATION).easing(HABIT_ANIM_EASING)}
                  >
                    <TouchableOpacity
                      style={[
                        styles.needsSetupHabitRow,
                        index < displaySections.needsSetup.length - 1 &&
                          styles.needsSetupHabitRowBorder,
                      ]}
                      onPress={() => {
                        // TODO: Open habit overlay for editing
                        // e.g., openOverlay({ type: 'habit', id: item.habit.id, mode: 'edit' })
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.needsSetupHabitInfo}>
                        <Text style={styles.needsSetupHabitName} numberOfLines={1}>
                          {item.habit.name}
                        </Text>
                        <Text style={styles.needsSetupHabitFrequency}>{item.frequencyLabel}</Text>
                      </View>
                      <View style={styles.needsSetupBadge}>
                        <Icon
                          name="Calendar"
                          size="xs"
                          color={BRAND.colors.goldenPear}
                          strokeWidth={2}
                        />
                        <Text style={styles.needsSetupBadgeText}>Set date</Text>
                        <Icon
                          name="ChevronRight"
                          size="xs"
                          color={BRAND.colors.inkMuted}
                          strokeWidth={2}
                        />
                      </View>
                    </TouchableOpacity>
                  </Reanimated.View>
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
            {openCount} habit{openCount !== 1 ? 's' : ''} open.
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
  /** DEV ONLY: Jump to specific card index for testing */
  initialCardIndex?: number;
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
    console.log('[SweepSnapshot] Taking snapshot with', allCandidates.length, 'candidates');
    console.log(
      '[SweepSnapshot] Candidate IDs:',
      allCandidates.map((c) => c.candidate.id.slice(0, 8)),
    );
    setSnapshot(allCandidates);
  }

  return {
    candidatesWithMeta: snapshot ?? [],
    isLoading: storeIsLoading || snapshot === null,
  };
}

function SweepDecisionStep({ onFinished, onClose, initialCardIndex }: DecisionStepProps) {
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
  const habits = useGremlyStore((state) => state.habits);
  const spaces = useActiveSpaces();
  const overlayController = useOverlayController();

  // Local state for navigation - use initialCardIndex in DEV mode only
  const [currentIndex, setCurrentIndex] = useState(
    __DEV__ && initialCardIndex !== undefined ? initialCardIndex : 0,
  );

  // Track summary stats for the sweep completion screen
  const [stats, setStats] = useState<SweepSummary>({ kept: 0, cleared: 0 });

  // Track age-up during sweep session
  // Use both state (for UI) and refs (for async callbacks that need latest values)
  const [didAgeUp, setDidAgeUp] = useState(false);
  const [finalAge, setFinalAge] = useState(useGremlyStore.getState().gremlyAge);
  const didAgeUpRef = useRef(false);
  const finalAgeRef = useRef(useGremlyStore.getState().gremlyAge);

  // Helper to update age-up state (both state and refs)
  const updateAgeUpState = useCallback((aged: boolean, newAge: number) => {
    if (aged) {
      console.log('[Sweep] Age up! Setting didAgeUp=true, finalAge=', newAge);
      setDidAgeUp(true);
      setFinalAge(newAge);
      didAgeUpRef.current = true;
      finalAgeRef.current = newAge;
    }
  }, []);

  // Track decisions without committing them (allows back navigation)
  // Use both state (for UI re-renders) and ref (for immediate access in async operations)
  const [decisions, setDecisions] = useState<Map<string, SweepDecision>>(new Map());
  const decisionsRef = useRef<Map<string, SweepDecision>>(new Map());

  // Entity chat state (for chat button on sweep cards)
  const [showEntityChat, setShowEntityChat] = useState(false);
  const [chatPresetHint, setChatPresetHint] = useState<string | undefined>();

  // Track which section transitions have been shown
  const [shownTransitions, setShownTransitions] = useState<Set<'todo' | 'habit' | 'note'>>(
    new Set(),
  );

  // Track item details for summary display
  const itemDetailsRef = useRef<Map<string, { name: string; kind: 'todo' | 'habit' | 'note' }>>(
    new Map(),
  );

  // Helper to record a decision (doesn't commit, just stores)
  const recordDecision = useCallback(
    (decision: SweepDecision) => {
      // Update ref immediately (synchronous)
      decisionsRef.current.set(decision.candidateId, decision);
      // Update state for UI (triggers re-render)
      setDecisions((prev) => {
        const next = new Map(prev);
        next.set(decision.candidateId, decision);
        return next;
      });

      // Also store item name for summary display
      const candidate = candidatesWithMeta.find((c) => c.candidate.id === decision.candidateId);
      if (candidate) {
        const name =
          candidate.candidate.kind === 'todo'
            ? (candidate.candidate.raw as any).name
            : candidate.candidate.kind === 'habit'
              ? (candidate.candidate.raw as any).name
              : (candidate.candidate.raw as any).title ||
                (candidate.candidate.raw as any).body?.slice(0, 30);
        itemDetailsRef.current.set(decision.candidateId, {
          name: name || 'Untitled',
          kind: decision.candidateKind,
        });
      }
    },
    [candidatesWithMeta],
  );

  // Get existing decision for current card
  const currentDecision = useMemo(() => {
    const candidate = candidatesWithMeta[currentIndex]?.candidate;
    return candidate ? decisions.get(candidate.id) : undefined;
  }, [decisions, candidatesWithMeta, currentIndex]);

  // Compute section boundaries for transition cards
  const sectionBoundaries = useMemo(() => {
    const boundaries: { type: 'todo' | 'habit' | 'note'; startIndex: number; count: number }[] = [];
    let lastKind: string | null = null;
    let currentCount = 0;

    candidatesWithMeta.forEach((item, index) => {
      const kind = item.candidate.kind;
      if (kind !== lastKind) {
        if (lastKind !== null && boundaries.length > 0) {
          boundaries[boundaries.length - 1].count = currentCount;
        }
        boundaries.push({ type: kind as 'todo' | 'habit' | 'note', startIndex: index, count: 0 });
        lastKind = kind;
        currentCount = 1;
      } else {
        currentCount++;
      }
    });

    if (boundaries.length > 0) {
      boundaries[boundaries.length - 1].count = currentCount;
    }

    return boundaries;
  }, [candidatesWithMeta]);

  // Check if current index is at a section boundary needing transition
  const currentTransition = useMemo(() => {
    const boundary = sectionBoundaries.find((b) => b.startIndex === currentIndex);
    if (boundary && !shownTransitions.has(boundary.type)) {
      return boundary;
    }
    return null;
  }, [currentIndex, sectionBoundaries, shownTransitions]);

  // Handler for when user swipes past the transition card
  const handleTransitionContinue = useCallback(() => {
    if (currentTransition) {
      setShownTransitions((prev) => new Set([...prev, currentTransition.type]));
    }
  }, [currentTransition]);

  /**
   * Batch commit all recorded decisions to the database.
   * Called when sweep finishes or user saves and exits.
   * Uses ref instead of state to ensure we have the latest decisions
   * (state updates may not have been applied yet in the same render cycle).
   */
  const commitAllDecisions = useCallback(async () => {
    const ds = getDateService();
    const updates: Promise<void>[] = [];
    let keptCount = 0;
    let clearedCount = 0;

    // Use ref for immediate access to latest decisions
    decisionsRef.current.forEach((decision) => {
      if (decision.action === 'clear') {
        clearedCount++;
        if (decision.candidateKind === 'todo') {
          updates.push(archiveTodo(decision.candidateId, 'swept'));
        } else if (decision.candidateKind === 'habit') {
          updates.push(archiveHabit(decision.candidateId, 'swept'));
        } else if (decision.candidateKind === 'note') {
          updates.push(archiveNote(decision.candidateId, 'swept'));
        }
      } else if (decision.action === 'keep') {
        keptCount++;
        if (decision.candidateKind === 'todo' && decision.resurfaceDate) {
          // Handle resurface date (remind me later)
          const resurfaceDateStr = ds.toLocalDate(decision.resurfaceDate);
          console.log('[SweepFlowScreen] Setting resurface_at:', resurfaceDateStr);

          updates.push(
            updateTodo(decision.candidateId, {
              resurface_at: resurfaceDateStr,
              due_day: null,
              due_date: null,
            } as any),
          );
        } else if (decision.candidateKind === 'todo' && decision.dueDate) {
          updates.push(
            updateTodo(decision.candidateId, {
              due_day: toDayString(decision.dueDate),
              skipped_in_sweep_at: null,
              resurface_at: null, // Clear reminder so it doesn't keep resurfacing
            } as any),
          );
        } else if (decision.candidateKind === 'habit' && decision.startDate) {
          updates.push(
            updateHabit(decision.candidateId, {
              start_date: ds.toLocalDate(decision.startDate),
              start_date_confirmed: true,
            }),
          );
        } else if (decision.candidateKind === 'note') {
          // Note kept without special action = "Just Save"
          // Mark as swept so it doesn't reappear in sweep
          if (decision.resurfaceDate) {
            // "Remind Me" - set resurface date
            const resurfaceDateStr = ds.toLocalDate(decision.resurfaceDate);
            console.log('[SweepFlowScreen] Setting note resurface_at:', resurfaceDateStr);
            updates.push(
              updateNote(decision.candidateId, {
                resurface_at: resurfaceDateStr,
                swept_at: new Date().toISOString(),
                skipped_in_sweep_at: null,
              } as any),
            );
          } else {
            // "Just Save" - mark as swept
            console.log('[SweepFlowScreen] Marking note as swept:', decision.candidateId);
            updates.push(
              updateNote(decision.candidateId, {
                swept_at: new Date().toISOString(),
                skipped_in_sweep_at: null,
                resurface_at: null, // Clear old resurface date
              } as any),
            );
          }
        }
        // For habits with 'asktomorrow', no update needed
      }
      // 'skip' action = no changes to persist
    });

    try {
      await Promise.all(updates);
      console.log('[Sweep] Committed', updates.length, 'decisions');
    } catch (error) {
      console.error('[Sweep] Error committing decisions:', error);
    }

    return { keptCount, clearedCount };
  }, [archiveTodo, archiveHabit, archiveNote, updateTodo, updateHabit]);

  /**
   * Handle save and exit - commits all decisions before closing.
   */
  const handleSaveAndExit = useCallback(async () => {
    await commitAllDecisions();
    if (onClose) {
      onClose();
    }
  }, [commitAllDecisions, onClose]);

  /**
   * Handle completing all cards - commits decisions then calls onFinished.
   */
  const handleAllCardsComplete = useCallback(
    async (summary: SweepSummary) => {
      await commitAllDecisions();

      // Build detailed items breakdown for summary
      const todos: SweepSummaryItem[] = [];
      const thoughts: SweepSummaryItem[] = [];
      const habits: SweepSummaryItem[] = [];

      decisionsRef.current.forEach((decision, id) => {
        const details = itemDetailsRef.current.get(id);
        if (!details) return;

        let outcome: SweepSummaryItem['outcome'];
        let scheduledDate: string | undefined;

        if (decision.action === 'clear') {
          // Todos = "Cleared", Notes = "Archived", Habits = "Removed"
          outcome =
            details.kind === 'note' ? 'archived' : details.kind === 'habit' ? 'removed' : 'cleared';
        } else if (decision.action === 'keep') {
          if (decision.resurfaceDate) {
            outcome = 'remind';
            scheduledDate = decision.resurfaceDate.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });
          } else if (decision.dueDate) {
            outcome = 'scheduled';
            scheduledDate = decision.dueDate.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });
          } else if (details.kind === 'habit' && decision.startDate) {
            outcome = 'scheduled';
            scheduledDate = decision.startDate.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });
          } else if (details.kind === 'note') {
            outcome = 'saved';
          } else if (details.kind === 'habit') {
            outcome = 'logged';
          } else {
            outcome = 'kept';
          }
        } else {
          // skip or other
          outcome = 'kept';
        }

        const item: SweepSummaryItem = { id, name: details.name, outcome, scheduledDate };

        if (details.kind === 'todo') {
          todos.push(item);
        } else if (details.kind === 'note') {
          thoughts.push(item);
        } else if (details.kind === 'habit') {
          habits.push(item);
        }
      });

      onFinished({
        ...summary,
        items: { todos, thoughts, habits },
        didAgeUp: didAgeUpRef.current,
        finalAge: finalAgeRef.current,
      });
    },
    [commitAllDecisions, onFinished],
  );

  // Track the candidate ID currently being edited (for detecting overlay saves)
  const editingCandidateIdRef = useRef<string | null>(null);

  // Track type conversion in progress (source candidate -> target type)
  const convertingCandidateRef = useRef<{
    sourceId: string;
    sourceKind: 'todo' | 'habit' | 'note';
    targetType: 'todo' | 'habit' | 'note';
  } | null>(null);

  // Track which candidates have already been converted (prevent duplicate conversions)
  const convertedCandidatesRef = useRef<Set<string>>(new Set());

  // Track candidates that were converted in-place (source -> new entity)
  const [convertedCandidate, setConvertedCandidate] = useState<{
    originalId: string;
    originalKind: 'todo' | 'habit' | 'note';
    newId: string;
    newKind: 'todo' | 'habit' | 'note';
    animating: boolean;
  } | null>(null);

  // Clear conversion animation state after animation completes
  useEffect(() => {
    if (convertedCandidate?.animating) {
      const timer = setTimeout(() => {
        setConvertedCandidate((prev) => (prev ? { ...prev, animating: false } : null));
      }, 400); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [convertedCandidate?.animating]);

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
      // Clear conversion state if user is acting on converted card
      if (convertedCandidate) {
        setConvertedCandidate(null);
      }

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
      // Check if this is a type conversion
      const converting = convertingCandidateRef.current;
      if (converting && payload.type === converting.targetType) {
        // Check if this candidate was already converted (prevent duplicates)
        if (convertedCandidatesRef.current.has(converting.sourceId)) {
          console.log(
            '[SweepFlow] Candidate already converted, ignoring duplicate:',
            converting.sourceId,
          );
          convertingCandidateRef.current = null;
          return;
        }

        console.log(
          `[SweepFlow] ${converting.sourceKind} converted to ${converting.targetType} (in-place):`,
          converting.sourceId,
          '->',
          payload.id,
        );
        // Mark this candidate as converted
        convertedCandidatesRef.current.add(converting.sourceId);
        // Clear the conversion ref
        convertingCandidateRef.current = null;

        // Instead of advancing, trigger in-place transformation
        setConvertedCandidate({
          originalId: converting.sourceId,
          originalKind: converting.sourceKind,
          newId: payload.id,
          newKind: converting.targetType,
          animating: true,
        });
        return;
      }

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
  // Card Action Handlers (record decisions, don't commit immediately)
  // ─────────────────────────────────────────────────────────────────────────
  const handleSkip = useCallback(() => {
    // Increment sweep count for ritual progress
    useGremlyStore
      .getState()
      .incrementSweepCount()
      .then(({ didAgeUp: aged, newAge }) => {
        updateAgeUpState(aged, newAge);
      })
      .catch((err) => {
        console.warn('[Sweep] Failed to increment sweep count:', err);
      });

    // Clear conversion state if user is acting on converted card
    if (convertedCandidate) {
      setConvertedCandidate(null);
    }

    const candidateWithMeta = candidatesWithMeta[currentIndex];
    if (!candidateWithMeta) return;
    const { candidate } = candidateWithMeta;

    recordDecision({
      candidateId: candidate.id,
      candidateKind: candidate.kind,
      action: 'keep',
    });

    // Update stats
    const newStats = { ...stats, kept: stats.kept + 1 };
    setStats(newStats);

    // Move to next card (or finish if last)
    if (currentIndex < candidatesWithMeta.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleAllCardsComplete(newStats);
    }
  }, [candidatesWithMeta, currentIndex, recordDecision, stats, handleAllCardsComplete]);

  const handleClear = useCallback(() => {
    // Increment sweep count for ritual progress
    useGremlyStore
      .getState()
      .incrementSweepCount()
      .then(({ didAgeUp: aged, newAge }) => {
        updateAgeUpState(aged, newAge);
      })
      .catch((err) => {
        console.warn('[Sweep] Failed to increment sweep count:', err);
      });

    // Clear conversion state if user is acting on converted card
    if (convertedCandidate) {
      setConvertedCandidate(null);
    }

    const candidateWithMeta = candidatesWithMeta[currentIndex];
    if (!candidateWithMeta) return;
    const { candidate } = candidateWithMeta;

    recordDecision({
      candidateId: candidate.id,
      candidateKind: candidate.kind,
      action: 'clear',
    });

    // Update stats
    const newStats = { ...stats, cleared: stats.cleared + 1 };
    setStats(newStats);

    // Move to next card
    if (currentIndex < candidatesWithMeta.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleAllCardsComplete(newStats);
    }
  }, [candidatesWithMeta, currentIndex, recordDecision, stats, handleAllCardsComplete]);

  const handleOpenEdit = useCallback(() => {
    const candidateWithMeta = candidatesWithMeta[currentIndex];
    if (!candidateWithMeta) return;
    const { candidate } = candidateWithMeta;

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

    // Prevent duplicate conversions
    if (convertedCandidatesRef.current.has(candidate.id)) {
      console.log('[SweepFlow] Candidate already converted, ignoring:', candidate.id);
      return;
    }

    // Prevent re-triggering while conversion is in progress
    if (convertingCandidateRef.current?.sourceId === candidate.id) {
      console.log('[SweepFlow] Conversion already in progress for:', candidate.id);
      return;
    }

    // Track that we're converting this candidate (so we don't advance on save)
    convertingCandidateRef.current = {
      sourceId: candidate.id,
      sourceKind: candidate.kind,
      targetType: 'todo',
    };

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
   * Records decision with calculated date - actual save happens in batch commit
   */
  const handleConfirmQuickDate = useCallback(
    (option: 'tomorrow' | 'nextweek') => {
      // Increment sweep count for ritual progress
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .then(({ didAgeUp: aged, newAge }) => {
          updateAgeUpState(aged, newAge);
        })
        .catch((err) => {
          console.warn('[Sweep] Failed to increment sweep count:', err);
        });

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const { candidate } = candidateWithMeta;

      // Only works for todos and notes (not habits)
      if (candidate.kind === 'habit') return;

      // Calculate the target date
      const today = new Date();
      let targetDate: Date;
      switch (option) {
        case 'tomorrow':
          targetDate = addDays(today, 1);
          break;
        case 'nextweek':
          targetDate = nextMonday(today);
          break;
      }

      recordDecision({
        candidateId: candidate.id,
        candidateKind: candidate.kind,
        action: 'keep',
        dueDate: targetDate,
      });

      // Update stats and move to next card
      const newStats = { ...stats, kept: stats.kept + 1 };
      setStats(newStats);

      if (currentIndex < candidatesWithMeta.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleAllCardsComplete(newStats);
      }
    },
    [candidatesWithMeta, currentIndex, recordDecision, stats, handleAllCardsComplete],
  );

  /**
   * Handle confirmed remind later (user picked resurface date + swiped right)
   * Records decision with resurface date - item will reappear in sweep on that date
   */
  const handleConfirmRemindLater = useCallback(
    (resurfaceDate: Date) => {
      // Increment sweep count for ritual progress
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .then(({ didAgeUp: aged, newAge }) => {
          updateAgeUpState(aged, newAge);
        })
        .catch((err) => {
          console.warn('[Sweep] Failed to increment sweep count:', err);
        });

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const { candidate } = candidateWithMeta;

      // Only works for todos and notes (not habits)
      if (candidate.kind === 'habit') return;

      console.log('[SweepFlowScreen] Recording remind later decision:', {
        id: candidate.id,
        kind: candidate.kind,
        resurfaceDate: resurfaceDate.toISOString(),
      });

      // Record decision with resurface date (not due date)
      recordDecision({
        candidateId: candidate.id,
        candidateKind: candidate.kind,
        action: 'keep',
        resurfaceDate,
      });

      // Update stats and move to next card
      const newStats = { ...stats, kept: stats.kept + 1 };
      setStats(newStats);

      if (currentIndex < candidatesWithMeta.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleAllCardsComplete(newStats);
      }
    },
    [candidatesWithMeta, currentIndex, recordDecision, stats, handleAllCardsComplete],
  );

  /**
   * Handle confirmed custom date (user picked date in date picker + swiped right)
   * Records decision with custom date - actual save happens in batch commit
   */
  const handleConfirmCustomDate = useCallback(
    (date: Date) => {
      // Increment sweep count for ritual progress
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .then(({ didAgeUp: aged, newAge }) => {
          updateAgeUpState(aged, newAge);
        })
        .catch((err) => {
          console.warn('[Sweep] Failed to increment sweep count:', err);
        });

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const { candidate } = candidateWithMeta;

      // Only works for todos and notes (not habits)
      if (candidate.kind === 'habit') return;

      recordDecision({
        candidateId: candidate.id,
        candidateKind: candidate.kind,
        action: 'keep',
        dueDate: date,
      });

      // Update stats and move to next card
      const newStats = { ...stats, kept: stats.kept + 1 };
      setStats(newStats);

      if (currentIndex < candidatesWithMeta.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleAllCardsComplete(newStats);
      }
    },
    [candidatesWithMeta, currentIndex, recordDecision, stats, handleAllCardsComplete],
  );

  /**
   * Confirm Habit Start Handler - Records habit start decision
   * Actual save happens in batch commit
   */
  const handleConfirmHabitStart = useCallback(
    (action: 'asktomorrow' | 'starttomorrow' | 'startmonday', customDate?: Date) => {
      // Increment sweep count for ritual progress
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .then(({ didAgeUp: aged, newAge }) => {
          updateAgeUpState(aged, newAge);
        })
        .catch((err) => {
          console.warn('[Sweep] Failed to increment sweep count:', err);
        });

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta || candidateWithMeta.candidate.kind !== 'habit') return;
      const { candidate } = candidateWithMeta;

      if (action === 'asktomorrow') {
        // Skip - will ask again tomorrow
        recordDecision({
          candidateId: candidate.id,
          candidateKind: 'habit',
          action: 'skip',
          habitAction: action,
        });
      } else {
        // Calculate start date based on action
        let startDate: Date;
        if (customDate) {
          startDate = customDate;
        } else if (action === 'starttomorrow') {
          startDate = addDays(new Date(), 1);
        } else {
          startDate = nextMonday(new Date());
        }

        recordDecision({
          candidateId: candidate.id,
          candidateKind: 'habit',
          action: 'keep',
          startDate,
          habitAction: action,
        });
      }

      // Update stats and move to next card
      const newStats = { ...stats, kept: stats.kept + 1 };
      setStats(newStats);

      if (currentIndex < candidatesWithMeta.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleAllCardsComplete(newStats);
      }
    },
    [candidatesWithMeta, currentIndex, recordDecision, stats, handleAllCardsComplete],
  );

  /**
   * Add to Space Handler - Assigns item to selected space and moves to next card
   * Used for logs that user wants to organize into a Space
   */
  const handleAddToSpace = useCallback(
    async (spaceId: string) => {
      // Increment sweep count for ritual progress
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .then(({ didAgeUp: aged, newAge }) => {
          updateAgeUpState(aged, newAge);
        })
        .catch((err) => {
          console.warn('[Sweep] Failed to increment sweep count:', err);
        });

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const candidate = candidateWithMeta.candidate;

      console.log('[SweepFlow] Adding to space:', candidate.id, 'space:', spaceId);

      try {
        // Update the item with the space_id
        if (candidate.kind === 'note') {
          await updateNote(candidate.id, {
            space_id: spaceId,
            swept_at: new Date().toISOString(),
            skipped_in_sweep_at: null,
            resurface_at: null, // Clear any old resurface date
          } as any);
        } else if (candidate.kind === 'todo') {
          await updateTodo(candidate.id, { space_id: spaceId });
        }

        // Record decision
        recordDecision({
          candidateId: candidate.id,
          candidateKind: candidate.kind,
          action: 'keep',
        });

        // Update stats
        const newStats = { ...stats, kept: stats.kept + 1 };
        setStats(newStats);

        // Move to next card (or finish if last)
        if (currentIndex < candidatesWithMeta.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          handleAllCardsComplete(newStats);
        }
      } catch (error) {
        console.error('[SweepFlow] Failed to add to space:', error);
      }
    },
    [
      candidatesWithMeta,
      currentIndex,
      updateNote,
      updateTodo,
      recordDecision,
      stats,
      handleAllCardsComplete,
    ],
  );

  /**
   * Go Back Handler - Navigate to previous card
   * Allows user to review/change previous decisions
   */
  const handleGoBackCard = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  /**
   * Open Entity Chat Handler - Opens chat modal for current card
   */
  const handleOpenChat = useCallback((presetHint?: string) => {
    setChatPresetHint(presetHint);
    setShowEntityChat(true);
  }, []);

  // Auto-advance to summary when all cards are processed (fallback)
  useEffect(() => {
    if (!isLoading && candidatesWithMeta.length > 0 && currentIndex >= candidatesWithMeta.length) {
      // All cards processed - auto-finish to show summary
      // This is a fallback - normally last card handler calls handleAllCardsComplete
      handleAllCardsComplete(stats);
    }
  }, [isLoading, candidatesWithMeta.length, currentIndex, stats, handleAllCardsComplete]);

  // Build effective candidate - if this card was converted, use the new entity data
  // NOTE: This must be called unconditionally (before early returns) to satisfy React hooks rules
  const effectiveCandidateWithMeta = useMemo(() => {
    // Guard for empty/out-of-bounds state
    if (candidatesWithMeta.length === 0 || currentIndex >= candidatesWithMeta.length) {
      return null;
    }

    const base = candidatesWithMeta[currentIndex];

    // Check if this candidate was just converted (e.g., note -> todo, note -> habit)
    if (convertedCandidate && base.candidate.id === convertedCandidate.originalId) {
      // Look up the new entity from the store based on what it was converted to
      if (convertedCandidate.newKind === 'todo') {
        const newTodo = todos.find((t) => t.id === convertedCandidate.newId);
        if (newTodo) {
          // Return a transformed candidate with todo data
          const convertedTodoCandidate: SweepCandidateTodo = {
            id: newTodo.id,
            kind: 'todo' as const,
            createdAt: newTodo.created_at || base.candidate.createdAt,
            dropId: (newTodo as any).drop_id ?? base.candidate.dropId,
            skippedInSweepAt: null,
            isOverdue: false,
            isDueToday: false,
            isCreatedToday: true,
            raw: newTodo as any,
          };
          return {
            ...base,
            candidate: convertedTodoCandidate,
            isConverted: true, // Flag for animation
          };
        }
      } else if (convertedCandidate.newKind === 'habit') {
        const newHabit = habits.find((h) => h.id === convertedCandidate.newId);
        if (newHabit) {
          // Return a transformed candidate with habit data
          const convertedHabitCandidate: SweepCandidateHabit = {
            id: newHabit.id,
            kind: 'habit' as const,
            createdAt: newHabit.created_at || base.candidate.createdAt,
            dropId: (newHabit as any).drop_id ?? base.candidate.dropId,
            skippedInSweepAt: null,
            isOverdue: false,
            isDueToday: false,
            isCreatedToday: true,
            raw: newHabit as any,
          };
          return {
            ...base,
            candidate: convertedHabitCandidate,
            isConverted: true, // Flag for animation
          };
        }
      }
    }

    return base;
  }, [currentIndex, candidatesWithMeta, convertedCandidate, todos, habits]);

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
          <Text style={styles.decisionEmptyPrimary}>Nothing to sweep!</Text>
          <Text style={styles.decisionEmptySecondary}>
            You're all caught up. Check back after you've dropped some thoughts.
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

  // Handle case where converted todo isn't in store yet (show loading)
  if (!effectiveCandidateWithMeta) {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.decisionLoadingContainer}>
          <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
          <Text variant="subtle" style={styles.decisionLoadingText}>
            Creating your todo…
          </Text>
        </View>
      </View>
    );
  }

  // Get current candidate (effectiveCandidateWithMeta already handles conversion)
  const currentCandidateWithMeta = effectiveCandidateWithMeta;
  const currentCandidate = currentCandidateWithMeta.candidate;

  return (
    <View style={styles.decisionStepContainer}>
      {/* Decision Step Header - Back on left, Close on right */}
      <View style={styles.decisionHeader}>
        {/* Back button - only show if not on first card */}
        {currentIndex > 0 ? (
          <TouchableOpacity
            style={styles.decisionBackButton}
            onPress={handleGoBackCard}
            activeOpacity={0.7}
            accessibilityLabel="Go back to previous card"
            accessibilityRole="button"
          >
            <Icon name="ChevronLeft" size="sm" color={BRAND.colors.mossGreen} />
            <Text style={styles.decisionBackText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.decisionHeaderSpacer} />
        )}

        {/* Close button */}
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
        {!currentTransition && (
          <>
            <Reanimated.View entering={FadeIn.duration(200)}>
              <SweepGremlyHeader
                candidate={currentCandidate}
                meta={currentCandidateWithMeta.meta}
                onOpenChat={handleOpenChat}
              />
            </Reanimated.View>
            <SweepCard
              key={`${currentCandidate.id}-${currentIndex}`}
              candidate={currentCandidate}
              meta={currentCandidateWithMeta.meta}
              index={currentIndex}
              total={candidatesWithMeta.length}
              isConverted={convertedCandidate?.animating ?? false}
              onSkip={handleSkip}
              onClear={handleClear}
              onOpenEdit={handleOpenEdit}
              onConvertToTodo={handleConvertToTodo}
              onConfirmQuickDate={handleConfirmQuickDate}
              onConfirmRemindLater={handleConfirmRemindLater}
              onConfirmCustomDate={handleConfirmCustomDate}
              onAddToSpace={handleAddToSpace}
              onConfirmHabitStart={handleConfirmHabitStart}
              onClose={onClose}
              hideBottomSaveExit={true}
              onGoBack={currentIndex > 0 ? handleGoBackCard : undefined}
              previousDecision={currentDecision}
              onOpenChat={handleOpenChat}
            />
          </>
        )}
      </View>

      {/* Bottom section - Progress + Save and exit */}
      {!currentTransition && (
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
            <TouchableOpacity onPress={handleSaveAndExit} style={styles.saveExitButton}>
              <Text style={styles.saveExitText}>Need a break? Save and exit</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Section Transition Modal */}
      <Modal visible={!!currentTransition} animationType="fade" statusBarTranslucent={true}>
        <SweepSectionTransition
          sectionType={currentTransition?.type || 'todo'}
          itemCount={currentTransition?.count || 0}
          onContinue={handleTransitionContinue}
          onClose={onClose}
        />
      </Modal>

      {/* Entity Chat Modal */}
      <Modal
        visible={showEntityChat}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowEntityChat(false)}
      >
        <EntityChatScreen
          entityId={currentCandidate.id}
          entityType={currentCandidate.kind}
          initialPreset={chatPresetHint as any}
          sweepContext={{
            times_moved: currentCandidateWithMeta.meta.rescheduleCount ?? 0,
            days_unscheduled: 0,
            is_overdue: currentCandidateWithMeta.meta.todoStatus === 'overdue',
          }}
          onClose={() => setShowEntityChat(false)}
        />
      </Modal>
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
  items?: {
    todos: SweepSummaryItem[];
    thoughts: SweepSummaryItem[];
    habits: SweepSummaryItem[];
  };
  gremlyAge: number;
  lockInCompleted: number;
  lockInTotal: number;
  habitsCheckedCount: number;
  journalWritten: boolean;
  onDone: () => void;
}

function SweepSummaryStep({
  keptCount,
  clearedCount,
  items,
  gremlyAge,
  lockInCompleted,
  lockInTotal,
  habitsCheckedCount,
  journalWritten,
  onDone,
}: SummaryStepProps) {
  const ds = getDateService();
  const totalProcessed = keptCount + clearedCount;

  // Sweep streak from Zustand
  const sweepStreak = useGremlyStore((state) => state.sweepStreak);

  // Get raw data from store
  const allTodos = useGremlyStore((state) => state.todos);
  const allHabits = useGremlyStore((state) => state.habits);

  // Tomorrow's items - memoized to prevent infinite loops
  const tomorrowTodos = useMemo(() => {
    const tomorrowStr = ds.tomorrow();
    return allTodos.filter((t) => !t.archived && !t.completed_at && t.due_day === tomorrowStr);
  }, [allTodos]);

  const tomorrowHabits = useMemo(() => {
    return allHabits.filter((h) => !h.archived);
  }, [allHabits]);

  const hasTomorrow = tomorrowTodos.length > 0 || tomorrowHabits.length > 0;

  const tomorrowSubtitle = useMemo(
    () =>
      [
        tomorrowTodos.length > 0
          ? `${tomorrowTodos.length} ${tomorrowTodos.length === 1 ? 'todo' : 'todos'}`
          : null,
        tomorrowHabits.length > 0
          ? `${tomorrowHabits.length} ${tomorrowHabits.length === 1 ? 'habit' : 'habits'}`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
    [tomorrowTodos, tomorrowHabits],
  );

  // Trigger haptic on mount
  useEffect(() => {
    triggerLight();
  }, []);

  const showBadges = lockInTotal > 0 || habitsCheckedCount > 0 || journalWritten;

  return (
    <View style={styles.stepContainer}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.summaryScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Gremly mascot - broom-riding */}
        <View style={styles.summaryMascotContainer}>
          <Image
            source={GREMLY_MASCOT_CELEBRATE}
            style={styles.summaryMascotImage}
            resizeMode="contain"
            testID="sweep-summary-mascot"
            accessibilityLabel="Gremly mascot riding a broom"
          />
        </View>

        {/* Title */}
        <Text variant="title" style={styles.summaryTitle}>
          Nice sweep!
        </Text>

        {/* Subtext */}
        {totalProcessed > 0 && (
          <Text style={styles.summarySubtext}>
            Your mind is {totalProcessed} {totalProcessed === 1 ? 'item' : 'items'} lighter.
          </Text>
        )}

        {/* Completion Badges */}
        {showBadges && (
          <>
            <CompletionBadges
              lockInCompleted={lockInCompleted}
              lockInTotal={lockInTotal}
              habitsChecked={habitsCheckedCount}
              journalWritten={journalWritten}
            />
            <View style={styles.summaryDivider} />
          </>
        )}

        {/* Expandable Summary */}
        {totalProcessed > 0 && items ? (
          <View style={styles.expandableSummaryContainer}>
            {(() => {
              const sortedTodos = items.todos.filter(
                (i) => i.outcome !== 'cleared' && i.outcome !== 'archived',
              );
              const sortedThoughts = items.thoughts.filter((i) => i.outcome !== 'archived');
              const sortedHabits = items.habits.filter((i) => i.outcome !== 'removed');
              const sortedCount = sortedTodos.length + sortedThoughts.length + sortedHabits.length;

              if (sortedCount === 0) return null;

              return (
                <SweepEndCard
                  icon={<CheckCircle size={20} color={BRAND.colors.mossGreen} />}
                  title={`${sortedCount} ${sortedCount === 1 ? 'item' : 'items'} sorted`}
                  expandable={true}
                >
                  <SweepEndItemList
                    todos={sortedTodos.map((i) => ({
                      id: i.id,
                      name: i.name,
                      outcome: i.scheduledDate ? `Due ${i.scheduledDate}` : 'Saved',
                    }))}
                    notes={sortedThoughts.map((i) => ({
                      id: i.id,
                      name: i.name,
                      outcome: i.scheduledDate ? `Remind ${i.scheduledDate}` : 'Saved',
                    }))}
                    habits={sortedHabits.map((i) => ({
                      id: i.id,
                      name: i.name,
                      outcome:
                        i.outcome === 'logged'
                          ? 'Done ✓'
                          : i.outcome === 'skipped'
                            ? 'Skipped'
                            : 'Kept',
                    }))}
                  />
                </SweepEndCard>
              );
            })()}

            {/* Things you let go section */}
            {(() => {
              const clearedTodos = items.todos.filter(
                (i) => i.outcome === 'cleared' || i.outcome === 'archived',
              );
              const clearedThoughts = items.thoughts.filter((i) => i.outcome === 'archived');
              const clearedHabits = items.habits.filter((i) => i.outcome === 'removed');
              const clearedCount =
                clearedTodos.length + clearedThoughts.length + clearedHabits.length;

              if (clearedCount === 0) return null;

              return (
                <SweepEndCard
                  icon={<Leaf size={20} color={BRAND.colors.goldenPear} />}
                  title={`${clearedCount} ${clearedCount === 1 ? 'thing' : 'things'} let go`}
                  expandable={true}
                >
                  <SweepEndItemList
                    clearedItems={[
                      ...clearedTodos.map((i) => ({
                        id: i.id,
                        name: i.name,
                        type: 'todo' as const,
                      })),
                      ...clearedThoughts.map((i) => ({
                        id: i.id,
                        name: i.name,
                        type: 'note' as const,
                      })),
                      ...clearedHabits.map((i) => ({
                        id: i.id,
                        name: i.name,
                        type: 'habit' as const,
                      })),
                    ]}
                  />
                </SweepEndCard>
              );
            })()}

            {/* Tomorrow's ready section */}
            {hasTomorrow && (
              <View style={styles.tomorrowSection}>
                <Text style={styles.tomorrowHeader}>Tomorrow's looking good</Text>
                <SweepEndCard
                  icon={<Moon size={20} color={BRAND.colors.mossGreen} />}
                  title={tomorrowSubtitle}
                  expandable={true}
                  variant="outline"
                >
                  <SweepEndItemList
                    todos={tomorrowTodos.map((t) => ({
                      id: t.id,
                      name: t.name || 'Untitled',
                      outcome: '',
                    }))}
                    habits={tomorrowHabits.map((h) => ({
                      id: h.id,
                      name: h.name || 'Untitled',
                      outcome: '',
                    }))}
                  />
                </SweepEndCard>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.summaryEmptyContainer}>
            <Text variant="body" style={styles.summaryEmptyText}>
              Nothing needed your attention this time — you're all clear.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Streak display */}
      {sweepStreak >= 1 && (
        <View style={styles.streakContainer}>
          <Flame size={16} color={BRAND.colors.goldenPear} />
          <Text style={styles.streakText}>{sweepStreak} day streak</Text>
        </View>
      )}

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

  // Get route params for DEV mode step jumping
  const route = useRoute<RouteProp<RootStackParamList, 'Sweep'>>();
  const initialStep = __DEV__ ? (route.params?.initialStep ?? 0) : 0;
  const initialCardIndex = __DEV__ ? route.params?.initialCardIndex : undefined;

  // Debug logging for DEV mode step jumping
  if (__DEV__) {
    console.log('[SweepFlowScreen] Route params:', route.params);
    console.log(
      '[SweepFlowScreen] initialStep:',
      initialStep,
      'initialCardIndex:',
      initialCardIndex,
    );
  }

  const { user } = useAuth();
  const [step, setStep] = useState<number>(initialStep);

  // Check if user has locked items for lock-in checkpoint (including completed ones for celebration)
  const lockedItems = useGremlyStore(selectTodayLockedItems);
  const allLockedItems = useGremlyStore(selectTodayLockedItemsIncludingCompleted);
  const hasLockedItems = allLockedItems.length > 0;

  // Track if lock-in checkpoint was shown
  const [lockInCheckpointComplete, setLockInCheckpointComplete] = useState(false);

  // Track sweep stats across the session
  const [keptCount, setKeptCount] = useState(() => {
    // Initialize mock data if jumping directly to summary in DEV mode
    if (__DEV__ && initialStep === 4) {
      return 5;
    }
    return 0;
  });
  const [clearedCount, setClearedCount] = useState(() => {
    // Initialize mock data if jumping directly to summary in DEV mode
    if (__DEV__ && initialStep === 4) {
      return 3;
    }
    return 0;
  });

  // Track detailed item breakdown for summary display
  const [summaryItems, setSummaryItems] = useState<SweepSummary['items']>(undefined);

  // Track Gremly age for summary display
  const [summaryGremlyAge, setSummaryGremlyAge] = useState(0);
  const [summaryDidAgeUp, setSummaryDidAgeUp] = useState(false);
  const [showAgeUpModal, setShowAgeUpModal] = useState(false);
  const [celebrationAge, setCelebrationAge] = useState(0);

  // Celebration transition and modal state
  const [showCelebration, setShowCelebration] = useState(true);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);

  // Get completed items for celebration
  const { stats: introStats } = useSweepIntroStats();
  const completedItems = useMemo(() => {
    if (!introStats) return [];
    return [
      ...introStats.completed.todos.map((t) => ({ id: t.id, name: t.name, type: 'todo' as const })),
      ...introStats.completed.habits.map((h) => ({
        id: h.id,
        name: h.name,
        type: 'habit' as const,
      })),
    ];
  }, [introStats]);

  // Track completion badges data
  const [habitsCheckedCount, setHabitsCheckedCount] = useState(0);
  const [journalWritten, setJournalWritten] = useState(false);

  // DEV MODE: Sync step from route params when they change (for test mode jumping)
  // Using requestAnimationFrame to defer state updates and avoid cascading render warning
  useEffect(() => {
    if (__DEV__ && route.params?.initialStep !== undefined) {
      console.log('[SweepFlowScreen] useEffect: Setting step to', route.params.initialStep);
      const initialStepValue = route.params.initialStep;

      // Defer state updates to next frame to avoid cascading render warning
      const frameId = requestAnimationFrame(() => {
        setStep(initialStepValue);

        // Set mock summary data when jumping to summary step
        if (initialStepValue === 4) {
          console.log('[SweepFlowScreen] Setting mock summary data for step 4');
          setKeptCount(5);
          setClearedCount(3);
          setSummaryGremlyAge(7);
          setSummaryDidAgeUp(true);
          setSummaryItems({
            todos: [
              { id: '1', name: 'Call Mom', outcome: 'scheduled', scheduledDate: 'Tomorrow' },
              { id: '2', name: 'Buy groceries', outcome: 'scheduled', scheduledDate: 'Next Week' },
              { id: '3', name: 'Old project idea', outcome: 'archived' },
            ],
            thoughts: [
              { id: '4', name: 'Book recommendation from Sarah', outcome: 'kept' },
              { id: '5', name: 'Random note about plants', outcome: 'archived' },
            ],
            habits: [
              { id: '6', name: 'Morning meditation', outcome: 'logged' },
              { id: '7', name: 'Exercise', outcome: 'skipped' },
            ],
          });
        }
      });

      return () => cancelAnimationFrame(frameId);
    }
  }, [route.params?.initialStep]);

  // Debug: log step changes
  useEffect(() => {
    if (__DEV__) {
      console.log('[SweepFlowScreen] Step changed to:', step);
    }
  }, [step]);

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
    if (hasLockedItems && !lockInCheckpointComplete) {
      setStep(0.5); // Go to lock-in checkpoint
    } else {
      setStep(1); // Go to decision cards
    }
  };

  // Handle lock-in checkpoint decisions
  const handleLockInContinue = useCallback(
    (decisions: Map<string, 'done' | 'tomorrow' | 'archive'>) => {
      // Navigate IMMEDIATELY - don't wait for processing
      setLockInCheckpointComplete(true);
      setStep(1); // Proceed to decision cards

      // Process decisions in background (fire and forget)
      const processDecisions = async () => {
        const { updateTodo, archiveTodo, archiveHabit, completeHabit } = useGremlyStore.getState();
        const ds = getDateService();
        const tomorrow = ds.addDays(ds.getCurrentDate(), 1);

        for (const [itemId, decision] of decisions) {
          const item = lockedItems.find((i) => i.id === itemId);
          if (!item) continue;

          const isTodo = 'name' in item && !('frequency' in item);

          try {
            switch (decision) {
              case 'done':
                if (isTodo) {
                  await updateTodo(itemId, { completed_at: new Date().toISOString() });
                } else {
                  await completeHabit(itemId);
                }
                break;
              case 'tomorrow':
                if (isTodo) {
                  await updateTodo(itemId, { due_day: tomorrow, due_date: tomorrow });
                }
                // Habits automatically stay locked for tomorrow
                break;
              case 'archive':
                if (isTodo) {
                  await archiveTodo(itemId);
                } else {
                  await archiveHabit(itemId);
                }
                break;
            }
          } catch (err) {
            console.warn('[LockIn] Failed to process decision for', itemId, err);
          }
        }
      };

      // Fire and forget - don't block navigation
      processDecisions().catch((err) => {
        console.warn('[LockIn] Failed to process decisions:', err);
      });
    },
    [lockedItems],
  );

  const handleMoodContinue = (data?: { habitsChecked?: number; journalWritten?: boolean }) => {
    if (data?.journalWritten !== undefined) {
      setJournalWritten(data.journalWritten);
    }
    setStep(4); // Mood → Summary
  };

  const handleWrapUpContinue = (data?: { habitsChecked?: number; journalWritten?: boolean }) => {
    if (data?.habitsChecked !== undefined) {
      setHabitsCheckedCount(data.habitsChecked);
    }
    setStep(3); // Habits → Mood
  };

  const handleDecisionFinished = useCallback(
    async (summary: SweepSummary) => {
      setKeptCount(summary.kept);
      setClearedCount(summary.cleared);
      if (summary.items) {
        setSummaryItems(summary.items);
      }

      // Set Gremly age for summary display (from SweepDecisionStep tracking)
      setSummaryGremlyAge(summary.finalAge ?? useGremlyStore.getState().gremlyAge);
      setSummaryDidAgeUp(summary.didAgeUp ?? false);

      // Record completion in DB and get streak
      if (user?.id) {
        try {
          const result = await markSweepCompleted(user.id, supabase, {
            kept: summary.kept,
            cleared: summary.cleared,
          });
          console.log('[SweepFlowScreen] Sweep completed, streak:', result.streak);

          // Update Zustand store with new sweep preferences
          const { setSweepPreferences, totalSweepCount } = useGremlyStore.getState();
          setSweepPreferences({
            lastSweepCompletedAt: new Date().toISOString(),
            sweepStreak: result.streak,
            totalSweepCount: totalSweepCount + 1,
          });
        } catch (err) {
          console.error('[SweepFlowScreen] Failed to mark sweep as completed:', err);
        }
      }

      // Advance to Habits step
      setStep(2); // Decision → Habits
    },
    [user],
  );

  const handleSummaryDone = () => {
    if (summaryDidAgeUp) {
      setCelebrationAge(summaryGremlyAge);
      setShowAgeUpModal(true);
    } else {
      navigation.goBack();
    }
  };

  const handleAgeModalDismiss = () => {
    setShowAgeUpModal(false);
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
        {/* Conditional Header - Different for decision step and lock-in checkpoint */}
        {step !== 1 && step !== 0.5 ? (
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

            {/* Center - subtle title (long-press for test mode in DEV) */}
            <Pressable
              style={styles.headerCenter}
              onLongPress={() => {
                if (__DEV__) {
                  triggerLight();
                  navigation.navigate('SweepTest');
                }
              }}
              delayLongPress={500}
            >
              <View style={styles.headerModeIndicator}>
                <Icon name="Sparkles" size="xs" color="rgba(46, 85, 64, 0.50)" strokeWidth={1.5} />
                <Text style={styles.headerModeLabel}>Sweep</Text>
                {__DEV__ && <Text style={styles.devIndicator}>•</Text>}
              </View>
            </Pressable>

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
        {__DEV__ &&
          (() => {
            console.log('[SweepFlowScreen] Rendering step:', step);
            return null;
          })()}
        <View
          style={
            step === 1
              ? styles.contentDecision
              : step === 0.5
                ? styles.contentLockIn
                : styles.content
          }
        >
          {step === 0 && (!showCelebration || completedItems.length === 0) && (
            <>
              {__DEV__ && console.log('[SweepFlowScreen] Rendering SweepIntroStep')}
              <SweepIntroStep
                onStart={handleIntroStart}
                onHelpPress={() => setShowInstructionsModal(true)}
                onClose={handleClose}
              />
              <SweepInstructionsModal
                visible={showInstructionsModal}
                onClose={() => setShowInstructionsModal(false)}
              />
              <SweepCompletedModal
                visible={showCompletedModal}
                onClose={() => setShowCompletedModal(false)}
                completedItems={completedItems}
              />
            </>
          )}
          {step === 0.5 && (
            <LockInCheckpointStep onContinue={handleLockInContinue} onClose={handleClose} />
          )}
          {step === 1 && (
            <SweepDecisionStep
              onFinished={handleDecisionFinished}
              onClose={handleClose}
              initialCardIndex={initialCardIndex}
            />
          )}
          {step === 2 && <SweepHabitsStep onContinue={handleWrapUpContinue} />}
          {step === 3 && <SweepMoodStep onContinue={handleMoodContinue} />}
          {step === 4 &&
            (__DEV__ &&
              console.log(
                '[SweepFlowScreen] Rendering SweepSummaryStep with kept:',
                keptCount,
                'cleared:',
                clearedCount,
              ),
            (
              <SweepSummaryStep
                keptCount={keptCount}
                clearedCount={clearedCount}
                items={summaryItems}
                gremlyAge={summaryGremlyAge}
                lockInCompleted={
                  allLockedItems.filter(
                    (item) => 'completed_at' in item && item.completed_at !== null,
                  ).length
                }
                lockInTotal={allLockedItems.length}
                habitsCheckedCount={habitsCheckedCount}
                journalWritten={journalWritten}
                onDone={handleSummaryDone}
              />
            ))}
        </View>
      </Screen>

      {/* Celebration Overlay - Full screen, covers header */}
      {step === 0 && showCelebration && completedItems.length > 0 && (
        <View style={styles.celebrationOverlay}>
          <SweepCelebrationTransition
            completedItems={completedItems}
            onComplete={() => setShowCelebration(false)}
            onSkip={() => setShowCelebration(false)}
          />
        </View>
      )}

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

      {/* Age-Up Celebration Modal */}
      <AgeUpCelebrationModal
        visible={showAgeUpModal}
        newAge={celebrationAge}
        onDismiss={handleAgeModalDismiss}
      />
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
  devIndicator: {
    fontSize: 10,
    color: 'rgba(46, 85, 64, 0.10)', // Very subtle mossGreen at 10% opacity
    marginLeft: 2,
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
  celebrationOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  contentDecision: {
    flex: 1,
    paddingHorizontal: 0, // Full-bleed for decision step
    backgroundColor: '#FFFFFF', // White background for decision step
  },
  contentLockIn: {
    flex: 1,
    paddingHorizontal: 0, // Full-bleed for lock-in checkpoint
    backgroundColor: BRAND.colors.linenCream,
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
  // SweepIntroStep styles - New Design
  // ─────────────────────────────────────────────────────────────────────────
  introContainer: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  introMascotContainerNew: {
    marginBottom: 24,
  },
  introMascotNew: {
    width: 110,
    height: 110,
  },
  introPhrase: {
    fontSize: 26,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 34,
    paddingTop: 4,
    includeFontPadding: true,
  },
  introSubtitle: {
    fontSize: 17,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  breakdownCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    marginTop: 24,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 32,
  },
  breakdownColumn: {
    alignItems: 'center',
    flex: 1,
  },
  breakdownNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    marginTop: 8,
    marginBottom: 2,
  },
  breakdownLabel: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    marginBottom: 24,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  lastSweepText: {
    fontSize: 13,
    color: BRAND.colors.inkSubtle,
    textAlign: 'center',
    marginTop: 8,
  },
  introButton: {
    backgroundColor: BRAND.colors.sageMist,
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 14,
    marginBottom: 24,
  },
  introButtonText: {
    color: BRAND.colors.mossGreen,
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    color: BRAND.colors.mossGreen,
    fontSize: 15,
    fontWeight: '500',
  },
  introFooter: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    position: 'absolute',
    bottom: 24,
  },
  introCelebrationTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    marginBottom: 8,
  },
  introCelebrationSubtitle: {
    fontSize: 15,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  // ─────────────────────────────────────────────────────────────────────────
  // SweepIntroStep styles - Legacy (kept for reference)
  // ─────────────────────────────────────────────────────────────────────────
  introScrollContent: {
    flexGrow: 1,
    paddingTop: 32,
    paddingHorizontal: 24,
  },
  introWelcomeTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    marginBottom: 16,
  },
  introWelcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 8,
  },
  introWelcomeMascot: {
    width: 130,
    height: 130,
  },
  introWelcomeSubcopy: {
    flex: 1,
    fontSize: 16,
    color: BRAND.colors.inkSubtle,
    lineHeight: 23,
  },
  streakBadgeContainer: {
    marginVertical: 16,
  },
  streakDivider: {
    height: 1,
    backgroundColor: BRAND.colors.inkSubtle,
    opacity: 0.2,
    marginHorizontal: 40,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  streakBadgeText: {
    fontSize: 20,
    fontWeight: '600',
    color: BRAND.colors.goldenPear,
  },
  streakBadgeTextWelcome: {
    fontSize: 20,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  introSpacer: {
    flex: 0.4,
    minHeight: 20,
  },
  introStatsSection: {
    marginHorizontal: -24,
    marginBottom: 0,
  },
  achievementLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
    marginHorizontal: 24,
    marginBottom: 8,
    textAlign: 'left',
  },
  // Legacy intro styles (kept for reference)
  introMascotContainer: {
    alignItems: 'center',
    marginBottom: 0,
  },
  introMascotImage: {
    width: 140,
    height: 140,
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
  habitsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  habitsHeaderText: {
    flex: 1,
    paddingRight: 12,
  },
  habitsMascot: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
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
    marginBottom: 8, // Gap to first section header
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
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: BRAND.colors.linenCream,
  },
  streakText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
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
    marginTop: 8,
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
  // Needs Setup Section styles
  habitsNeedsSetupSection: {
    marginTop: 24,
    opacity: 0.8,
  },
  habitsNeedsSetupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.goldenPear,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginHorizontal: 12,
  },
  needsSetupSubtext: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  needsSetupHabitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  needsSetupHabitRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  needsSetupHabitInfo: {
    flex: 1,
    marginRight: 12,
  },
  needsSetupHabitName: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    marginBottom: 2,
  },
  needsSetupHabitFrequency: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  needsSetupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  needsSetupBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.goldenPear,
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
  completedHabitRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  // SweepDecisionStep styles - White background with sage card
  decisionStepContainer: {
    flex: 1,
    position: 'relative', // For absolute positioned behindCardTextContainer
    backgroundColor: '#FFFFFF', // White background for contrast
  },
  decisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  decisionHeaderSpacer: {
    width: 60, // Match back button width for alignment
  },
  decisionBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 2,
  },
  decisionBackText: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
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
    paddingHorizontal: 24,
  },
  decisionEmptyPrimary: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 4,
  },
  decisionEmptySecondary: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
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
    paddingBottom: 12,
  },
  summaryTitle: {
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  summarySubtext: {
    fontSize: 16,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  tomorrowSection: {
    marginTop: 12,
    width: '100%',
  },
  tomorrowHeader: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 8,
  },
  summaryMascotContainer: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  summaryMascotImage: {
    width: 140,
    height: 140,
  },
  ageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 8,
  },
  ageCount: {
    fontSize: 28,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    lineHeight: 36,
  },
  ageLabel: {
    fontSize: 17,
    color: BRAND.colors.inkMuted,
    lineHeight: 24,
  },
  summaryDivider: {
    width: 80,
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
    alignSelf: 'center',
    marginVertical: 6,
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
  // Expandable summary styles
  expandableSummaryContainer: {
    paddingHorizontal: 16,
    gap: 6,
  },
  summarySubheading: {
    fontSize: 15,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 6,
  },
  summarySubheadingMuted: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    marginTop: 8,
    marginBottom: 4,
  },
  archivedSubheading: {
    fontSize: 15,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  summarySection: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    overflow: 'hidden',
    marginBottom: 6,
  },
  summarySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
  },
  summarySectionTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  summarySectionContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BRAND.colors.borderSubtle,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  summaryItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  summaryItemName: {
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
    flex: 1,
    marginRight: 12,
  },
  summaryItemOutcome: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    fontStyle: 'italic',
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
