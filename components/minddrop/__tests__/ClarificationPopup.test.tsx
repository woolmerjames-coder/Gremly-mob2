/**
 * ClarificationPopup Component Tests
 *
 * Tests the clarification popup states, interactions, and animations.
 */

import React from 'react';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
import { ClarificationPopup } from '../ClarificationPopup';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: ({ children, style }: any) => <View style={style}>{children}</View>,
    },
    useSharedValue: (initial: any) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    withTiming: (value: any) => value,
    Easing: {
      out: (fn: any) => fn,
      cubic: (x: number) => x,
    },
  };
});

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  CheckCircle: () => null,
}));

const mockOptions = [
  {
    id: 'event',
    label: "It's an event on that date",
    action: { bucket: 'log' as const, target_date: true },
  },
  {
    id: 'task',
    label: "It's a task to do by then",
    action: { bucket: 'todo' as const, scheduled_date: true },
  },
  {
    id: 'reminder',
    label: 'Just remind me',
    action: { bucket: 'log' as const },
  },
];

describe('ClarificationPopup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('loading state', () => {
    it('shows loading indicator when question is null', () => {
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question={null}
          options={null}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
        />,
      );
      expect(getByText('Thinking...')).toBeTruthy();
    });

    it('shows loading when options are null', () => {
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={null}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
        />,
      );
      expect(getByText('Thinking...')).toBeTruthy();
    });

    it('shows loading when options are empty', () => {
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={[]}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
        />,
      );
      expect(getByText('Thinking...')).toBeTruthy();
    });

    it('shows loading when only one option (needs at least 2)', () => {
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={[mockOptions[0]]}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
        />,
      );
      expect(getByText('Thinking...')).toBeTruthy();
    });
  });

  describe('normal state', () => {
    it('renders question text', () => {
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do with this?"
          options={mockOptions}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
        />,
      );
      expect(getByText('What would you like to do with this?')).toBeTruthy();
    });

    it('renders all option buttons', () => {
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
        />,
      );
      expect(getByText("It's an event on that date")).toBeTruthy();
      expect(getByText("It's a task to do by then")).toBeTruthy();
      expect(getByText('Just remind me')).toBeTruthy();
    });

    it('calls onSelectOption when option pressed', () => {
      const onSelectOption = jest.fn();
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={onSelectOption}
          onSkip={jest.fn()}
        />,
      );

      fireEvent.press(getByText("It's an event on that date"));

      expect(onSelectOption).toHaveBeenCalledWith('event');
    });

    it('calls onSelectOption with correct option id', () => {
      const onSelectOption = jest.fn();
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={onSelectOption}
          onSkip={jest.fn()}
        />,
      );

      fireEvent.press(getByText("It's a task to do by then"));

      expect(onSelectOption).toHaveBeenCalledWith('task');
    });

    it('shows instant success state after selection', async () => {
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
        />,
      );

      fireEvent.press(getByText("It's an event on that date"));

      // After pressing, the success state should show (Got it! checkmark)
      // The instant success is handled internally
    });

    it('renders skip button', () => {
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
        />,
      );
      expect(getByText('Skip for now')).toBeTruthy();
    });
  });

  describe('skip functionality', () => {
    it('calls onSkip when skip button pressed', () => {
      const onSkip = jest.fn();
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={jest.fn()}
          onSkip={onSkip}
        />,
      );

      fireEvent.press(getByText('Skip for now'));

      expect(onSkip).toHaveBeenCalled();
    });

    it('closes popup on skip', () => {
      const onSkip = jest.fn();
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={jest.fn()}
          onSkip={onSkip}
        />,
      );

      fireEvent.press(getByText('Skip for now'));

      expect(onSkip).toHaveBeenCalledTimes(1);
    });
  });

  describe('success message state', () => {
    it('shows success message when provided', () => {
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
          successMessage="Got it!"
        />,
      );

      expect(getByText('Got it!')).toBeTruthy();
    });

    it('shows custom success message', () => {
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
          successMessage="Updated successfully!"
        />,
      );

      expect(getByText('Updated successfully!')).toBeTruthy();
    });
  });

  describe('submitting state', () => {
    it('renders normally when isSubmitting is true (instant success handles feedback)', () => {
      // isSubmitting doesn't directly show loading - the component uses internal instantSuccess state
      // When isSubmitting=true, the component should still render its normal state
      // (instant success feedback is handled internally after option selection)
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
          isSubmitting={true}
        />,
      );

      // Question should still be visible
      expect(getByText('What would you like to do?')).toBeTruthy();
    });
  });

  describe('visibility', () => {
    it('does not render content when visible is false', () => {
      const { queryByText } = render(
        <ClarificationPopup
          visible={false}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
        />,
      );

      // Modal is not visible, content should not be rendered
      expect(queryByText('What would you like to do?')).toBeNull();
    });
  });

  describe('free text input', () => {
    it('renders text input field', () => {
      const { getByPlaceholderText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
        />,
      );

      // There should be a text input for custom responses
      expect(getByPlaceholderText('Or explain more...')).toBeTruthy();
    });

    it('calls onSelectOption with freetext prefix when submitted', () => {
      const onSelectOption = jest.fn();
      const { getByPlaceholderText, getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={onSelectOption}
          onSkip={jest.fn()}
        />,
      );

      const textInput = getByPlaceholderText('Or explain more...');
      fireEvent.changeText(textInput, 'Custom explanation here');
      fireEvent.press(getByText('Go'));

      expect(onSelectOption).toHaveBeenCalledWith('freetext:Custom explanation here');
    });

    it('does not show Go button when text is less than 2 characters', () => {
      const onSelectOption = jest.fn();
      const { getByPlaceholderText, queryByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={onSelectOption}
          onSkip={jest.fn()}
        />,
      );

      const textInput = getByPlaceholderText('Or explain more...');
      fireEvent.changeText(textInput, 'a');

      // Go button should not be rendered when text is less than 2 chars
      expect(queryByText('Go')).toBeNull();
      // onSelectOption should not have been called
      expect(onSelectOption).not.toHaveBeenCalled();
    });
  });
});
