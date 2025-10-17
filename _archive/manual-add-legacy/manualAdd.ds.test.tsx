/**
 * ManualAdd DS Sheet Tests
 *
 * Tests for the Design System version of ManualAddSheet (/components/ManualAddSheet.tsx)
 * Note: ManualAddSheet is designed to work with ActionSheet, so these tests verify
 * basic rendering and tab structure only. Full integration tests would require
 * testing within the ActionSheet context.
 */

import React from 'react';
import { renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
import ManualAddSheet from '../components/ManualAddSheet';

// Mock the repo
jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn(() => Promise.resolve({ id: 'new-id' })),
    update: jest.fn(),
    remove: jest.fn(),
    listSpaces: jest.fn(() => Promise.resolve([])),
  }),
}));

describe('ManualAdd DS Sheet - Basic Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders tab buttons with correct testIDs', async () => {
    renderWithProviders(<ManualAddSheet />);

    await waitFor(() => {
      expect(screen.getByTestId('tab-habits')).toBeTruthy();
      expect(screen.getByTestId('tab-todos')).toBeTruthy();
      expect(screen.getByTestId('tab-journal')).toBeTruthy();
      expect(screen.getByTestId('tab-catchall')).toBeTruthy();
    });
  });

  it('displays habit form fields by default', async () => {
    renderWithProviders(<ManualAddSheet />);

    await waitFor(() => {
      expect(screen.getByTestId('habit-name')).toBeTruthy();
      expect(screen.getByTestId('frequency-daily')).toBeTruthy();
    });
  });
});
