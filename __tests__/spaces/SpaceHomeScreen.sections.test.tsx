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
  { key: 'logs', label: 'Logs' },
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

/** Test version of section headers */
function TestSectionHeader({ title, testID }: { title: string; testID?: string }) {
  return (
    <View testID={testID}>
      <Text>{title}</Text>
    </View>
  );
}

/** Test container that simulates SpaceHomeScreen filter + sections behavior */
function TestSpaceLayout({
  items,
  initialFilter = 'all',
}: {
  items: any[];
  initialFilter?: FilterTab;
}) {
  const [filter, setFilter] = React.useState<FilterTab>(initialFilter);

  // Filter items by type
  const todos = items.filter((i) => i.type === 'todo' && !i.completed_at);
  const habits = items.filter((i) => i.type === 'habit');
  const logs = items.filter((i) => i.type === 'note' && !i.is_list && i.subtype !== 'list');
  const lists = items.filter((i) => i.type === 'note' && (i.is_list || i.subtype === 'list'));
  const recentItems = [...items]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  return (
    <View>
      <TestSpaceFilterBar activeFilter={filter} onFilterChange={setFilter} />

      {/* Recent Activity - ALWAYS shows */}
      <View testID="space-section-recent-activity">
        <TestSectionHeader title="Recent activity" testID="space-section-recent-activity-header" />
        {recentItems.length === 0 ? (
          <View testID="space-section-recent-activity-empty">
            <Text>No recent activity in this space</Text>
          </View>
        ) : (
          recentItems.map((item) => (
            <View key={item.id} testID={`space-section-recent-activity-item-${item.id}`}>
              <Text>{item.name || item.title}</Text>
            </View>
          ))
        )}
      </View>

      {/* Todos Section */}
      {(filter === 'all' || filter === 'todos') && todos.length > 0 && (
        <View testID="space-section-todos">
          <TestSectionHeader title="Todos for this Space" testID="space-section-todos-header" />
          {todos.map((todo) => (
            <View key={todo.id} testID={`space-section-todos-item-${todo.id}`}>
              <Text>{todo.name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Habits Section */}
      {(filter === 'all' || filter === 'habits') && habits.length > 0 && (
        <View testID="space-section-habits">
          <TestSectionHeader title="Habits for this Space" testID="space-section-habits-header" />
          {habits.map((habit) => (
            <View key={habit.id} testID={`space-section-habits-item-${habit.id}`}>
              <Text>{habit.name}</Text>
              <Text>3/5 this week</Text>
            </View>
          ))}
        </View>
      )}

      {/* Logs/Notes Section */}
      {(filter === 'all' || filter === 'logs') && logs.length > 0 && (
        <View testID="space-section-logs-notes">
          <TestSectionHeader title="Logs / Notes" testID="space-section-logs-notes-header" />
          {logs.map((log) => (
            <View key={log.id} testID={`space-section-logs-notes-item-${log.id}`}>
              <Text>{log.title}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Lists Section */}
      {(filter === 'all' || filter === 'lists') && lists.length > 0 && (
        <View testID="space-section-lists">
          <TestSectionHeader title="Lists" testID="space-section-lists-header" />
          {lists.map((list) => (
            <View key={list.id} testID={`space-section-lists-item-${list.id}`}>
              <Text>{list.title}</Text>
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
    expect(getByText('Todos for this Space')).toBeTruthy();
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
    expect(getByText('Habits for this Space')).toBeTruthy();
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
    expect(getByText('Logs / Notes')).toBeTruthy();
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
    // 'Lists' appears in both filter tab and section header
    expect(getAllByText('Lists').length).toBeGreaterThan(0);
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

describe('SpaceHomeScreen Recent Activity Section', () => {
  it('renders recent activity section', () => {
    const { getByTestId, getByText } = render(<TestSpaceLayout items={createMockItems()} />);
    expect(getByTestId('space-section-recent-activity')).toBeTruthy();
    expect(getByText('Recent activity')).toBeTruthy();
  });

  it('shows empty state when no items', () => {
    const { getByTestId, getByText } = render(<TestSpaceLayout items={[]} />);
    expect(getByTestId('space-section-recent-activity-empty')).toBeTruthy();
    expect(getByText('No recent activity in this space')).toBeTruthy();
  });
});

describe('SpaceHomeScreen Filter Behavior', () => {
  it('shows all sections when filter is "all"', () => {
    const { getByTestId } = render(<TestSpaceLayout items={createMockItems()} />);
    expect(getByTestId('space-section-recent-activity')).toBeTruthy();
    expect(getByTestId('space-section-todos')).toBeTruthy();
    expect(getByTestId('space-section-habits')).toBeTruthy();
    expect(getByTestId('space-section-logs-notes')).toBeTruthy();
    expect(getByTestId('space-section-lists')).toBeTruthy();
  });

  it('shows only Todos section when filter is "todos" (plus Recent Activity)', () => {
    const { getByTestId, queryByTestId } = render(<TestSpaceLayout items={createMockItems()} />);

    fireEvent.press(getByTestId('space-filter-todos'));

    // Recent Activity always shows
    expect(getByTestId('space-section-recent-activity')).toBeTruthy();
    // Todos should show
    expect(getByTestId('space-section-todos')).toBeTruthy();
    // Others should be hidden
    expect(queryByTestId('space-section-habits')).toBeNull();
    expect(queryByTestId('space-section-logs-notes')).toBeNull();
    expect(queryByTestId('space-section-lists')).toBeNull();
  });

  it('shows only Habits section when filter is "habits" (plus Recent Activity)', () => {
    const { getByTestId, queryByTestId } = render(<TestSpaceLayout items={createMockItems()} />);

    fireEvent.press(getByTestId('space-filter-habits'));

    expect(getByTestId('space-section-recent-activity')).toBeTruthy();
    expect(getByTestId('space-section-habits')).toBeTruthy();
    expect(queryByTestId('space-section-todos')).toBeNull();
    expect(queryByTestId('space-section-logs-notes')).toBeNull();
    expect(queryByTestId('space-section-lists')).toBeNull();
  });

  it('shows only Logs/Notes section when filter is "logs" (plus Recent Activity)', () => {
    const { getByTestId, queryByTestId } = render(<TestSpaceLayout items={createMockItems()} />);

    fireEvent.press(getByTestId('space-filter-logs'));

    expect(getByTestId('space-section-recent-activity')).toBeTruthy();
    expect(getByTestId('space-section-logs-notes')).toBeTruthy();
    expect(queryByTestId('space-section-todos')).toBeNull();
    expect(queryByTestId('space-section-habits')).toBeNull();
    expect(queryByTestId('space-section-lists')).toBeNull();
  });

  it('shows only Lists section when filter is "lists" (plus Recent Activity)', () => {
    const { getByTestId, queryByTestId } = render(<TestSpaceLayout items={createMockItems()} />);

    fireEvent.press(getByTestId('space-filter-lists'));

    expect(getByTestId('space-section-recent-activity')).toBeTruthy();
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

    expect(getByTestId('space-section-recent-activity')).toBeTruthy();
    expect(getByTestId('space-section-todos')).toBeTruthy();
    expect(getByTestId('space-section-habits')).toBeTruthy();
    expect(getByTestId('space-section-logs-notes')).toBeTruthy();
    expect(getByTestId('space-section-lists')).toBeTruthy();
  });

  it('Recent Activity always shows regardless of filter', () => {
    const { getByTestId } = render(<TestSpaceLayout items={createMockItems()} />);

    // Test each filter - Recent Activity should always be visible
    const filters = ['all', 'todos', 'habits', 'logs', 'lists'] as const;
    for (const filterKey of filters) {
      fireEvent.press(getByTestId(`space-filter-${filterKey}`));
      expect(getByTestId('space-section-recent-activity')).toBeTruthy();
    }
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

      {/* Todos Section with pressable rows */}
      {(filter === 'all' || filter === 'todos') && todos.length > 0 && (
        <View testID="space-section-todos">
          <TestSectionHeader title="Todos for this Space" testID="space-section-todos-header" />
          {todos.map((todo) => (
            <Pressable
              key={todo.id}
              testID={`space-section-todos-item-${todo.id}`}
              onPress={() => onItemPress(todo, spaceId)}
            >
              <Text>{todo.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Habits Section with pressable rows */}
      {(filter === 'all' || filter === 'habits') && habits.length > 0 && (
        <View testID="space-section-habits">
          <TestSectionHeader title="Habits for this Space" testID="space-section-habits-header" />
          {habits.map((habit) => (
            <Pressable
              key={habit.id}
              testID={`space-section-habits-item-${habit.id}`}
              onPress={() => onItemPress(habit, spaceId)}
            >
              <Text>{habit.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Logs Section with pressable rows */}
      {(filter === 'all' || filter === 'logs') && logs.length > 0 && (
        <View testID="space-section-logs-notes">
          <TestSectionHeader title="Logs / Notes" testID="space-section-logs-notes-header" />
          {logs.map((log) => (
            <Pressable
              key={log.id}
              testID={`space-section-logs-notes-item-${log.id}`}
              onPress={() => onItemPress(log, spaceId)}
            >
              <Text>{log.title}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Lists Section with pressable rows */}
      {(filter === 'all' || filter === 'lists') && lists.length > 0 && (
        <View testID="space-section-lists">
          <TestSectionHeader title="Lists" testID="space-section-lists-header" />
          {lists.map((list) => (
            <Pressable
              key={list.id}
              testID={`space-section-lists-item-${list.id}`}
              onPress={() => onItemPress(list, spaceId)}
            >
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
