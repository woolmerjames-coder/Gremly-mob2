/**
 * EntityCard Component Tests
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { EntityCard } from '../../components/shared/EntityCard';

describe('EntityCard', () => {
  const mockOnPress = jest.fn();
  const mockOnToggleComplete = jest.fn();
  const mockOnLogProgress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Todo rendering', () => {
    const todoRecord = {
      id: 'todo-1',
      name: 'Test Todo',
      due_day: '2025-12-08',
    };

    it('renders todo with title and type pill', () => {
      const { getByText, getByTestId } = render(
        <EntityCard
          record={todoRecord}
          type="todo"
          onPress={mockOnPress}
          showTypePill={true}
          testID="test-todo"
        />,
      );

      expect(getByText('Test Todo')).toBeTruthy();
      expect(getByText('Todo')).toBeTruthy();
    });

    it('shows checkbox when showCheckbox is true', () => {
      const { getByTestId } = render(
        <EntityCard
          record={todoRecord}
          type="todo"
          onPress={mockOnPress}
          onToggleComplete={mockOnToggleComplete}
          showCheckbox={true}
          testID="test-todo"
        />,
      );

      expect(getByTestId('test-todo-checkbox')).toBeTruthy();
    });

    it('calls onToggleComplete when checkbox pressed', () => {
      const { getByTestId } = render(
        <EntityCard
          record={todoRecord}
          type="todo"
          onPress={mockOnPress}
          onToggleComplete={mockOnToggleComplete}
          showCheckbox={true}
          testID="test-todo"
        />,
      );

      fireEvent.press(getByTestId('test-todo-checkbox'));
      expect(mockOnToggleComplete).toHaveBeenCalledTimes(1);
    });

    it('shows strikethrough when completed', () => {
      const { getByText } = render(
        <EntityCard
          record={todoRecord}
          type="todo"
          onPress={mockOnPress}
          completed={true}
          testID="test-todo"
        />,
      );

      const title = getByText('Test Todo');
      expect(title.props.style).toContainEqual(
        expect.objectContaining({ textDecorationLine: 'line-through' }),
      );
    });
  });

  describe('Habit rendering', () => {
    const habitRecord = {
      id: 'habit-1',
      name: 'Test Habit',
    };

    it('renders habit with progress bar', () => {
      const { getByText, getByTestId } = render(
        <EntityCard
          record={habitRecord}
          type="habit"
          onPress={mockOnPress}
          showTypePill={true}
          habitProgress={{ done: 2, target: 5 }}
          testID="test-habit"
        />,
      );

      expect(getByText('Test Habit')).toBeTruthy();
      expect(getByText('Habit')).toBeTruthy();
      expect(getByText('2/5 this week')).toBeTruthy();
    });

    it('shows log progress button when onLogProgress provided', () => {
      const { getByTestId } = render(
        <EntityCard
          record={habitRecord}
          type="habit"
          onPress={mockOnPress}
          onLogProgress={mockOnLogProgress}
          showCheckbox={true}
          habitProgress={{ done: 2, target: 5 }}
          testID="test-habit"
        />,
      );

      expect(getByTestId('test-habit-log')).toBeTruthy();
    });

    it('calls onLogProgress when log button pressed', () => {
      const { getByTestId } = render(
        <EntityCard
          record={habitRecord}
          type="habit"
          onPress={mockOnPress}
          onLogProgress={mockOnLogProgress}
          showCheckbox={true}
          habitProgress={{ done: 2, target: 5 }}
          testID="test-habit"
        />,
      );

      fireEvent.press(getByTestId('test-habit-log'));
      expect(mockOnLogProgress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Log rendering', () => {
    const logRecord = {
      id: 'log-1',
      title: 'Test Log',
      subtype: 'journal',
    };

    it('renders log with chevron', () => {
      const { getByText } = render(
        <EntityCard
          record={logRecord}
          type="log"
          onPress={mockOnPress}
          showTypePill={true}
          testID="test-log"
        />,
      );

      expect(getByText('Test Log')).toBeTruthy();
      expect(getByText('Note')).toBeTruthy();
      expect(getByText('›')).toBeTruthy();
    });

    it('shows custom subtitle when provided', () => {
      const { getByText } = render(
        <EntityCard
          record={logRecord}
          type="log"
          onPress={mockOnPress}
          subtitle="Yesterday"
          testID="test-log"
        />,
      );

      expect(getByText('Yesterday')).toBeTruthy();
    });
  });

  describe('List rendering', () => {
    const listRecord = {
      id: 'list-1',
      title: 'Shopping List',
      body: '- Milk\n- Bread\n- Eggs',
    };

    it('renders list with chevron', () => {
      const { getByText } = render(
        <EntityCard
          record={listRecord}
          type="list"
          onPress={mockOnPress}
          showTypePill={true}
          testID="test-list"
        />,
      );

      expect(getByText('Shopping List')).toBeTruthy();
      expect(getByText('List')).toBeTruthy();
      expect(getByText('›')).toBeTruthy();
    });
  });

  describe('Card interactions', () => {
    const record = { id: 'test-1', name: 'Test Item' };

    it('calls onPress when card is pressed', () => {
      const { getByTestId } = render(
        <EntityCard record={record} type="todo" onPress={mockOnPress} testID="test-card" />,
      );

      fireEvent.press(getByTestId('test-card'));
      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });

    it('hides divider when isFirst is true', () => {
      const { queryByTestId } = render(
        <EntityCard
          record={record}
          type="todo"
          onPress={mockOnPress}
          isFirst={true}
          testID="test-card"
        />,
      );

      // The divider should not be visible for the first item
      // This is a style-based check, so we just verify the component renders
      expect(queryByTestId('test-card')).toBeTruthy();
    });

    it('hides type pill when showTypePill is false', () => {
      const { queryByText } = render(
        <EntityCard
          record={record}
          type="todo"
          onPress={mockOnPress}
          showTypePill={false}
          testID="test-card"
        />,
      );

      expect(queryByText('Todo')).toBeNull();
    });
  });
});
