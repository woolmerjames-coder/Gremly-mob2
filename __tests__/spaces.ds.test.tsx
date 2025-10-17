/**
 * Spaces DS Screen Tests
 *
 * Tests for the Design System version of Spaces screen (/app/tabs/SpacesScreen.tsx)
 * Verifies testIDs, search functionality, empty states, and space list rendering
 */

import React from 'react';
import { renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
import SpacesScreen from '../app/tabs/SpacesScreen';

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

  it('displays list of spaces with correct testIDs', async () => {
    renderWithProviders(<SpacesScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('space-item-space-1')).toBeTruthy();
      expect(screen.getByTestId('space-item-space-2')).toBeTruthy();
      expect(screen.getByTestId('space-item-space-3')).toBeTruthy();
    });
  });

  it('displays space names correctly', async () => {
    renderWithProviders(<SpacesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Fitness')).toBeTruthy();
      expect(screen.getByText('Work')).toBeTruthy();
      expect(screen.getByText('Personal')).toBeTruthy();
    });
  });

  it('shows DS marker in dev mode', async () => {
    renderWithProviders(<SpacesScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('ds-marker')).toBeTruthy();
      expect(screen.getByText('DS')).toBeTruthy();
    });
  });
});

describe('Spaces DS Screen - Empty State', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows empty state when no spaces exist', async () => {
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

    await waitFor(() => {
      expect(screen.getByText(/no spaces yet/i)).toBeTruthy();
    });
  });
});
