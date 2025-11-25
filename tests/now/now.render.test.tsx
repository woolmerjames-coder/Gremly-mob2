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
  it('renders the NOW V1 placeholder when flag is true', () => {
    renderWithProviders(<NowScreenV1 />);

    expect(screen.getByText('NOW V1 placeholder')).toBeTruthy();
  });

  it('mounts successfully', () => {
    renderWithProviders(<NowScreenV1 />);

    expect(screen.getByText('NOW V1 placeholder')).toBeTruthy();
  });
});
