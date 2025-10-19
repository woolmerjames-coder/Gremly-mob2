/**
 * Tests for Break Habit fields - taper plan, triggers, and replacement routine
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { HabitFields } from '../components/overlay/fields/HabitFields';
import type { BreakHabitState } from '../components/overlay/fields/HabitFields';

describe('Break Habit Fields', () => {
  const defaultProps = {
    name: 'Stop smoking',
    onNameChange: jest.fn(),
    frequency: 'daily' as const,
    onFrequencyChange: jest.fn(),
    subtype: 'break_habit' as const,
    onSubtypeChange: jest.fn(),
  };

  describe('Taper Plan', () => {
    it('renders taper plan section for break habit', () => {
      const breakHabitState: BreakHabitState = {};
      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={jest.fn()}
        />,
      );

      expect(screen.getByText('Taper Plan')).toBeTruthy();
      expect(screen.getByText('Baseline:')).toBeTruthy();
      expect(screen.getByText('Target:')).toBeTruthy();
    });

    it('has default baseline of 7 per week', () => {
      const breakHabitState: BreakHabitState = {};
      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={jest.fn()}
        />,
      );

      const baselineInput = screen.getByTestId('taper-baseline');
      expect(baselineInput.props.value).toBe('7');
    });

    it('allows adjusting baseline count with stepper', () => {
      const onBreakHabitStateChange = jest.fn();
      const breakHabitState: BreakHabitState = {
        taperPlan: {
          baselineCount: 7,
          baselinePeriod: 'week',
          targetCount: 0,
          targetPeriod: 'week',
          strategy: null,
        },
      };

      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={onBreakHabitStateChange}
        />,
      );

      // Increment baseline
      fireEvent.press(screen.getByTestId('taper-baseline-plus'));
      expect(onBreakHabitStateChange).toHaveBeenCalledWith({
        taperPlan: expect.objectContaining({
          baselineCount: 8,
        }),
      });

      // Decrement baseline
      fireEvent.press(screen.getByTestId('taper-baseline-minus'));
      expect(onBreakHabitStateChange).toHaveBeenCalledWith({
        taperPlan: expect.objectContaining({
          baselineCount: 6,
        }),
      });
    });

    it('toggles baseline period between day and week', () => {
      const onBreakHabitStateChange = jest.fn();
      const breakHabitState: BreakHabitState = {
        taperPlan: {
          baselineCount: 7,
          baselinePeriod: 'week',
          targetCount: 0,
          targetPeriod: 'week',
          strategy: null,
        },
      };

      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={onBreakHabitStateChange}
        />,
      );

      fireEvent.press(screen.getByTestId('taper-baseline-period'));
      expect(onBreakHabitStateChange).toHaveBeenCalledWith({
        taperPlan: expect.objectContaining({
          baselinePeriod: 'day',
        }),
      });
    });

    it('allows selecting Zero as target', () => {
      const onBreakHabitStateChange = jest.fn();
      const breakHabitState: BreakHabitState = {
        taperPlan: {
          baselineCount: 7,
          baselinePeriod: 'week',
          targetCount: 1,
          targetPeriod: 'week',
          strategy: null,
        },
      };

      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={onBreakHabitStateChange}
        />,
      );

      fireEvent.press(screen.getByTestId('taper-target-zero'));
      expect(onBreakHabitStateChange).toHaveBeenCalledWith({
        taperPlan: expect.objectContaining({
          targetCount: 0,
        }),
      });
    });

    it('allows adjusting target count with stepper', () => {
      const onBreakHabitStateChange = jest.fn();
      const breakHabitState: BreakHabitState = {
        taperPlan: {
          baselineCount: 7,
          baselinePeriod: 'week',
          targetCount: 3,
          targetPeriod: 'week',
          strategy: null,
        },
      };

      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={onBreakHabitStateChange}
        />,
      );

      fireEvent.press(screen.getByTestId('taper-target-plus'));
      expect(onBreakHabitStateChange).toHaveBeenCalledWith({
        taperPlan: expect.objectContaining({
          targetCount: 4,
        }),
      });
    });

    it('renders strategy chips', () => {
      const breakHabitState: BreakHabitState = {};
      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={jest.fn()}
        />,
      );

      expect(screen.getByTestId('taper-strategy-step_down')).toBeTruthy();
      expect(screen.getByTestId('taper-strategy-windowing')).toBeTruthy();
      expect(screen.getByTestId('taper-strategy-days_off')).toBeTruthy();
    });

    it('allows selecting a taper strategy', () => {
      const onBreakHabitStateChange = jest.fn();
      const breakHabitState: BreakHabitState = {
        taperPlan: {
          baselineCount: 7,
          baselinePeriod: 'week',
          targetCount: 0,
          targetPeriod: 'week',
          strategy: null,
        },
      };

      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={onBreakHabitStateChange}
        />,
      );

      fireEvent.press(screen.getByTestId('taper-strategy-step_down'));
      expect(onBreakHabitStateChange).toHaveBeenCalledWith({
        taperPlan: expect.objectContaining({
          strategy: 'step_down',
        }),
      });
    });

    it('shows step-down parameters when strategy is selected', () => {
      const breakHabitState: BreakHabitState = {
        taperPlan: {
          baselineCount: 7,
          baselinePeriod: 'week',
          targetCount: 0,
          targetPeriod: 'week',
          strategy: 'step_down',
        },
      };

      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={jest.fn()}
        />,
      );

      expect(screen.getByText('Reduce by')).toBeTruthy();
      expect(screen.getByTestId('step-down-reduce-minus')).toBeTruthy();
      expect(screen.getByTestId('step-down-reduce-plus')).toBeTruthy();
      expect(screen.getByTestId('step-down-per')).toBeTruthy();
    });
  });

  describe('Triggers', () => {
    it('renders triggers section for break habit', () => {
      const breakHabitState: BreakHabitState = {};
      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={jest.fn()}
        />,
      );

      expect(screen.getByText('Triggers')).toBeTruthy();
      expect(screen.getByText('What prompts this habit?')).toBeTruthy();
    });

    it('renders common trigger chips', () => {
      const breakHabitState: BreakHabitState = {};
      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={jest.fn()}
        />,
      );

      expect(screen.getByTestId('trigger-chip-stress')).toBeTruthy();
      expect(screen.getByTestId('trigger-chip-boredom')).toBeTruthy();
      expect(screen.getByTestId('trigger-chip-social')).toBeTruthy();
      expect(screen.getByTestId('trigger-chip-evening')).toBeTruthy();
      expect(screen.getByTestId('trigger-chip-after_meals')).toBeTruthy();
    });

    it('allows selecting common triggers', () => {
      const onBreakHabitStateChange = jest.fn();
      const breakHabitState: BreakHabitState = {
        triggers: [],
      };

      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={onBreakHabitStateChange}
        />,
      );

      fireEvent.press(screen.getByTestId('trigger-chip-stress'));
      expect(onBreakHabitStateChange).toHaveBeenCalledWith({
        triggers: ['Stress'],
      });
    });

    it('allows adding custom triggers', () => {
      const onBreakHabitStateChange = jest.fn();
      const breakHabitState: BreakHabitState = {
        triggers: [],
      };

      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={onBreakHabitStateChange}
        />,
      );

      const input = screen.getByTestId('trigger-input');
      fireEvent.changeText(input, 'Morning coffee');
      fireEvent.press(screen.getByTestId('trigger-add'));

      expect(onBreakHabitStateChange).toHaveBeenCalledWith({
        triggers: ['Morning coffee'],
      });
    });

    it('allows removing triggers', () => {
      const onBreakHabitStateChange = jest.fn();
      const breakHabitState: BreakHabitState = {
        triggers: ['Stress', 'Custom trigger'],
      };

      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={onBreakHabitStateChange}
        />,
      );

      // Remove common trigger
      fireEvent.press(screen.getByTestId('trigger-chip-stress'));
      expect(onBreakHabitStateChange).toHaveBeenCalledWith({
        triggers: ['Custom trigger'],
      });
    });
  });

  describe('Replacement Routine', () => {
    it('renders replacement routine section', () => {
      const breakHabitState: BreakHabitState = {};
      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={jest.fn()}
        />,
      );

      expect(screen.getByText('Replacement Routine')).toBeTruthy();
      expect(screen.getByText('What will you do instead?')).toBeTruthy();
    });

    it('shows pick habit button', () => {
      const breakHabitState: BreakHabitState = {};
      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={jest.fn()}
        />,
      );

      expect(screen.getByTestId('replacement-pick')).toBeTruthy();
      expect(screen.getByText('+ Pick a Start Habit')).toBeTruthy();
    });

    it('shows free text input for replacement', () => {
      const breakHabitState: BreakHabitState = {};
      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={jest.fn()}
        />,
      );

      expect(screen.getByTestId('replacement-freetext')).toBeTruthy();
    });

    it('allows entering free text replacement', () => {
      const onBreakHabitStateChange = jest.fn();
      const breakHabitState: BreakHabitState = {};

      render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={onBreakHabitStateChange}
        />,
      );

      const input = screen.getByTestId('replacement-freetext');
      fireEvent.changeText(input, 'Take a walk');

      expect(onBreakHabitStateChange).toHaveBeenCalledWith({
        replacementFreeText: 'Take a walk',
      });
    });
  });

  describe('Integration - Full Break Habit', () => {
    it('allows defining a simple taper with trigger and saving', () => {
      const onBreakHabitStateChange = jest.fn();
      const breakHabitState: BreakHabitState = {
        taperPlan: {
          baselineCount: 7,
          baselinePeriod: 'week',
          targetCount: 0,
          targetPeriod: 'week',
          strategy: null,
        },
        triggers: [],
      };

      const { rerender } = render(
        <HabitFields
          {...defaultProps}
          breakHabitState={breakHabitState}
          onBreakHabitStateChange={onBreakHabitStateChange}
        />,
      );

      // Verify baseline 7/week is displayed
      expect(screen.getByTestId('taper-baseline').props.value).toBe('7');

      // Select step-down strategy
      fireEvent.press(screen.getByTestId('taper-strategy-step_down'));
      expect(onBreakHabitStateChange).toHaveBeenCalledWith({
        ...breakHabitState,
        taperPlan: expect.objectContaining({
          strategy: 'step_down',
        }),
      });

      // Simulate state update with strategy
      const updatedState: BreakHabitState = {
        taperPlan: {
          baselineCount: 7,
          baselinePeriod: 'week',
          targetCount: 0,
          targetPeriod: 'week',
          strategy: 'step_down',
        },
        triggers: [],
      };

      rerender(
        <HabitFields
          {...defaultProps}
          breakHabitState={updatedState}
          onBreakHabitStateChange={onBreakHabitStateChange}
        />,
      );

      // Add a trigger
      fireEvent.press(screen.getByTestId('trigger-chip-stress'));
      expect(onBreakHabitStateChange).toHaveBeenCalledWith({
        ...updatedState,
        triggers: ['Stress'],
      });

      // Verify all required fields are present
      expect(screen.getByTestId('habit-name-input')).toBeTruthy();
      expect(screen.getByTestId('taper-baseline')).toBeTruthy();
      expect(screen.getByTestId('taper-target-zero')).toBeTruthy();
      expect(screen.getByTestId('taper-strategy-step_down')).toBeTruthy();
      expect(screen.getByTestId('trigger-chip-stress')).toBeTruthy();
    });
  });

  describe('Break Habit - Not shown for Start Habit', () => {
    it('does not render break habit fields when subtype is start_habit', () => {
      render(<HabitFields {...defaultProps} subtype="start_habit" />);

      expect(screen.queryByText('Taper Plan')).toBeNull();
      expect(screen.queryByText('Triggers')).toBeNull();
      expect(screen.queryByText('Replacement Routine')).toBeNull();
    });
  });
});
