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
  Flag: () => null,
  Folder: () => null,
}));

// Mock spaceIconMatcher - returns a mock component
jest.mock('../lib/utils/spaceIconMatcher', () => ({
  getSpaceIcon: () => () => null,
}));

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

  describe('Step 1: Name + Milestone', () => {
    it('renders space name and milestone inputs', () => {
      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      expect(getByTestId('space-name-input')).toBeTruthy();
      expect(getByTestId('milestone-name-input')).toBeTruthy();
      expect(getByText('Skip for now')).toBeTruthy();
      expect(getByText('Continue')).toBeTruthy();
    });

    it('calls createSpace without milestone when Skip pressed', async () => {
      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      // Find the TextInput inside the Input component
      const spaceNameInput = getByTestId('space-name-input');
      fireEvent.changeText(spaceNameInput, 'Test Space');

      fireEvent.press(getByText('Skip for now'));

      await waitFor(() => {
        expect(mockCreateSpace).toHaveBeenCalledWith({
          name: 'Test Space',
        });
        expect(mockCreateMilestone).not.toHaveBeenCalled();
      });
    });

    it('creates Space without milestone when Continue pressed with no milestone', async () => {
      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      fireEvent.changeText(getByTestId('space-name-input'), 'Test Space');
      // Don't enter milestone
      fireEvent.press(getByText('Continue'));

      await waitFor(() => {
        expect(mockCreateSpace).toHaveBeenCalledWith({
          name: 'Test Space',
        });
        expect(mockCreateMilestone).not.toHaveBeenCalled();
      });
    });

    it('goes to Step 2 when Continue pressed with milestone', async () => {
      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      fireEvent.changeText(getByTestId('space-name-input'), 'Honeymoon');
      fireEvent.changeText(getByTestId('milestone-name-input'), 'Trip to Japan');
      fireEvent.press(getByText('Continue'));

      // Should now be on Step 2
      await waitFor(() => {
        expect(getByText('Help Gremly help you')).toBeTruthy();
        expect(getByTestId('milestone-date-input')).toBeTruthy();
      });

      // Space should NOT be created yet
      expect(mockCreateSpace).not.toHaveBeenCalled();
    });
  });

  describe('Step 2: Enrichment', () => {
    const goToStep2 = async (getByTestId: any, getByText: any) => {
      fireEvent.changeText(getByTestId('space-name-input'), 'Honeymoon');
      fireEvent.changeText(getByTestId('milestone-name-input'), 'Trip to Japan');
      fireEvent.press(getByText('Continue'));

      await waitFor(() => {
        expect(getByTestId('milestone-date-input')).toBeTruthy();
      });
    };

    it('creates Space with milestone when Skip pressed on Step 2', async () => {
      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      await goToStep2(getByTestId, getByText);

      // Press Skip on Step 2
      fireEvent.press(getByText('Skip for now'));

      await waitFor(() => {
        expect(mockCreateSpace).toHaveBeenCalledWith({ name: 'Honeymoon' });
        expect(mockCreateMilestone).toHaveBeenCalledWith(
          'new-space-id',
          expect.objectContaining({
            name: 'Trip to Japan',
            date: null,
          }),
        );
        expect(mockUpsertSpaceMeta).not.toHaveBeenCalled();
      });
    });

    it('creates Space with milestone and meta when Save & Start pressed', async () => {
      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      await goToStep2(getByTestId, getByText);

      // Fill enrichment fields
      fireEvent.changeText(getByTestId('milestone-date-input'), '2025-06-15');
      fireEvent.changeText(getByTestId('success-criteria-input'), 'Relaxed trip');
      fireEvent.changeText(getByTestId('other-context-input'), 'Wife prefers quiet spots');

      fireEvent.press(getByText('Save & Start'));

      await waitFor(() => {
        expect(mockCreateSpace).toHaveBeenCalledWith({ name: 'Honeymoon' });
        expect(mockCreateMilestone).toHaveBeenCalledWith(
          'new-space-id',
          expect.objectContaining({
            name: 'Trip to Japan',
            date: '2025-06-15',
          }),
        );
        expect(mockUpsertSpaceMeta).toHaveBeenCalledWith(
          'new-space-id',
          expect.objectContaining({
            success_criteria: 'Relaxed trip',
            other_context: 'Wife prefers quiet spots',
          }),
        );
      });
    });

    it('allows going back to Step 1', async () => {
      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      await goToStep2(getByTestId, getByText);

      // Press Back
      fireEvent.press(getByText('← Back'));

      await waitFor(() => {
        // Should be back on Step 1
        expect(getByText('Create a Space')).toBeTruthy();
        expect(getByTestId('space-name-input')).toBeTruthy();
      });

      // Space should NOT have been created
      expect(mockCreateSpace).not.toHaveBeenCalled();
    });
  });

  describe('Callback', () => {
    it('calls onCreatedCallback with new space', async () => {
      const callback = jest.fn();
      setCreateSpaceCallback(callback);

      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      fireEvent.changeText(getByTestId('space-name-input'), 'Test Space');
      fireEvent.press(getByText('Skip for now'));

      await waitFor(() => {
        expect(callback).toHaveBeenCalledWith(mockSpace);
      });
    });

    it('clears callback after calling it', async () => {
      const callback = jest.fn();
      setCreateSpaceCallback(callback);

      const {
        getByTestId,
        getByText,
        rerender: _rerender,
      } = renderWithProviders(<CreateSpaceModal />);

      // First creation
      fireEvent.changeText(getByTestId('space-name-input'), 'Test Space');
      fireEvent.press(getByText('Skip for now'));

      await waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(1);
      });

      // Callback should be cleared - set a new one to verify
      const callback2 = jest.fn();
      setCreateSpaceCallback(callback2);

      // Create another space
      fireEvent.changeText(getByTestId('space-name-input'), 'Test Space 2');
      fireEvent.press(getByText('Skip for now'));

      await waitFor(() => {
        expect(callback2).toHaveBeenCalled();
        expect(callback).toHaveBeenCalledTimes(1); // Still just 1
      });
    });
  });

  describe('Error handling', () => {
    it('displays error when createSpace fails', async () => {
      mockCreateSpace.mockRejectedValueOnce(new Error('Network error'));

      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      fireEvent.changeText(getByTestId('space-name-input'), 'Test Space');
      fireEvent.press(getByText('Skip for now'));

      await waitFor(() => {
        expect(getByText('Network error')).toBeTruthy();
      });
    });

    it('displays error when createMilestone fails', async () => {
      mockCreateMilestone.mockRejectedValueOnce(new Error('Milestone error'));

      const { getByTestId, getByText } = renderWithProviders(<CreateSpaceModal />);

      // Go to Step 2
      fireEvent.changeText(getByTestId('space-name-input'), 'Honeymoon');
      fireEvent.changeText(getByTestId('milestone-name-input'), 'Trip to Japan');
      fireEvent.press(getByText('Continue'));

      await waitFor(() => {
        expect(getByTestId('milestone-date-input')).toBeTruthy();
      });

      fireEvent.press(getByText('Save & Start'));

      await waitFor(() => {
        expect(getByText('Milestone error')).toBeTruthy();
      });
    });
  });
});
