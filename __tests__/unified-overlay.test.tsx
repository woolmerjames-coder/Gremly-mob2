/**
 * UnifiedCreateOverlay Integration Tests (Simplified)
 *
 * Tests critical user flows matching actual component implementation:
 * 1. Create habit flow (tap type pill → enter name → pick frequency → save)
 * 2. AI freeform flow (tap AI mode → type text → save)
 * 3. Edit flow (open with mode='edit', verify AI button disabled, save triggers update)
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UnifiedCreateOverlay } from '../components/overlay/UnifiedCreateOverlay';
import { useRepo } from '../providers/RepoProvider';
import type { AppRecord } from '../lib/types';

// Mock dependencies
jest.mock('../providers/RepoProvider');
jest.mock('../providers/CortexProvider', () => ({
  useCortex: () => ({
    classify: jest.fn(() =>
      Promise.resolve({
        type: 'note',
        subtype: 'catchall',
        why_string: 'AI classified this as a note',
      }),
    ),
  }),
}));
jest.mock('../providers/ThemeProvider', () => ({
  useTheme: () => ({
    theme: {
      mode: 'light',
      colors: {
        deepTeal: {
          DEFAULT: '#0A2F2E',
          600: '#0D3B3A',
          700: '#0B3332',
          900: '#072524',
        },
        mint: '#B7F7E1',
        cream: '#FFF9F0',
        periwinkle: '#C9D4FF',
        bg: {
          DEFAULT: '#FFFDF8',
          secondary: '#FFF4E6',
        },
        text: {
          primary: '#1A1A1A',
          secondary: '#4B5563',
          tertiary: '#9CA3AF',
        },
        border: {
          DEFAULT: '#E7E2D9',
          light: '#F3F4F6',
          focus: '#0D3B3A',
        },
        white: '#FFFFFF',
        black: '#000000',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        gray: '#9CA3AF',
        status: {
          success: '#10B981',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#3B82F6',
        },
      },
    },
  }),
}));

const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  getAll: jest.fn(() => []),
};

(useRepo as jest.Mock).mockReturnValue(mockRepo);

// Render helper with providers
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

describe('UnifiedCreateOverlay - Critical Flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Create Habit Flow', () => {
    it('should select habit → enter name → pick frequency → save', async () => {
      const onClose = jest.fn();
      mockRepo.create.mockResolvedValue({ id: 'habit-123', type: 'habit' });

      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay visible={true} mode="create" onClose={onClose} />,
      );

      // Step 1: Tap habit type pill
      fireEvent.press(getByTestId('type-pill-habit'));

      // Step 2: Wait for habit form to appear and enter name
      await waitFor(() => {
        expect(getByTestId('habit-name-input')).toBeTruthy();
      });
      fireEvent.changeText(getByTestId('habit-name-input'), 'Morning meditation');

      // Step 3: Select daily frequency
      fireEvent.press(getByTestId('frequency-chip-daily'));

      // Step 4: Save
      fireEvent.press(getByTestId('save-to-hub'));

      // Verify repo.create called with correct habit data
      await waitFor(() => {
        expect(mockRepo.create).toHaveBeenCalledWith({
          type: 'habit',
          title: 'Morning meditation',
          frequency: 'daily',
          subtype: undefined,
          space_id: null,
          ai_placed: false,
        });
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should support different frequencies and subtypes', async () => {
      const onClose = jest.fn();
      mockRepo.create.mockResolvedValue({ id: 'habit-456', type: 'habit' });

      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay visible={true} mode="create" onClose={onClose} />,
      );

      // Select habit
      fireEvent.press(getByTestId('type-pill-habit'));

      await waitFor(() => {
        expect(getByTestId('habit-name-input')).toBeTruthy();
      });

      // Enter name
      fireEvent.changeText(getByTestId('habit-name-input'), 'Gym workout');

      // Select break_habit subtype
      fireEvent.press(getByTestId('subtype-pill-break_habit'));

      // Select weekly frequency
      fireEvent.press(getByTestId('frequency-chip-weekly'));

      // Save
      fireEvent.press(getByTestId('save-to-hub'));

      await waitFor(() => {
        expect(mockRepo.create).toHaveBeenCalledWith({
          type: 'habit',
          title: 'Gym workout',
          frequency: 'weekly',
          subtype: 'break_habit',
          space_id: null,
          ai_placed: false,
        });
      });
    });
  });

  describe('2. AI Freeform Flow', () => {
    it('should toggle AI mode → enter text → save', async () => {
      const onClose = jest.fn();
      mockRepo.create.mockResolvedValue({ id: 'note-ai-123', type: 'note' });

      const { getByTestId, queryByTestId } = renderWithProviders(
        <UnifiedCreateOverlay visible={true} mode="create" onClose={onClose} />,
      );

      // Step 1: Verify type pills are visible initially
      expect(queryByTestId('type-pill-habit')).toBeTruthy();
      expect(queryByTestId('type-pill-todo')).toBeTruthy();

      // Step 2: Tap AI mode button
      fireEvent.press(getByTestId('ai-mode-button'));

      // Step 3: Verify freeform input appears
      await waitFor(() => {
        expect(getByTestId('freeform-input')).toBeTruthy();
      });

      // Step 4: Enter freeform text
      fireEvent.changeText(getByTestId('freeform-input'), 'Buy groceries tomorrow');

      // Step 5: Save
      fireEvent.press(getByTestId('save-to-hub'));

      // Verify repo.create called with AI catchall data
      await waitFor(() => {
        expect(mockRepo.create).toHaveBeenCalledWith({
          type: 'note',
          title: '',
          body: 'Buy groceries tomorrow',
          subtype: 'catchall',
          space_id: null,
          ai_placed: true,
          why_string: expect.any(String),
          origin: 'catchall',
        });
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should toggle back from AI mode to manual mode', async () => {
      const onClose = jest.fn();

      const { getByTestId, queryByTestId } = renderWithProviders(
        <UnifiedCreateOverlay visible={true} mode="create" onClose={onClose} />,
      );

      // Enter AI mode
      fireEvent.press(getByTestId('ai-mode-button'));

      await waitFor(() => {
        expect(getByTestId('freeform-input')).toBeTruthy();
      });

      // Toggle back to manual mode
      fireEvent.press(getByTestId('ai-mode-button'));

      // Verify type pills reappear
      await waitFor(() => {
        expect(queryByTestId('type-pill-habit')).toBeTruthy();
        expect(queryByTestId('type-pill-todo')).toBeTruthy();
        expect(queryByTestId('freeform-input')).toBeNull();
      });
    });
  });

  describe('3. Edit Flow', () => {
    it('should edit habit with AI button hidden', async () => {
      const onClose = jest.fn();
      const existingHabit: AppRecord = {
        id: 'habit-edit-123',
        type: 'habit',
        title: 'Original habit name',
        frequency: 'daily',
        subtype: undefined,
        space_id: null,
        ai_placed: false,
        owner_id: 'user-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepo.update.mockResolvedValue({
        ...existingHabit,
        title: 'Updated habit name',
      });

      const { getByTestId, queryByTestId } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="edit"
          initialEntity={existingHabit}
          onClose={onClose}
        />,
      );

      // Verify AI mode button is NOT visible in edit mode
      expect(queryByTestId('ai-mode-button')).toBeNull();

      // Wait for habit form to appear
      await waitFor(() => {
        expect(getByTestId('habit-name-input')).toBeTruthy();
      });

      // Edit the name (component may or may not pre-fill, but we can update it)
      fireEvent.changeText(getByTestId('habit-name-input'), 'Updated habit name');

      // Save
      fireEvent.press(getByTestId('save-to-hub'));

      // Verify repo.update called with correct patch
      await waitFor(() => {
        expect(mockRepo.update).toHaveBeenCalledWith({
          id: 'habit-edit-123',
          patch: {
            title: 'Updated habit name',
            frequency: 'daily',
            subtype: undefined,
          },
        });
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should edit todo in edit mode', async () => {
      const onClose = jest.fn();
      const existingTodo: AppRecord = {
        id: 'todo-edit-456',
        type: 'todo',
        title: 'Original todo',
        space_id: 'space-home',
        undefined_due: true,
        ai_placed: false,
        owner_id: 'user-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockRepo.update.mockResolvedValue({
        ...existingTodo,
        title: 'Updated todo',
      });

      const { getByTestId, queryByTestId } = renderWithProviders(
        <UnifiedCreateOverlay
          visible={true}
          mode="edit"
          initialEntity={existingTodo}
          onClose={onClose}
        />,
      );

      // Verify AI button not visible
      expect(queryByTestId('ai-mode-button')).toBeNull();

      // Wait for todo form to appear
      await waitFor(() => {
        expect(getByTestId('todo-name-input')).toBeTruthy();
      });

      // Edit the title (component may or may not pre-fill, but we can update it)
      fireEvent.changeText(getByTestId('todo-name-input'), 'Updated todo');

      // Save
      fireEvent.press(getByTestId('save-to-hub'));

      await waitFor(() => {
        expect(mockRepo.update).toHaveBeenCalledWith({
          id: 'todo-edit-456',
          patch: {
            title: 'Updated todo',
            due_date: null, // Component includes due_date in patch
          },
        });
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe('Validation', () => {
    it('should not allow saving habit without name', async () => {
      const onClose = jest.fn();

      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay visible={true} mode="create" onClose={onClose} />,
      );

      // Select habit
      fireEvent.press(getByTestId('type-pill-habit'));

      await waitFor(() => {
        expect(getByTestId('habit-name-input')).toBeTruthy();
      });

      // Don't enter name, just select frequency
      fireEvent.press(getByTestId('frequency-chip-daily'));

      // Try to save
      fireEvent.press(getByTestId('save-to-hub'));

      // Verify repo.create was NOT called (button should be disabled)
      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('should not allow saving AI freeform without text', async () => {
      const onClose = jest.fn();

      const { getByTestId } = renderWithProviders(
        <UnifiedCreateOverlay visible={true} mode="create" onClose={onClose} />,
      );

      // Enter AI mode
      fireEvent.press(getByTestId('ai-mode-button'));

      await waitFor(() => {
        expect(getByTestId('freeform-input')).toBeTruthy();
      });

      // Don't enter text, just try to save (button should be disabled)
      const saveButton = getByTestId('save-to-hub');

      // In React Native Testing Library, disabled buttons can still be pressed
      // but the component should prevent the action
      fireEvent.press(saveButton);

      // Verify repo.create was NOT called
      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
