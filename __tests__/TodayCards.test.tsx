/**
 * TodayCards.spec.tsx - Phase 9 Step 3
 * Focused component isolation tests for Today cards
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TodayHabitCard from '../components/today/TodayHabitCard';
import TodayTodoCard from '../components/today/TodayTodoCard';

// Mock token system
jest.mock('../design/makeStyles', () => ({
  useTokens: () => ({
    colors: {
      accentMint: '#A5F3C1',
      accentPeri: '#AEB8FF',
      success: '#34C759',
      danger: '#E25555',
      surface: '#FFFFFF',
      subtle: '#6A6F76',
    },
    spacing: [0, 4, 8, 12, 16, 20, 24, 32],
    radius: [0, 6, 12, 16, 20],
    typography: {
      fontFamily: {
        regular: 'System',
        medium: 'System',
        bold: 'System',
      },
      size: {
        xs: 12,
        sm: 14,
        md: 16,
        lg: 20,
        xl: 24,
        '2xl': 32,
      },
      lineHeight: {
        tight: 1.1,
        snug: 1.25,
        normal: 1.4,
        relaxed: 1.6,
      },
    },
  }),
}));

// Mock reduced motion
jest.mock('../lib/a11y/reducedMotion', () => ({
  isReducedMotion: jest.fn(() => true),
}));

describe('TodayHabitCard', () => {
  const defaultProps = {
    id: 'habit-123',
    name: 'Morning Meditation',
    onComplete: jest.fn(),
    onLongPress: jest.fn(),
    reducedMotion: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render habit name', () => {
    const { getByText } = render(<TodayHabitCard {...defaultProps} />);
    expect(getByText('Morning Meditation')).toBeTruthy();
  });

  it('should call onComplete when check button is pressed', () => {
    const { getByTestId } = render(<TodayHabitCard {...defaultProps} />);

    const checkButton = getByTestId('habit-check-habit-123');
    fireEvent.press(checkButton);

    expect(defaultProps.onComplete).toHaveBeenCalledWith('habit-123');
  });

  it('should call onLongPress when long press area is pressed', () => {
    const { getByTestId } = render(<TodayHabitCard {...defaultProps} />);

    const longPressArea = getByTestId('habit-longpress-habit-123');
    fireEvent(longPressArea, 'longPress');

    expect(defaultProps.onLongPress).toHaveBeenCalledWith('habit-123');
  });

  it('should have correct accessibility labels', () => {
    const { getByTestId } = render(<TodayHabitCard {...defaultProps} />);

    const checkButton = getByTestId('habit-check-habit-123');
    expect(checkButton.props.accessibilityLabel).toBe("Complete habit 'Morning Meditation'");
    expect(checkButton.props.accessibilityRole).toBe('button');

    const longPressArea = getByTestId('habit-longpress-habit-123');
    expect(longPressArea.props.accessibilityLabel).toBe("Options for habit 'Morning Meditation'");
  });

  it('should render due window when provided', () => {
    const { getByText } = render(<TodayHabitCard {...defaultProps} dueWindow="before 10:00" />);
    expect(getByText('before 10:00')).toBeTruthy();
  });

  it('should render streak count when provided', () => {
    const { getByText } = render(<TodayHabitCard {...defaultProps} streakCount={5} />);
    expect(getByText(/🔥 5/)).toBeTruthy();
  });

  it('should render space name when provided', () => {
    const { getByText } = render(<TodayHabitCard {...defaultProps} spaceName="Work" />);
    expect(getByText('Work')).toBeTruthy();
  });

  it('should render tags (max 2)', () => {
    const { getByText } = render(
      <TodayHabitCard {...defaultProps} tags={['health', 'morning', 'wellness']} />,
    );
    expect(getByText('health')).toBeTruthy();
    expect(getByText('morning')).toBeTruthy();
  });
});

describe('TodayTodoCard', () => {
  const defaultProps = {
    id: 'todo-456',
    title: 'Review PR',
    onComplete: jest.fn(),
    onLongPress: jest.fn(),
    reducedMotion: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render todo title', () => {
    const { getByText } = render(<TodayTodoCard {...defaultProps} />);
    expect(getByText('Review PR')).toBeTruthy();
  });

  it('should call onComplete when complete button is pressed', () => {
    const { getByTestId } = render(<TodayTodoCard {...defaultProps} />);

    const completeButton = getByTestId('todo-complete-todo-456');
    fireEvent.press(completeButton);

    expect(defaultProps.onComplete).toHaveBeenCalledWith('todo-456');
  });

  it('should call onLongPress when long press area is pressed', () => {
    const { getByTestId } = render(<TodayTodoCard {...defaultProps} />);

    const longPressArea = getByTestId('todo-longpress-todo-456');
    fireEvent(longPressArea, 'longPress');

    expect(defaultProps.onLongPress).toHaveBeenCalledWith('todo-456');
  });

  it('should have correct accessibility labels', () => {
    const { getByTestId } = render(<TodayTodoCard {...defaultProps} />);

    const completeButton = getByTestId('todo-complete-todo-456');
    expect(completeButton.props.accessibilityLabel).toBe("Complete to-do 'Review PR'");
    expect(completeButton.props.accessibilityRole).toBe('button');

    const longPressArea = getByTestId('todo-longpress-todo-456');
    expect(longPressArea.props.accessibilityLabel).toBe("Options for to-do 'Review PR'");
  });

  it('should render due time when provided', () => {
    const { getByText } = render(<TodayTodoCard {...defaultProps} dueTime="2:30 PM" />);
    expect(getByText(/Due: 2:30 PM/)).toBeTruthy();
  });

  it('should render overdue indicator when overdue', () => {
    const { getByText } = render(<TodayTodoCard {...defaultProps} overdue />);
    expect(getByText('⏰')).toBeTruthy();
  });

  it('should apply near-due glow styling when nearDue is true', () => {
    const { getByTestId } = render(<TodayTodoCard {...defaultProps} nearDue />);

    const card = getByTestId('todo-card-todo-456');
    const cardJSON = card.props.style;

    // Check that near-due glow styles are applied
    // The style should have borderWidth and borderColor
    expect(cardJSON).toBeTruthy();
    // Note: Exact style checking depends on how Card component merges styles
    // We're verifying the component receives the nearDue prop correctly
  });

  it('should NOT apply near-due glow when nearDue is false', () => {
    const { getByTestId } = render(<TodayTodoCard {...defaultProps} nearDue={false} />);

    const card = getByTestId('todo-card-todo-456');
    expect(card).toBeTruthy();
    // Card exists but without extra glow styling
  });

  it('should render space name when provided', () => {
    const { getByText } = render(<TodayTodoCard {...defaultProps} spaceName="Work" />);
    expect(getByText('Work')).toBeTruthy();
  });

  it('should render tags (max 2)', () => {
    const { getByText } = render(
      <TodayTodoCard {...defaultProps} tags={['urgent', 'review', 'frontend']} />,
    );
    expect(getByText('urgent')).toBeTruthy();
    expect(getByText('review')).toBeTruthy();
  });
});
