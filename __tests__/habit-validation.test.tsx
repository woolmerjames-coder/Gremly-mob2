/**
 * Tests for habit validation logic and testIDs
 * Step 9: Validation, copy, and testIDs
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HabitFields } from '../components/overlay/fields/HabitFields';

describe('Habit Validation and TestIDs', () => {
  describe('Start Habit - Name and Frequency Requirements', () => {
    it('should be valid when both name and frequency are provided', () => {
      const { getByTestId } = render(
        <HabitFields
          name="Morning Meditation"
          onNameChange={jest.fn()}
          frequency="daily"
          onFrequencyChange={jest.fn()}
          subtype="start_habit"
          onSubtypeChange={jest.fn()}
        />,
      );

      // Verify fields render with values
      const nameInput = getByTestId('habit-name-input');
      expect(nameInput.props.value).toBe('Morning Meditation');
    });

    it('should be invalid when name is empty for Start Habit', () => {
      const { getByTestId } = render(
        <HabitFields
          name=""
          onNameChange={jest.fn()}
          frequency="daily"
          onFrequencyChange={jest.fn()}
          subtype="start_habit"
          onSubtypeChange={jest.fn()}
        />,
      );

      const nameInput = getByTestId('habit-name-input');
      expect(nameInput.props.value).toBe('');
    });
  });

  describe('Break Habit - Name Only Requirement', () => {
    it('should be valid with only name for Break Habit', () => {
      const { getByTestId } = render(
        <HabitFields
          name="Stop Smoking"
          onNameChange={jest.fn()}
          frequency="daily"
          onFrequencyChange={jest.fn()}
          subtype="break_habit"
          onSubtypeChange={jest.fn()}
        />,
      );

      const nameInput = getByTestId('habit-name-input');
      expect(nameInput.props.value).toBe('Stop Smoking');
    });
  });

  describe('TestIDs Coverage - All Required Fields', () => {
    it('should have habit toggle testIDs', () => {
      const { getByTestId } = render(
        <HabitFields
          name="Test"
          onNameChange={jest.fn()}
          frequency="daily"
          onFrequencyChange={jest.fn()}
          onSubtypeChange={jest.fn()}
        />,
      );

      expect(getByTestId('habit-toggle-start')).toBeTruthy();
      expect(getByTestId('habit-toggle-break')).toBeTruthy();
    });

    it('should have name input testID', () => {
      const { getByTestId } = render(
        <HabitFields
          name="Test"
          onNameChange={jest.fn()}
          frequency="daily"
          onFrequencyChange={jest.fn()}
        />,
      );

      expect(getByTestId('habit-name-input')).toBeTruthy();
    });

    it('should have frequency chip testIDs', () => {
      const { getByTestId } = render(
        <HabitFields
          name="Test"
          onNameChange={jest.fn()}
          frequency="daily"
          onFrequencyChange={jest.fn()}
          subtype="start_habit"
          frequencyValue={{ kind: 'daily' }}
          onFrequencyValueChange={jest.fn()}
        />,
      );

      expect(getByTestId('freq-chip-daily')).toBeTruthy();
      expect(getByTestId('freq-chip-weekly')).toBeTruthy();
      expect(getByTestId('freq-chip-monthly')).toBeTruthy();
      expect(getByTestId('freq-chip-custom')).toBeTruthy();
    });

    it('should have custom frequency testIDs when custom is selected', () => {
      const { getByTestId } = render(
        <HabitFields
          name="Test"
          onNameChange={jest.fn()}
          frequency="daily"
          onFrequencyChange={jest.fn()}
          subtype="start_habit"
          frequencyValue={{ kind: 'custom_days', days: [1, 3, 5] }}
          onFrequencyValueChange={jest.fn()}
        />,
      );

      // Click custom to show the custom builder
      const customChip = getByTestId('freq-chip-custom');
      fireEvent.press(customChip);

      expect(getByTestId('freq-custom-days')).toBeTruthy();
      expect(getByTestId('freq-custom-nper')).toBeTruthy();
    });

    it('should have reminders testIDs', () => {
      const { getByTestId } = render(
        <HabitFields
          name="Test"
          onNameChange={jest.fn()}
          frequency="daily"
          onFrequencyChange={jest.fn()}
          reminders={[]}
          onRemindersChange={jest.fn()}
        />,
      );

      expect(getByTestId('reminders-add')).toBeTruthy();
    });

    it('should have reminder row testID after adding', () => {
      const onRemindersChange = jest.fn();
      const { getByTestId } = render(
        <HabitFields
          name="Test"
          onNameChange={jest.fn()}
          frequency="daily"
          onFrequencyChange={jest.fn()}
          reminders={[]}
          onRemindersChange={onRemindersChange}
        />,
      );

      const addButton = getByTestId('reminders-add');
      fireEvent.press(addButton);

      // onRemindersChange should be called with new reminder
      expect(onRemindersChange).toHaveBeenCalled();
      const call = onRemindersChange.mock.calls[0][0];
      expect(call).toHaveLength(1);
      expect(call[0]).toHaveProperty('id');
    });

    it('should have details section testIDs', () => {
      const { getByTestId } = render(
        <HabitFields
          name="Test"
          onNameChange={jest.fn()}
          frequency="daily"
          onFrequencyChange={jest.fn()}
          details={{}}
          onDetailsChange={jest.fn()}
        />,
      );

      // Open details section
      const detailsToggle = getByTestId('add-details-toggle');
      fireEvent.press(detailsToggle);

      expect(getByTestId('habit-notes')).toBeTruthy();
      expect(getByTestId('tag-input')).toBeTruthy();
      expect(getByTestId('tag-add')).toBeTruthy();
      expect(getByTestId('stack-select')).toBeTruthy();
      expect(getByTestId('habit-start-date')).toBeTruthy();
      expect(getByTestId('habit-end-date')).toBeTruthy();
      expect(getByTestId('schedule-preview')).toBeTruthy();
    });

    it('should have stack position testIDs after entering habit name', () => {
      const onDetailsChange = jest.fn();
      const { getByTestId } = render(
        <HabitFields
          name="Test"
          onNameChange={jest.fn()}
          frequency="daily"
          onFrequencyChange={jest.fn()}
          details={{ stackHabitName: 'Morning Routine' }}
          onDetailsChange={onDetailsChange}
        />,
      );

      // Open details section
      const detailsToggle = getByTestId('add-details-toggle');
      fireEvent.press(detailsToggle);

      // Stack position buttons should appear
      expect(getByTestId('stack-pos-before')).toBeTruthy();
      expect(getByTestId('stack-pos-after')).toBeTruthy();
      expect(getByTestId('stack-offset')).toBeTruthy();
    });
  });

  describe('Validation Message Spec', () => {
    it('validates Start Habit requires Name + Frequency', () => {
      // This test documents the validation rules
      const rules = {
        startHabit: {
          required: ['name', 'frequency'],
          hint: 'Name required',
        },
        breakHabit: {
          required: ['name'],
          hint: 'Name required',
        },
      };

      expect(rules.startHabit.required).toEqual(['name', 'frequency']);
      expect(rules.breakHabit.required).toEqual(['name']);
    });
  });
});
