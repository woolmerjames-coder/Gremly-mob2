/**
 * Form Visibility Test - Verify all forms render correctly
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ManualAddOverlay } from '../components/ManualAddOverlay';

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { width: 375, height: 812, x: 0, y: 0 },
      }}
    >
      {component}
    </SafeAreaProvider>,
  );
};

describe('ManualAddOverlay - Form Visibility', () => {
  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders HabitsTab with Start form by default', () => {
    renderWithProviders(
      <ManualAddOverlay
        visible={true}
        defaultTab="habits"
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />,
    );

    // Check for habits tab elements
    expect(screen.getByTestId('habits-tab')).toBeTruthy();
    expect(screen.getByTestId('habit-toggle-start')).toBeTruthy();
    expect(screen.getByTestId('habit-toggle-break')).toBeTruthy();
    expect(screen.getByTestId('habit-start-form')).toBeTruthy();
    expect(screen.getByTestId('habit-start-name')).toBeTruthy();

    // Reminders should be visible for habits
    expect(screen.getByTestId('reminders-pinned')).toBeTruthy();
  });

  it('switches to HabitBreakForm when Break toggle pressed', () => {
    renderWithProviders(
      <ManualAddOverlay
        visible={true}
        defaultTab="habits"
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />,
    );

    fireEvent.press(screen.getByTestId('habit-toggle-break'));

    expect(screen.getByTestId('habit-break-form')).toBeTruthy();
    expect(screen.getByTestId('habit-break-name')).toBeTruthy();
  });

  it('renders TodoForm when todos tab pressed', async () => {
    renderWithProviders(
      <ManualAddOverlay
        visible={true}
        defaultTab="habits"
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />,
    );

    fireEvent.press(screen.getByTestId('tab-todos'));

    await waitFor(() => {
      expect(screen.getByTestId('todo-form')).toBeTruthy();
      expect(screen.getByTestId('todo-name')).toBeTruthy();
    });

    // Reminders should be visible for todos
    expect(screen.getByTestId('reminders-pinned')).toBeTruthy();
  });

  it('renders JournalForm when journal tab pressed', async () => {
    renderWithProviders(
      <ManualAddOverlay
        visible={true}
        defaultTab="habits"
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />,
    );

    fireEvent.press(screen.getByTestId('tab-journal'));

    await waitFor(() => {
      expect(screen.getByTestId('journal-form')).toBeTruthy();
      expect(screen.getByTestId('journal-date')).toBeTruthy();
      expect(screen.getByTestId('journal-entry')).toBeTruthy();
    });

    // Reminders should be visible for journal
    expect(screen.getByTestId('reminders-pinned')).toBeTruthy();
  });

  it('renders CatchAllForm when catchall tab pressed', async () => {
    renderWithProviders(
      <ManualAddOverlay
        visible={true}
        defaultTab="habits"
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />,
    );

    fireEvent.press(screen.getByTestId('tab-catchall'));

    await waitFor(() => {
      expect(screen.getByTestId('catchall-form')).toBeTruthy();
      expect(screen.getByTestId('catchall-entry')).toBeTruthy();
    });

    // Reminders should NOT be visible for catchall
    expect(screen.queryByTestId('reminders-pinned')).toBeNull();
  });

  it('shows manual-body testID wrapper', () => {
    renderWithProviders(
      <ManualAddOverlay
        visible={true}
        defaultTab="habits"
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />,
    );

    expect(screen.getByTestId('manual-body')).toBeTruthy();
    expect(screen.getByTestId('manual-overlay')).toBeTruthy();
  });

  it('all tab keys match and are clickable', () => {
    renderWithProviders(
      <ManualAddOverlay
        visible={true}
        defaultTab="habits"
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />,
    );

    // All tabs should be present
    expect(screen.getByTestId('tab-habits')).toBeTruthy();
    expect(screen.getByTestId('tab-todos')).toBeTruthy();
    expect(screen.getByTestId('tab-journal')).toBeTruthy();
    expect(screen.getByTestId('tab-catchall')).toBeTruthy();

    // All tabs should be pressable (no errors)
    fireEvent.press(screen.getByTestId('tab-todos'));
    fireEvent.press(screen.getByTestId('tab-journal'));
    fireEvent.press(screen.getByTestId('tab-catchall'));
    fireEvent.press(screen.getByTestId('tab-habits'));
  });
});
