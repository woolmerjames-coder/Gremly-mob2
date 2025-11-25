import React from 'react';
import { renderWithProviders, screen } from '../utils/renderWithProviders';
import NowScreenV1 from '../../app/screens/NowScreenV1';

jest.mock('../../providers/AuthProvider', () => ({
  ...jest.requireActual('../../providers/AuthProvider'),
  useAuth: () => require('../utils/renderWithProviders').useAuth(),
}));

jest.mock('../../providers/RepoProvider', () => ({
  ...jest.requireActual('../../providers/RepoProvider'),
  useRepo: () => require('../utils/renderWithProviders').useRepo(),
}));

describe('NowScreenV1', () => {
  it('renders the NOW V1 components when flag is true', () => {
    renderWithProviders(<NowScreenV1 />);

    // Check for header elements
    expect(screen.getByText(/Hi James/)).toBeTruthy();
    expect(screen.getByText('NOW')).toBeTruthy();

    // Check for vault
    expect(screen.getByText('📚 Mind Vault')).toBeTruthy();
  });

  it('mounts successfully with all sections', () => {
    renderWithProviders(<NowScreenV1 />);

    // Verify main sections render
    expect(screen.getByText('NOW')).toBeTruthy();
    expect(screen.getByText('📚 Mind Vault')).toBeTruthy();
    expect(screen.getByText('🧹 Sweep Available')).toBeTruthy();
    expect(screen.getByText('Feeling stuck?')).toBeTruthy();
  });
});
