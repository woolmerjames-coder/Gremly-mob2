/**
 * PeopleView.test.tsx
 *
 * Tests for the PeopleView component.
 * Validates: empty state, people grouping from views.people,
 * item counts by type, sorting by itemCount, person detail view,
 * and onItemPress callback.
 *
 * Hub V2 (Feb 2026)
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock lucide icons
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return {
    ChevronRight: (props: any) => <View testID="chevron-right" {...props} />,
    User: (props: any) => <View testID="icon-user" {...props} />,
    Users: (props: any) => <View testID="icon-users" {...props} />,
    X: (props: any) => <View testID="icon-x" {...props} />,
  };
});

// Store mock data
let mockTodos: any[] = [];
let mockHabits: any[] = [];
let mockNotes: any[] = [];

jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: (state: any) => any) => {
    const state = {
      todos: mockTodos,
      habits: mockHabits,
      notes: mockNotes,
    };
    return selector(state);
  },
}));

import PeopleView from '../PeopleView';

describe('PeopleView', () => {
  const mockOnItemPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockTodos = [];
    mockHabits = [];
    mockNotes = [];
  });

  describe('empty state', () => {
    it('shows "No people discovered yet" when no items have people', () => {
      const { getByText } = render(<PeopleView onItemPress={mockOnItemPress} />);
      expect(getByText('No people discovered yet')).toBeTruthy();
    });

    it('shows hint about mentioning people in a drop', () => {
      const { getByText } = render(<PeopleView onItemPress={mockOnItemPress} />);
      expect(getByText(/Mention someone in a drop/)).toBeTruthy();
    });
  });

  describe('people list', () => {
    beforeEach(() => {
      mockTodos = [
        {
          id: 'todo-1',
          type: 'todo',
          name: 'Call Alice',
          owner_id: 'u1',
          created_at: '2026-02-01T10:00:00Z',
          updated_at: '2026-02-01T10:00:00Z',
          archived: false,
          views: { people: ['Alice'] },
        },
        {
          id: 'todo-2',
          type: 'todo',
          name: 'Email Bob',
          owner_id: 'u1',
          created_at: '2026-02-01T10:00:00Z',
          updated_at: '2026-02-01T10:00:00Z',
          archived: false,
          views: { people: ['Bob'] },
        },
        {
          id: 'todo-3',
          type: 'todo',
          name: 'Meet Bob',
          owner_id: 'u1',
          created_at: '2026-02-02T10:00:00Z',
          updated_at: '2026-02-02T10:00:00Z',
          archived: false,
          views: { people: ['Bob'] },
        },
      ];
    });

    it('shows people count label', () => {
      const { getByText } = render(<PeopleView onItemPress={mockOnItemPress} />);
      expect(getByText(/2 people mentioned/)).toBeTruthy();
    });

    it('renders each person name', () => {
      const { getByText } = render(<PeopleView onItemPress={mockOnItemPress} />);
      expect(getByText('Alice')).toBeTruthy();
      expect(getByText('Bob')).toBeTruthy();
    });

    it('sorts people by item count (most mentioned first)', () => {
      const { getAllByText } = render(<PeopleView onItemPress={mockOnItemPress} />);
      // Bob has 2 items, Alice has 1 — Bob should come first
      // We check the order by looking at the rendered text
      const allText = getAllByText(/Bob|Alice/);
      expect(allText[0].props.children).toBe('Bob');
      expect(allText[1].props.children).toBe('Alice');
    });

    it('shows item type counts for each person', () => {
      const { getByText } = render(<PeopleView onItemPress={mockOnItemPress} />);
      expect(getByText('2 to-dos')).toBeTruthy(); // Bob
      expect(getByText('1 to-do')).toBeTruthy(); // Alice
    });

    it('shows singular count labels correctly', () => {
      const { getByText } = render(<PeopleView onItemPress={mockOnItemPress} />);
      expect(getByText('1 to-do')).toBeTruthy();
    });

    it('ignores archived items', () => {
      mockTodos = [
        {
          id: 'todo-archived',
          type: 'todo',
          name: 'Archived call',
          owner_id: 'u1',
          created_at: '2026-02-01T10:00:00Z',
          updated_at: '2026-02-01T10:00:00Z',
          archived: true,
          views: { people: ['Ghost'] },
        },
      ];

      const { getByText } = render(<PeopleView onItemPress={mockOnItemPress} />);
      expect(getByText('No people discovered yet')).toBeTruthy();
    });
  });

  describe('person detail view', () => {
    beforeEach(() => {
      mockTodos = [
        {
          id: 'todo-1',
          type: 'todo',
          name: 'Call Alice',
          owner_id: 'u1',
          created_at: '2026-02-01T10:00:00Z',
          updated_at: '2026-02-01T10:00:00Z',
          archived: false,
          views: { people: ['Alice'] },
        },
        {
          id: 'todo-2',
          type: 'todo',
          name: 'Email Alice',
          owner_id: 'u1',
          created_at: '2026-02-02T10:00:00Z',
          updated_at: '2026-02-02T10:00:00Z',
          archived: false,
          views: { people: ['Alice'] },
        },
      ];
    });

    it('shows detail view when a person is tapped', () => {
      const { getByText } = render(<PeopleView onItemPress={mockOnItemPress} />);

      // Tap Alice
      fireEvent.press(getByText('Alice'));

      // Should show items
      expect(getByText('Call Alice')).toBeTruthy();
      expect(getByText('Email Alice')).toBeTruthy();
    });

    it('shows item count in detail header', () => {
      const { getByText } = render(<PeopleView onItemPress={mockOnItemPress} />);
      fireEvent.press(getByText('Alice'));
      expect(getByText('2 items')).toBeTruthy();
    });

    it('calls onItemPress when an item is tapped in detail view', () => {
      const { getByText } = render(<PeopleView onItemPress={mockOnItemPress} />);
      fireEvent.press(getByText('Alice'));
      fireEvent.press(getByText('Call Alice'));
      expect(mockOnItemPress).toHaveBeenCalledTimes(1);
      expect(mockOnItemPress).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'todo-1' }),
      );
    });

    it('shows type labels for items', () => {
      const { getByText, getAllByText } = render(<PeopleView onItemPress={mockOnItemPress} />);
      fireEvent.press(getByText('Alice'));
      const todoLabels = getAllByText('To-Do');
      expect(todoLabels.length).toBe(2);
    });
  });

  describe('multi-type people', () => {
    it('counts todos, habits, and notes separately', () => {
      mockTodos = [
        {
          id: 'todo-1',
          type: 'todo',
          name: 'Call Dana',
          owner_id: 'u1',
          created_at: '2026-02-01T10:00:00Z',
          updated_at: '2026-02-01T10:00:00Z',
          archived: false,
          views: { people: ['Dana'] },
        },
      ];
      mockHabits = [
        {
          id: 'habit-1',
          type: 'habit',
          name: 'Exercise with Dana',
          owner_id: 'u1',
          created_at: '2026-02-01T10:00:00Z',
          updated_at: '2026-02-01T10:00:00Z',
          archived: false,
          views: { people: ['Dana'] },
        },
      ];
      mockNotes = [
        {
          id: 'note-1',
          type: 'note',
          title: 'Lunch with Dana',
          body: 'Lunch with Dana',
          owner_id: 'u1',
          created_at: '2026-02-01T10:00:00Z',
          updated_at: '2026-02-01T10:00:00Z',
          archived: false,
          views: { people: ['Dana'] },
        },
      ];

      const { getByText } = render(<PeopleView onItemPress={mockOnItemPress} />);
      expect(getByText('1 to-do')).toBeTruthy();
      expect(getByText('1 habit')).toBeTruthy();
      expect(getByText('1 note')).toBeTruthy();
    });
  });
});
