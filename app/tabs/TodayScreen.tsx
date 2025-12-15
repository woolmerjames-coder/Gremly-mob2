/**
 * Today Screen - Phase 9: Energy & Momentum
 * Enhanced with mascot header, sections, and smart cards
 * Step 2: Adds repo persistence, undo with timer, show more buttons, evening teaser
 * Step 4: Adds space grouping, pull-to-refresh, session collapse state
 * Step 5: Adds suggestion heuristics with prefilled overlay and analytics
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { RefreshControl, View, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useRepo } from '../../providers/RepoProvider';
import { Screen, Box, Text, Button } from '../../ui';
import { Card } from '../../design-system/Card';
import { UnifiedCreateOverlay } from '../../components/overlay/UnifiedCreateOverlay';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { useTodayData, type Suggestion, type TodayCommitment } from '../../lib/today/useTodayData';
import { useTodayInteractions } from '../../lib/today/useTodayInteractions';
import { eventBus } from '../../lib/events';
import { emitChatEvent } from '../../app/lib/chat/events';
import { env } from '../../lib/env';
import TodayMascotHeader from '../../components/today/TodayMascotHeader';
import TodaySection from '../../components/today/TodaySection';
import TodayHabitCard from '../../components/today/TodayHabitCard';
import TodayTodoCard from '../../components/today/TodayTodoCard';
import TodaySuggestionCard from '../../components/today/TodaySuggestionCard';
import TodayCelebrationOverlay from '../../components/today/TodayCelebrationOverlay';
import TodayV3View from './TodayV3View';
import TodayV4LanesView from './TodayV4LanesView';
import NowScreenV1 from '../../app/screens/NowScreenV1';
import { Icon, type IconName } from '../../components/ui/Icon';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const UNDO_TIMEOUT_MS = 3000; // 3 seconds to undo

const COMMITMENTS_FEATURE_ENABLED = (() => {
  const rawValue = (process.env.EXPO_PUBLIC_FEATURE_COMMITMENTS ?? 'on').toLowerCase();
  return rawValue === 'on' || rawValue === 'true' || rawValue === '1';
})();

// UndoState removed - now using PendingCompletionInfo from useTodayInteractions

// Helper types and functions for space grouping
type Group<T> = { key: string; items: T[] };

function groupBy<T>(arr: T[], getKey: (t: T) => string): Group<T>[] {
  const map = new Map<string, T[]>();
  for (const it of arr) {
    const k = getKey(it) || 'No Space';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(it);
  }
  // Sort groups: alphabetically, but "No Space" always last
  const entries = Array.from(map.entries());
  entries.sort(([a], [b]) => {
    if (a === 'No Space') return 1;
    if (b === 'No Space') return -1;
    return a.localeCompare(b);
  });
  return entries.map(([key, items]) => ({ key, items }));
}

function toKebabCase(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-');
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getCommitmentStartedLabel(started?: string | null): string {
  if (!started) {
    return 'Started recently';
  }

  const startedDate = new Date(started);
  if (Number.isNaN(startedDate.getTime())) {
    return 'Started recently';
  }

  const now = new Date();
  const diffMs = now.getTime() - startedDate.getTime();
  const days = Math.max(0, Math.floor(diffMs / MS_PER_DAY));

  if (days <= 0) {
    return 'Started today';
  }

  if (days === 1) {
    return 'Started 1 day ago';
  }

  return `Started ${days} days ago`;
}

export default function TodayScreen() {
  if (__DEV__) {
    console.log('[TodayVariant]', {
      v3: env.feature.today.v3,
      v4: env.feature.today.v4Lanes,
      nowV1: env.feature.today.nowV1,
      showCommitments: COMMITMENTS_FEATURE_ENABLED,
    });
  }
  if (env.feature.today.nowV1) {
    return <NowScreenV1 />;
  }
  if (env.feature.today.v4Lanes) {
    return <TodayV4LanesView />;
  }
  if (env.feature.today.v3) {
    return <TodayV3View />;
  }
  return <TodayScreenV2 />;
}

function TodayScreenV2() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const repo = useRepo();
  const isTestLight = process.env.JEST_TODAY_LIGHT === '1';

  // Unified overlay controller
  const overlayController = useUnifiedOverlayController();
  const overlayMode =
    overlayController.state.mode === 'view' ? 'create' : overlayController.state.mode;

  // Today data hook
  const todayData = useTodayData();

  // Read feature flags from env module
  const celebrationEnabled = !isTestLight && env.feature.today.celebration;
  const suggestionsEnabled = !isTestLight && env.feature.today.suggestions;
  const eveningTeaserEnabled = env.feature.today.eveningTeaser;

  // Shared interactions hook - no onReload needed, store auto-updates
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const interactions = useTodayInteractions({
    celebrationEnabled,
    onCelebration: () => setCelebrationVisible(true),
    showCelebrationToast: false, // Disable toast on Today - use dot glow instead
  });

  // Local state for UI
  const [showAllHabits, setShowAllHabits] = useState(false);
  const [showAllTodos, setShowAllTodos] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [removingCommitmentId, setRemovingCommitmentId] = useState<string | null>(null);

  // State for pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const [mascotWaveTick, setMascotWaveTick] = useState(0);

  // State for section collapse (session-only)
  const [expanded, setExpanded] = useState<{ [k: string]: boolean }>({
    'Habits Today': true,
    'Due Today': true,
    Suggested: true,
  });

  // Check if we should show evening reflection teaser (18:00+)
  const shouldShowEveningTeaser =
    !isTestLight && eveningTeaserEnabled && new Date().getHours() >= 18;

  // Emit analytics event on mount
  useEffect(() => {
    const hour = new Date().getHours();
    const hourBlock = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    eventBus.emit('TodayViewOpened', { hourBlock });
  }, []);

  // Handle pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await todayData.reload();
    if (!isTestLight) {
      setMascotWaveTick((t) => t + 1);
    }
    setRefreshing(false);
  }, [todayData, isTestLight]);

  // Handle habit completion - delegate to shared hook
  const handleHabitComplete = useCallback(
    (id: string) => {
      const habit = todayData.habits.find((h) => h.id === id);
      if (habit) {
        void interactions.toggleHabitComplete(habit);
      }
    },
    [todayData.habits, interactions],
  );

  // Handle todo completion - delegate to shared hook
  const handleTodoComplete = useCallback(
    (id: string) => {
      const todo = todayData.todos.find((t) => t.id === id);
      if (todo) {
        void interactions.toggleTodoComplete(todo);
      }
    },
    [todayData.todos, interactions],
  );

  // Handle suggestion acceptance with prefilled overlay
  const handleSuggestionAccept = (suggestion: Suggestion) => {
    // Emit analytics
    eventBus.emit('TodaySuggestionAccept', {
      suggestionId: suggestion.id,
      type: suggestion.type,
    });

    // Open overlay with prefilled data based on suggestion type
    if (suggestion.type === 'journal') {
      overlayController.openCreate({ type: 'log', logSubtype: 'journal' });
    } else if (suggestion.type === 'todo') {
      overlayController.openCreate({ type: 'todo' });
    } else if (suggestion.type === 'habit') {
      overlayController.openCreate({ type: 'habit' });
    }
  };

  const handleUndo = useCallback(() => {
    void interactions.undoLastCompletion();
    setCelebrationVisible(false);
  }, [interactions]);

  // Handle long press
  const handleLongPress = (id: string) => {
    // TODO Phase 12: Show context menu or navigate to detail
    if (__DEV__) {
      console.log('[TodayScreen] Long press:', id);
    }
  };

  const reloadToday = todayData.reload;

  const handleCommitmentRemove = useCallback(
    async (commitment: TodayCommitment) => {
      if (!COMMITMENTS_FEATURE_ENABLED) {
        return;
      }
      if (removingCommitmentId) {
        return;
      }

      setRemovingCommitmentId(commitment.id);
      try {
        await repo.removeCommitment(commitment.id, commitment.type);
        await reloadToday();
      } catch (err) {
        console.error('Failed to remove commitment:', err);
        Alert.alert('Remove failed', 'Unable to remove commitment right now. Please try again.');
      } finally {
        setRemovingCommitmentId(null);
      }
    },
    [reloadToday, removingCommitmentId, repo],
  );

  const handleOverlaySaved = useCallback(async () => {
    // Reload data after overlay save (event bus will also trigger reload)
    await todayData.reload();
  }, [todayData]);

  const handleCommitmentsChanged = useCallback(async () => {
    try {
      await todayData.reload();
    } catch (error) {
      if (__DEV__) {
        console.warn('[TodayScreen] Failed to reload after commitment change', error);
      }
    }
  }, [todayData]);

  // Open journal overlay with evening reflection prompt
  const handleOpenEveningReflection = () => {
    overlayController.openCreate({ type: 'log', logSubtype: 'journal' });
  };

  // Determine which items to show based on visible/hidden and show more state
  const habitsToShow = showAllHabits ? todayData.habits : todayData.visible.habits;
  const todosToShow = showAllTodos ? todayData.todos : todayData.visible.todos;
  const suggestionsToShow = showAllSuggestions
    ? todayData.suggestions
    : todayData.visible.suggestions;

  // Filter out completed items for display (optimistic UI)
  const visibleHabits = habitsToShow.filter((h) => !interactions.completedHabitIds.has(h.id));
  const visibleTodos = todosToShow.filter((t) => !interactions.completedTodoIds.has(t.id));

  // Group todos by space
  const todoGroups = groupBy(visibleTodos, (t) => t.spaceName || '');
  const commitments = COMMITMENTS_FEATURE_ENABLED ? (todayData.commitments ?? []) : [];
  const hasCommitments = COMMITMENTS_FEATURE_ENABLED && commitments.length > 0;

  return (
    <Screen
      title="Today"
      scroll
      padded
      testID="today-screen"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.deepTeal.DEFAULT}
        />
      }
    >
      <Box gap={4}>
        {/* Loading state */}
        {todayData.loading && (
          <Box p={4}>
            <Text variant="body" style={{ textAlign: 'center' }}>
              Loading...
            </Text>
          </Box>
        )}

        {interactions.lastPendingInfo && (
          <Card testID="today-undo-banner">
            <Box
              p={3}
              gap={2}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text variant="body" style={{ flex: 1, marginRight: 12 }} numberOfLines={2}>
                {`Marked "${interactions.lastPendingInfo.label}" ${interactions.lastPendingInfo.type === 'habit' ? 'habit' : 'to-do'} complete.`}
              </Text>
              <Button
                title="Undo"
                variant="neutral"
                onPress={handleUndo}
                testID="today-undo-button"
              />
            </Box>
          </Card>
        )}

        {/* Main content */}
        {!todayData.loading && !todayData.error && user && (
          <>
            {isTestLight && <View testID="today-light-mode" accessibilityLabel="1" />}

            {hasCommitments && (
              <Box gap={3} testID="today-section-commitments">
                <Text variant="title">Commitments</Text>
                <Box gap={3}>
                  {commitments.map((commitment) => {
                    const iconName: IconName =
                      commitment.type === 'habit' ? 'Activity' : 'CheckCircle2';
                    const startedLabel = getCommitmentStartedLabel(commitment.started);
                    const isRemoving = removingCommitmentId === commitment.id;

                    return (
                      <Card
                        key={commitment.id}
                        variant="outlined"
                        padding="md"
                        testID={`commitment-card-${commitment.id}`}
                      >
                        <Box row gap={4} style={{ alignItems: 'flex-start' }}>
                          <View
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 16,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: 1,
                              borderColor: theme.colors.border.DEFAULT,
                              backgroundColor: theme.colors.cream,
                            }}
                          >
                            <Icon name={iconName} size="sm" color={theme.colors.deepTeal.DEFAULT} />
                          </View>
                          <Box flex={1} gap={1}>
                            <Text variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                              {commitment.name}
                            </Text>
                            <Text variant="subtle">{startedLabel}</Text>
                            {commitment.note ? (
                              <Text
                                variant="subtle"
                                style={{ color: theme.colors.text.secondary }}
                                numberOfLines={1}
                              >
                                {commitment.note}
                              </Text>
                            ) : null}
                          </Box>
                          <Button
                            label={isRemoving ? 'Removing...' : 'Remove'}
                            variant="ghost"
                            size="sm"
                            onPress={() => void handleCommitmentRemove(commitment)}
                            disabled={isRemoving}
                            testID={`commitment-remove-${commitment.id}`}
                          />
                        </Box>
                      </Card>
                    );
                  })}
                </Box>
              </Box>
            )}

            {/* Mascot Header */}
            <TodayMascotHeader
              greeting={todayData.header.greeting}
              subline={todayData.header.subline}
              streakCount={todayData.header.streakCount}
              completedToday={todayData.header.completedToday}
              plannedToday={todayData.header.plannedToday}
              timeWindow={todayData.timeWindow}
              reducedMotion={todayData.reducedMotion}
              waveTick={isTestLight ? 0 : mascotWaveTick}
            />

            {/* Evening Reflection Teaser */}
            {shouldShowEveningTeaser && (
              <Card testID="today-evening-teaser">
                <Box p={4} gap={3} style={{ alignItems: 'center' }}>
                  <Text variant="title" style={{ textAlign: 'center' }}>
                    🌙 Evening Check-in
                  </Text>
                  <Text variant="body" style={{ textAlign: 'center' }}>
                    How did today go? Take a moment to reflect.
                  </Text>
                  <Button
                    title="Open Journal"
                    variant="primary"
                    onPress={handleOpenEveningReflection}
                    testID="today-evening-journal-cta"
                  />
                </Box>
              </Card>
            )}

            {/* Habits Today Section */}
            <TodaySection
              title="Habits Today"
              initiallyExpanded={expanded['Habits Today']}
              onExpandedChange={(e) => setExpanded((s) => ({ ...s, 'Habits Today': e }))}
              reducedMotion={todayData.reducedMotion}
              limit={isTestLight ? 2 : undefined}
              footer={
                !showAllHabits && todayData.hidden.habits > 0 ? (
                  <Button
                    title={`Show ${todayData.hidden.habits} more`}
                    variant="neutral"
                    onPress={() => setShowAllHabits(true)}
                    testID="today-habits-show-more"
                  />
                ) : undefined
              }
            >
              <Box gap={2} testID="today-section-habits-today">
                {visibleHabits.length === 0 && (
                  <Text variant="subtle" style={{ textAlign: 'center', padding: 16 }}>
                    No habits due — enjoy the space 🌤️
                  </Text>
                )}
                {visibleHabits.map((habit) => (
                  <TodayHabitCard
                    key={habit.id}
                    id={habit.id}
                    name={habit.name}
                    dueWindow={habit.dueWindow}
                    streakCount={habit.streakCount}
                    tags={habit.tags}
                    spaceName={habit.spaceName}
                    onComplete={handleHabitComplete}
                    onLongPress={handleLongPress}
                    reducedMotion={todayData.reducedMotion}
                  />
                ))}
              </Box>
            </TodaySection>

            {/* Due Today Section */}
            <TodaySection
              title="Due Today"
              initiallyExpanded={expanded['Due Today']}
              onExpandedChange={(e) => setExpanded((s) => ({ ...s, 'Due Today': e }))}
              reducedMotion={todayData.reducedMotion}
              limit={isTestLight ? 2 : undefined}
              footer={
                !showAllTodos && todayData.hidden.todos > 0 ? (
                  <Button
                    title={`Show ${todayData.hidden.todos} more`}
                    variant="neutral"
                    onPress={() => setShowAllTodos(true)}
                    testID="today-todos-show-more"
                  />
                ) : undefined
              }
            >
              <Box gap={3} testID="today-section-due-today">
                {todoGroups.length === 0 && (
                  <Text variant="subtle" style={{ textAlign: 'center', padding: 16 }}>
                    All clear for now
                  </Text>
                )}
                {todoGroups.map((group) => (
                  <Box key={group.key} gap={2}>
                    {/* Group header */}
                    <Box
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        paddingHorizontal: 4,
                      }}
                      testID={`due-group-${toKebabCase(group.key)}`}
                    >
                      <Text variant="subtle" style={{ fontSize: 12, fontWeight: '600' }}>
                        {group.key}
                      </Text>
                      <View
                        style={{
                          backgroundColor: theme.colors.deepTeal.DEFAULT,
                          borderRadius: 12,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          minWidth: 24,
                          alignItems: 'center',
                        }}
                        testID={`due-group-count-${toKebabCase(group.key)}`}
                      >
                        <Text
                          style={{ fontSize: 11, color: theme.colors.cream, fontWeight: '600' }}
                        >
                          {group.items.length}
                        </Text>
                      </View>
                    </Box>
                    {/* Group items */}
                    {group.items.map((todo) => (
                      <TodayTodoCard
                        key={todo.id}
                        id={todo.id}
                        title={todo.title}
                        dueTime={todo.dueTime}
                        tags={todo.tags}
                        spaceName={todo.spaceName}
                        overdue={todo.overdue}
                        nearDue={todo.nearDue}
                        grouped
                        onComplete={handleTodoComplete}
                        onLongPress={handleLongPress}
                        reducedMotion={todayData.reducedMotion}
                      />
                    ))}
                  </Box>
                ))}
              </Box>
            </TodaySection>

            {/* Suggested Section */}
            {suggestionsEnabled && todayData.suggestions.length > 0 && (
              <TodaySection
                title="Suggested"
                initiallyExpanded={expanded['Suggested']}
                onExpandedChange={(e) => setExpanded((s) => ({ ...s, Suggested: e }))}
                reducedMotion={todayData.reducedMotion}
                footer={
                  !showAllSuggestions && todayData.hidden.suggestions > 0 ? (
                    <Button
                      title={`Show ${todayData.hidden.suggestions} more`}
                      variant="neutral"
                      onPress={() => setShowAllSuggestions(true)}
                      testID="today-suggestions-show-more"
                    />
                  ) : undefined
                }
              >
                <Box gap={2} testID="today-section-suggested">
                  {suggestionsToShow.map((suggestion) => (
                    <TodaySuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onAccept={handleSuggestionAccept}
                      reducedMotion={todayData.reducedMotion}
                    />
                  ))}
                </Box>
              </TodaySection>
            )}

            {/* Quick Add Button */}
            <Box mt={2}>
              <Button
                title="Add More"
                variant="neutral"
                onPress={() => overlayController.openCreate()}
                testID="today-add-more"
              />
            </Box>

            {/* Test-only: Debug refresh button */}
            {process.env.JEST_WORKAROUND === '1' && (
              <Box style={{ opacity: 0, height: 0 }}>
                <Button
                  title="Debug Refresh"
                  variant="neutral"
                  onPress={onRefresh}
                  testID="debug-refresh"
                />
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Unified Create/Edit Overlay */}
      {!isTestLight && (
        <UnifiedCreateOverlay
          visible={overlayController.state.visible}
          mode={overlayMode}
          initialEntity={overlayController.state.initialEntity}
          initialSpaceId={overlayController.state.initialSpaceId}
          onClose={overlayController.close}
          onSaved={handleOverlaySaved}
          onCommitmentsChanged={handleCommitmentsChanged}
        />
      )}

      {/* Celebration Overlay */}
      {celebrationEnabled && (
        <TodayCelebrationOverlay
          visible={celebrationVisible}
          onUndo={handleUndo}
          onRequestClose={() => {
            setCelebrationVisible(false);
          }}
          reducedMotion={todayData.reducedMotion}
        />
      )}
    </Screen>
  );
}
