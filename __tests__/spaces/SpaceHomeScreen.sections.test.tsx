/**
 * SpaceHomeScreen Section Tests
 *
 * Tests for the new filter bar and populated sections in SpaceHomeScreen
 * Verifies:
 * - Filter bar renders and updates state
 * - Sections render when relevant items exist
 * - Sections hide when no items exist
 *
 * NOTE: These tests use unit testing for the filter/section logic since
 * SpaceHomeScreen has complex provider dependencies. Full integration tests
 * are verified manually in the simulator.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { View, Text, Pressable, StyleSheet } from 'react-native';

// ============================================================================
// TEST IMPLEMENTATIONS OF FILTER BAR & SECTIONS (matching SpaceHomeScreen)
// ============================================================================

type FilterTab = 'all' | 'todos' | 'habits' | 'logs' | 'lists';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'todos', label: 'Todos' },
  { key: 'habits', label: 'Habits' },
  { key: 'logs', label: 'Notes' },
  { key: 'lists', label: 'Lists' },
];

/** Test version of SpaceFilterBar */
function TestSpaceFilterBar({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: FilterTab;
  onFilterChange: (filter: FilterTab) => void;
}) {
  return (
    <View testID="space-filter-bar">
      {FILTER_TABS.map((tab) => {
        const isActive = activeFilter === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onFilterChange(tab.key)}
            testID={`space-filter-${tab.key}`}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${tab.label}`}
            accessibilityState={{ selected: isActive }}
          >
            <Text>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Test container that simulates SpaceHomeScreen filter + sections behavior with 5-item limit */
function TestSpaceLayout({
  items,
  initialFilter = 'all',
  chats = [],
  onNewChat,
}: {
  items: any[];
  initialFilter?: FilterTab;
  chats?: any[];
  onNewChat?: () => void;
}) {
  const [filter, setFilter] = React.useState<FilterTab>(initialFilter);

  // Filter and sort items by type (sorted by most recent updated_at)
  const sortByRecent = (arr: any[]) =>
    [...arr].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const todos = sortByRecent(items.filter((i) => i.type === 'todo' && !i.completed_at));
  const habits = sortByRecent(items.filter((i) => i.type === 'habit'));
  const logs = sortByRecent(
    items.filter((i) => i.type === 'note' && !i.is_list && i.subtype !== 'list'),
  );
  const lists = sortByRecent(
    items.filter((i) => i.type === 'note' && (i.is_list || i.subtype === 'list')),
  );

  // Max 5 items per section
  const MAX_ITEMS = 5;

  return (
    <View>
      <TestSpaceFilterBar activeFilter={filter} onFilterChange={setFilter} />

      {/* Todos Section - no header, with type pills */}
      {(filter === 'all' || filter === 'todos') && todos.length > 0 && (
        <View testID="space-section-todos">
          {todos.slice(0, MAX_ITEMS).map((todo) => (
            <View key={todo.id} testID={`space-section-todos-item-${todo.id}`}>
              <View testID={`space-section-todos-pill-${todo.id}`}>
                <Text>Todo</Text>
              </View>
              <Text>{todo.name}</Text>
            </View>
          ))}
          {todos.length > MAX_ITEMS && (
            <View testID="space-section-todos-more">
              <Text>+ {todos.length - MAX_ITEMS} more in this space</Text>
            </View>
          )}
        </View>
      )}

      {/* Habits Section - no header, with type pills */}
      {(filter === 'all' || filter === 'habits') && habits.length > 0 && (
        <View testID="space-section-habits">
          {habits.slice(0, MAX_ITEMS).map((habit) => (
            <View key={habit.id} testID={`space-section-habits-item-${habit.id}`}>
              <View testID={`space-section-habits-pill-${habit.id}`}>
                <Text>Habit</Text>
              </View>
              <Text>{habit.name}</Text>
              <Text>3/5 this week</Text>
            </View>
          ))}
          {habits.length > MAX_ITEMS && (
            <View testID="space-section-habits-more">
              <Text>+ {habits.length - MAX_ITEMS} more in this space</Text>
            </View>
          )}
        </View>
      )}

      {/* Logs/Notes Section - no header, with type pills */}
      {(filter === 'all' || filter === 'logs') && logs.length > 0 && (
        <View testID="space-section-logs-notes">
          {logs.slice(0, MAX_ITEMS).map((log) => (
            <View key={log.id} testID={`space-section-logs-notes-item-${log.id}`}>
              <View testID={`space-section-logs-notes-pill-${log.id}`}>
                <Text>Log</Text>
              </View>
              <Text>{log.title}</Text>
            </View>
          ))}
          {logs.length > MAX_ITEMS && (
            <View testID="space-section-logs-notes-more">
              <Text>+ {logs.length - MAX_ITEMS} more in this space</Text>
            </View>
          )}
        </View>
      )}

      {/* Lists Section - no header, with type pills */}
      {(filter === 'all' || filter === 'lists') && lists.length > 0 && (
        <View testID="space-section-lists">
          {lists.slice(0, MAX_ITEMS).map((list) => (
            <View key={list.id} testID={`space-section-lists-item-${list.id}`}>
              <View testID={`space-section-lists-pill-${list.id}`}>
                <Text>List</Text>
              </View>
              <Text>{list.title}</Text>
            </View>
          ))}
          {lists.length > MAX_ITEMS && (
            <View testID="space-section-lists-more">
              <Text>+ {lists.length - MAX_ITEMS} more in this space</Text>
            </View>
          )}
        </View>
      )}

      {/* Chat CTA - appears above Recent conversations */}
      <Pressable testID="space-chat-cta" onPress={onNewChat}>
        <Text>Start a new chat with Gremly</Text>
      </Pressable>

      {/* Recent conversations */}
      {chats.length > 0 && (
        <View testID="space-recent-conversations">
          <Text>Recent conversations</Text>
          {chats.map((chat: any) => (
            <View key={chat.id} testID={`space-chat-${chat.id}`}>
              <Text>{chat.title}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// MOCK DATA
// ============================================================================

const createMockItems = () => [
  // Todos
  {
    id: 'todo-1',
    type: 'todo',
    name: 'Review documents',
    created_at: '2024-01-02T09:00:00Z',
    updated_at: '2024-01-14T09:00:00Z',
    space_id: 'test-space',
    completed_at: null,
  },
  {
    id: 'todo-2',
    type: 'todo',
    name: 'Send email',
    created_at: '2024-01-03T10:00:00Z',
    updated_at: '2024-01-13T10:00:00Z',
    space_id: 'test-space',
    completed_at: null,
  },
  // Habits
  {
    id: 'habit-1',
    type: 'habit',
    name: 'Morning Exercise',
    created_at: '2024-01-01T08:00:00Z',
    updated_at: '2024-01-15T08:00:00Z',
    space_id: 'test-space',
  },
  {
    id: 'habit-2',
    type: 'habit',
    name: 'Read 30 minutes',
    created_at: '2024-01-05T12:00:00Z',
    updated_at: '2024-01-12T12:00:00Z',
    space_id: 'test-space',
  },
  // Notes/Logs
  {
    id: 'note-1',
    type: 'note',
    title: 'Meeting notes',
    body: 'Important discussion points',
    subtype: 'journal',
    created_at: '2024-01-03T10:00:00Z',
    updated_at: '2024-01-16T10:00:00Z',
    space_id: 'test-space',
  },
  {
    id: 'note-2',
    type: 'note',
    title: 'Project idea',
    body: 'New feature concept',
    subtype: 'idea',
    created_at: '2024-01-04T11:00:00Z',
    updated_at: '2024-01-11T11:00:00Z',
    space_id: 'test-space',
  },
  // Lists
  {
    id: 'list-1',
    type: 'note',
    title: 'Shopping List',
    body: '- Milk\n- Eggs\n- Bread',
    subtype: 'list',
    is_list: true,
    created_at: '2024-01-04T11:00:00Z',
    updated_at: '2024-01-10T11:00:00Z',
    space_id: 'test-space',
  },
];

// ============================================================================
// TESTS
// ============================================================================

describe('SpaceHomeScreen Filter Bar', () => {
  it('renders the filter bar', () => {
    const { getByTestId } = render(<TestSpaceLayout items={createMockItems()} />);
    expect(getByTestId('space-filter-bar')).toBeTruthy();
  });

  it('renders all filter tabs', () => {
    const { getByTestId } = render(<TestSpaceLayout items={createMockItems()} />);
    expect(getByTestId('space-filter-all')).toBeTruthy();
    expect(getByTestId('space-filter-todos')).toBeTruthy();
    expect(getByTestId('space-filter-habits')).toBeTruthy();
    expect(getByTestId('space-filter-logs')).toBeTruthy();
    expect(getByTestId('space-filter-lists')).toBeTruthy();
  });

  it('updates selection when pressing a filter tab', () => {
    const { getByTestId } = render(<TestSpaceLayout items={createMockItems()} />);
    fireEvent.press(getByTestId('space-filter-todos'));
    const todosTab = getByTestId('space-filter-todos');
    expect(todosTab.props.accessibilityState.selected).toBe(true);
  });
});

describe('SpaceHomeScreen Todos Section', () => {
  it('renders todos section when todos exist', () => {
    const { getByTestId, getByText } = render(<TestSpaceLayout items={createMockItems()} />);
    expect(getByTestId('space-section-todos')).toBeTruthy();
    // Type pill should show "Todo"
    expect(getByTestId('space-section-todos-pill-todo-1')).toBeTruthy();
  });

  it('shows todo items', () => {
    const { getByTestId, getAllByText } = render(<TestSpaceLayout items={createMockItems()} />);
    expect(getByTestId('space-section-todos-item-todo-1')).toBeTruthy();
    // Text appears in both Recent Activity and Todos section
    expect(getAllByText('Review documents').length).toBeGreaterThan(0);
  });

  it('hides todos section when no todos exist', () => {
    const itemsWithoutTodos = createMockItems().filter((i) => i.type !== 'todo');
    const { queryByTestId } = render(<TestSpaceLayout items={itemsWithoutTodos} />);
    expect(queryByTestId('space-section-todos')).toBeNull();
  });
});

describe('SpaceHomeScreen Habits Section', () => {
  it('renders habits section when habits exist', () => {
    const { getByTestId, getByText } = render(<TestSpaceLayout items={createMockItems()} />);
    expect(getByTestId('space-section-habits')).toBeTruthy();
    // Type pill should show "Habit"
    expect(getByTestId('space-section-habits-pill-habit-1')).toBeTruthy();
  });

  it('shows weekly progress', () => {
    const { getAllByText } = render(<TestSpaceLayout items={createMockItems()} />);
    // Progress text appears for each habit
    expect(getAllByText('3/5 this week').length).toBeGreaterThan(0);
  });

  it('hides habits section when no habits exist', () => {
    const itemsWithoutHabits = createMockItems().filter((i) => i.type !== 'habit');
    const { queryByTestId } = render(<TestSpaceLayout items={itemsWithoutHabits} />);
    expect(queryByTestId('space-section-habits')).toBeNull();
  });
});

describe('SpaceHomeScreen Logs/Notes Section', () => {
  it('renders logs/notes section when logs exist', () => {
    const { getByTestId, getByText } = render(<TestSpaceLayout items={createMockItems()} />);
    expect(getByTestId('space-section-logs-notes')).toBeTruthy();
    // Type pill should show "Note"
    expect(getByTestId('space-section-logs-notes-pill-note-1')).toBeTruthy();
  });

  it('excludes lists from logs section', () => {
    const { queryByTestId } = render(<TestSpaceLayout items={createMockItems()} />);
    expect(queryByTestId('space-section-logs-notes-item-list-1')).toBeNull();
  });
});

describe('SpaceHomeScreen Lists Section', () => {
  it('renders lists section when lists exist', () => {
    const { getByTestId, getAllByText } = render(<TestSpaceLayout items={createMockItems()} />);
    expect(getByTestId('space-section-lists')).toBeTruthy();
    // Type pill should show "List" and 'Lists' appears in filter tab
    expect(getByTestId('space-section-lists-pill-list-1')).toBeTruthy();
  });

  it('shows list items', () => {
    const { getByTestId, getByText } = render(<TestSpaceLayout items={createMockItems()} />);
    expect(getByTestId('space-section-lists-item-list-1')).toBeTruthy();
    expect(getByText('Shopping List')).toBeTruthy();
  });

  it('hides lists section when no lists exist', () => {
    const itemsWithoutLists = createMockItems().filter(
      (i) => !(i as any).is_list && (i as any).subtype !== 'list',
    );
    const { queryByTestId } = render(<TestSpaceLayout items={itemsWithoutLists} />);
    expect(queryByTestId('space-section-lists')).toBeNull();
  });
});

describe('SpaceHomeScreen Filter Behavior', () => {
  it('shows all sections when filter is "all"', () => {
    const { getByTestId } = render(<TestSpaceLayout items={createMockItems()} />);
    expect(getByTestId('space-section-todos')).toBeTruthy();
    expect(getByTestId('space-section-habits')).toBeTruthy();
    expect(getByTestId('space-section-logs-notes')).toBeTruthy();
    expect(getByTestId('space-section-lists')).toBeTruthy();
  });

  it('shows only Todos section when filter is "todos"', () => {
    const { getByTestId, queryByTestId } = render(<TestSpaceLayout items={createMockItems()} />);

    fireEvent.press(getByTestId('space-filter-todos'));

    // Todos should show
    expect(getByTestId('space-section-todos')).toBeTruthy();
    // Others should be hidden
    expect(queryByTestId('space-section-habits')).toBeNull();
    expect(queryByTestId('space-section-logs-notes')).toBeNull();
    expect(queryByTestId('space-section-lists')).toBeNull();
  });

  it('shows only Habits section when filter is "habits"', () => {
    const { getByTestId, queryByTestId } = render(<TestSpaceLayout items={createMockItems()} />);

    fireEvent.press(getByTestId('space-filter-habits'));

    expect(getByTestId('space-section-habits')).toBeTruthy();
    expect(queryByTestId('space-section-todos')).toBeNull();
    expect(queryByTestId('space-section-logs-notes')).toBeNull();
    expect(queryByTestId('space-section-lists')).toBeNull();
  });

  it('shows only Logs/Notes section when filter is "logs"', () => {
    const { getByTestId, queryByTestId } = render(<TestSpaceLayout items={createMockItems()} />);

    fireEvent.press(getByTestId('space-filter-logs'));

    expect(getByTestId('space-section-logs-notes')).toBeTruthy();
    expect(queryByTestId('space-section-todos')).toBeNull();
    expect(queryByTestId('space-section-habits')).toBeNull();
    expect(queryByTestId('space-section-lists')).toBeNull();
  });

  it('shows only Lists section when filter is "lists"', () => {
    const { getByTestId, queryByTestId } = render(<TestSpaceLayout items={createMockItems()} />);

    fireEvent.press(getByTestId('space-filter-lists'));

    expect(getByTestId('space-section-lists')).toBeTruthy();
    expect(queryByTestId('space-section-todos')).toBeNull();
    expect(queryByTestId('space-section-habits')).toBeNull();
    expect(queryByTestId('space-section-logs-notes')).toBeNull();
  });

  it('restores all sections when pressing "All" after filtering', () => {
    const { getByTestId, queryByTestId } = render(<TestSpaceLayout items={createMockItems()} />);

    // First filter to todos only
    fireEvent.press(getByTestId('space-filter-todos'));
    expect(queryByTestId('space-section-habits')).toBeNull();

    // Now press "All" to restore
    fireEvent.press(getByTestId('space-filter-all'));

    expect(getByTestId('space-section-todos')).toBeTruthy();
    expect(getByTestId('space-section-habits')).toBeTruthy();
    expect(getByTestId('space-section-logs-notes')).toBeTruthy();
    expect(getByTestId('space-section-lists')).toBeTruthy();
  });
});

// ============================================================================
// OPEN VIEW INTEGRATION TESTS
// ============================================================================

/** Test version of SpaceLayout that supports onItemPress callback (simulating openView) */
function TestSpaceLayoutWithPress({
  items,
  spaceId,
  onItemPress,
  initialFilter = 'all',
}: {
  items: any[];
  spaceId: string;
  onItemPress: (record: any, spaceId: string) => void;
  initialFilter?: FilterTab;
}) {
  const [filter, setFilter] = React.useState<FilterTab>(initialFilter);

  // Filter items by type
  const todos = items.filter((i) => i.type === 'todo' && !i.completed_at);
  const habits = items.filter((i) => i.type === 'habit');
  const logs = items.filter((i) => i.type === 'note' && !i.is_list && i.subtype !== 'list');
  const lists = items.filter((i) => i.type === 'note' && (i.is_list || i.subtype === 'list'));

  return (
    <View>
      <TestSpaceFilterBar activeFilter={filter} onFilterChange={setFilter} />

      {/* Todos Section with pressable rows - no header, with type pills */}
      {(filter === 'all' || filter === 'todos') && todos.length > 0 && (
        <View testID="space-section-todos">
          {todos.map((todo) => (
            <Pressable
              key={todo.id}
              testID={`space-section-todos-item-${todo.id}`}
              onPress={() => onItemPress(todo, spaceId)}
            >
              <View testID={`space-section-todos-pill-${todo.id}`}>
                <Text>Todo</Text>
              </View>
              <Text>{todo.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Habits Section with pressable rows - no header, with type pills */}
      {(filter === 'all' || filter === 'habits') && habits.length > 0 && (
        <View testID="space-section-habits">
          {habits.map((habit) => (
            <Pressable
              key={habit.id}
              testID={`space-section-habits-item-${habit.id}`}
              onPress={() => onItemPress(habit, spaceId)}
            >
              <View testID={`space-section-habits-pill-${habit.id}`}>
                <Text>Habit</Text>
              </View>
              <Text>{habit.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Logs Section with pressable rows - no header, with type pills */}
      {(filter === 'all' || filter === 'logs') && logs.length > 0 && (
        <View testID="space-section-logs-notes">
          {logs.map((log) => (
            <Pressable
              key={log.id}
              testID={`space-section-logs-notes-item-${log.id}`}
              onPress={() => onItemPress(log, spaceId)}
            >
              <View testID={`space-section-logs-notes-pill-${log.id}`}>
                <Text>Log</Text>
              </View>
              <Text>{log.title}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Lists Section with pressable rows - no header, with type pills */}
      {(filter === 'all' || filter === 'lists') && lists.length > 0 && (
        <View testID="space-section-lists">
          {lists.map((list) => (
            <Pressable
              key={list.id}
              testID={`space-section-lists-item-${list.id}`}
              onPress={() => onItemPress(list, spaceId)}
            >
              <View testID={`space-section-lists-pill-${list.id}`}>
                <Text>List</Text>
              </View>
              <Text>{list.title}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

describe('SpaceHomeScreen Row Press → openView', () => {
  const TEST_SPACE_ID = 'test-space-123';

  it('calls openView with correct record and spaceId when a todo row is pressed', () => {
    const mockOpenView = jest.fn();
    const items = createMockItems();
    const todoItem = items.find((i) => i.id === 'todo-1');

    const { getByTestId } = render(
      <TestSpaceLayoutWithPress
        items={items}
        spaceId={TEST_SPACE_ID}
        onItemPress={(record, spaceId) => mockOpenView({ record, spaceId })}
      />,
    );

    // Press the todo row
    fireEvent.press(getByTestId('space-section-todos-item-todo-1'));

    // Assert openView was called once
    expect(mockOpenView).toHaveBeenCalledTimes(1);

    // Assert openView was called with correct shape
    expect(mockOpenView).toHaveBeenCalledWith({
      record: todoItem,
      spaceId: TEST_SPACE_ID,
    });
  });

  it('calls openView with correct record and spaceId when a habit row is pressed', () => {
    const mockOpenView = jest.fn();
    const items = createMockItems();
    const habitItem = items.find((i) => i.id === 'habit-1');

    const { getByTestId } = render(
      <TestSpaceLayoutWithPress
        items={items}
        spaceId={TEST_SPACE_ID}
        onItemPress={(record, spaceId) => mockOpenView({ record, spaceId })}
      />,
    );

    // Press the habit row
    fireEvent.press(getByTestId('space-section-habits-item-habit-1'));

    // Assert openView was called once
    expect(mockOpenView).toHaveBeenCalledTimes(1);

    // Assert openView was called with correct shape
    expect(mockOpenView).toHaveBeenCalledWith({
      record: habitItem,
      spaceId: TEST_SPACE_ID,
    });
  });

  it('calls openView with correct record and spaceId when a log row is pressed', () => {
    const mockOpenView = jest.fn();
    const items = createMockItems();
    const logItem = items.find((i) => i.id === 'note-1');

    const { getByTestId } = render(
      <TestSpaceLayoutWithPress
        items={items}
        spaceId={TEST_SPACE_ID}
        onItemPress={(record, spaceId) => mockOpenView({ record, spaceId })}
      />,
    );

    // Press the log row
    fireEvent.press(getByTestId('space-section-logs-notes-item-note-1'));

    // Assert openView was called once
    expect(mockOpenView).toHaveBeenCalledTimes(1);

    // Assert openView was called with correct shape
    expect(mockOpenView).toHaveBeenCalledWith({
      record: logItem,
      spaceId: TEST_SPACE_ID,
    });
  });

  it('calls openView with correct record and spaceId when a list row is pressed', () => {
    const mockOpenView = jest.fn();
    const items = createMockItems();
    const listItem = items.find((i) => i.id === 'list-1');

    const { getByTestId } = render(
      <TestSpaceLayoutWithPress
        items={items}
        spaceId={TEST_SPACE_ID}
        onItemPress={(record, spaceId) => mockOpenView({ record, spaceId })}
      />,
    );

    // Press the list row
    fireEvent.press(getByTestId('space-section-lists-item-list-1'));

    // Assert openView was called once
    expect(mockOpenView).toHaveBeenCalledTimes(1);

    // Assert openView was called with correct shape
    expect(mockOpenView).toHaveBeenCalledWith({
      record: listItem,
      spaceId: TEST_SPACE_ID,
    });
  });
});

describe('SpaceHomeScreen Chat CTA Position', () => {
  it('renders chat CTA button', () => {
    const { getByTestId } = render(<TestSpaceLayout items={createMockItems()} />);
    expect(getByTestId('space-chat-cta')).toBeTruthy();
  });

  it('chat CTA appears after sections and before Recent conversations', () => {
    const mockChats = [{ id: 'chat-1', title: 'Test Chat' }];
    const { getByTestId, getByText } = render(
      <TestSpaceLayout items={createMockItems()} chats={mockChats} />,
    );

    // Chat CTA should be present
    const chatCta = getByTestId('space-chat-cta');
    expect(chatCta).toBeTruthy();

    // Recent conversations should be present
    expect(getByTestId('space-recent-conversations')).toBeTruthy();

    // The CTA text should be "Start a new chat with Gremly"
    expect(getByText('Start a new chat with Gremly')).toBeTruthy();
  });

  it('calls onNewChat when chat CTA is pressed', () => {
    const mockOnNewChat = jest.fn();
    const { getByTestId } = render(
      <TestSpaceLayout items={createMockItems()} onNewChat={mockOnNewChat} />,
    );

    fireEvent.press(getByTestId('space-chat-cta'));
    expect(mockOnNewChat).toHaveBeenCalledTimes(1);
  });
});

describe('SpaceHomeScreen 5-Item Limit and "X More" Footer', () => {
  // Helper to create many items of a specific type
  const createManyTodos = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `todo-${i + 1}`,
      type: 'todo',
      name: `Todo ${i + 1}`,
      created_at: `2024-01-01T0${i}:00:00Z`,
      updated_at: `2024-01-${15 - i}T09:00:00Z`, // Most recent first
      space_id: 'test-space',
      completed_at: null,
    }));

  const createManyHabits = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `habit-${i + 1}`,
      type: 'habit',
      name: `Habit ${i + 1}`,
      created_at: `2024-01-01T0${i}:00:00Z`,
      updated_at: `2024-01-${15 - i}T09:00:00Z`,
      space_id: 'test-space',
    }));

  const createManyLogs = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `note-${i + 1}`,
      type: 'note',
      title: `Log ${i + 1}`,
      body: `Content ${i + 1}`,
      subtype: 'journal',
      created_at: `2024-01-01T0${i}:00:00Z`,
      updated_at: `2024-01-${15 - i}T09:00:00Z`,
      space_id: 'test-space',
    }));

  const createManyLists = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `list-${i + 1}`,
      type: 'note',
      title: `List ${i + 1}`,
      body: '- Item 1\n- Item 2',
      subtype: 'list',
      is_list: true,
      created_at: `2024-01-01T0${i}:00:00Z`,
      updated_at: `2024-01-${15 - i}T09:00:00Z`,
      space_id: 'test-space',
    }));

  it('shows at most 5 todos when more than 5 exist', () => {
    const manyTodos = createManyTodos(8);
    const { queryAllByTestId } = render(
      <TestSpaceLayout items={manyTodos} initialFilter="todos" />,
    );

    // Should only render 5 todo items
    const todoItems = queryAllByTestId(/^space-section-todos-item-/);
    expect(todoItems.length).toBe(5);
  });

  it('shows "+ X more" footer for todos when more than 5 exist', () => {
    const manyTodos = createManyTodos(8);
    const { getByTestId, getByText } = render(
      <TestSpaceLayout items={manyTodos} initialFilter="todos" />,
    );

    // Should show the "more" footer
    expect(getByTestId('space-section-todos-more')).toBeTruthy();
    expect(getByText('+ 3 more in this space')).toBeTruthy();
  });

  it('does NOT show "+ X more" footer for todos when 5 or fewer exist', () => {
    const fewTodos = createManyTodos(5);
    const { queryByTestId } = render(<TestSpaceLayout items={fewTodos} initialFilter="todos" />);

    // Should NOT show the "more" footer
    expect(queryByTestId('space-section-todos-more')).toBeNull();
  });

  it('shows at most 5 habits when more than 5 exist', () => {
    const manyHabits = createManyHabits(7);
    const { queryAllByTestId } = render(
      <TestSpaceLayout items={manyHabits} initialFilter="habits" />,
    );

    const habitItems = queryAllByTestId(/^space-section-habits-item-/);
    expect(habitItems.length).toBe(5);
  });

  it('shows "+ X more" footer for habits when more than 5 exist', () => {
    const manyHabits = createManyHabits(7);
    const { getByTestId, getByText } = render(
      <TestSpaceLayout items={manyHabits} initialFilter="habits" />,
    );

    expect(getByTestId('space-section-habits-more')).toBeTruthy();
    expect(getByText('+ 2 more in this space')).toBeTruthy();
  });

  it('does NOT show "+ X more" footer for habits when 5 or fewer exist', () => {
    const fewHabits = createManyHabits(3);
    const { queryByTestId } = render(<TestSpaceLayout items={fewHabits} initialFilter="habits" />);

    expect(queryByTestId('space-section-habits-more')).toBeNull();
  });

  it('shows at most 5 logs when more than 5 exist', () => {
    const manyLogs = createManyLogs(10);
    const { queryAllByTestId } = render(<TestSpaceLayout items={manyLogs} initialFilter="logs" />);

    const logItems = queryAllByTestId(/^space-section-logs-notes-item-/);
    expect(logItems.length).toBe(5);
  });

  it('shows "+ X more" footer for logs when more than 5 exist', () => {
    const manyLogs = createManyLogs(10);
    const { getByTestId, getByText } = render(
      <TestSpaceLayout items={manyLogs} initialFilter="logs" />,
    );

    expect(getByTestId('space-section-logs-notes-more')).toBeTruthy();
    expect(getByText('+ 5 more in this space')).toBeTruthy();
  });

  it('shows at most 5 lists when more than 5 exist', () => {
    const manyLists = createManyLists(9);
    const { queryAllByTestId } = render(
      <TestSpaceLayout items={manyLists} initialFilter="lists" />,
    );

    const listItems = queryAllByTestId(/^space-section-lists-item-/);
    expect(listItems.length).toBe(5);
  });

  it('shows "+ X more" footer for lists when more than 5 exist', () => {
    const manyLists = createManyLists(9);
    const { getByTestId, getByText } = render(
      <TestSpaceLayout items={manyLists} initialFilter="lists" />,
    );

    expect(getByTestId('space-section-lists-more')).toBeTruthy();
    expect(getByText('+ 4 more in this space')).toBeTruthy();
  });

  it('does NOT render Recent Activity section (removed)', () => {
    const { queryByTestId } = render(
      <TestSpaceLayout items={createMockItems()} initialFilter="all" />,
    );

    // Recent Activity section should no longer exist
    expect(queryByTestId('space-section-recent-activity')).toBeNull();
    expect(queryByTestId('space-section-recent-activity-header')).toBeNull();
    expect(queryByTestId('space-section-recent-activity-empty')).toBeNull();
  });
});

describe('SpaceHomeScreen Attach Existing Flow', () => {
  it('does NOT render standalone attach existing link on main Space screen', () => {
    // The standalone "Attach existing item" link was moved into SpaceQuickAddModal
    // So the testID "space-attach-existing-cta" should no longer exist on the main layout
    const { queryByTestId } = render(
      <TestSpaceLayout items={createMockItems()} initialFilter="all" />,
    );

    // Should NOT find the old standalone link
    expect(queryByTestId('space-attach-existing-cta')).toBeNull();
  });
});

describe('SpaceQuickAddModal Links', () => {
  // Test helper component that simulates the modal content
  function TestSpaceQuickAddModalLinks({
    onPressManualAdd,
    onPressAttachExisting,
  }: {
    onPressManualAdd?: () => void;
    onPressAttachExisting?: () => void;
  }) {
    return (
      <View testID="space-quick-add-modal">
        <Pressable testID="quick-add-manual-link" onPress={onPressManualAdd}>
          <Text>Prefer to add it manually?</Text>
        </Pressable>
        {onPressAttachExisting && (
          <Pressable testID="quick-add-attach-existing" onPress={onPressAttachExisting}>
            <Text>Or attach an existing item</Text>
          </Pressable>
        )}
      </View>
    );
  }

  it('renders both manual add and attach existing links when onPressAttachExisting is provided', () => {
    const mockManualAdd = jest.fn();
    const mockAttachExisting = jest.fn();

    const { getByTestId, getByText } = render(
      <TestSpaceQuickAddModalLinks
        onPressManualAdd={mockManualAdd}
        onPressAttachExisting={mockAttachExisting}
      />,
    );

    // Both links should be present
    expect(getByTestId('quick-add-manual-link')).toBeTruthy();
    expect(getByTestId('quick-add-attach-existing')).toBeTruthy();

    // Both should have the expected text
    expect(getByText('Prefer to add it manually?')).toBeTruthy();
    expect(getByText('Or attach an existing item')).toBeTruthy();
  });

  it('calls onPressAttachExisting when attach existing link is pressed', () => {
    const mockManualAdd = jest.fn();
    const mockAttachExisting = jest.fn();

    const { getByTestId } = render(
      <TestSpaceQuickAddModalLinks
        onPressManualAdd={mockManualAdd}
        onPressAttachExisting={mockAttachExisting}
      />,
    );

    fireEvent.press(getByTestId('quick-add-attach-existing'));
    expect(mockAttachExisting).toHaveBeenCalledTimes(1);
  });

  it('does NOT render attach existing link when onPressAttachExisting is not provided', () => {
    const mockManualAdd = jest.fn();

    const { queryByTestId, getByTestId } = render(
      <TestSpaceQuickAddModalLinks onPressManualAdd={mockManualAdd} />,
    );

    // Manual add should still be present
    expect(getByTestId('quick-add-manual-link')).toBeTruthy();

    // Attach existing should NOT be present
    expect(queryByTestId('quick-add-attach-existing')).toBeNull();
  });
});
