/**
 * Today Screen - DS-only implementation (no Tailwind)
 * Shows habits and todos due today with proper data fetching
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { Screen, Box, Text, Button } from '../../ui';
import { Card } from '../../design-system/Card';
import { ListItem } from '../../design-system/ListItem';
import { openManualAdd } from '../../components/ManualAddSheet';
import type { AppRecord } from '../../lib/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function TodayScreen() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const navigation = useNavigation<NavigationProp>();
  const repo = useRepo();
  const { user } = useAuth();
  const { theme } = useTheme();

  // State
  const [items, setItems] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // DEV: DS marker for QA
  const dsMarker = __DEV__ ? (
    <Box style={{ position: 'absolute', top: 8, right: 8, opacity: 0.5 }}>
      <Text testID="ds-marker" variant="subtle" style={{ fontSize: 10 }}>
        DS
      </Text>
    </Box>
  ) : null;

  // Load due today items
  const load = useCallback(async () => {
    // Skip if not authenticated
    if (!user) {
      setError('Please sign in to view your items');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nowIso = new Date().toISOString();
      const dueItems = await repo.listDueToday(nowIso);
      setItems(dueItems);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load today items';
      console.error('Failed to load today items:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [repo, user]);

  // Load on mount and when user changes
  useEffect(() => {
    void load();
  }, [load]);

  // Separate items by type
  const habits = items.filter((item) => item.type === 'habit');
  const todos = items.filter((item) => item.type === 'todo');

  // Empty state
  const isEmpty = items.length === 0;

  // Navigate to item detail (placeholder - adjust based on your navigation)
  const handleItemPress = (item: AppRecord) => {
    console.log('Item pressed:', item.id);
    // TODO: Navigate to detail screen when implemented
    // navigation.navigate('ItemDetail', { id: item.id });
  };

  // Mark item as done (placeholder)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleMarkDone = async (item: AppRecord) => {
    console.log('Mark done:', item.id);
    // TODO: Implement mark done logic
    // await repo.update({ id: item.id, patch: { completed: true } });
    // await load();
  };

  return (
    <Screen title="Today" scroll padded testID="today-screen">
      {dsMarker}
      <Box gap={3}>
        {/* Error state */}
        {error && (
          <Card>
            <Box p={4} gap={3} style={{ alignItems: 'center' }}>
              <Text variant="title" style={{ textAlign: 'center' }}>
                Authentication Required
              </Text>
              <Text variant="body" style={{ textAlign: 'center', color: theme.colors.error }}>
                {error}
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
        {loading && !items.length && !error && (
          <Box p={4}>
            <Text variant="body" style={{ textAlign: 'center' }}>
              Loading...
            </Text>
          </Box>
        )}

        {/* Empty state */}
        {isEmpty && !loading && !error && (
          <Card>
            <Box p={4} gap={3} style={{ alignItems: 'center' }}>
              <Text variant="title" style={{ textAlign: 'center' }}>
                You're all set! �
              </Text>
              <Text variant="body" style={{ textAlign: 'center' }}>
                No items due today. Add something to get started.
              </Text>
              <Button title="Add Item" onPress={() => openManualAdd()} testID="today-empty-add" />
            </Box>
          </Card>
        )}

        {/* Due Habits Section */}
        {habits.length > 0 && (
          <Box gap={2}>
            <Text variant="title">Due Habits</Text>
            {habits.map((habit) => (
              <ListItem
                key={habit.id}
                title={habit.title}
                subtitle={habit.frequency ? `Frequency: ${habit.frequency}` : undefined}
                onPress={() => handleItemPress(habit)}
                testID={`today-habit-${habit.id}`}
              />
            ))}
          </Box>
        )}

        {/* To-Dos Section */}
        {todos.length > 0 && (
          <Box gap={2}>
            <Text variant="title">To-Dos</Text>
            {todos.map((todo) => (
              <ListItem
                key={todo.id}
                title={todo.title}
                subtitle={
                  todo.due_date
                    ? `Due: ${new Date(todo.due_date).toLocaleDateString()}`
                    : 'No due date'
                }
                onPress={() => handleItemPress(todo)}
                testID={`today-todo-${todo.id}`}
              />
            ))}
          </Box>
        )}

        {/* Quick Add Button (if items exist) */}
        {!isEmpty && (
          <Box mt={3}>
            <Button
              title="Add More"
              variant="neutral"
              onPress={() => openManualAdd()}
              testID="today-add-more"
            />
          </Box>
        )}
      </Box>
    </Screen>
  );
}
