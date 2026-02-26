/**
 * Tests for NotificationQuickActionSheet
 *
 * Tests the bottom sheet that appears when user taps an entity-reminder
 * notification. Covers visibility gates, helper functions, and callbacks.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NotificationQuickActionSheet } from '../NotificationQuickActionSheet';

// Mock lucide-react-native icons
jest.mock('lucide-react-native', () => ({
  Check: () => null,
}));

// Mock useGremlyStore
const mockTodos = [
  {
    id: 'todo-1',
    type: 'todo',
    title: 'Buy groceries',
    due_day: null,
    space_id: null,
  },
  {
    id: 'todo-2',
    type: 'todo',
    title: 'Submit report',
    due_day: '2099-06-15',
    space_id: 'space-1',
  },
];

const mockHabits = [
  {
    id: 'habit-1',
    type: 'habit',
    name: 'Meditate',
    due_day: null,
    space_id: null,
  },
];

const mockSpaces = [{ id: 'space-1', name: 'Work' }];

jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: (state: any) => any) => {
    const state = {
      todos: mockTodos,
      habits: mockHabits,
      notes: [],
      spaces: mockSpaces,
    };
    return selector(state);
  },
}));

describe('NotificationQuickActionSheet', () => {
  const defaultProps = {
    visible: true,
    entityId: 'todo-1',
    entityType: 'todo' as const,
    onDismiss: jest.fn(),
    onDone: jest.fn(),
    onSnooze: jest.fn(),
    onOpen: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Visibility gate ─────────────────────────────────────────

  describe('visibility', () => {
    it('renders nothing when visible is false', () => {
      const { toJSON } = render(<NotificationQuickActionSheet {...defaultProps} visible={false} />);
      expect(toJSON()).toBeNull();
    });

    it('renders nothing when entityId is null', () => {
      const { toJSON } = render(<NotificationQuickActionSheet {...defaultProps} entityId={null} />);
      expect(toJSON()).toBeNull();
    });

    it('renders nothing when entityType is null', () => {
      const { toJSON } = render(
        <NotificationQuickActionSheet {...defaultProps} entityType={null} />,
      );
      expect(toJSON()).toBeNull();
    });

    it('renders when visible with valid entityId and entityType', () => {
      const { getByText } = render(<NotificationQuickActionSheet {...defaultProps} />);
      expect(getByText('Buy groceries')).toBeTruthy();
    });
  });

  // ─── Entity lookup & display ──────────────────────────────────

  describe('entity display', () => {
    it('displays todo title', () => {
      const { getByText } = render(
        <NotificationQuickActionSheet {...defaultProps} entityId="todo-1" />,
      );
      expect(getByText('Buy groceries')).toBeTruthy();
    });

    it('displays habit name', () => {
      const { getByText } = render(
        <NotificationQuickActionSheet {...defaultProps} entityId="habit-1" entityType="habit" />,
      );
      expect(getByText('Meditate')).toBeTruthy();
    });

    it('shows fallback "Reminder" for unknown entity', () => {
      const { getByText } = render(
        <NotificationQuickActionSheet {...defaultProps} entityId="unknown-id" />,
      );
      expect(getByText('Reminder')).toBeTruthy();
    });

    it('shows space name in subtitle when entity has space_id', () => {
      const { getByText } = render(
        <NotificationQuickActionSheet {...defaultProps} entityId="todo-2" />,
      );
      expect(getByText(/Work/)).toBeTruthy();
    });
  });

  // ─── Done button visibility ───────────────────────────────────

  describe('Done button', () => {
    it('shows Done button for todo', () => {
      const { getByText } = render(
        <NotificationQuickActionSheet {...defaultProps} entityType="todo" />,
      );
      expect(getByText('Done')).toBeTruthy();
    });

    it('shows Done button for habit', () => {
      const { getByText } = render(
        <NotificationQuickActionSheet {...defaultProps} entityId="habit-1" entityType="habit" />,
      );
      expect(getByText('Done')).toBeTruthy();
    });

    it('does NOT show Done button for event', () => {
      const { queryByText } = render(
        <NotificationQuickActionSheet {...defaultProps} entityId="event-1" entityType="event" />,
      );
      expect(queryByText('Done')).toBeNull();
    });
  });

  // ─── Callback wiring ─────────────────────────────────────────

  describe('callbacks', () => {
    it('calls onDone then onDismiss when Done is pressed', () => {
      const { getByText } = render(<NotificationQuickActionSheet {...defaultProps} />);
      fireEvent.press(getByText('Done'));

      expect(defaultProps.onDone).toHaveBeenCalledWith('todo-1', 'todo');
      expect(defaultProps.onDismiss).toHaveBeenCalled();
    });

    it('calls onSnooze with 900s for 15m pill', () => {
      const { getByText } = render(<NotificationQuickActionSheet {...defaultProps} />);
      fireEvent.press(getByText('15m'));

      expect(defaultProps.onSnooze).toHaveBeenCalledWith('todo-1', 'todo', 900);
      expect(defaultProps.onDismiss).toHaveBeenCalled();
    });

    it('calls onSnooze with 3600s for 1hr pill', () => {
      const { getByText } = render(<NotificationQuickActionSheet {...defaultProps} />);
      fireEvent.press(getByText('1hr'));

      expect(defaultProps.onSnooze).toHaveBeenCalledWith('todo-1', 'todo', 3600);
    });

    it('calls onSnooze with positive seconds for Tomorrow pill', () => {
      const { getByText } = render(<NotificationQuickActionSheet {...defaultProps} />);
      fireEvent.press(getByText('Tomorrow'));

      expect(defaultProps.onSnooze).toHaveBeenCalledWith('todo-1', 'todo', expect.any(Number));
      // Should be a positive number (seconds until tomorrow 9am)
      const seconds = defaultProps.onSnooze.mock.calls[0][2];
      expect(seconds).toBeGreaterThan(0);
    });

    it('calls onOpen then onDismiss when Open is pressed', () => {
      const { getByText } = render(<NotificationQuickActionSheet {...defaultProps} />);
      fireEvent.press(getByText('Open'));

      expect(defaultProps.onOpen).toHaveBeenCalledWith('todo-1', 'todo');
      expect(defaultProps.onDismiss).toHaveBeenCalled();
    });
  });

  // ─── Snooze pills render ──────────────────────────────────────

  describe('snooze pills', () => {
    it('shows all three snooze options', () => {
      const { getByText } = render(<NotificationQuickActionSheet {...defaultProps} />);
      expect(getByText('15m')).toBeTruthy();
      expect(getByText('1hr')).toBeTruthy();
      expect(getByText('Tomorrow')).toBeTruthy();
    });

    it('shows Snooze label', () => {
      const { getByText } = render(<NotificationQuickActionSheet {...defaultProps} />);
      expect(getByText('Snooze')).toBeTruthy();
    });
  });
});
