import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

jest.setTimeout(2000);

const mockCreate = jest.fn();
const mockListSpaces = jest.fn();

jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
    update: jest.fn(),
    listSpaces: mockListSpaces,
    linkTag: jest.fn(),
    linkPerson: jest.fn(),
  }),
}));

jest.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ userId: 'user-test' }),
}));

jest.mock('../../components/overlay/hooks/usePhase8LinksState', () => ({
  usePhase8LinksState: () => ({
    pendingTagIds: [],
    pendingPeople: [],
    clearPendingPeople: jest.fn(),
    clearPendingTags: jest.fn(),
  }),
}));

jest.mock('../../components/overlay/useOverlayPrefill', () => {
  const suggestions = [
    { name: 'journal', confidence: 0.7 },
    { name: 'meeting', confidence: 0.9 },
  ];

  return {
    __esModule: true,
    default: () => ({
      suggestedTitle: null,
      suggestedTags: suggestions.map(({ name, confidence }) => ({
        name,
        lowConfidence: confidence < 0.8,
      })),
      loading: false,
      error: null,
      refresh: jest.fn(),
    }),
  };
});

describe('UnifiedOverlayV2 suggested tags row', () => {
  const baseProps: any = { visible: true, onClose: jest.fn(), mode: 'create' as const };

  beforeAll(() => {
    process.env.EXPO_PUBLIC_FEATURE_OVERLAY_PREFILL = 'on';
  });

  beforeEach(() => {
    mockCreate.mockReset();
    mockListSpaces.mockResolvedValue([]);
  });

  it.skip('renders AI suggestions, toggles tag selection, preserves on type switch, and saves selected tags', async () => {
    const { getByPlaceholderText, getByLabelText, getByRole, getByText } = render(
      <UnifiedOverlayV2 {...baseProps} />,
    );

    const journalChip = await waitFor(() => getByLabelText('#journal'));
    expect(journalChip).toBeTruthy();

    const meetingChip = getByLabelText('#meeting');
    await act(async () => {
      fireEvent.press(meetingChip);
    });

    await waitFor(() => {
      expect(getByLabelText('#meeting')).toBeTruthy();
    });

    const input = getByPlaceholderText('Drop your thought…');
    fireEvent.changeText(input, 'Discuss roadmap with team');

    const todoTab = getByRole('tab', { name: 'To-Do' });
    await act(async () => {
      fireEvent.press(todoTab);
    });

    expect(getByLabelText('#meeting')).toBeTruthy();

    const saveButton = getByText('Save');
    await act(async () => {
      fireEvent.press(saveButton);
    });

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    const payload = mockCreate.mock.calls[0][0];
    expect(payload.tags).toEqual(['meeting']);
  });
});
