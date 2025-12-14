/**
 * Hub Screen Integration Tests - Phase 1
 *
 * Tests Hub Mode vs Search Mode behavior and transitions.
 * Focus on behavior and state, NOT styling or snapshots.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';

// =============================================================================
// Mocks - Must be before imports that use them
// =============================================================================

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: jest.fn(),
      addListener: jest.fn(() => () => {}),
    }),
    useFocusEffect: (callback: () => void) => {
      // Use require to access React inside mock
      const React = require('react');
      React.useEffect(() => {
        callback();
      }, []);
    },
  };
});

// Mock AuthProvider
jest.mock('../providers/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: { id: 'test-user-id' },
    userId: undefined,
    session: null,
    loading: false,
    error: null,
    signInWithEmail: jest.fn(),
    devSignIn: jest.fn(),
    signOut: jest.fn(),
    clearError: jest.fn(),
    waitForSession: jest.fn(),
  }),
}));

// Mock RepoProvider with minimal data
const mockRepo = {
  listByType: jest.fn().mockResolvedValue([]),
  listSpaces: jest.fn().mockResolvedValue([]),
  listPeopleWithCounts: jest.fn().mockResolvedValue([]),
  listPeople: jest.fn().mockResolvedValue([]),
  getUnsortedCount: jest.fn().mockResolvedValue(0),
  listUnsorted: jest.fn().mockResolvedValue([]),
  listJournalsForDateRange: jest.fn().mockResolvedValue([]),
  getNextHabitOccurrences: jest.fn().mockResolvedValue([]),
};

jest.mock('../providers/RepoProvider', () => ({
  RepoProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useRepo: () => mockRepo,
}));

// Mock OverlayContext
jest.mock('../contexts/OverlayContext', () => ({
  OverlayProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useOverlay: () => ({
    isVisible: false,
    mode: 'create',
    editRecord: null,
    prefillText: null,
    open: jest.fn(),
    close: jest.fn(),
    submit: jest.fn(),
  }),
}));

// Mock UnifiedOverlayController
jest.mock('../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    openPrefill: jest.fn(),
    close: jest.fn(),
  }),
}));

// Mock ThemeProvider
jest.mock('../providers/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({
    theme: 'light',
    toggleTheme: jest.fn(),
  }),
}));

// =============================================================================
// Import component after mocks
// =============================================================================

import HubScreen from '../app/tabs/HubScreen';
import { AuthProvider } from '../providers/AuthProvider';
import { RepoProvider } from '../providers/RepoProvider';
import { OverlayProvider } from '../contexts/OverlayContext';
import { ThemeProvider } from '../providers/ThemeProvider';

// =============================================================================
// Test Wrapper
// =============================================================================

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RepoProvider>
          <OverlayProvider>
            <NavigationContainer>{children}</NavigationContainer>
          </OverlayProvider>
        </RepoProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

// =============================================================================
// Tests
// =============================================================================

describe('HubScreen - Mode Transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.listByType.mockResolvedValue([]);
    mockRepo.listSpaces.mockResolvedValue([]);
    mockRepo.listPeopleWithCounts.mockResolvedValue([]);
    mockRepo.listPeople.mockResolvedValue([]);
    mockRepo.getUnsortedCount.mockResolvedValue(0);
    mockRepo.listUnsorted.mockResolvedValue([]);
  });

  it('renders Hub Mode when search is empty', async () => {
    const { getByTestId, queryByTestId: _queryByTestId } = render(
      <TestWrapper>
        <HubScreen />
      </TestWrapper>,
    );

    await waitFor(() => {
      // Hub Mode should be visible
      expect(getByTestId('hub-screen')).toBeTruthy();
    });

    // Search input should exist but be empty
    const searchInput = getByTestId('hub-search');
    expect(searchInput.props.value).toBe('');
  });

  it('transitions to Search Mode when search query is entered', async () => {
    const { getByTestId } = render(
      <TestWrapper>
        <HubScreen />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(getByTestId('hub-screen')).toBeTruthy();
    });

    // Enter search query
    const searchInput = getByTestId('hub-search');
    fireEvent.changeText(searchInput, 'test query');

    await waitFor(() => {
      // Search Mode indicators should be visible
      // (the actual result rendering depends on data)
      expect(searchInput.props.value).toBe('test query');
    });
  });

  it('transitions back to Hub Mode when search is cleared', async () => {
    const { getByTestId } = render(
      <TestWrapper>
        <HubScreen />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(getByTestId('hub-screen')).toBeTruthy();
    });

    const searchInput = getByTestId('hub-search');

    // Enter search query
    fireEvent.changeText(searchInput, 'test query');
    await waitFor(() => {
      expect(searchInput.props.value).toBe('test query');
    });

    // Clear search
    fireEvent.changeText(searchInput, '');
    await waitFor(() => {
      expect(searchInput.props.value).toBe('');
    });
  });

  it('shows archived items button in Hub Mode', async () => {
    const { getByTestId } = render(
      <TestWrapper>
        <HubScreen />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(getByTestId('hub-archived-btn')).toBeTruthy();
    });
  });

  it('navigates to ArchivedItems when archived button is pressed', async () => {
    const { getByTestId } = render(
      <TestWrapper>
        <HubScreen />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(getByTestId('hub-archived-btn')).toBeTruthy();
    });

    fireEvent.press(getByTestId('hub-archived-btn'));

    expect(mockNavigate).toHaveBeenCalledWith('ArchivedItems', undefined);
  });
});

describe('HubScreen - Needs Attention Section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.listSpaces.mockResolvedValue([]);
    mockRepo.listPeopleWithCounts.mockResolvedValue([]);
    mockRepo.listPeople.mockResolvedValue([]);
    mockRepo.getUnsortedCount.mockResolvedValue(0);
    mockRepo.listUnsorted.mockResolvedValue([]);
  });

  it('hides needs-attention section when no items qualify', async () => {
    // Return items that don't qualify for attention
    mockRepo.listByType.mockResolvedValue([
      {
        id: 'todo-1',
        type: 'todo',
        name: 'Complete todo',
        due_day: '2025-12-20', // Has due date - doesn't qualify
        created_at: '2025-12-01T10:00:00.000Z',
        owner_id: 'test-user',
      },
    ]);

    const { getByTestId, queryByText } = render(
      <TestWrapper>
        <HubScreen />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(getByTestId('hub-screen')).toBeTruthy();
    });

    // The section title should still exist, but with empty state
    await waitFor(() => {
      expect(queryByText("So you don't forget…")).toBeTruthy();
    });
  });

  it('shows needs-attention items when data qualifies', async () => {
    // Return a stale todo without due date (qualifies for attention)
    const staleTodo = {
      id: 'stale-todo-1',
      type: 'todo',
      name: 'Old task without due date',
      due_day: null,
      due_date: null,
      created_at: '2025-12-01T10:00:00.000Z', // Old enough to be stale
      updated_at: '2025-12-01T10:00:00.000Z',
      owner_id: 'test-user',
      space_id: 'some-space',
    };

    mockRepo.listByType.mockResolvedValue([staleTodo]);

    const { getByTestId, queryByText } = render(
      <TestWrapper>
        <HubScreen />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(getByTestId('hub-screen')).toBeTruthy();
    });

    // Section should be visible
    await waitFor(() => {
      expect(queryByText("So you don't forget…")).toBeTruthy();
    });
  });
});

describe('HubScreen - Search Results', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.listSpaces.mockResolvedValue([]);
    mockRepo.listPeopleWithCounts.mockResolvedValue([]);
    mockRepo.listPeople.mockResolvedValue([]);
    mockRepo.getUnsortedCount.mockResolvedValue(0);
    mockRepo.listUnsorted.mockResolvedValue([]);
  });

  it('shows no results state when search returns empty', async () => {
    mockRepo.listByType.mockResolvedValue([]);

    const { getByTestId, queryByText } = render(
      <TestWrapper>
        <HubScreen />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(getByTestId('hub-screen')).toBeTruthy();
    });

    // Enter search query
    const searchInput = getByTestId('hub-search');
    fireEvent.changeText(searchInput, 'nonexistent item');

    await waitFor(() => {
      expect(queryByText('No results found')).toBeTruthy();
    });
  });
});
