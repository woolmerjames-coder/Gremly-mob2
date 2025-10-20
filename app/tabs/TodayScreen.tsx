/**
 * Today Screen - Phase 9: Energy & Momentum
 * Enhanced with mascot header, sections, and smart cards
 * Step 2: Adds repo persistence, undo with timer, show more buttons, evening teaser
 */

import { useCallback, useState, useEffect, useRef } from 'react';
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
import { useTodayData } from '../../lib/today/useTodayData';
import TodayMascotHeader from '../../components/today/TodayMascotHeader';
import TodaySection from '../../components/today/TodaySection';
import TodayHabitCard from '../../components/today/TodayHabitCard';
import TodayTodoCard from '../../components/today/TodayTodoCard';
import TodaySuggestionCard from '../../components/today/TodaySuggestionCard';
import TodayCelebrationOverlay from '../../components/today/TodayCelebrationOverlay';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const UNDO_TIMEOUT_MS = 3000; // 3 seconds to undo

export default function TodayScreen() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const repo = useRepo();

  // Unified overlay controller
  const overlayController = useUnifiedOverlayController();

  // Today data hook
  const todayData = useTodayData();

  // Local state for optimistic UI
  const [completedHabitIds, setCompletedHabitIds] = useState<Set<string>>(new Set());
  const [completedTodoIds, setCompletedTodoIds] = useState<Set<string>>(new Set());
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [lastCompletedId, setLastCompletedId] = useState<string | null>(null);
  const [lastCompletedType, setLastCompletedType] = useState<'habit' | 'todo' | null>(null);
  const [showAllHabits, setShowAllHabits] = useState(false);
  const [showAllTodos, setShowAllTodos] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);

  // Undo timer ref
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Read feature flags
  const celebrationEnabled = process.env.EXPO_PUBLIC_TODAY_CELEBRATION !== 'off';
  const suggestionsEnabled = process.env.EXPO_PUBLIC_TODAY_SUGGESTIONS !== 'off';
  const eveningTeaserEnabled = process.env.EXPO_PUBLIC_TODAY_EVENING_TEASER !== 'off';

  // Check if we should show evening reflection teaser (18:00+)
  const shouldShowEveningTeaser = eveningTeaserEnabled && new Date().getHours() >= 18;

  // DEV: DS marker for QA
  const dsMarker = __DEV__ ? (
    <Box style={{ position: 'absolute', top: 8, right: 8, opacity: 0.5 }}>
      <Text testID="ds-marker" variant="subtle" style={{ fontSize: 10 }}>
        DS
      </Text>
    </Box>
  ) : null;

  // Clear undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  // Handle habit completion with repo persistence
  const handleHabitComplete = async (id: string) => {
    // Optimistic UI
    setCompletedHabitIds((prev) => new Set(prev).add(id));
    setLastCompletedId(id);
    setLastCompletedType('habit');

    if (celebrationEnabled) {
      setCelebrationVisible(true);
    }

    // Clear any existing timer
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }

    // Start undo timer - persist after 3s
    undoTimerRef.current = setTimeout(async () => {
      try {
        await repo.completeHabit(id, new Date().toISOString());
        // Event bus will trigger reload automatically
      } catch (err) {
        console.error('Failed to complete habit:', err);
        // Revert optimistic UI on error
        setCompletedHabitIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }, UNDO_TIMEOUT_MS);
  };

  // Handle todo completion with repo persistence
  const handleTodoComplete = async (id: string) => {
    // Optimistic UI
    setCompletedTodoIds((prev) => new Set(prev).add(id));
    setLastCompletedId(id);
    setLastCompletedType('todo');

    if (celebrationEnabled) {
      setCelebrationVisible(true);
    }

    // Clear any existing timer
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }

    // Start undo timer - persist after 3s
    undoTimerRef.current = setTimeout(async () => {
      try {
        await repo.completeTodo(id, new Date().toISOString());
        // Event bus will trigger reload automatically
      } catch (err) {
        console.error('Failed to complete todo:', err);
        // Revert optimistic UI on error
        setCompletedTodoIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }, UNDO_TIMEOUT_MS);
  };

  // Handle suggestion acceptance (placeholder)
  const handleSuggestionAccept = (id: string) => {
    console.log('Suggestion accepted:', id);
    // TODO Phase 9 step 3: Add to today list
  };

  // Handle undo from celebration overlay
  const handleUndo = () => {
    // Clear the pending persist timer
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    // Revert optimistic UI
    if (lastCompletedId && lastCompletedType) {
      if (lastCompletedType === 'habit') {
        setCompletedHabitIds((prev) => {
          const next = new Set(prev);
          next.delete(lastCompletedId);
          return next;
        });
      } else {
        setCompletedTodoIds((prev) => {
          const next = new Set(prev);
          next.delete(lastCompletedId);
          return next;
        });
      }
    }

    setCelebrationVisible(false);
    setLastCompletedId(null);
    setLastCompletedType(null);
  };

  // Handle long press (placeholder)
  const handleLongPress = (id: string) => {
    console.log('Long press:', id);
    // TODO: Show context menu or navigate to detail
  };

  const handleOverlaySaved = useCallback(async () => {
    // Reload data after overlay save (event bus will also trigger reload)
    await todayData.reload();
  }, [todayData]);

  // Open journal overlay with evening reflection prompt
  const handleOpenEveningReflection = () => {
    overlayController.openCreate({ type: 'journal' });
  };

  // Determine which items to show based on visible/hidden and show more state
  const habitsToShow = showAllHabits ? todayData.habits : todayData.visible.habits;
  const todosToShow = showAllTodos ? todayData.todos : todayData.visible.todos;
  const suggestionsToShow = showAllSuggestions
    ? todayData.suggestions
    : todayData.visible.suggestions;

  // Filter out completed items for display (optimistic UI)
  const visibleHabits = habitsToShow.filter((h) => !completedHabitIds.has(h.id));
  const visibleTodos = todosToShow.filter((t) => !completedTodoIds.has(t.id));

  return (
    <Screen title="Today" scroll padded testID="today-screen">
      {dsMarker}
      <Box gap={4}>
        {/* Error state */}
        {todayData.error && (
          <Card>
            <Box p={4} gap={3} style={{ alignItems: 'center' }}>
              <Text variant="title" style={{ textAlign: 'center' }}>
                Authentication Required
              </Text>
              <Text variant="body" style={{ textAlign: 'center', color: theme.colors.error }}>
                {todayData.error}
              </Text>
              {__DEV__ && (
                <Button
                  title="Open Dev Login"
                  onPress={() => navigation.navigate('DevLogin')}
                  testID="dev-login-cta"
                />
              )}
            </Box>
          </Card>
        )}

        {/* Loading state */}
        {todayData.loading && !todayData.error && (
          <Box p={4}>
            <Text variant="body" style={{ textAlign: 'center' }}>
              Loading...
            </Text>
          </Box>
        )}

        {/* Main content */}
        {!todayData.loading && !todayData.error && user && (
          <>
            {/* Mascot Header */}
            <TodayMascotHeader
              greeting={todayData.header.greeting}
              subline={todayData.header.subline}
              streakCount={todayData.header.streakCount}
              completedToday={todayData.header.completedToday}
              plannedToday={todayData.header.plannedToday}
              timeWindow={todayData.timeWindow}
              reducedMotion={todayData.reducedMotion}
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
              initiallyExpanded
              reducedMotion={todayData.reducedMotion}
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
              initiallyExpanded
              reducedMotion={todayData.reducedMotion}
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
              <Box gap={2} testID="today-section-due-today">
                {visibleTodos.length === 0 && (
                  <Text variant="subtle" style={{ textAlign: 'center', padding: 16 }}>
                    All clear for now ✨
                  </Text>
                )}
                {visibleTodos.map((todo) => (
                  <TodayTodoCard
                    key={todo.id}
                    id={todo.id}
                    title={todo.title}
                    dueTime={todo.dueTime}
                    tags={todo.tags}
                    spaceName={todo.spaceName}
                    overdue={todo.overdue}
                    nearDue={todo.nearDue}
                    onComplete={handleTodoComplete}
                    onLongPress={handleLongPress}
                    reducedMotion={todayData.reducedMotion}
                  />
                ))}
              </Box>
            </TodaySection>

            {/* Suggested Section */}
            {suggestionsEnabled && todayData.suggestions.length > 0 && (
              <TodaySection
                title="Suggested"
                initiallyExpanded
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
                      id={suggestion.id}
                      title={suggestion.title}
                      reason={suggestion.reason}
                      ctaLabel={suggestion.ctaLabel}
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
          </>
        )}
      </Box>

      {/* Unified Create/Edit Overlay */}
      <UnifiedCreateOverlay
        visible={overlayController.state.visible}
        mode={overlayController.state.mode}
        initialEntity={overlayController.state.initialEntity}
        initialSpaceId={overlayController.state.initialSpaceId}
        onClose={overlayController.close}
        onSaved={handleOverlaySaved}
      />

      {/* Celebration Overlay */}
      {celebrationEnabled && (
        <TodayCelebrationOverlay
          visible={celebrationVisible}
          onUndo={handleUndo}
          onRequestClose={() => {
            setCelebrationVisible(false);
            setLastCompletedId(null);
            setLastCompletedType(null);
          }}
          reducedMotion={todayData.reducedMotion}
        />
      )}
    </Screen>
  );
}
