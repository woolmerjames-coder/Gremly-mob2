/**
 * Tests for JournalFields component
 * Validates required fields (date + entry + mood), inspiration, formatting, and optional fields
 * Updated for multi-select mood system using shared/moods.ts
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import {
  JournalFields,
  type JournalDetailsState,
} from '../components/overlay/fields/JournalFields';
import { ALL_MOODS } from '../lib/shared/moods';

describe('JournalFields', () => {
  const mockOnDateChange = jest.fn();
  const mockOnEntryChange = jest.fn();
  const mockOnMoodChange = jest.fn();
  const mockOnDetailsChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Required Fields', () => {
    it('renders date input with testID', () => {
      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={null}
          onMoodChange={mockOnMoodChange}
        />,
      );

      expect(screen.getByTestId('journal-date')).toBeTruthy();
    });

    it('renders mood chips with all mood options from shared moods', () => {
      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={null}
          onMoodChange={mockOnMoodChange}
        />,
      );

      // Check all moods from shared moods are rendered
      ALL_MOODS.forEach((mood) => {
        expect(screen.getByTestId(`mood-${mood}`)).toBeTruthy();
      });
    });

    it('renders entry textarea with testID', () => {
      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={null}
          onMoodChange={mockOnMoodChange}
        />,
      );

      expect(screen.getByTestId('journal-entry')).toBeTruthy();
    });

    it('calls onMoodChange with array when mood chip is pressed (multi-select)', () => {
      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={null}
          onMoodChange={mockOnMoodChange}
        />,
      );

      fireEvent.press(screen.getByTestId('mood-good'));
      expect(mockOnMoodChange).toHaveBeenCalledWith(['good']);
    });

    it('shows selected mood chip with visual feedback', () => {
      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={['good']}
          onMoodChange={mockOnMoodChange}
        />,
      );

      const goodChip = screen.getByTestId('mood-good');
      expect(goodChip.props.style).toMatchObject(
        expect.arrayContaining([
          expect.objectContaining({
            borderColor: '#4CAF93',
            backgroundColor: '#E8F5F3',
          }),
        ]),
      );
    });

    it('supports multi-select - adds mood to existing array', () => {
      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={['good']}
          onMoodChange={mockOnMoodChange}
        />,
      );

      fireEvent.press(screen.getByTestId('mood-grateful'));
      expect(mockOnMoodChange).toHaveBeenCalledWith(['good', 'grateful']);
    });

    it('supports multi-select - removes mood from array when toggled', () => {
      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={['good', 'grateful']}
          onMoodChange={mockOnMoodChange}
        />,
      );

      fireEvent.press(screen.getByTestId('mood-good'));
      expect(mockOnMoodChange).toHaveBeenCalledWith(['grateful']);
    });
  });

  describe('Need Inspiration Button', () => {
    it('renders inspiration button with testID', () => {
      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={['okay']}
          onMoodChange={mockOnMoodChange}
        />,
      );

      expect(screen.getByTestId('journal-inspire')).toBeTruthy();
    });

    it('injects random prompt when inspiration button is pressed', () => {
      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry="Existing text"
          onEntryChange={mockOnEntryChange}
          mood={['okay']}
          onMoodChange={mockOnMoodChange}
        />,
      );

      fireEvent.press(screen.getByTestId('journal-inspire'));

      expect(mockOnEntryChange).toHaveBeenCalled();
      const callArg = mockOnEntryChange.mock.calls[0][0];
      expect(callArg).toContain('Existing text');
      expect(callArg.length).toBeGreaterThan('Existing text'.length);
    });
  });

  describe('Formatting Toggle', () => {
    it('renders formatting toggle when onDetailsChange is provided', () => {
      const details: JournalDetailsState = {
        formatting: null,
      };

      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={['okay']}
          onMoodChange={mockOnMoodChange}
          details={details}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      expect(screen.getByTestId('fmt-bullets')).toBeTruthy();
      expect(screen.getByTestId('fmt-numbers')).toBeTruthy();
      expect(screen.getByTestId('fmt-checkboxes')).toBeTruthy();
    });

    it('calls onDetailsChange when formatting is selected', () => {
      const details: JournalDetailsState = {
        formatting: null,
      };

      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={['okay']}
          onMoodChange={mockOnMoodChange}
          details={details}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('fmt-bullets'));
      expect(mockOnDetailsChange).toHaveBeenCalledWith({
        formatting: 'bullets',
      });
    });
  });

  describe('Reminders Integration', () => {
    it('renders RemindersList when details.reminders is provided', () => {
      const details: JournalDetailsState = {
        reminders: [],
      };

      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={['okay']}
          onMoodChange={mockOnMoodChange}
          details={details}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      expect(screen.getByTestId('reminders-add')).toBeTruthy();
    });
  });

  describe('Add Details Toggle', () => {
    it('shows "Add details" toggle when onDetailsChange is provided', () => {
      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={['okay']}
          onMoodChange={mockOnMoodChange}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      expect(screen.getByTestId('add-details-toggle')).toBeTruthy();
    });

    it('shows details section when toggle is pressed', () => {
      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={['okay']}
          onMoodChange={mockOnMoodChange}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('add-details-toggle'));
      expect(screen.getByTestId('journal-space')).toBeTruthy();
      expect(screen.getByTestId('journal-tag-input')).toBeTruthy();
    });
  });

  describe('Details Section - Tags', () => {
    it('renders tag input and add button', () => {
      const details: JournalDetailsState = {
        tags: [],
      };

      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={['okay']}
          onMoodChange={mockOnMoodChange}
          details={details}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('add-details-toggle'));
      expect(screen.getByTestId('journal-tag-input')).toBeTruthy();
      expect(screen.getByTestId('journal-tag-add')).toBeTruthy();
    });

    it('adds a tag when add button is pressed', () => {
      const details: JournalDetailsState = {
        tags: [],
      };

      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={['okay']}
          onMoodChange={mockOnMoodChange}
          details={details}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('add-details-toggle'));
      const tagInput = screen.getByTestId('journal-tag-input');
      const addButton = screen.getByTestId('journal-tag-add');

      fireEvent.changeText(tagInput, 'Gratitude');
      fireEvent.press(addButton);

      expect(mockOnDetailsChange).toHaveBeenCalledWith({
        tags: ['Gratitude'],
      });
    });
  });

  describe('Disabled State', () => {
    it('disables all mood chips when disabled prop is true', () => {
      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={null}
          onMoodChange={mockOnMoodChange}
          disabled={true}
        />,
      );

      const goodChip = screen.getByTestId('mood-good');
      expect(goodChip.props.accessibilityState.disabled).toBe(true);
    });

    it('disables inspiration button when disabled prop is true', () => {
      render(
        <JournalFields
          date="2025-10-19"
          onDateChange={mockOnDateChange}
          entry=""
          onEntryChange={mockOnEntryChange}
          mood={null}
          onMoodChange={mockOnMoodChange}
          disabled={true}
        />,
      );

      const inspireButton = screen.getByTestId('journal-inspire');
      expect(inspireButton.props.accessibilityState.disabled).toBe(true);
    });
  });
});
