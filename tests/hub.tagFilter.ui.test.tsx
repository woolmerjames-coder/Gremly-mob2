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
  { id: 'tag-3', name: '*Project', color: '#ff9900' },
];

describe('HubScreen tag filter integration', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_FEATURE_BUDDY = 'false';
  });

  const renderHub = () => {
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

    return { listByTypeMock, listTagsMock };
  };

  test('passes selected tag names to repo.listByType', async () => {
    const { listByTypeMock, listTagsMock } = renderHub();

    await waitFor(() => expect(listTagsMock).toHaveBeenCalled());

    const focusChip = await screen.findByTestId('available-#focus');
    fireEvent.press(focusChip);

    await waitFor(() =>
      expect(listByTypeMock).toHaveBeenCalledWith(
        'habit',
        expect.objectContaining({
          tagNames: ['#focus'],
        }),
      ),
    );
  });

  test('selecting multiple tags applies AND semantics', async () => {
    const { listByTypeMock, listTagsMock } = renderHub();

    await waitFor(() => expect(listTagsMock).toHaveBeenCalled());

    const focusChip = await screen.findByTestId('available-#focus');
    const aliceChip = await screen.findByTestId('available-@alice');

    fireEvent.press(focusChip);

    await waitFor(() =>
      expect(listByTypeMock).toHaveBeenCalledWith(
        'habit',
        expect.objectContaining({
          tagNames: ['#focus'],
        }),
      ),
    );

    fireEvent.press(aliceChip);

    await waitFor(() =>
      expect(listByTypeMock).toHaveBeenCalledWith(
        'habit',
        expect.objectContaining({
          tagNames: ['#focus', '@alice'],
        }),
      ),
    );
  });
});
