import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { UnifiedOverlayV2 } from '../components/overlay/UnifiedOverlayV2';

const mockRepo = {
  update: jest.fn(),
  create: jest.fn(),
  listSpaces: jest.fn().mockResolvedValue([]),
  listTags: jest.fn().mockResolvedValue([]),
  listPeople: jest.fn().mockResolvedValue([]),
  linkTag: jest.fn(),
  linkPerson: jest.fn(),
  linkPersonToEntity: jest.fn(),
  countActiveCommitments: jest.fn().mockResolvedValue(0),
  listCommitments: jest.fn().mockResolvedValue([]),
  findBySourceMessageId: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ userId: 'user-1' }),
}));

jest.mock('../components/overlay/useOverlayV2Draft', () => ({
  __esModule: true,
  useOverlayV2Draft: () => undefined,
  readOverlayV2Draft: () => Promise.resolve(null),
  clearOverlayV2Draft: jest.fn(() => Promise.resolve()),
}));

const { clearOverlayV2Draft: mockClearOverlayV2Draft } = jest.requireMock(
  '../components/overlay/useOverlayV2Draft',
) as { clearOverlayV2Draft: jest.Mock };

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

describe('UnifiedOverlayV2 cancel reset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('restores server data on reopen after Cancel', async () => {
    const onClose = jest.fn();
    const initialEntity = {
      id: 'todo-1',
      type: 'todo' as const,
      title: 'Follow up with Sam',
      details: 'Initial server details',
      due_at: null,
    };

    const utils = render(
      <UnifiedOverlayV2
        visible
        mode="edit"
        onClose={onClose}
        initialEntity={initialEntity as any}
        initialText={null}
      />,
    );

    const input = await utils.findByLabelText('Overlay content input');
    await waitFor(() => expect(input.props.value).toBe('Initial server details'));

    fireEvent.changeText(input, 'Locally edited details');
    await waitFor(() => expect(input.props.value).toBe('Locally edited details'));

    fireEvent.press(utils.getByText('Cancel'));

    await waitFor(() => {
      expect(mockClearOverlayV2Draft).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    const updatedEntity = {
      ...initialEntity,
      details: 'Server refreshed details',
    };

    utils.rerender(
      <UnifiedOverlayV2
        visible={false}
        mode="edit"
        onClose={onClose}
        initialEntity={updatedEntity as any}
        initialText={null}
      />,
    );

    utils.rerender(
      <UnifiedOverlayV2
        visible
        mode="edit"
        onClose={onClose}
        initialEntity={updatedEntity as any}
        initialText={null}
      />,
    );

    const reopenedInput = await utils.findByLabelText('Overlay content input');
    await waitFor(() => expect(reopenedInput.props.value).toBe('Server refreshed details'));
    expect(reopenedInput.props.value).not.toBe('Locally edited details');
  });
});
