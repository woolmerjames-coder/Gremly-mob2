import React from 'react';
import { renderWithProviders, screen } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated/mock');
  return {
    ...actual,
    useSharedValue: (initial: number) => ({ value: initial }),
    withTiming: (value: number) => value,
  };
});

jest.mock('../lib/env', () => ({
  env: {
    feature: {
      today: {
        v4Lanes: true,
        v3: false,
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

jest.mock('../selectors/today/useTodayData', () => ({
  useTodayData: () => ({
    left: [],
    right: [],
    completeItem: jest.fn(),
    loading: false,
  }),
}));

describe('Today V4 Commitments Section', () => {
  it('renders commitments when feature flag enabled', async () => {
    process.env.EXPO_PUBLIC_FEATURE_COMMITMENTS = 'on';

    const { mockRepo } = renderWithProviders(<TodayScreen />, {
      repo: {
        listCommitments: jest.fn(() =>
          Promise.resolve([
            {
              id: 'c1',
              type: 'todo',
              name: 'Deliver report',
              commitment_started_at: new Date().toISOString(),
              commitment_note: 'Finish before lunch',
            },
          ]),
        ),
        removeCommitment: jest.fn(() => Promise.resolve()),
      },
    });

    const header = await screen.findByText(/Commitments/i);
    expect(header).toBeTruthy();
    expect(screen.getByText(/Deliver report/i)).toBeTruthy();
    expect(mockRepo.listCommitments).toHaveBeenCalled();
  });
});
