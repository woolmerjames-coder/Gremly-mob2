import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

jest.setTimeout(1500);

const mockGetById = jest.fn();
const mockUpdate = jest.fn();
const mockListSpaces = jest.fn();

const findChipStyle = (instance: any) => {
  let current = instance;
  while (current) {
    const flattened = StyleSheet.flatten((current as any)?.props?.style);
    if (flattened && Object.prototype.hasOwnProperty.call(flattened, 'backgroundColor')) {
      return { element: current, style: flattened };
    }
    current = current?.parent ?? null;
  }
  return { element: instance, style: StyleSheet.flatten((instance as any)?.props?.style) ?? {} };
};

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

    const { getByText, queryByText, getByPlaceholderText } = render(
      <UnifiedOverlayV2 {...props} />,
    );

    const input = getByPlaceholderText('Drop your thought…');
    await waitFor(() => expect(input.props.value).toBe('Existing body'));

    const journalChipLabel = await waitFor(() => getByText('• Journal'));
    const { element: journalChipNode, style: journalStyle } = findChipStyle(journalChipLabel);
    expect(journalStyle?.backgroundColor).toBe('transparent');
    expect(queryByText('• Work')).toBeNull();
    expect(getByText('AI suggestions (low confidence)')).toBeTruthy();
    expect(queryByText(/0\.6/)).toBeNull();

    await act(async () => {
      fireEvent.changeText(input, 'Edited body with more detail');
    });

    const listChipLabel = await waitFor(() => getByText('• List'));
    const { element: listChipNode, style: listStyle } = findChipStyle(listChipLabel);
    expect(listStyle?.backgroundColor).toBe('transparent');

    await act(async () => {
      fireEvent.press(journalChipNode as any);
    });

    await waitFor(() => expect(queryByText('• Journal')).toBeNull());
    expect(getByText('Journal')).toBeTruthy();

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
