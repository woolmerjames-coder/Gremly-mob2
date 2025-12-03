/**
 * Gremly Home Screen Tests (formerly Spaces DS Screen)
 *
 * Tests for the Design System version of Gremly Home screen (/app/tabs/SpacesScreen.tsx)
 * Verifies testIDs, mascot greeting, feature bars, and spaces modal functionality
 *
 * UI REDESIGN (Dec 2025):
 * - Homepage now shows hero greeting + feature bars (Mind Drop / Spaces)
 * - Spaces list moved to a modal (opened via "spaces-new" button)
 * - New copy: "Hi", "So…where do we begin?", "To-dos, Thoughts, Habits, Anything..."
 */

import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
import SpacesScreen from '../app/tabs/SpacesScreen';

jest.mock('../components/MascotIcon', () => () => null);

// Mock image imports to avoid module resolution errors in tests
jest.mock('../../assets/minddrop_header-removebg.png', () => 'test-image-stub', {
  virtual: true,
});

// Mock the auth provider to return an authenticated user
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    userId: 'test-user-id',
    loading: false,
    signInWithEmail: jest.fn(),
    signOut: jest.fn(),
  }),
}));

// Mock the repo to return controlled test data
jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    listSpaces: jest.fn(() =>
      Promise.resolve([
        { id: 'space-1', name: 'Fitness', icon: '🏋️', theme: 'mint' },
        { id: 'space-2', name: 'Work', icon: '💼', theme: 'deepTeal' },
        { id: 'space-3', name: 'Personal', icon: '🏠', theme: 'cream' },
      ]),
    ),
    createSpace: jest.fn(),
    updateSpace: jest.fn(),
    deleteSpace: jest.fn(),
    getSpaceById: jest.fn(),
    listBySpaceGrouped: jest.fn(),
  }),
}));

describe('Spaces DS Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders spaces screen with correct testID', async () => {
    renderWithProviders(<SpacesScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('spaces-screen')).toBeTruthy();
    });
  });

  it('displays hero greeting text', async () => {
    renderWithProviders(<SpacesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Hi')).toBeTruthy();
      expect(screen.getByText(/So…where do/)).toBeTruthy();
    });
  });

  it('displays Mind Drop feature bar description', async () => {
    renderWithProviders(<SpacesScreen />);

    await waitFor(() => {
      expect(
        screen.getByText(/To-dos, Thoughts, Habits, Anything.*capture.*organize/i),
      ).toBeTruthy();
    });
  });

  it('displays Mind Drop CTA button', async () => {
    renderWithProviders(<SpacesScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('spaces-catchall-button')).toBeTruthy();
      expect(screen.getByText('Drop here')).toBeTruthy();
    });
  });

  it('displays Spaces feature bar with CTA', async () => {
    renderWithProviders(<SpacesScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('spaces-new')).toBeTruthy();
      expect(screen.getByText('Go deep here')).toBeTruthy();
    });
  });

  it('displays Spaces feature bar description', async () => {
    renderWithProviders(<SpacesScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Where your projects live/)).toBeTruthy();
    });
  });

  it('shows DS marker in dev mode', async () => {
    renderWithProviders(<SpacesScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('ds-marker')).toBeTruthy();
      expect(screen.getByText('DS')).toBeTruthy();
    });
  });

  it('displays philosophy footer', async () => {
    renderWithProviders(<SpacesScreen />);

    await waitFor(() => {
      expect(screen.getByText('From scattered to unstoppable.')).toBeTruthy();
    });
  });
});

describe('Spaces DS Screen - Spaces Modal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens spaces modal when pressing spaces button', async () => {
    renderWithProviders(<SpacesScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('spaces-new')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('spaces-new'));

    await waitFor(() => {
      expect(screen.getByText('Spaces')).toBeTruthy();
      expect(screen.getByText('Create a Space')).toBeTruthy();
    });
  });

  it('displays all spaces with correct testIDs in modal', async () => {
    renderWithProviders(<SpacesScreen />);

    // Open the modal
    await waitFor(() => {
      expect(screen.getByTestId('spaces-new')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('spaces-new'));

    await waitFor(() => {
      expect(screen.getByTestId('space-item-space-1')).toBeTruthy();
      expect(screen.getByTestId('space-item-space-2')).toBeTruthy();
      expect(screen.getByTestId('space-item-space-3')).toBeTruthy();
    });
  });

  it('displays all space names correctly in modal', async () => {
    renderWithProviders(<SpacesScreen />);

    // Open the modal
    await waitFor(() => {
      expect(screen.getByTestId('spaces-new')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('spaces-new'));

    await waitFor(() => {
      expect(screen.getByText('Fitness')).toBeTruthy();
      expect(screen.getByText('Work')).toBeTruthy();
      expect(screen.getByText('Personal')).toBeTruthy();
    });
  });

  it('shows create space CTA in modal', async () => {
    renderWithProviders(<SpacesScreen />);

    // Open the modal
    await waitFor(() => {
      expect(screen.getByTestId('spaces-new')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('spaces-new'));

    await waitFor(() => {
      expect(screen.getByTestId('spaces-empty-cta')).toBeTruthy();
      expect(screen.getByText('Create a Space')).toBeTruthy();
    });
  });
});

describe('Spaces DS Screen - Empty State', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows empty state when no spaces exist in modal', async () => {
    // Override mock to return empty array
    jest.spyOn(require('../providers/RepoProvider'), 'useRepo').mockReturnValue({
      listSpaces: jest.fn(() => Promise.resolve([])),
      createSpace: jest.fn(),
      updateSpace: jest.fn(),
      deleteSpace: jest.fn(),
      getSpaceById: jest.fn(),
      listBySpaceGrouped: jest.fn(),
    });

    renderWithProviders(<SpacesScreen />);

    // Open the modal
    await waitFor(() => {
      expect(screen.getByTestId('spaces-new')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('spaces-new'));

    await waitFor(() => {
      expect(screen.getByText(/no spaces yet/i)).toBeTruthy();
      expect(screen.getByText(/create one to organize by topic/i)).toBeTruthy();
      expect(screen.getByTestId('spaces-empty-cta')).toBeTruthy();
    });
  });
});
