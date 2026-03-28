/**
 * TodayDSPlayground - Preview for DS-only Today screen
 * Shows mocked data for visual testing
 *
 * NOTE: ManualAddSheet removed - use ManualAddOverlay instead
 */

import { Screen, Box, Text, Button } from '../../ui';
import { Card } from '../../design-system/Card';
import { ListItem } from '../../design-system/ListItem';
import { getDateService, nowTimestamp } from '../../lib/date/DateService';
// import { openManualAdd } from '../../components/ManualAddSheet'; // DEPRECATED - removed

// Mock data
const mockHabits = [
  {
    id: 'habit-1',
    type: 'habit' as const,
    title: 'Morning Run',
    frequency: 'daily',
    created_at: nowTimestamp(),
    updated_at: nowTimestamp(),
    owner_id: 'user-1',
  },
  {
    id: 'habit-2',
    type: 'habit' as const,
    title: 'Read for 30 minutes',
    frequency: 'daily',
    created_at: nowTimestamp(),
    updated_at: nowTimestamp(),
    owner_id: 'user-1',
  },
];

const mockTodos = [
  {
    id: 'todo-1',
    type: 'todo' as const,
    title: 'Buy groceries',
    due_date: nowTimestamp(),
    undefined_due: false,
    created_at: nowTimestamp(),
    updated_at: nowTimestamp(),
    owner_id: 'user-1',
  },
  {
    id: 'todo-2',
    type: 'todo' as const,
    title: 'Call dentist',
    due_date: null,
    undefined_due: true,
    created_at: nowTimestamp(),
    updated_at: nowTimestamp(),
    owner_id: 'user-1',
  },
];

export default function TodayDSPlayground() {
  const handleItemPress = (id: string) => {
    console.log('[TodayDSPlayground] Item pressed:', id);
  };

  return (
    <Screen title="Today (Preview)" scroll padded testID="today-screen">
      <Box gap={3}>
        {/* Due Habits Section */}
        <Box gap={2}>
          <Text variant="title">Due Habits</Text>
          {mockHabits.map((habit) => (
            <ListItem
              key={habit.id}
              title={habit.title}
              subtitle={`Frequency: ${habit.frequency}`}
              onPress={() => handleItemPress(habit.id)}
              testID={`today-habit-${habit.id}`}
            />
          ))}
        </Box>

        {/* To-Dos Section */}
        <Box gap={2}>
          <Text variant="title">To-Dos</Text>
          {mockTodos.map((todo) => (
            <ListItem
              key={todo.id}
              title={todo.title}
              subtitle={
                todo.due_date
                  ? `Due: ${getDateService().formatForChip(getDateService().toLocalDate(new Date(todo.due_date)))}`
                  : 'No due date'
              }
              onPress={() => handleItemPress(todo.id)}
              testID={`today-todo-${todo.id}`}
            />
          ))}
        </Box>

        {/* Quick Add Button */}
        <Box mt={3}>
          <Button
            title="Add More"
            variant="neutral"
            onPress={() => console.log('TODO: Open ManualAddOverlay')}
            testID="today-add-more"
          />
        </Box>

        {/* Empty State Preview */}
        <Box mt={4} gap={2}>
          <Text variant="title">Empty State Preview:</Text>
          <Card>
            <Box p={4} gap={3} style={{ alignItems: 'center' }}>
              <Text variant="title" style={{ textAlign: 'center' }}>
                You're all set! 🎉
              </Text>
              <Text variant="body" style={{ textAlign: 'center' }}>
                No items due today. Add something to get started.
              </Text>
              <Button
                title="Add Item"
                onPress={() => console.log('TODO: Open ManualAddOverlay')}
                testID="today-empty-add"
              />
            </Box>
          </Card>
        </Box>
      </Box>
    </Screen>
  );
}
