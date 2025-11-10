import React from 'react';
import { fireEvent, renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
import HubScreen from '../app/tabs/HubScreen';

jest.mock('../providers/AuthProvider', () => ({
  ...jest.requireActual('../providers/AuthProvider'),
  useAuth: () => require('./utils/renderWithProviders').useAuth(),
}));

jest.mock('../providers/RepoProvider', () => ({
  ...jest.requireActual('../providers/RepoProvider'),
  useRepo: () => require('./utils/renderWithProviders').useRepo(),
}));

const mockTags = [
  { id: 'tag-1', name: '#Focus', color: '#123456' },
  { id: 'tag-2', name: '@Alice', color: '#abcdef' },
];

describe('HubScreen tag filter integration', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_FEATURE_BUDDY = 'false';
  });

  test('passes selected tag names to repo.listByType', async () => {
    const listByTypeMock = jest.fn().mockResolvedValue([]);
    const listTagsMock = jest.fn().mockResolvedValue(mockTags);
    const listSpacesMock = jest.fn().mockResolvedValue([]);

    renderWithProviders(<HubScreen />, {
      repo: {
        listByType: listByTypeMock,
        listTags: listTagsMock,
        listSpaces: listSpacesMock,
      },
    });

    await waitFor(() => expect(listTagsMock).toHaveBeenCalled());

    const availableChip = await waitFor(() => screen.getByTestId('available-#focus'));
    fireEvent.press(availableChip);

    await waitFor(() =>
      expect(listByTypeMock).toHaveBeenCalledWith('habit', { tagNames: ['#focus'] }),
    );
  });
});
