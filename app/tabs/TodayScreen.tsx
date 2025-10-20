/**
 * Today Screen - Phase 9: Energy & Momentum
 * Enhanced with mascot header, sections, and smart cards
 */

import { useCallback, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
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

export default function TodayScreen() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { theme } = useTheme();

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

  // Read feature flags
  const celebrationEnabled = process.env.EXPO_PUBLIC_TODAY_CELEBRATION !== 'off';
  const suggestionsEnabled = process.env.EXPO_PUBLIC_TODAY_SUGGESTIONS !== 'off';

  // DEV: DS marker for QA
  const dsMarker = __DEV__ ? (
    <Box style={{ position: 'absolute', top: 8, right: 8, opacity: 0.5 }}>
      <Text testID="ds-marker" variant="subtle" style={{ fontSize: 10 }}>
        DS
      </Text>
    </Box>
  ) : null;

  // Handle habit completion (optimistic UI only - no repo mutation yet)
  const handleHabitComplete = (id: string) => {
    setCompletedHabitIds((prev) => new Set(prev).add(id));
    setLastCompletedId(id);
    setLastCompletedType('habit');
    if (celebrationEnabled) {
      setCelebrationVisible(true);
    }
    // TODO Phase 9 step 2: Persist to repo and emit event
  };

  // Handle todo completion (optimistic UI only - no repo mutation yet)
  const handleTodoComplete = (id: string) => {
    setCompletedTodoIds((prev) => new Set(prev).add(id));
    setLastCompletedId(id);
    setLastCompletedType('todo');
    if (celebrationEnabled) {
      setCelebrationVisible(true);
    }
    // TODO Phase 9 step 2: Persist to repo and emit event
  };

  // Handle suggestion acceptance (placeholder)
  const handleSuggestionAccept = (id: string) => {
    console.log('Suggestion accepted:', id);
    // TODO Phase 9 step 2: Add to today list
  };

  // Handle undo from celebration overlay
  const handleUndo = () => {
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
    // Reload data after overlay save
    await todayData.reload();
  }, [todayData]);

  // Filter out completed items for display
  const visibleHabits = todayData.habits.filter((h) => !completedHabitIds.has(h.id));
  const visibleTodos = todayData.todos.filter((t) => !completedTodoIds.has(t.id));

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

            {/* Habits Today Section */}
            <TodaySection
              title="Habits Today"
              initiallyExpanded
              reducedMotion={todayData.reducedMotion}
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
              >
                <Box gap={2} testID="today-section-suggested">
                  {todayData.suggestions.map((suggestion) => (
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
