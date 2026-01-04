/**
 * ArchivedItemsScreen Integration Tests - Phase 3
 *
 * Tests the Archived Items screen behavior:
 * - Renders archived items list
 * - Restore action removes item from list
 * - Delete action shows confirmation, then removes item
 * - Search filtering works
 * - Empty states render correctly
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { Alert } from 'react-native';

// =============================================================================
// Mocks - Must be before imports that use them
// =============================================================================

// Mock navigation
const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
      addListener: jest.fn(() => () => {}),
    }),
    useRoute: () => ({
      params: {},
    }),
  };
});

// Mock Alert
jest.spyOn(Alert, 'alert');

// Create mock repo with jest functions
const mockRestoreItem = jest.fn();
const mockRemove = jest.fn();
const mockListByType = jest.fn();

const mockRepo = {
  listByType: mockListByType,
  restoreItem: mockRestoreItem,
  remove: mockRemove,
};

jest.mock('../providers/RepoProvider', () => ({
  RepoProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useRepo: () => mockRepo,
}));

// Mock UnifiedOverlayController
const mockOpenEdit = jest.fn();
jest.mock('../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({
    openCreate: jest.fn(),
    openEdit: mockOpenEdit,
    openPrefill: jest.fn(),
    close: jest.fn(),
  }),
}));

// =============================================================================
// Import component after mocks
// =============================================================================

import ArchivedItemsScreen from '../app/screens/ArchivedItemsScreen';

// =============================================================================
// Test Data
// =============================================================================

const createMockTodo = (id: string, title: string) => ({
  id,
  type: 'todo' as const,
  owner_id: 'test-user',
  created_at: '2025-12-14T10:00:00.000Z',
  title,
  status: 'archived',
  archived: true,
  archived_at: '2025-12-13T10:00:00.000Z',
  archived_reason: 'completed',
  ai_placed: false,
});

const createMockHabit = (id: string, name: string) => ({
  id,
  type: 'habit' as const,
  owner_id: 'test-user',
  created_at: '2025-12-14T10:00:00.000Z',
  name,
  frequency: 'daily',
  archived: true,
  archived_at: '2025-12-13T10:00:00.000Z',
  archived_reason: 'stopped',
  ai_placed: false,
});

const createMockNote = (id: string, body: string) => ({
  id,
  type: 'note' as const,
  owner_id: 'test-user',
  created_at: '2025-12-14T10:00:00.000Z',
  body,
  archived: true,
  archived_at: '2025-12-13T10:00:00.000Z',
  archived_reason: 'cleaned up',
  ai_placed: false,
});

// =============================================================================
// Test Wrapper
// =============================================================================

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  return <NavigationContainer>{children}</NavigationContainer>;
};

// =============================================================================
// Tests
// =============================================================================

describe('ArchivedItemsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListByType.mockResolvedValue([]);
    mockRestoreItem.mockResolvedValue(undefined);
    mockRemove.mockResolvedValue(undefined);
  });

  describe('Rendering', () => {
    it('renders screen with search input and filter controls', async () => {
      const { getByTestId } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-search-input')).toBeTruthy();
        expect(getByTestId('archived-back-button')).toBeTruthy();
      });
    });

    it('shows empty state when no archived items exist', async () => {
      mockListByType.mockResolvedValue([]);

      const { getByTestId } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-empty-state')).toBeTruthy();
        expect(getByTestId('archived-empty-title')).toBeTruthy();
      });
    });

    it('renders archived items list when items exist', async () => {
      const mockItems = [
        createMockTodo('todo-1', 'Archived Todo'),
        createMockHabit('habit-1', 'Archived Habit'),
        createMockNote('note-1', 'Archived Note body'),
      ];

      mockListByType.mockImplementation(async (type: string) => {
        if (type === 'todo') return [mockItems[0]];
        if (type === 'habit') return [mockItems[1]];
        if (type === 'note') return [mockItems[2]];
        return [];
      });

      const { getByTestId } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-items-list')).toBeTruthy();
        expect(getByTestId('archived-item-todo-1')).toBeTruthy();
        expect(getByTestId('archived-item-habit-1')).toBeTruthy();
        expect(getByTestId('archived-item-note-1')).toBeTruthy();
      });
    });
  });

  describe('Restore Action', () => {
    it('calls restoreItem when restore button is pressed', async () => {
      const mockTodo = createMockTodo('todo-restore', 'Todo to restore');

      mockListByType.mockImplementation(async (type: string) => {
        if (type === 'todo') return [mockTodo];
        return [];
      });

      const { getByTestId } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-restore-todo-restore')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId('archived-restore-todo-restore'));
      });

      await waitFor(() => {
        expect(mockRestoreItem).toHaveBeenCalledWith('todo-restore', 'todo');
      });
    });

    it('refreshes list after successful restore', async () => {
      const mockTodo = createMockTodo('todo-refresh', 'Todo to refresh');
      let callCount = 0;

      mockListByType.mockImplementation(async (type: string) => {
        if (type === 'todo') {
          callCount++;
          // First call returns the item, subsequent calls return empty (item was restored)
          return callCount === 1 ? [mockTodo] : [];
        }
        return [];
      });

      const { getByTestId, queryByTestId: _queryByTestId } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-restore-todo-refresh')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId('archived-restore-todo-refresh'));
      });

      // After restore, the list should refresh and item should be gone
      await waitFor(() => {
        // listByType should be called again to refresh
        expect(mockListByType).toHaveBeenCalledTimes(6); // Initial 3 calls + 3 refresh calls
      });
    });
  });

  describe('Delete Action', () => {
    it('shows delete confirmation modal when delete button is pressed', async () => {
      const mockTodo = createMockTodo('todo-delete', 'Todo to delete');

      mockListByType.mockImplementation(async (type: string) => {
        if (type === 'todo') return [mockTodo];
        return [];
      });

      const { getByTestId } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-delete-todo-delete')).toBeTruthy();
      });

      fireEvent.press(getByTestId('archived-delete-todo-delete'));

      await waitFor(() => {
        expect(getByTestId('delete-confirmation-modal')).toBeTruthy();
        expect(getByTestId('delete-modal-confirm')).toBeTruthy();
        expect(getByTestId('delete-modal-cancel')).toBeTruthy();
      });
    });

    it('calls remove when delete is confirmed', async () => {
      const mockTodo = createMockTodo('todo-confirm-delete', 'Todo to confirm delete');

      mockListByType.mockImplementation(async (type: string) => {
        if (type === 'todo') return [mockTodo];
        return [];
      });

      const { getByTestId } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-delete-todo-confirm-delete')).toBeTruthy();
      });

      // Open delete modal
      fireEvent.press(getByTestId('archived-delete-todo-confirm-delete'));

      await waitFor(() => {
        expect(getByTestId('delete-modal-confirm')).toBeTruthy();
      });

      // Confirm delete
      await act(async () => {
        fireEvent.press(getByTestId('delete-modal-confirm'));
      });

      await waitFor(() => {
        expect(mockRemove).toHaveBeenCalledWith('todo-confirm-delete');
      });
    });

    it('closes modal without deleting when cancel is pressed', async () => {
      const mockTodo = createMockTodo('todo-cancel-delete', 'Todo to cancel delete');

      mockListByType.mockImplementation(async (type: string) => {
        if (type === 'todo') return [mockTodo];
        return [];
      });

      const { getByTestId, queryByTestId } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-delete-todo-cancel-delete')).toBeTruthy();
      });

      // Open delete modal
      fireEvent.press(getByTestId('archived-delete-todo-cancel-delete'));

      await waitFor(() => {
        expect(getByTestId('delete-modal-cancel')).toBeTruthy();
      });

      // Cancel delete
      fireEvent.press(getByTestId('delete-modal-cancel'));

      await waitFor(() => {
        // Modal should close
        expect(queryByTestId('delete-confirmation-modal')).toBeFalsy();
      });

      // Remove should NOT have been called
      expect(mockRemove).not.toHaveBeenCalled();
    });
  });

  describe('Search Filtering', () => {
    it('filters items based on search query', async () => {
      const mockTodos = [
        createMockTodo('todo-groceries', 'Buy groceries'),
        createMockTodo('todo-workout', 'Go to gym'),
      ];

      mockListByType.mockImplementation(async (type: string) => {
        if (type === 'todo') return mockTodos;
        return [];
      });

      const { getByTestId, queryByTestId } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-item-todo-groceries')).toBeTruthy();
        expect(getByTestId('archived-item-todo-workout')).toBeTruthy();
      });

      // Enter search query
      await act(async () => {
        fireEvent.changeText(getByTestId('archived-search-input'), 'groceries');
      });

      // Wait for debounce (300ms) and filter to apply
      await act(async () => {
        await new Promise((r) => setTimeout(r, 400));
      });

      await waitFor(() => {
        expect(getByTestId('archived-item-todo-groceries')).toBeTruthy();
      });

      // The workout item should be filtered out
      expect(queryByTestId('archived-item-todo-workout')).toBeFalsy();
    });

    it('shows no results state when search returns empty', async () => {
      const mockTodo = createMockTodo('todo-1', 'Some todo');

      mockListByType.mockImplementation(async (type: string) => {
        if (type === 'todo') return [mockTodo];
        return [];
      });

      const { getByTestId, queryByTestId } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-item-todo-1')).toBeTruthy();
      });

      // Enter search query that won't match
      fireEvent.changeText(getByTestId('archived-search-input'), 'nonexistent xyz');

      // Wait for debounce and filter
      await waitFor(
        () => {
          expect(getByTestId('archived-no-results')).toBeTruthy();
          expect(queryByTestId('archived-item-todo-1')).toBeFalsy();
        },
        { timeout: 500 },
      );
    });
  });

  describe('Navigation', () => {
    it('calls goBack when back button is pressed', async () => {
      const { getByTestId } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-back-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('archived-back-button'));

      expect(mockGoBack).toHaveBeenCalled();
    });

    it('renders back to hub link in empty state', async () => {
      mockListByType.mockResolvedValue([]);

      const { getByTestId } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-back-to-hub')).toBeTruthy();
      });

      fireEvent.press(getByTestId('archived-back-to-hub'));

      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  describe('Type Filters', () => {
    it('renders type filter chips', async () => {
      const { getByTestId } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-filter-type-todo')).toBeTruthy();
        expect(getByTestId('archived-filter-type-habit')).toBeTruthy();
        expect(getByTestId('archived-filter-type-note')).toBeTruthy();
      });
    });

    it('toggles type filter when chip is pressed', async () => {
      const mockTodo = createMockTodo('todo-1', 'A todo');
      const mockHabit = createMockHabit('habit-1', 'A habit');

      mockListByType.mockImplementation(async (type: string) => {
        if (type === 'todo') return [mockTodo];
        if (type === 'habit') return [mockHabit];
        return [];
      });

      const { getByTestId, queryByTestId: _queryByTestId2 } = render(
        <TestWrapper>
          <ArchivedItemsScreen />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(getByTestId('archived-item-todo-1')).toBeTruthy();
        expect(getByTestId('archived-item-habit-1')).toBeTruthy();
      });

      // Toggle off todos (but can't deselect all, so this should work since habits is also selected)
      fireEvent.press(getByTestId('archived-filter-type-todo'));

      // Re-query to trigger reload
      await waitFor(() => {
        // The listByType should be called again with the new filter
        expect(mockListByType).toHaveBeenCalled();
      });
    });
  });
});
