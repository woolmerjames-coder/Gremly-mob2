/**
 * Tests for UnifiedEntityCard component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import {
  UnifiedEntityCard,
  UnifiedEntityRecord,
} from '../../components/entities/UnifiedEntityCard';

// Mock expo-clipboard
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

// Mock entity data
const mockTodo: UnifiedEntityRecord = {
  id: 'todo-1',
  type: 'todo',
  entityType: 'todo',
  name: 'Test Todo',
  due_day: '2025-12-07',
  ai_placed: false,
  created_at: '2025-12-01T00:00:00Z',
  updated_at: '2025-12-01T00:00:00Z',
  owner_id: 'user-1',
};

const mockHabit: UnifiedEntityRecord = {
  id: 'habit-1',
  type: 'habit',
  entityType: 'habit',
  name: 'Test Habit',
  frequency: 'daily',
  subtype: 'start_habit',
  ai_placed: false,
  created_at: '2025-12-01T00:00:00Z',
  updated_at: '2025-12-01T00:00:00Z',
  owner_id: 'user-1',
};

const mockLog: UnifiedEntityRecord = {
  id: 'log-1',
  type: 'note',
  entityType: 'log',
  title: 'Test Log',
  subtype: 'journal',
  ai_placed: false,
  created_at: '2025-12-01T00:00:00Z',
  updated_at: '2025-12-01T00:00:00Z',
  owner_id: 'user-1',
};

const mockList: UnifiedEntityRecord = {
  id: 'list-1',
  type: 'note',
  entityType: 'list',
  title: 'Test List',
  subtype: 'list',
  ai_placed: false,
  created_at: '2025-12-01T00:00:00Z',
  updated_at: '2025-12-01T00:00:00Z',
  owner_id: 'user-1',
};

describe('UnifiedEntityCard', () => {
  describe('Todo rendering', () => {
    it('renders todo with checkbox', () => {
      const onPress = jest.fn();
      const onToggleComplete = jest.fn();

      const { getByText, getByTestId } = render(
        <UnifiedEntityCard
          entity={mockTodo}
          onPress={onPress}
          onToggleComplete={onToggleComplete}
          showCheckbox={true}
          showTypeChip={true}
          testID="test-todo"
        />,
      );

      expect(getByText('Test Todo')).toBeTruthy();
      expect(getByText('Todo')).toBeTruthy();
      expect(getByTestId('test-todo-checkbox')).toBeTruthy();
    });

    it('calls onPress when card is pressed', () => {
      const onPress = jest.fn();

      const { getByTestId } = render(
        <UnifiedEntityCard entity={mockTodo} onPress={onPress} testID="test-todo" />,
      );

      fireEvent.press(getByTestId('test-todo'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('calls onToggleComplete when checkbox is pressed', () => {
      const onPress = jest.fn();
      const onToggleComplete = jest.fn();

      const { getByTestId } = render(
        <UnifiedEntityCard
          entity={mockTodo}
          onPress={onPress}
          onToggleComplete={onToggleComplete}
          showCheckbox={true}
          testID="test-todo"
        />,
      );

      fireEvent.press(getByTestId('test-todo-checkbox'));
      expect(onToggleComplete).toHaveBeenCalledTimes(1);
    });

    it('shows strikethrough when completed', () => {
      const { getByText } = render(
        <UnifiedEntityCard
          entity={mockTodo}
          onPress={jest.fn()}
          completed={true}
          testID="test-todo"
        />,
      );

      const titleElement = getByText('Test Todo');
      expect(titleElement.props.style).toContainEqual(
        expect.objectContaining({ textDecorationLine: 'line-through' }),
      );
    });
  });

  describe('Habit rendering', () => {
    it('renders habit with progress bar', () => {
      const onPress = jest.fn();
      const onLogProgress = jest.fn();

      const { getByText, getByTestId } = render(
        <UnifiedEntityCard
          entity={mockHabit}
          onPress={onPress}
          onLogProgress={onLogProgress}
          showProgressBar={true}
          showTypeChip={true}
          habitProgress={{ done: 2, target: 5 }}
          testID="test-habit"
        />,
      );

      expect(getByText('Test Habit')).toBeTruthy();
      expect(getByText('Habit')).toBeTruthy();
      expect(getByText('2/5 this week')).toBeTruthy();
      expect(getByTestId('test-habit-log')).toBeTruthy();
    });

    it('calls onLogProgress when log button is pressed', () => {
      const onPress = jest.fn();
      const onLogProgress = jest.fn();

      const { getByTestId } = render(
        <UnifiedEntityCard
          entity={mockHabit}
          onPress={onPress}
          onLogProgress={onLogProgress}
          showProgressBar={true}
          habitProgress={{ done: 2, target: 5 }}
          testID="test-habit"
        />,
      );

      fireEvent.press(getByTestId('test-habit-log'));
      expect(onLogProgress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Log rendering', () => {
    it('renders log with chevron (no checkbox)', () => {
      const onPress = jest.fn();

      const { getByText, queryByTestId } = render(
        <UnifiedEntityCard
          entity={mockLog}
          onPress={onPress}
          showTypeChip={true}
          testID="test-log"
        />,
      );

      expect(getByText('Test Log')).toBeTruthy();
      expect(getByText('Log')).toBeTruthy();
      expect(getByText('›')).toBeTruthy();
      expect(queryByTestId('test-log-checkbox')).toBeNull();
    });
  });

  describe('List rendering', () => {
    it('renders list with chevron (no checkbox)', () => {
      const onPress = jest.fn();

      const { getByText, queryByTestId } = render(
        <UnifiedEntityCard
          entity={mockList}
          onPress={onPress}
          showTypeChip={true}
          testID="test-list"
        />,
      );

      expect(getByText('Test List')).toBeTruthy();
      expect(getByText('List')).toBeTruthy();
      expect(getByText('›')).toBeTruthy();
      expect(queryByTestId('test-list-checkbox')).toBeNull();
    });
  });

  describe('Type chip visibility', () => {
    it('hides type chip when showTypeChip is false', () => {
      const { queryByText } = render(
        <UnifiedEntityCard
          entity={mockTodo}
          onPress={jest.fn()}
          showTypeChip={false}
          testID="test-todo"
        />,
      );

      expect(queryByText('Todo')).toBeNull();
    });

    it('shows type chip when showTypeChip is true', () => {
      const { getByText } = render(
        <UnifiedEntityCard
          entity={mockTodo}
          onPress={jest.fn()}
          showTypeChip={true}
          testID="test-todo"
        />,
      );

      expect(getByText('Todo')).toBeTruthy();
    });
  });

  describe('Divider visibility', () => {
    it('shows divider when isFirst is false', () => {
      const { toJSON } = render(
        <UnifiedEntityCard
          entity={mockTodo}
          onPress={jest.fn()}
          isFirst={false}
          testID="test-todo"
        />,
      );

      const tree = toJSON();
      // First child of wrapper should be the divider
      expect(tree?.children?.[0]?.props?.style?.height).toBe(1);
    });

    it('hides divider when isFirst is true', () => {
      const { toJSON } = render(
        <UnifiedEntityCard
          entity={mockTodo}
          onPress={jest.fn()}
          isFirst={true}
          testID="test-todo"
        />,
      );

      const tree = toJSON();
      // No divider as first child when isFirst is true
      expect(tree?.children?.[0]?.props?.style?.height).not.toBe(1);
    });
  });
});
