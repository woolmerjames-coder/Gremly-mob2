import React from 'react';
import { render } from '@testing-library/react-native';
import { UnifiedOverlayV2 } from '../components/overlay/UnifiedOverlayV2';
import { Button } from '../ui/Button';

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

describe('Overlay visual hierarchy', () => {
  it('renders scrim and keeps Save as the single primary CTA', () => {
    const initialEntity = {
      type: 'note',
      id: 'log-visual',
      title: 'Test overlay',
      body: 'Body copy',
    };

    const { getByTestId, UNSAFE_getAllByType } = render(
      <UnifiedOverlayV2 visible mode="edit" onClose={noop} initialEntity={initialEntity as any} />,
    );

    expect(getByTestId('overlay-scrim')).toBeTruthy();

    const buttons = UNSAFE_getAllByType(Button);
    const saveButtons = buttons.filter((btn) => (btn.props.title ?? btn.props.label) === 'Save');
    expect(saveButtons).toHaveLength(1);
    const saveVariant = saveButtons[0].props.variant ?? 'primary';
    expect(saveVariant).toBe('primary');

    const cancelButton = buttons.find((btn) => (btn.props.title ?? btn.props.label) === 'Cancel');
    expect(cancelButton?.props.variant ?? 'ghost').toBe('ghost');
  });
});
