import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Text as OverlayText } from '../ui/Text';
import { UnifiedOverlayV2 } from '../components/overlay/UnifiedOverlayV2';

const updateMock = jest.fn();
const mockRepo = {
  update: updateMock,
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

type ParseDue = typeof import('../lib/cortex/entities/datetime').parseDue;

const mockParseDue = jest.fn<ReturnType<ParseDue>, Parameters<ParseDue>>(() => ({
  iso: '2025-12-01T15:00:00.000Z',
  date: '2025-12-01',
  time: '15:00',
  confidence: 0.9,
  granularity: 'time' as const,
  matched: 'Dec 1 at 3pm',
  textWithoutWhen: 'Follow up with Sam',
}));

jest.mock('../lib/cortex/entities/datetime', () => {
  const actual = jest.requireActual('../lib/cortex/entities/datetime');
  return {
    ...actual,
    parseDue: (...args: Parameters<ParseDue>) => mockParseDue(...args),
  };
});

describe('UnifiedOverlayV2 suggested due prefill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders suggested due without persisting until Save', async () => {
    const utils = render(
      <UnifiedOverlayV2
        visible
        mode="create"
        onClose={jest.fn()}
        initialEntity={null as any}
        initialText={null}
      />,
    );

    fireEvent.press(utils.getByText('To-Do'));
    const input = utils.getByLabelText('Overlay content input');
    fireEvent.changeText(input, 'Follow up with Sam on Dec 1 at 3pm');

    await waitFor(() => expect(mockParseDue).toHaveBeenCalled());
    expect(utils.getByText('Add due date')).toBeTruthy();
    expect(mockRepo.update).not.toHaveBeenCalled();

    fireEvent.press(utils.getByText('Save'));

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1));
    const payload = mockRepo.create.mock.calls[0]?.[0] ?? {};
    expect(payload.due_at ?? payload.due_date ?? null).toBeNull();
  });
});
