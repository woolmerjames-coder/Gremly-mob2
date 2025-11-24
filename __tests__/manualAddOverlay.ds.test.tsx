/**
 * ManualAddOverlay Tests - Phase 6 (Brand Refresh)
 * Comprehensive RTL tests for the overlay functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ManualAddOverlay } from '../legacy/overlays/ManualAddOverlay';
import { CortexProvider } from '../providers/CortexProvider';
import { RepoProvider } from '../providers/RepoProvider';
import { AuthProvider } from '../providers/AuthProvider';

// Note: Supabase client mock is in jest-setup.ts globally

// Mock Cortex engine
const mockClassify = jest.fn();
jest.mock('../providers/CortexProvider', () => {
  const actual = jest.requireActual('../providers/CortexProvider');
  return {
    ...actual,
    useCortex: () => ({
      classify: mockClassify,
    }),
  };
});

// Mock repo
const mockRepoCreate = jest.fn();
jest.mock('../providers/RepoProvider', () => {
  const actual = jest.requireActual('../providers/RepoProvider');
  return {
    ...actual,
    useRepo: () => ({
      create: mockRepoCreate,
      list: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      delete: jest.fn(),
    }),
  };
});

// Mock auth
jest.mock('../providers/AuthProvider', () => {
  return {
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
    useAuth: () => ({
      user: { id: 'test-user-1', email: 'test@example.com' },
      signIn: jest.fn(),
      signOut: jest.fn(),
      loading: false,
    }),
  };
});

// Mock providers if needed
const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <AuthProvider>
        <CortexProvider>
          <RepoProvider>{component}</RepoProvider>
        </CortexProvider>
      </AuthProvider>
    </SafeAreaProvider>,
  );
};

describe('ManualAddOverlay', () => {
  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
    mockOnSubmit.mockClear();
    mockClassify.mockClear();
    mockRepoCreate.mockClear();
    // Set up env for classification
    process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = 'true';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL;
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

    it('submits Catch-All form and saves internally with Cortex classification', async () => {
      // Mock Cortex to return a classification
      const mockClassification = {
        type: 'todo' as const,
        subtype: 'task',
        aiPlaced: true,
        whyString: 'AI detected todo item',
      };
      mockClassify.mockResolvedValue(mockClassification);
      mockRepoCreate.mockResolvedValue({ id: 'new-item-1' });

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
      fireEvent.changeText(entryInput, 'Buy milk tomorrow');

      // Submit
      const submitButton = screen.getByTestId('capture-catchall');
      fireEvent.press(submitButton);

      await waitFor(() => {
        // Verify classification was called
        expect(mockClassify).toHaveBeenCalledWith({
          text: 'Buy milk tomorrow',
          spaceId: null,
        });

        // Verify repo.create was called with classified payload
        expect(mockRepoCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'todo',
            ai_placed: true,
            why_string: 'AI detected todo item',
            origin: 'catchall',
          }),
        );

        // Verify overlay closed
        expect(mockOnClose).toHaveBeenCalled();
      });

      // onSubmit should NOT be called for catch-all (handled internally)
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('saves catch-all with heuristic when classification disabled', async () => {
      // Disable classification
      process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = 'false';
      mockRepoCreate.mockResolvedValue({ id: 'new-item-2' });

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
        // Verify classification was NOT called
        expect(mockClassify).not.toHaveBeenCalled();

        // Verify repo.create was called with default payload
        expect(mockRepoCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'note',
            subtype: 'catchall',
            ai_placed: true,
            why_string: 'Heuristic default.',
            origin: 'catchall',
          }),
        );

        // Verify overlay closed
        expect(mockOnClose).toHaveBeenCalled();
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
