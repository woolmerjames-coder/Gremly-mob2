import React from 'react';
import { render } from '@testing-library/react-native';
import { UnifiedOverlayV2 } from '../components/overlay/UnifiedOverlayV2';

const noop = () => {};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn(),
    update: jest.fn(),
    listSpaces: jest.fn().mockResolvedValue([]),
    linkTag: jest.fn(),
    linkPerson: jest.fn(),
  }),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ userId: 'user-test' }),
}));

jest.mock('../components/overlay/hooks/usePhase8LinksState', () => ({
  usePhase8LinksState: () => ({
    pendingTagIds: [],
    pendingPeople: [],
    clearPendingPeople: jest.fn(),
    clearPendingTags: jest.fn(),
  }),
}));

jest.mock('../components/overlay/useOverlayPrefill', () => ({
  __esModule: true,
  default: () => ({
    suggestedTitle: null,
    suggestedTags: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

describe('Overlay header title', () => {
  it('shows derived title instead of literal Edit', async () => {
    const initialEntity = {
      type: 'note',
      id: 'log-123',
      title: "Dave's pizza preference",
      body: 'Dave loves 4 cheese pizza',
    };

    const { findByText, queryByText } = render(
      <UnifiedOverlayV2 visible mode="edit" onClose={noop} initialEntity={initialEntity as any} />,
    );

    await findByText("Dave's pizza preference");
    expect(queryByText('Edit')).toBeNull();
  });
});
