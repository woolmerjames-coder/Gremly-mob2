// SKIP: Needs Zustand migration - tests use old useRepo mocks
import React from 'react';
import { renderWithProviders, screen } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';

jest.mock('../lib/env', () => ({
  env: {
    feature: {
      today: {
        v4Lanes: false,
        v3: true,
        focusCard: true,
        dropZone: true,
        sweepPreview: true,
        suggestions: false,
        celebration: false,
        eveningTeaser: false,
      },
    },
  },
}));

jest.mock('../providers/AuthProvider', () => ({
  ...jest.requireActual('../providers/AuthProvider'),
  useAuth: () => require('./utils/renderWithProviders').useAuth(),
}));

jest.mock('../providers/RepoProvider', () => ({
  ...jest.requireActual('../providers/RepoProvider'),
  useRepo: () => require('./utils/renderWithProviders').useRepo(),
}));

describe.skip('Today V3 Commitments Section', () => {
  it('renders commitments when feature flag enabled', async () => {
    process.env.EXPO_PUBLIC_FEATURE_COMMITMENTS = 'on';

    const { mockRepo } = renderWithProviders(<TodayScreen />, {
      repo: {
        listCommitments: jest.fn(() =>
          Promise.resolve([
            {
              id: 'a1',
              type: 'habit',
              name: 'Morning stretch',
              commitment_started_at: new Date().toISOString(),
              commitment_note: 'Stay limber',
            },
          ]),
        ),
        removeCommitment: jest.fn(() => Promise.resolve()),
      },
    });

    const header = await screen.findByText(/Commitments/i);
    expect(header).toBeTruthy();
    expect(screen.getByText(/Morning stretch/i)).toBeTruthy();
    expect(mockRepo.listCommitments).toHaveBeenCalled();
  });
});
