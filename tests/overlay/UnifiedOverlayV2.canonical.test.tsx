import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

const mockRepo = {
  update: jest.fn(),
  create: jest.fn(),
  listSpaces: jest.fn(),
  listTags: jest.fn(),
  listPeople: jest.fn(),
  linkTag: jest.fn(),
  linkPerson: jest.fn(),
  linkPersonToEntity: jest.fn(),
  countActiveCommitments: jest.fn(),
  listCommitments: jest.fn(),
  findBySourceMessageId: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
  getById: jest.fn(),
};

jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ userId: 'user-canonical' }),
}));

jest.mock('../../components/overlay/useOverlayPrefill', () => ({
  __esModule: true,
  default: () => ({
    suggestedTitle: null,
    suggestedTags: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('../../components/overlay/hooks/usePhase8LinksState', () => ({
  usePhase8LinksState: () => ({
    pendingTagIds: [],
    pendingPeople: [],
    clearPendingPeople: jest.fn(),
    clearPendingTags: jest.fn(),
  }),
}));

jest.mock('../../components/overlay/useOverlayV2Draft', () => ({
  __esModule: true,
  useOverlayV2Draft: () => undefined,
  readOverlayV2Draft: () => Promise.resolve(null),
  clearOverlayV2Draft: jest.fn(() => Promise.resolve()),
}));

describe('UnifiedOverlayV2 canonical metadata preservation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.listSpaces.mockResolvedValue([]);
    mockRepo.listTags.mockResolvedValue([]);
    mockRepo.listPeople.mockResolvedValue([]);
    mockRepo.countActiveCommitments.mockResolvedValue(0);
    mockRepo.listCommitments.mockResolvedValue([]);
    mockRepo.create.mockResolvedValue({ id: 'new-id', type: 'note' });
  });

  it('preserves canonicalType and subtype for canonical logs on edit save', async () => {
    const initialEntity = {
      id: 'note-log-1',
      type: 'note',
      title: 'Daily reflection',
      body: 'Today was a good day',
      subtype: 'journal',
      canonicalType: 'log',
      tags: ['journal'],
    };

    mockRepo.update.mockResolvedValue({ id: 'note-log-1', type: 'note' });
    mockRepo.getById.mockResolvedValue(initialEntity as any);

    const { getByText } = render(
      <UnifiedOverlayV2
        visible
        mode="edit"
        onClose={jest.fn()}
        initialEntity={initialEntity as any}
        initialText={null}
      />,
    );

    await act(() => Promise.resolve());

    fireEvent.press(getByText('Save'));

    await waitFor(() => expect(mockRepo.update).toHaveBeenCalledTimes(1));

    const updateArg = mockRepo.update.mock.calls[0][0];
    expect(updateArg).toBeDefined();
    expect(updateArg.id).toBe('note-log-1');
    expect(updateArg.patch.canonicalType).toBe('log');
    expect(updateArg.patch.subtype).toBe('journal');
  });

  it('keeps unsorted canonical classification when editing catchall notes', async () => {
    const initialEntity = {
      id: 'note-unsorted-1',
      type: 'note',
      title: 'Sort this later',
      body: 'Unsorted thoughts',
      subtype: 'catchall',
      canonicalType: 'unsorted',
      labels: ['catchall', 'needs_review'],
    };

    mockRepo.update.mockResolvedValue({ id: 'note-unsorted-1', type: 'note' });
    mockRepo.getById.mockResolvedValue(initialEntity as any);

    const { getByText } = render(
      <UnifiedOverlayV2
        visible
        mode="edit"
        onClose={jest.fn()}
        initialEntity={initialEntity as any}
        initialText={null}
      />,
    );

    await act(() => Promise.resolve());

    fireEvent.press(getByText('Save'));

    await waitFor(() => expect(mockRepo.update).toHaveBeenCalledTimes(1));

    const updateArg = mockRepo.update.mock.calls[0][0];
    expect(updateArg).toBeDefined();
    expect(updateArg.id).toBe('note-unsorted-1');
    expect(updateArg.patch.canonicalType).toBe('unsorted');
    expect(updateArg.patch.subtype).toBe('catchall');
  });
});
