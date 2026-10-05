/**
 * Choosing Journal in the add overlay's type picker: a new entry is written
 * on the journal page, and an item that already exists is refiled in place.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import '../../tests/overlay/__testutils__/mockUnifiedOverlayDeps';

const mockOpenCreate = jest.fn();

jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
    update: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
    getById: jest.fn().mockResolvedValue(null),
    remove: jest.fn(),
    listSpaces: jest.fn(() => Promise.resolve([])),
    getAll: jest.fn(() => []),
  }),
}));

jest.mock('../../components/overlay/useOverlayPrefill', () => ({
  __esModule: true,
  default: () => ({
    shouldRunMindDropPrefill: false,
    suggestedTitle: null,
    suggestedTags: [],
    aiTags: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    state: { visible: false, mode: 'create', record: null, spaceId: null },
    openCreate: mockOpenCreate,
    openEdit: jest.fn(),
    openView: jest.fn(),
    close: jest.fn(),
  }),
}));

import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

const note = {
  id: 'test-note-123',
  type: 'note' as const,
  title: 'Test Note',
  body: 'Test note body',
  subtype: 'catchall',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  user_id: 'test-user',
  space_id: null,
  tags: [],
};

beforeEach(() => {
  jest.useFakeTimers();
  mockOpenCreate.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('choosing Journal for a new item', () => {
  it('closes the overlay and opens the journal page with the words typed', () => {
    const onClose = jest.fn();
    const { getByTestId, getByText, getByPlaceholderText } = render(
      <UnifiedOverlayV2 visible={true} mode="create" onClose={onClose} />,
    );
    fireEvent.changeText(getByPlaceholderText('Add title...'), 'Tired but pleased');
    fireEvent.press(getByTestId('type-pill'));
    fireEvent.press(getByText('Journal'));
    expect(onClose).toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(mockOpenCreate).toHaveBeenCalledWith({
      type: 'log',
      logSubtype: 'journal',
      initialText: 'Tired but pleased',
    });
  });

  it('opens an empty page when nothing was typed', () => {
    const { getByTestId, getByText } = render(
      <UnifiedOverlayV2 visible={true} mode="create" onClose={jest.fn()} />,
    );
    fireEvent.press(getByTestId('type-pill'));
    fireEvent.press(getByText('Journal'));
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(mockOpenCreate).toHaveBeenCalledWith({
      type: 'log',
      logSubtype: 'journal',
      initialText: null,
    });
  });

  it('stays in the overlay for any other kind', () => {
    const onClose = jest.fn();
    const { getByTestId, getByText, getByLabelText } = render(
      <UnifiedOverlayV2 visible={true} mode="create" onClose={onClose} />,
    );
    fireEvent.press(getByTestId('type-pill'));
    fireEvent.press(getByText('Idea'));
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(mockOpenCreate).not.toHaveBeenCalled();
    expect(getByLabelText('Type: Idea. Tap to change.')).toBeTruthy();
  });
});

describe('choosing Journal for an item that already exists', () => {
  it('refiles it as a journal entry where it is', () => {
    const onClose = jest.fn();
    const { getByTestId, getByText, getByLabelText } = render(
      <UnifiedOverlayV2 visible={true} mode="edit" initialEntity={note} onClose={onClose} />,
    );
    fireEvent.press(getByTestId('type-pill'));
    fireEvent.press(getByText('Journal'));
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(mockOpenCreate).not.toHaveBeenCalled();
    expect(getByLabelText('Type: Journal. Tap to change.')).toBeTruthy();
  });
});
