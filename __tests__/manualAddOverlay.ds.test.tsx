/**
 * ManualAddOverlay Tests - Phase 6 (Brand Refresh)
 * Comprehensive RTL tests for the overlay functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ManualAddOverlay } from '../components/ManualAddOverlay';

// Mock providers if needed
const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      {component}
    </SafeAreaProvider>,
  );
};

describe('ManualAddOverlay', () => {
  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
    mockOnSubmit.mockClear();
  });

  describe('Overlay Rendering', () => {
    it('renders overlay when visible', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      expect(screen.getByTestId('manual-overlay')).toBeTruthy();
    });

    it('renders all 4 tabs', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      expect(screen.getByTestId('tab-habits')).toBeTruthy();
      expect(screen.getByTestId('tab-todos')).toBeTruthy();
      expect(screen.getByTestId('tab-journal')).toBeTruthy();
      expect(screen.getByTestId('tab-catchall')).toBeTruthy();
    });

    it('renders exit button', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      expect(screen.getByTestId('exit-button')).toBeTruthy();
    });
  });

  describe('Tab Switching', () => {
    it('shows Habits tab by default', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      // Should see habit toggle
      expect(screen.getByTestId('habit-toggle-start')).toBeTruthy();
    });

    it('switches to To-Dos tab', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      fireEvent.press(screen.getByTestId('tab-todos'));

      // Should see todo name field
      expect(screen.getByTestId('todo-name')).toBeTruthy();
    });

    it('switches to Journal tab', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      fireEvent.press(screen.getByTestId('tab-journal'));

      // Should see journal date and entry fields
      expect(screen.getByTestId('journal-date')).toBeTruthy();
      expect(screen.getByTestId('journal-entry')).toBeTruthy();
    });

    it('switches to Catch-All tab', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      fireEvent.press(screen.getByTestId('tab-catchall'));

      // Should see catchall entry field
      expect(screen.getByTestId('catchall-entry')).toBeTruthy();
    });
  });

  describe('Reminders Pinned Correctly', () => {
    it('shows reminders on Habits tab', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      // Reminders should be visible
      expect(screen.getByTestId('reminder-add')).toBeTruthy();
    });

    it('shows reminders on To-Dos tab', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      fireEvent.press(screen.getByTestId('tab-todos'));
      expect(screen.getByTestId('reminder-add')).toBeTruthy();
    });

    it('shows reminders on Journal tab', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      fireEvent.press(screen.getByTestId('tab-journal'));
      expect(screen.getByTestId('reminder-add')).toBeTruthy();
    });

    it('hides reminders on Catch-All tab', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      fireEvent.press(screen.getByTestId('tab-catchall'));
      expect(screen.queryByTestId('reminder-add')).toBeNull();
    });
  });

  describe('Habits Tab', () => {
    it('shows Start/Break toggle', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      expect(screen.getByTestId('habit-toggle-start')).toBeTruthy();
      expect(screen.getByTestId('habit-toggle-break')).toBeTruthy();
    });

    it('shows frequency chips in Start form', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      fireEvent.press(screen.getByTestId('habit-toggle-start'));
      expect(screen.getByTestId('freq-daily')).toBeTruthy();
      expect(screen.getByTestId('freq-weekly')).toBeTruthy();
    });

    it('switches to Break form', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      fireEvent.press(screen.getByTestId('habit-toggle-break'));
      expect(screen.getByTestId('habit-break-name')).toBeTruthy();
    });
  });

  describe('Form Submission', () => {
    it('submits Habit Start form with valid data', async () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      // Fill form
      const nameInput = screen.getByTestId('habit-start-name');
      fireEvent.changeText(nameInput, 'Meditate daily');

      // Submit
      const submitButton = screen.getByTestId('habit-start-submit');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'habits',
            subType: 'start',
            data: expect.objectContaining({
              name: 'Meditate daily',
            }),
          }),
        );
      });
    });

    it('submits To-Do form with valid data', async () => {
      renderWithProviders(
        <ManualAddOverlay
          visible={true}
          defaultTab="todos"
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />,
      );

      // Fill form
      const nameInput = screen.getByTestId('todo-name');
      fireEvent.changeText(nameInput, 'Finish report');

      // Submit
      const submitButton = screen.getByTestId('todo-submit');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'todos',
            data: expect.objectContaining({
              name: 'Finish report',
            }),
          }),
        );
      });
    });

    it('submits Journal form with valid data', async () => {
      renderWithProviders(
        <ManualAddOverlay
          visible={true}
          defaultTab="journal"
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />,
      );

      // Fill form
      const entryInput = screen.getByTestId('journal-entry');
      fireEvent.changeText(entryInput, 'Today was a great day');

      // Submit
      const submitButton = screen.getByTestId('journal-submit');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'journal',
            data: expect.objectContaining({
              entry: 'Today was a great day',
            }),
          }),
        );
      });
    });

    it('submits Catch-All form with valid data', async () => {
      renderWithProviders(
        <ManualAddOverlay
          visible={true}
          defaultTab="catchall"
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />,
      );

      // Fill form
      const entryInput = screen.getByTestId('catchall-entry');
      fireEvent.changeText(entryInput, 'Random thought');

      // Submit
      const submitButton = screen.getByTestId('capture-catchall');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'catchall',
            data: expect.objectContaining({
              entry: 'Random thought',
            }),
          }),
        );
      });
    });
  });

  describe('Footer Callbacks', () => {
    it('calls onClose when exit button pressed', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      fireEvent.press(screen.getByTestId('exit-button'));
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when footer exit pressed', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      fireEvent.press(screen.getByTestId('footer-exit'));
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Optional Fields', () => {
    it('shows optional fields when toggled in Habit Start form', () => {
      renderWithProviders(
        <ManualAddOverlay visible={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
      );

      // Initially hidden
      expect(screen.queryByTestId('habit-start-notes')).toBeNull();

      // Toggle show
      fireEvent.press(screen.getByTestId('show-optional'));

      // Now visible
      expect(screen.getByTestId('habit-start-notes')).toBeTruthy();
      expect(screen.getByTestId('habit-start-category')).toBeTruthy();
    });

    it('shows optional fields in To-Do form', () => {
      renderWithProviders(
        <ManualAddOverlay
          visible={true}
          defaultTab="todos"
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />,
      );

      fireEvent.press(screen.getByTestId('show-optional'));

      expect(screen.getByTestId('todo-deadline')).toBeTruthy();
      expect(screen.getByTestId('todo-notes')).toBeTruthy();
    });
  });
});
