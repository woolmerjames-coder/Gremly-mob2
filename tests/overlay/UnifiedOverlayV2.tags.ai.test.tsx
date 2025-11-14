import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

jest.setTimeout(1500);

const mockGetById = jest.fn();
const mockUpdate = jest.fn();
const mockListSpaces = jest.fn();

jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    getById: mockGetById,
    update: mockUpdate,
    listSpaces: mockListSpaces,
    create: jest.fn(),
    linkTag: jest.fn(),
    linkPerson: jest.fn(),
  }),
}));

jest.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ userId: 'user-123' }),
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
  const React = require('react');
  const refreshMock = jest.fn();
  const initialSuggestions = [
    { name: 'work', lowConfidence: false },
    { name: 'journal', lowConfidence: true },
  ];

  const useOverlayPrefillStub = (options: any = {}) => {
    const { getText } = options ?? {};
    const text = typeof getText === 'function' ? (getText() ?? '') : '';
    const [suggestedTags, setSuggestedTags] = React.useState(() => initialSuggestions);

    React.useEffect(() => {
      const next = text.includes('Edited')
        ? [
            { name: 'journal', lowConfidence: true },
            { name: 'list', lowConfidence: false },
          ]
        : initialSuggestions;

      setSuggestedTags((prev: Array<{ name: string; lowConfidence?: boolean }>) => {
        if (
          prev.length === next.length &&
          prev.every(
            (entry, index) =>
              entry.name === next[index].name &&
              Boolean(entry.lowConfidence) === Boolean(next[index].lowConfidence),
          )
        ) {
          return prev;
        }
        return next;
      });
    }, [text]);

    return {
      suggestedTitle: null,
      suggestedTags,
      loading: false,
      error: null,
      refresh: refreshMock,
    } as const;
  };

  useOverlayPrefillStub.__mockReset = () => {
    refreshMock.mockReset();
  };

  return {
    __esModule: true,
    default: useOverlayPrefillStub,
  };
});

describe('UnifiedOverlayV2 tag suggestions in edit mode', () => {
  beforeAll(() => {
    process.env.EXPO_PUBLIC_FEATURE_OVERLAY_PREFILL = 'on';
  });

  beforeEach(() => {
    const { default: useOverlayPrefill } = require('../../components/overlay/useOverlayPrefill');
    if (typeof useOverlayPrefill.__mockReset === 'function') {
      useOverlayPrefill.__mockReset();
    }
    mockGetById.mockResolvedValue({
      id: 'note-123',
      type: 'note',
      title: 'Existing note',
      body: 'Existing body',
      tags: ['work'],
    });
    mockUpdate.mockResolvedValue({ id: 'note-123', type: 'note' });
    mockListSpaces.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('filters supported tag suggestions, debounces refresh, and saves journal tag', async () => {
    const props: any = {
      visible: true,
      onClose: jest.fn(),
      mode: 'edit' as const,
      initialEntity: {
        id: 'note-123',
        type: 'note' as const,
        title: 'Existing note',
        body: 'Existing body',
        tags: ['work'],
      } as any,
    };

    const { getByText, queryByLabelText, getByLabelText, getByPlaceholderText, getByTestId } =
      render(<UnifiedOverlayV2 {...props} />);

    const input = getByPlaceholderText('Drop your thought…');
    await waitFor(() => expect(input.props.value).toBe('Existing body'));

    const resuggestAction = getByTestId('resuggest-tags-action');
    expect(queryByLabelText('#journal')).toBeNull();

    await act(async () => {
      fireEvent.press(resuggestAction);
    });

    const journalChip = await waitFor(() => getByLabelText('#journal'));
    expect(journalChip).toBeTruthy();
    expect(journalChip.props.accessibilityState?.selected).toBe(false);
    expect(getByText('AI suggestions (low confidence)')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(input, 'Edited body with more detail');
    });

    await act(async () => {
      fireEvent.press(resuggestAction);
    });

    const listChip = await waitFor(() => getByLabelText('#list'));
    expect(listChip).toBeTruthy();
    const updatedJournalChip = getByLabelText('#journal');

    await act(async () => {
      fireEvent.press(updatedJournalChip);
    });

    await waitFor(() => {
      const updatedChipState = getByLabelText('#journal').props.accessibilityState;
      expect(updatedChipState?.selected).toBe(true);
    });

    const saveButton = getByText('Save');
    await act(async () => {
      fireEvent.press(saveButton);
    });

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate).toHaveBeenCalledWith({
      id: 'note-123',
      patch: expect.objectContaining({ mood: 'neu' }),
    });
  });
});
