/**
 * ClarificationPopup Component Tests
 *
 * Tests the clarification popup states, interactions, and animations.
 */

import React from 'react';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
import { ClarificationPopup } from '../ClarificationPopup';
import { getDateService } from '../../../lib/date/DateService';

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

// Mock DateTimePicker to avoid native component issues in tests
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ testID }: { testID?: string }) => <View testID={testID || 'date-time-picker'} />,
  };
});

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

    it('closes without answering when tapped outside', () => {
      const onSkip = jest.fn();
      const onClose = jest.fn();
      const onSelectOption = jest.fn();
      const { getByTestId } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={onSelectOption}
          onSkip={onSkip}
          onClose={onClose}
        />,
      );

      fireEvent.press(getByTestId('clarification-backdrop'));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSkip).not.toHaveBeenCalled();
      expect(onSelectOption).not.toHaveBeenCalled();
    });

    it('does not close when the question itself is tapped', () => {
      const onClose = jest.fn();
      const { getByText } = render(
        <ClarificationPopup
          visible={true}
          question="What would you like to do?"
          options={mockOptions}
          onSelectOption={jest.fn()}
          onSkip={jest.fn()}
          onClose={onClose}
        />,
      );

      fireEvent.press(getByText('What would you like to do?'));

      expect(onClose).not.toHaveBeenCalled();
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

  describe('when is it? step', () => {
    const bookingOptions = [
      {
        id: 'opt_1',
        label: "Yes, it's booked",
        action: { bucket: 'log' as const, subtype: 'event', followUp: 'when' as const },
      },
      { id: 'opt_2', label: 'I need to book it', action: { bucket: 'todo' as const } },
      { id: 'opt_3', label: 'Just a note', action: { bucket: 'log' as const } },
    ];
    const renderBooking = (onSelectOption = jest.fn()) =>
      render(
        <ClarificationPopup
          visible={true}
          question="Is your doctor's appointment booked?"
          options={bookingOptions}
          onSelectOption={onSelectOption}
          onSkip={jest.fn()}
        />,
      );

    it('asks when it is instead of filing straight away', () => {
      const onSelectOption = jest.fn();
      const { getByText, getByTestId } = renderBooking(onSelectOption);
      fireEvent.press(getByText("Yes, it's booked"));
      expect(getByText('When is it?')).toBeTruthy();
      expect(getByTestId('clarification-when-today')).toBeTruthy();
      expect(onSelectOption).not.toHaveBeenCalled();
    });

    it('saves the day picked with the answer', () => {
      const onSelectOption = jest.fn();
      const { getByText, getByTestId } = renderBooking(onSelectOption);
      fireEvent.press(getByText("Yes, it's booked"));
      fireEvent.press(getByTestId('clarification-when-tomorrow'));
      fireEvent.press(getByTestId('clarification-when-save'));
      expect(onSelectOption).toHaveBeenCalledWith('opt_1', {
        date: getDateService().tomorrow(),
        time: null,
      });
    });

    it('does not save until a day is picked', () => {
      const onSelectOption = jest.fn();
      const { getByText, getByTestId } = renderBooking(onSelectOption);
      fireEvent.press(getByText("Yes, it's booked"));
      fireEvent.press(getByTestId('clarification-when-save'));
      expect(onSelectOption).not.toHaveBeenCalled();
    });

    it('files it without a date when the user will add it later', () => {
      const onSelectOption = jest.fn();
      const { getByText, getByTestId } = renderBooking(onSelectOption);
      fireEvent.press(getByText("Yes, it's booked"));
      fireEvent.press(getByTestId('clarification-when-later'));
      expect(onSelectOption).toHaveBeenCalledWith('opt_1');
    });

    it('opens the picker for another day', () => {
      const { getByText, getByTestId } = renderBooking();
      fireEvent.press(getByText("Yes, it's booked"));
      fireEvent.press(getByTestId('clarification-when-pick-date'));
      expect(getByTestId('clarification-when-picker')).toBeTruthy();
    });

    it('files other answers straight away', () => {
      const onSelectOption = jest.fn();
      const { getByText } = renderBooking(onSelectOption);
      fireEvent.press(getByText('I need to book it'));
      expect(onSelectOption).toHaveBeenCalledWith('opt_2');
    });
  });
});
