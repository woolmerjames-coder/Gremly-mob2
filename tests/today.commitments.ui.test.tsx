import React from 'react';
import { renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';

jest.mock('../lib/env', () => ({
  env: {
    feature: {
      today: {
        v4Lanes: false,
        v3: false,
        celebration: false,
        suggestions: false,
        eveningTeaser: false,
        focusCard: false,
        dropZone: false,
        sweepPreview: false,
      },
      sweep: { eveningV1: false },
      commitments: true,
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

describe('TodayScreen commitments section', () => {
  test('renders cards for active commitments', async () => {
    const mockCommitments = [
      {
        id: 'commitment-1',
        type: 'habit' as const,
        name: 'Morning Run',
        commitment_started_at: new Date('2025-01-05T08:00:00Z').toISOString(),
        commitment_note: 'Minimum 10 minutes outside',
      },
      {
        id: 'commitment-2',
        type: 'todo' as const,
        name: 'Inbox Zero',
        commitment_started_at: null,
        commitment_note: null,
      },
    ];

    const { mockRepo } = renderWithProviders(<TodayScreen />, {
      includeNavigation: false,
      repo: {
        listDueToday: jest.fn().mockResolvedValue([]),
        countPlannedToday: jest.fn().mockResolvedValue(0),
        countCompletedToday: jest.fn().mockResolvedValue(0),
        listCommitments: jest.fn().mockResolvedValue(mockCommitments),
      },
    });

    await waitFor(() => expect(mockRepo.listCommitments).toHaveBeenCalled());

    const section = await screen.findByTestId('today-section-commitments');
    expect(section).toBeTruthy();

    const cards = await screen.findAllByTestId(/commitment-card-/);
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Morning Run')).toBeTruthy();
    expect(screen.getByText('Inbox Zero')).toBeTruthy();
  });
});
