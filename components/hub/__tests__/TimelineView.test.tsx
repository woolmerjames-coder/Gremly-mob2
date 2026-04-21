/**
 * TimelineView.test.tsx
 *
 * Tests for the TimelineView component.
 * Validates: empty state, date-based grouping, Today/Yesterday labels,
 * type filter pills, item rendering, and onItemPress callback.
 *
 * Hub V2 (Feb 2026)
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock lucide icons
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        return (props: any) => <View testID={`icon-${String(prop)}`} {...props} />;
      },
    },
  );
});

// Mock getDateService
const TODAY_KEY = '2026-02-10';
jest.mock('../../../lib/date', () => ({
  getDateService: () => ({
    today: () => TODAY_KEY,
    now: () => new Date('2026-02-10T12:00:00'),
    extractLocalDate: (isoString: string) => isoString.split('T')[0] ?? '',
    toLocalDate: (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    },
    daysBetween: (dateKey: string, todayKey: string) => {
      const a = new Date(dateKey).getTime();
      const b = new Date(todayKey).getTime();
      return Math.round(Math.abs(b - a) / 86_400_000);
    },
  }),
}));

// Store mock data
let mockTodos: any[] = [];
let mockHabits: any[] = [];
let mockNotes: any[] = [];
let mockSpaces: any[] = [];

jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: (state: any) => any) => {
    const state = {
      todos: mockTodos,
      habits: mockHabits,
      notes: mockNotes,
      spaces: mockSpaces,
    };
    return selector(state);
  },
}));

import TimelineView from '../TimelineView';

describe('TimelineView', () => {
  const mockOnItemPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockTodos = [];
    mockHabits = [];
    mockNotes = [];
    mockSpaces = [];
  });

  describe('empty state', () => {
    it('shows "No items yet" when store is empty', () => {
      const { getByText } = render(<TimelineView onItemPress={mockOnItemPress} />);
      expect(getByText('No items yet')).toBeTruthy();
    });

    it('shows hint to drop a thought', () => {
      const { getByText } = render(<TimelineView onItemPress={mockOnItemPress} />);
      expect(getByText('Drop a thought to get started')).toBeTruthy();
    });
  });

  describe('filter pills', () => {
    it('renders All, Todos, Habits, Notes filter chips', () => {
      const { getByText } = render(<TimelineView onItemPress={mockOnItemPress} />);
      expect(getByText('All')).toBeTruthy();
      expect(getByText('Todos')).toBeTruthy();
      expect(getByText('Habits')).toBeTruthy();
      expect(getByText('Notes')).toBeTruthy();
    });

    it('shows correct count badges on filter chips', () => {
      mockTodos = [
        {
          id: 'todo-1',
          type: 'todo',
          name: 'Buy milk',
          owner_id: 'u1',
          created_at: `${TODAY_KEY}T10:00:00Z`,
          archived: false,
          tags: [],
        },
      ];
      mockNotes = [
        {
          id: 'note-1',
          type: 'note',
          title: 'My note',
          body: 'My note body',
          owner_id: 'u1',
          created_at: `${TODAY_KEY}T09:00:00Z`,
          archived: false,
          tags: [],
        },
      ];

      const { getAllByText } = render(<TimelineView onItemPress={mockOnItemPress} />);
      // Count badges appear on filter chips — at least one shows "1"
      const ones = getAllByText('1');
      expect(ones.length).toBeGreaterThanOrEqual(1);
    });

    it('filters items when a type chip is pressed', () => {
      mockTodos = [
        {
          id: 'todo-1',
          type: 'todo',
          name: 'Buy milk',
          owner_id: 'u1',
          created_at: `${TODAY_KEY}T10:00:00Z`,
          archived: false,
          tags: [],
        },
      ];
      mockNotes = [
        {
          id: 'note-1',
          type: 'note',
          title: 'My note',
          body: 'My note body',
          owner_id: 'u1',
          created_at: `${TODAY_KEY}T09:00:00Z`,
          archived: false,
          tags: [],
        },
      ];

      const { getByText, queryByText } = render(<TimelineView onItemPress={mockOnItemPress} />);

      // Tap "Todos" filter
      fireEvent.press(getByText('Todos'));

      // Should show todo but not note
      expect(getByText('Buy milk')).toBeTruthy();
      expect(queryByText('My note')).toBeNull();
    });
  });

  describe('day grouping', () => {
    it('groups today items under "Today" label', () => {
      mockTodos = [
        {
          id: 'todo-1',
          type: 'todo',
          name: 'Today task',
          owner_id: 'u1',
          created_at: `${TODAY_KEY}T10:00:00Z`,
          archived: false,
          tags: [],
        },
      ];

      const { getByText } = render(<TimelineView onItemPress={mockOnItemPress} />);
      expect(getByText('Today')).toBeTruthy();
      expect(getByText('Today task')).toBeTruthy();
    });

    it('groups yesterday items under "Yesterday" label', () => {
      mockTodos = [
        {
          id: 'todo-1',
          type: 'todo',
          name: 'Yesterday task',
          owner_id: 'u1',
          created_at: '2026-02-09T10:00:00Z',
          archived: false,
          tags: [],
        },
      ];

      const { getByText } = render(<TimelineView onItemPress={mockOnItemPress} />);
      expect(getByText('Yesterday')).toBeTruthy();
      expect(getByText('Yesterday task')).toBeTruthy();
    });

    it('shows item count per day group', () => {
      mockTodos = [
        {
          id: 'todo-1',
          type: 'todo',
          name: 'Task A',
          owner_id: 'u1',
          created_at: `${TODAY_KEY}T10:00:00Z`,
          archived: false,
          tags: [],
        },
        {
          id: 'todo-2',
          type: 'todo',
          name: 'Task B',
          owner_id: 'u1',
          created_at: `${TODAY_KEY}T09:00:00Z`,
          archived: false,
          tags: [],
        },
      ];

      const { getAllByText } = render(<TimelineView onItemPress={mockOnItemPress} />);
      // At least one element displays the count "2" (day group header)
      const twos = getAllByText('2');
      expect(twos.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('item interaction', () => {
    it('calls onItemPress with the raw item when tapped', () => {
      const rawTodo = {
        id: 'todo-1',
        type: 'todo',
        name: 'Buy milk',
        owner_id: 'u1',
        created_at: `${TODAY_KEY}T10:00:00Z`,
        archived: false,
        tags: [],
      };
      mockTodos = [rawTodo];

      const { getByText } = render(<TimelineView onItemPress={mockOnItemPress} />);
      fireEvent.press(getByText('Buy milk'));

      expect(mockOnItemPress).toHaveBeenCalledTimes(1);
      expect(mockOnItemPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'todo-1' }));
    });
  });

  describe('archived items', () => {
    it('excludes archived items from the timeline', () => {
      mockTodos = [
        {
          id: 'todo-1',
          type: 'todo',
          name: 'Active task',
          owner_id: 'u1',
          created_at: `${TODAY_KEY}T10:00:00Z`,
          archived: false,
          tags: [],
        },
        {
          id: 'todo-2',
          type: 'todo',
          name: 'Archived task',
          owner_id: 'u1',
          created_at: `${TODAY_KEY}T09:00:00Z`,
          archived: true,
          tags: [],
        },
      ];

      const { getByText, queryByText } = render(<TimelineView onItemPress={mockOnItemPress} />);
      expect(getByText('Active task')).toBeTruthy();
      expect(queryByText('Archived task')).toBeNull();
    });
  });

  describe('multi-type rendering', () => {
    it('renders todos, habits, and notes together', () => {
      mockTodos = [
        {
          id: 'todo-1',
          type: 'todo',
          name: 'My Todo',
          owner_id: 'u1',
          created_at: `${TODAY_KEY}T10:00:00Z`,
          archived: false,
          tags: [],
        },
      ];
      mockHabits = [
        {
          id: 'habit-1',
          type: 'habit',
          name: 'My Habit',
          owner_id: 'u1',
          created_at: `${TODAY_KEY}T09:00:00Z`,
          archived: false,
          tags: [],
        },
      ];
      mockNotes = [
        {
          id: 'note-1',
          type: 'note',
          title: 'My Note',
          body: 'My Note body',
          owner_id: 'u1',
          created_at: `${TODAY_KEY}T08:00:00Z`,
          archived: false,
          tags: [],
        },
      ];

      const { getByText } = render(<TimelineView onItemPress={mockOnItemPress} />);
      expect(getByText('My Todo')).toBeTruthy();
      expect(getByText('My Habit')).toBeTruthy();
      expect(getByText('My Note')).toBeTruthy();
    });
  });
});
