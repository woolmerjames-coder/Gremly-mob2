import React from 'react';
import { render as _render, fireEvent, waitFor } from '@testing-library/react-native';
import { SheetManager as _SheetManager } from 'react-native-actions-sheet';

// Mock the Zustand store and RepoProvider BEFORE importing the component
const mockCreateSpace = jest.fn();
const mockCreateMilestone = jest.fn();
const mockUpsertSpaceMeta = jest.fn();

// Mock useGremlyStore for createSpace and createMilestone (now uses Zustand)
jest.mock('../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: any) => {
    const state = {
      createSpace: mockCreateSpace,
      createMilestone: mockCreateMilestone,
    };
    return selector(state);
  },
}));

// Keep RepoProvider mock for upsertSpaceMeta (still uses repo)
jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    upsertSpaceMeta: mockUpsertSpaceMeta,
  }),
}));

// Mock SheetManager
jest.mock('react-native-actions-sheet', () => ({
  __esModule: true,
  default: ({ children }: any) => children,
  SheetManager: {
    show: jest.fn(),
    hide: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock lucide icons
jest.mock('lucide-react-native', () => ({
  ChevronDown: () => null,
  ChevronUp: () => null,
  Calendar: () => null,
  X: () => null,
}));

// Mock DateTimePicker
jest.mock('@react-native-community/datetimepicker', () => {
  return () => null;
});

// Import component AFTER mocks are set up
import CreateSpaceModal, { setCreateSpaceCallback } from '../components/CreateSpaceModal';
import { renderWithProviders } from './utils/renderWithProviders';

describe('CreateSpaceModal', () => {
  const mockSpace = {
    id: 'new-space-id',
    name: 'Test Space',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockMilestone = {
    id: 'new-milestone-id',
    space_id: 'new-space-id',
    name: 'Test Milestone',
    date: null,
    completed: false,
    completed_at: null,
    is_active: true,
    sort_order: 0,
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockMeta = {
    id: 'new-meta-id',
    space_id: 'new-space-id',
    success_criteria: null,
    other_context: null,
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSpace.mockResolvedValue(mockSpace);
    mockCreateMilestone.mockResolvedValue(mockMilestone);
    mockUpsertSpaceMeta.mockResolvedValue(mockMeta);
  });

  describe('Single-page form', () => {
    it('renders name input and more details toggle', () => {
      const { getByTestId, getByText, queryByTestId } = renderWithProviders(<CreateSpaceModal />);

      expect(getByTestId('space-name-input')).toBeTruthy();
      expect(getByText('Add more details')).toBeTruthy();
      expect(getByText('Cancel')).toBeTruthy();
      expect(getByText('Create Space')).toBeTruthy();
      // Goal should be hidden initially
      expect(queryByTestId('goal-name-input')).toBeNull();
    });

    it('creates Space with only name when no other fields filled', async () => {
      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      fireEvent.changeText(getByTestId('space-name-input'), 'Test Space');
      fireEvent.press(getByText('Create Space'));

      await waitFor(() => {
        expect(mockCreateSpace).toHaveBeenCalledWith({
          name: 'Test Space',
        });
        expect(mockCreateMilestone).not.toHaveBeenCalled();
        expect(mockUpsertSpaceMeta).not.toHaveBeenCalled();
      });
    });

    it('creates Space with goal/milestone when goal is provided', async () => {
      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      fireEvent.changeText(getByTestId('space-name-input'), 'Fitness');

      // Expand details to access goal input
      fireEvent.press(getByText('Add more details'));

      await waitFor(() => {
        expect(getByTestId('goal-name-input')).toBeTruthy();
      });

      fireEvent.changeText(getByTestId('goal-name-input'), 'Run a 5K');
      fireEvent.press(getByText('Create Space'));

      await waitFor(() => {
        expect(mockCreateSpace).toHaveBeenCalledWith({ name: 'Fitness' });
        expect(mockCreateMilestone).toHaveBeenCalledWith(
          'new-space-id',
          expect.objectContaining({
            name: 'Run a 5K',
            date: null,
          }),
        );
      });
    });

    it('expands more details section when toggled', async () => {
      const { getByTestId, getByText, queryByTestId } = renderWithProviders(<CreateSpaceModal />);

      // Initially, all optional inputs should not be visible
      expect(queryByTestId('goal-name-input')).toBeNull();
      expect(queryByTestId('success-criteria-input')).toBeNull();
      expect(queryByTestId('notes-input')).toBeNull();

      // Tap "Add more details"
      fireEvent.press(getByText('Add more details'));

      // Now should be visible
      await waitFor(() => {
        expect(getByTestId('goal-name-input')).toBeTruthy();
        expect(getByTestId('success-criteria-input')).toBeTruthy();
        expect(getByTestId('notes-input')).toBeTruthy();
      });
    });

    it('creates Space with meta when details are provided', async () => {
      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      fireEvent.changeText(getByTestId('space-name-input'), 'Fitness');

      // Expand details
      fireEvent.press(getByText('Add more details'));

      await waitFor(() => {
        expect(getByTestId('goal-name-input')).toBeTruthy();
      });

      fireEvent.changeText(getByTestId('goal-name-input'), 'Run a 5K');
      await waitFor(() => {
        expect(mockCreateSpace).toHaveBeenCalledWith({ name: 'Fitness' });
        expect(mockCreateMilestone).toHaveBeenCalledWith(
          'new-space-id',
          expect.objectContaining({
            name: 'Run a 5K',
          }),
        );
        expect(mockUpsertSpaceMeta).toHaveBeenCalledWith('new-space-id', {
          success_criteria: 'Finish without walking',
          other_context: 'Training with partner',
        });
      });
    });

    it('calls callback with created space', async () => {
      const callback = jest.fn();
      setCreateSpaceCallback(callback);

      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      fireEvent.changeText(getByTestId('space-name-input'), 'Test Space');
      fireEvent.press(getByText('Create Space'));

      await waitFor(() => {
        expect(callback).toHaveBeenCalledWith(mockSpace);
      });
    });

    it('disables Create Space button when name is empty', () => {
      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      // Don't enter anything
      const createButton = getByText('Create Space');

      // Button should be disabled (we check by trying to press it)
      fireEvent.press(createButton);

      // createSpace should not have been called
      expect(mockCreateSpace).not.toHaveBeenCalled();
    });

    it('closes modal and resets form on Cancel', async () => {
      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);
      const SheetManager = require('react-native-actions-sheet').SheetManager;

      fireEvent.changeText(getByTestId('space-name-input'), 'Some text');
      fireEvent.press(getByText('Cancel'));

      await waitFor(() => {
        expect(SheetManager.hide).toHaveBeenCalledWith('new-space');
      });
    });
  });
});
