/**
 * SweepTestScreen.tsx
 * Dev-only screen for testing the Sweep feature
 *
 * This screen provides controls to:
 * - Load test data
 * - Jump to specific steps
 * - View current state
 * - Reset the sweep flow
 */

import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useSweepCandidatesUnified } from '../../lib/store/selectors';
import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../providers/AuthProvider';

// =============================================================================
// Helpers
// =============================================================================

/** Get YYYY-MM-DD for today */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/** Get YYYY-MM-DD for yesterday */
function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

/** Get YYYY-MM-DD for tomorrow */
function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// =============================================================================
// Component
// =============================================================================

export default function SweepTestScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Store actions
  const createTodo = useGremlyStore((s) => s.createTodo);
  const createNote = useGremlyStore((s) => s.createNote);
  const createHabit = useGremlyStore((s) => s.createHabit);
  const archiveTodo = useGremlyStore((s) => s.archiveTodo);
  const archiveNote = useGremlyStore((s) => s.archiveNote);
  const archiveHabit = useGremlyStore((s) => s.archiveHabit);

  // Store data for filtering
  const todos = useGremlyStore((s) => s.todos);
  const notes = useGremlyStore((s) => s.notes);
  const habits = useGremlyStore((s) => s.habits);

  // Store counts
  const todoCount = useGremlyStore((s) => s.todos.length);
  const noteCount = useGremlyStore((s) => s.notes.length);
  const habitCount = useGremlyStore((s) => s.habits.length);

  const handleClose = () => {
    navigation.goBack();
  };

  // ---------------------------------------------------------------------------
  // Test Data Generators
  // ---------------------------------------------------------------------------

  const handleAddTodos = useCallback(async () => {
    try {
      const today = getTodayDate();
      const yesterday = getYesterdayDate();
      const tomorrow = getTomorrowDate();

      // 2 with no due date (unscheduled)
      await createTodo({
        name: '[Test] Unscheduled task 1',
        title: '[Test] Unscheduled task 1',
        ai_placed: false,
      });
      await createTodo({
        name: '[Test] Unscheduled task 2',
        title: '[Test] Unscheduled task 2',
        ai_placed: false,
      });

      // 1 due today
      await createTodo({
        name: '[Test] Due today task',
        title: '[Test] Due today task',
        due_day: today,
        ai_placed: false,
      });

      // 1 overdue (due yesterday)
      await createTodo({
        name: '[Test] Overdue task',
        title: '[Test] Overdue task',
        due_day: yesterday,
        ai_placed: false,
      });

      // 1 due tomorrow
      await createTodo({
        name: '[Test] Due tomorrow task',
        title: '[Test] Due tomorrow task',
        due_day: tomorrow,
        ai_placed: false,
      });

      Alert.alert('Success', '5 test todos created');
    } catch (err) {
      console.error('[SweepTestScreen] Failed to create todos:', err);
      Alert.alert('Error', 'Failed to create test todos');
    }
  }, [createTodo]);

  const handleAddNotes = useCallback(async () => {
    try {
      // 2 with subtype 'idea'
      await createNote({
        title: 'Test Idea 1',
        body: '[Test] Idea note 1 - App concept for tracking plants',
        subtype: 'idea',
        ai_placed: false,
      });
      await createNote({
        title: 'Test Idea 2',
        body: '[Test] Idea note 2 - Business plan for coffee shop',
        subtype: 'idea',
        ai_placed: false,
      });

      // 2 with subtype 'catchall' (general notes)
      await createNote({
        title: 'Test Catchall 1',
        body: '[Test] Catchall note 1 - Meeting notes from standup',
        subtype: 'catchall',
        ai_placed: false,
      });
      await createNote({
        title: 'Test Catchall 2',
        body: '[Test] Catchall note 2 - Shopping list for weekend',
        subtype: 'catchall',
        ai_placed: false,
      });

      // 1 with subtype 'journal'
      await createNote({
        title: 'Test Journal',
        body: '[Test] Journal entry - Today was a productive day...',
        subtype: 'journal',
        ai_placed: false,
      });

      Alert.alert('Success', '5 test notes created');
    } catch (err) {
      console.error('[SweepTestScreen] Failed to create notes:', err);
      Alert.alert('Error', 'Failed to create test notes');
    }
  }, [createNote]);

  const handleAddHabits = useCallback(async () => {
    try {
      // 2 with start_date_confirmed: true
      await createHabit({
        name: '[Test] Morning meditation',
        title: '[Test] Morning meditation',
        subtype: 'start_habit',
        frequency: 'daily',
        start_date_confirmed: true,
        ai_placed: false,
      });
      await createHabit({
        name: '[Test] Read 30 minutes',
        title: '[Test] Read 30 minutes',
        subtype: 'start_habit',
        frequency: 'daily',
        start_date_confirmed: true,
        ai_placed: false,
      });

      // 1 with start_date_confirmed: false (will appear in cards)
      await createHabit({
        name: '[Test] Exercise routine',
        title: '[Test] Exercise routine',
        subtype: 'start_habit',
        frequency: 'daily',
        start_date_confirmed: false,
        ai_placed: false,
      });

      Alert.alert('Success', '3 test habits created');
    } catch (err) {
      console.error('[SweepTestScreen] Failed to create habits:', err);
      Alert.alert('Error', 'Failed to create test habits');
    }
  }, [createHabit]);

  // ---------------------------------------------------------------------------
  // Jump to Step Handlers
  // ---------------------------------------------------------------------------

  const [cardIndexInput, setCardIndexInput] = useState('');

  const handleJumpToStep = useCallback(
    (stepNumber: number, cardIndex?: number) => {
      // Close the test screen first, then navigate to Sweep with params
      // This ensures the Sweep screen receives fresh params
      navigation.goBack();
      setTimeout(() => {
        navigation.navigate('Sweep', {
          initialStep: stepNumber,
          initialCardIndex: cardIndex,
        });
      }, 150);
    },
    [navigation],
  );

  const handleJumpToCardWithIndex = useCallback(() => {
    const idx = parseInt(cardIndexInput, 10);
    if (isNaN(idx) || idx < 0) {
      Alert.alert('Invalid Index', 'Please enter a valid card index (0 or greater)');
      return;
    }
    handleJumpToStep(1, idx);
  }, [cardIndexInput, handleJumpToStep]);

  // ---------------------------------------------------------------------------
  // Current State - Debug Panel
  // ---------------------------------------------------------------------------

  const { user } = useAuth();
  const sweepCandidates = useSweepCandidatesUnified();
  const [isDebugExpanded, setIsDebugExpanded] = useState(true);
  const [lastSweepAt, setLastSweepAt] = useState<string | null>(null);
  const [isLoadingLastSweep, setIsLoadingLastSweep] = useState(false);

  // Compute counts by type
  const todoCandidates = sweepCandidates.filter((c) => c.candidate.kind === 'todo');
  const noteCandidates = sweepCandidates.filter((c) => c.candidate.kind === 'note');
  const habitCandidates = sweepCandidates.filter((c) => c.candidate.kind === 'habit');

  const fetchLastSweep = useCallback(async () => {
    if (!user?.id) return;
    setIsLoadingLastSweep(true);
    try {
      const { data, error } = await supabase
        .from('cortex_preferences')
        .select('last_sweep_completed_at')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[SweepTestScreen] Failed to fetch last sweep:', error);
      } else {
        setLastSweepAt(data?.last_sweep_completed_at ?? null);
      }
    } catch (err) {
      console.error('[SweepTestScreen] Error fetching last sweep:', err);
    } finally {
      setIsLoadingLastSweep(false);
    }
  }, [user?.id]);

  // Fetch last sweep on mount
  useEffect(() => {
    fetchLastSweep();
  }, [fetchLastSweep]);

  const formatTimestamp = (ts: string | null): string => {
    if (!ts) return 'Never';
    try {
      const date = new Date(ts);
      return date.toLocaleString();
    } catch {
      return ts;
    }
  };

  const getStatusLabel = (candidate: (typeof sweepCandidates)[0]): string => {
    const { kind, isOverdue, isDueToday, isCreatedToday } = candidate.candidate;
    const { todoStatus, habitStatus, logSubtype } = candidate.meta;

    if (kind === 'todo') {
      if (isOverdue) return 'overdue';
      if (isDueToday) return 'due today';
      if (isCreatedToday) return 'new today';
      return todoStatus ?? 'unscheduled';
    }
    if (kind === 'habit') {
      return habitStatus ?? 'needs start date';
    }
    if (kind === 'note') {
      if (isCreatedToday) return `new ${logSubtype ?? 'note'}`;
      return logSubtype ?? 'note';
    }
    return 'unknown';
  };

  const getCandidateTitle = (candidate: (typeof sweepCandidates)[0]): string => {
    const raw = candidate.candidate.raw as Record<string, unknown>;
    let title = '';
    if ('name' in raw && raw.name) title = String(raw.name);
    else if ('title' in raw && raw.title) title = String(raw.title);
    else if ('body' in raw && raw.body) title = String(raw.body).split('\n')[0];
    else title = 'Untitled';
    return title.length > 30 ? title.substring(0, 30) + '...' : title;
  };

  // ---------------------------------------------------------------------------
  // Reset Controls Handlers
  // ---------------------------------------------------------------------------

  const testTodos = todos.filter((t) => t.name?.includes('[Test]') && !t.archived);
  const testNotes = notes.filter((n) => n.body?.includes('[Test]') && !n.archived);
  const testHabits = habits.filter((h) => h.name?.includes('[Test]') && !h.archived);

  const handleClearTestTodos = useCallback(async () => {
    if (testTodos.length === 0) {
      Alert.alert('No Test Todos', 'No todos with [Test] prefix found');
      return;
    }
    Alert.alert('Clear Test Todos', `Archive ${testTodos.length} todos with [Test] prefix?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            for (const todo of testTodos) {
              await archiveTodo(todo.id, 'test_cleanup');
            }
            Alert.alert('Success', `${testTodos.length} test todos archived`);
          } catch (err) {
            console.error('[SweepTestScreen] Failed to clear test todos:', err);
            Alert.alert('Error', 'Failed to archive test todos');
          }
        },
      },
    ]);
  }, [testTodos, archiveTodo]);

  const handleClearTestNotes = useCallback(async () => {
    if (testNotes.length === 0) {
      Alert.alert('No Test Notes', 'No notes with [Test] prefix found');
      return;
    }
    Alert.alert('Clear Test Notes', `Archive ${testNotes.length} notes with [Test] prefix?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            for (const note of testNotes) {
              await archiveNote(note.id, 'test_cleanup');
            }
            Alert.alert('Success', `${testNotes.length} test notes archived`);
          } catch (err) {
            console.error('[SweepTestScreen] Failed to clear test notes:', err);
            Alert.alert('Error', 'Failed to archive test notes');
          }
        },
      },
    ]);
  }, [testNotes, archiveNote]);

  const handleClearTestHabits = useCallback(async () => {
    if (testHabits.length === 0) {
      Alert.alert('No Test Habits', 'No habits with [Test] prefix found');
      return;
    }
    Alert.alert('Clear Test Habits', `Archive ${testHabits.length} habits with [Test] prefix?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            for (const habit of testHabits) {
              await archiveHabit(habit.id, 'test_cleanup');
            }
            Alert.alert('Success', `${testHabits.length} test habits archived`);
          } catch (err) {
            console.error('[SweepTestScreen] Failed to clear test habits:', err);
            Alert.alert('Error', 'Failed to archive test habits');
          }
        },
      },
    ]);
  }, [testHabits, archiveHabit]);

  const handleResetLastSweep = useCallback(async () => {
    if (!user?.id) {
      Alert.alert('Error', 'Not logged in');
      return;
    }
    Alert.alert(
      'Reset Last Sweep',
      'Set last_sweep_completed_at to NULL? This will make the next sweep act like your first sweep.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('cortex_preferences')
                .update({ last_sweep_completed_at: null })
                .eq('owner_id', user.id);

              if (error) {
                console.error('[SweepTestScreen] Failed to reset last sweep:', error);
                Alert.alert('Error', 'Failed to reset last sweep time');
              } else {
                setLastSweepAt(null);
                Alert.alert('Success', 'Last sweep time reset to NULL');
              }
            } catch (err) {
              console.error('[SweepTestScreen] Error resetting last sweep:', err);
              Alert.alert('Error', 'Failed to reset last sweep time');
            }
          },
        },
      ],
    );
  }, [user?.id]);

  const handleSetLastSweepYesterday = useCallback(async () => {
    if (!user?.id) {
      Alert.alert('Error', 'Not logged in');
      return;
    }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0); // Noon yesterday
    const yesterdayISO = yesterday.toISOString();

    Alert.alert(
      'Set Last Sweep to Yesterday',
      `Set last_sweep_completed_at to ${yesterday.toLocaleString()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('cortex_preferences')
                .update({ last_sweep_completed_at: yesterdayISO })
                .eq('owner_id', user.id);

              if (error) {
                console.error('[SweepTestScreen] Failed to set last sweep:', error);
                Alert.alert('Error', 'Failed to set last sweep time');
              } else {
                setLastSweepAt(yesterdayISO);
                Alert.alert('Success', 'Last sweep time set to yesterday noon');
              }
            } catch (err) {
              console.error('[SweepTestScreen] Error setting last sweep:', err);
              Alert.alert('Error', 'Failed to set last sweep time');
            }
          },
        },
      ],
    );
  }, [user?.id]);

  // ---------------------------------------------------------------------------
  // Verify Actions Handlers
  // ---------------------------------------------------------------------------

  const handleCheckRecentArchives = useCallback(async () => {
    if (!user?.id) {
      Alert.alert('Error', 'Not logged in');
      return;
    }
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: archivedTodos } = await supabase
      .from('todos')
      .select('id, name, archived_at, archived_reason')
      .eq('owner_id', user.id)
      .eq('archived', true)
      .gte('archived_at', fiveMinutesAgo);

    const { data: archivedNotes } = await supabase
      .from('notes')
      .select('id, title, archived_at')
      .eq('owner_id', user.id)
      .eq('archived', true)
      .gte('archived_at', fiveMinutesAgo);

    const todoNames = archivedTodos?.map((t) => t.name).join(', ') || 'none';
    const noteNames = archivedNotes?.map((n) => n.title).join(', ') || 'none';

    Alert.alert(
      'Recent Archives (last 5 min)',
      `Todos (${archivedTodos?.length || 0}): ${todoNames}\n\nNotes (${archivedNotes?.length || 0}): ${noteNames}`,
    );
  }, [user?.id]);

  const handleCheckRecentDateChanges = useCallback(async () => {
    if (!user?.id) {
      Alert.alert('Error', 'Not logged in');
      return;
    }
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: updatedTodos } = await supabase
      .from('todos')
      .select('id, name, due_day, updated_at')
      .eq('owner_id', user.id)
      .eq('archived', false)
      .gte('updated_at', fiveMinutesAgo)
      .not('due_day', 'is', null);

    const summary =
      updatedTodos?.map((t) => `${t.name} → ${t.due_day}`).join('\n') || 'No recent changes';

    Alert.alert('Recent Date Changes (last 5 min)', summary);
  }, [user?.id]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sweep Test Mode</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <X size={24} color={BRAND.colors.charcoalInk} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Test Data Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Test Data</Text>
          <View style={styles.sectionContent}>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.actionButton} onPress={handleAddTodos}>
                <Text style={styles.actionButtonText}>Add 5 Todos</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={handleAddNotes}>
                <Text style={styles.actionButtonText}>Add 5 Notes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={handleAddHabits}>
                <Text style={styles.actionButtonText}>Add 3 Habits</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.countRow}>
              <Text style={styles.countText}>{todoCount} todos in store</Text>
              <Text style={styles.countText}>{noteCount} notes in store</Text>
              <Text style={styles.countText}>{habitCount} habits in store</Text>
            </View>
          </View>
        </View>

        {/* Jump to Step Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Jump to Step</Text>
          <View style={styles.sectionContent}>
            {/* Step buttons */}
            <View style={styles.stepButtonRow}>
              <TouchableOpacity style={styles.stepButton} onPress={() => handleJumpToStep(0)}>
                <Text style={styles.stepButtonText}>Intro (0)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stepButton} onPress={() => handleJumpToStep(1)}>
                <Text style={styles.stepButtonText}>Cards (1)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stepButton} onPress={() => handleJumpToStep(2)}>
                <Text style={styles.stepButtonText}>Habits (2)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stepButton} onPress={() => handleJumpToStep(3)}>
                <Text style={styles.stepButtonText}>Mood (3)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stepButton} onPress={() => handleJumpToStep(4)}>
                <Text style={styles.stepButtonText}>Summary (4)</Text>
              </TouchableOpacity>
            </View>

            {/* Card index input for Cards step */}
            <View style={styles.cardIndexRow}>
              <Text style={styles.cardIndexLabel}>Jump to card index:</Text>
              <TextInput
                style={styles.cardIndexInput}
                value={cardIndexInput}
                onChangeText={setCardIndexInput}
                placeholder="0"
                placeholderTextColor={BRAND.colors.inkMuted}
                keyboardType="number-pad"
              />
              <TouchableOpacity style={styles.goButton} onPress={handleJumpToCardWithIndex}>
                <Text style={styles.goButtonText}>Go</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Current State Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.debugHeader}
            onPress={() => setIsDebugExpanded(!isDebugExpanded)}
          >
            <Text style={styles.sectionHeader}>Current State</Text>
            {isDebugExpanded ? (
              <ChevronUp size={18} color={BRAND.colors.mossGreen} />
            ) : (
              <ChevronDown size={18} color={BRAND.colors.mossGreen} />
            )}
          </TouchableOpacity>

          {isDebugExpanded && (
            <View style={styles.debugContent}>
              {/* Summary counts */}
              <View style={styles.debugRow}>
                <Text style={styles.debugLabel}>Sweep candidates:</Text>
                <Text style={styles.debugValue}>
                  {sweepCandidates.length} ({todoCandidates.length} todos, {noteCandidates.length}{' '}
                  notes, {habitCandidates.length} habits)
                </Text>
              </View>

              {/* Last sweep timestamp */}
              <View style={styles.debugRow}>
                <Text style={styles.debugLabel}>Last sweep:</Text>
                {isLoadingLastSweep ? (
                  <ActivityIndicator size="small" color={BRAND.colors.mossGreen} />
                ) : (
                  <Text style={styles.debugValue}>{formatTimestamp(lastSweepAt)}</Text>
                )}
              </View>

              {/* Refresh button */}
              <TouchableOpacity style={styles.refreshButton} onPress={fetchLastSweep}>
                <RefreshCw size={14} color={BRAND.colors.surface} />
                <Text style={styles.refreshButtonText}>Refresh</Text>
              </TouchableOpacity>

              {/* Candidate list */}
              {sweepCandidates.length > 0 && (
                <View style={styles.candidateListContainer}>
                  <Text style={styles.candidateListHeader}>
                    Candidates ({sweepCandidates.length})
                  </Text>
                  <ScrollView
                    style={styles.candidateList}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                  >
                    {sweepCandidates.map((c, idx) => (
                      <View key={c.candidate.id} style={styles.candidateRow}>
                        <Text style={styles.candidateIndex}>{idx}</Text>
                        <Text style={styles.candidateId}>{c.candidate.id.substring(0, 8)}</Text>
                        <View
                          style={[
                            styles.candidateKindBadge,
                            c.candidate.kind === 'todo' && styles.kindBadgeTodo,
                            c.candidate.kind === 'note' && styles.kindBadgeNote,
                            c.candidate.kind === 'habit' && styles.kindBadgeHabit,
                          ]}
                        >
                          <Text style={styles.candidateKindText}>{c.candidate.kind}</Text>
                        </View>
                        <Text style={styles.candidateTitle} numberOfLines={1}>
                          {getCandidateTitle(c)}
                        </Text>
                        <Text style={styles.candidateStatus}>{getStatusLabel(c)}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              {sweepCandidates.length === 0 && (
                <Text style={styles.emptyState}>No sweep candidates</Text>
              )}
            </View>
          )}
        </View>

        {/* Reset Controls Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Reset Controls</Text>
          <View style={styles.sectionContent}>
            {/* Clear test data buttons */}
            <Text style={styles.resetSubheader}>Clear Test Data</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.destructiveButton} onPress={handleClearTestTodos}>
                <Text style={styles.destructiveButtonText}>Clear Todos ({testTodos.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.destructiveButton} onPress={handleClearTestNotes}>
                <Text style={styles.destructiveButtonText}>Clear Notes ({testNotes.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.destructiveButton} onPress={handleClearTestHabits}>
                <Text style={styles.destructiveButtonText}>Clear Habits ({testHabits.length})</Text>
              </TouchableOpacity>
            </View>

            {/* Sweep time controls */}
            <Text style={[styles.resetSubheader, { marginTop: 16 }]}>Sweep Time</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.warningButton} onPress={handleResetLastSweep}>
                <Text style={styles.warningButtonText}>Reset to NULL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.warningButton} onPress={handleSetLastSweepYesterday}>
                <Text style={styles.warningButtonText}>Set to Yesterday</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Verify Actions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Verify Actions</Text>
          <View style={styles.sectionContent}>
            <Text style={styles.verifySubheader}>Check Database Persistence</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.infoButton} onPress={handleCheckRecentArchives}>
                <Text style={styles.infoButtonText}>Check Recent Archives</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.infoButton} onPress={handleCheckRecentDateChanges}>
                <Text style={styles.infoButtonText}>Check Recent Date Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    ...BRAND.typography.subhead,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 20,
  },
  section: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.lg,
    ...BRAND.elevation.one,
    overflow: 'hidden',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BRAND.colors.sageMist,
    ...BRAND.typography.subhead,
  },
  sectionContent: {
    padding: 16,
    minHeight: 80,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: BRAND.radius.md,
    alignItems: 'center',
  },
  actionButtonText: {
    color: BRAND.colors.surface,
    fontSize: 13,
    fontWeight: '600',
    ...BRAND.typography.bodyMedium,
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  countText: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    ...BRAND.typography.body,
  },
  stepButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  stepButton: {
    backgroundColor: BRAND.colors.periwinkleSmoke,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BRAND.radius.md,
  },
  stepButtonText: {
    color: BRAND.colors.surface,
    fontSize: 12,
    fontWeight: '600',
    ...BRAND.typography.bodyMedium,
  },
  cardIndexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardIndexLabel: {
    fontSize: 13,
    color: BRAND.colors.charcoalInk,
    ...BRAND.typography.body,
  },
  cardIndexInput: {
    width: 60,
    height: 36,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    borderRadius: BRAND.radius.sm,
    paddingHorizontal: 10,
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
    backgroundColor: BRAND.colors.surface,
  },
  goButton: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BRAND.radius.md,
  },
  goButtonText: {
    color: BRAND.colors.surface,
    fontSize: 13,
    fontWeight: '600',
    ...BRAND.typography.bodyMedium,
  },
  // Debug panel styles
  debugHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 16,
    backgroundColor: BRAND.colors.sageMist,
  },
  debugContent: {
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
  },
  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  debugLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginRight: 6,
    ...BRAND.typography.bodyMedium,
  },
  debugValue: {
    fontSize: 12,
    color: BRAND.colors.inkSubtle,
    ...BRAND.typography.body,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BRAND.radius.sm,
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 12,
    gap: 6,
  },
  refreshButtonText: {
    color: BRAND.colors.surface,
    fontSize: 12,
    fontWeight: '600',
    ...BRAND.typography.bodyMedium,
  },
  candidateListContainer: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    borderRadius: BRAND.radius.md,
    backgroundColor: BRAND.colors.surface,
  },
  candidateListHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...BRAND.typography.bodyMedium,
  },
  candidateList: {
    maxHeight: 300,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
    gap: 6,
  },
  candidateIndex: {
    fontSize: 10,
    color: BRAND.colors.inkMuted,
    width: 18,
    textAlign: 'right',
    ...BRAND.typography.body,
  },
  candidateId: {
    fontSize: 11,
    color: BRAND.colors.inkSubtle,
    fontFamily: 'monospace',
    width: 65,
  },
  candidateKindBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: BRAND.colors.inkMuted,
  },
  kindBadgeTodo: {
    backgroundColor: BRAND.colors.mossGreen,
  },
  kindBadgeNote: {
    backgroundColor: BRAND.colors.periwinkleSmoke,
  },
  kindBadgeHabit: {
    backgroundColor: BRAND.colors.goldenPear,
  },
  candidateKindText: {
    fontSize: 9,
    fontWeight: '600',
    color: BRAND.colors.surface,
    textTransform: 'uppercase',
    ...BRAND.typography.bodyMedium,
  },
  candidateTitle: {
    fontSize: 11,
    color: BRAND.colors.charcoalInk,
    flex: 1,
    ...BRAND.typography.body,
  },
  candidateStatus: {
    fontSize: 10,
    color: BRAND.colors.inkMuted,
    fontStyle: 'italic',
    ...BRAND.typography.italic,
  },
  emptyState: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
    ...BRAND.typography.italic,
  },
  // Reset Controls styles
  resetSubheader: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...BRAND.typography.bodyMedium,
  },
  destructiveButton: {
    flex: 1,
    backgroundColor: '#D32F2F',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: BRAND.radius.md,
    alignItems: 'center',
  },
  destructiveButtonText: {
    color: BRAND.colors.surface,
    fontSize: 11,
    fontWeight: '600',
    ...BRAND.typography.bodyMedium,
  },
  warningButton: {
    flex: 1,
    backgroundColor: '#F57C00',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: BRAND.radius.md,
    alignItems: 'center',
  },
  warningButtonText: {
    color: BRAND.colors.surface,
    fontSize: 12,
    fontWeight: '600',
    ...BRAND.typography.bodyMedium,
  },
  // Verify Actions styles
  verifySubheader: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...BRAND.typography.bodyMedium,
  },
  infoButton: {
    flex: 1,
    backgroundColor: '#1976D2',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: BRAND.radius.md,
    alignItems: 'center',
  },
  infoButtonText: {
    color: BRAND.colors.surface,
    fontSize: 11,
    fontWeight: '600',
    ...BRAND.typography.bodyMedium,
  },
});
