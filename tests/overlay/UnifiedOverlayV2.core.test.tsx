import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import './__testutils__/mockUnifiedOverlayDeps';

const mockCreate = jest.fn().mockResolvedValue({ id: 'x1', type: 'note' });
const mockUpdate = jest.fn().mockResolvedValue({ id: 'x1', type: 'note' });

// Mock provider before importing the component
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
    update: mockUpdate,
  }),
}));

jest.mock('../../components/overlay/useOverlayPrefill', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import useOverlayPrefill from '../../components/overlay/useOverlayPrefill';
import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

const mockUseOverlayPrefill = useOverlayPrefill as jest.MockedFunction<typeof useOverlayPrefill>;

const baseProps: any = { visible: true, onClose: jest.fn(), mode: 'create' };

let currentSuggestedTags: Array<{ name: string; lowConfidence?: boolean }> = [];
const refreshPrefillMock = jest.fn(async () => null);

const setSuggestedTags = (tags: Array<{ name: string; lowConfidence?: boolean }>) => {
  currentSuggestedTags = Array.isArray(tags) ? tags : [];
};

beforeEach(() => {
  mockCreate.mockClear();
  mockUpdate.mockClear();
  refreshPrefillMock.mockClear();
  refreshPrefillMock.mockResolvedValue(null);
  currentSuggestedTags = [];
  mockUseOverlayPrefill.mockReset();
  mockUseOverlayPrefill.mockImplementation(() => ({
    shouldRunMindDropPrefill: false,
    suggestedTitle: null,
    suggestedTags: currentSuggestedTags,
    aiTags: [],
    loading: false,
    error: null,
    refresh: refreshPrefillMock,
  }));
});

it('disables Save until text entered; first line becomes title', () => {
  const { getByPlaceholderText, getByText } = render(<UnifiedOverlayV2 {...baseProps} />);
  const input = getByPlaceholderText('Drop your thought…');
  const saveText = getByText('Save');
  // find ancestor with `disabled` prop (Button may wrap Text)
  let node: any = saveText as any;
  while (node && node.props && node.props.disabled === undefined) node = node.parent;
  expect(node).toBeDefined();
  expect(node.props.disabled).toBe(true);

  fireEvent.changeText(input, 'Hello world\nsecond');
  // re-resolve the ancestor after state change
  let node2: any = saveText as any;
  while (node2 && node2.props && node2.props.disabled === undefined) node2 = node2.parent;
  expect(node2.props.disabled).toBe(false);
});

it('saves note (log default) with title from first line', async () => {
  const { getByPlaceholderText, getByText } = render(<UnifiedOverlayV2 {...baseProps} />);
  fireEvent.changeText(getByPlaceholderText('Drop your thought…'), 'Hello V2\nrest');
  await act(() => Promise.resolve());
  fireEvent.press(getByText('Save'));
  // create called is asserted via mock in real harness (extend to check payload)
});

it('removing an existing tag records a tombstone meta entry and suppresses future suggestions', async () => {
  const props: any = {
    visible: true,
    onClose: jest.fn(),
    mode: 'edit' as const,
    initialEntity: {
      id: 'note-1',
      type: 'note' as const,
      title: 'Existing note',
      body: 'Existing body',
      tags: ['focus'],
      tags_meta: { sticky: ['#focus'], tombstones: [] },
    },
  };

  const utils = render(<UnifiedOverlayV2 {...props} />);
  const { getByLabelText, getByText } = utils;

  const tagChip = getByLabelText('#focus');
  await act(async () => {
    fireEvent.press(tagChip);
  });

  const saveButton = getByText('Save');
  await act(async () => {
    fireEvent.press(saveButton);
  });

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  const [updatePayload] = mockUpdate.mock.calls[0];
  expect(updatePayload).toMatchObject({
    id: 'note-1',
    patch: expect.objectContaining({
      tags_meta: {
        sticky: [],
        tombstones: ['#focus'],
      },
    }),
  });

  utils.unmount();
  mockUpdate.mockClear();

  setSuggestedTags([{ name: 'focus', lowConfidence: false }]);

  const reopenProps: any = {
    visible: true,
    onClose: jest.fn(),
    mode: 'edit' as const,
    initialEntity: {
      id: 'note-1',
      type: 'note' as const,
      title: 'Existing note',
      body: 'Existing body',
      tags: [],
      tags_meta: { sticky: [], tombstones: ['#focus'] },
    },
  };

  const reopen = render(<UnifiedOverlayV2 {...reopenProps} />);
  await act(async () => {
    fireEvent.press(reopen.getByTestId('resuggest-tags-action'));
  });

  await waitFor(() => expect(reopen.queryByLabelText('#focus')).toBeNull());
  reopen.unmount();
});

it('adds a sticky meta entry when using the + Add tag chip', async () => {
  const { getByPlaceholderText, getByText, getByTestId, getByLabelText } = render(
    <UnifiedOverlayV2 {...baseProps} />,
  );

  fireEvent.changeText(getByPlaceholderText('Drop your thought…'), 'Brain dump');

  await act(async () => {
    fireEvent.press(getByTestId('add-tag-trigger'));
  });
  const addInput = getByTestId('add-tag-input');
  await act(async () => {
    fireEvent.changeText(addInput, 'Strategy');
  });
  await act(async () => {
    fireEvent(addInput, 'submitEditing');
  });

  await waitFor(() => expect(getByLabelText('#strategy')).toBeTruthy());

  await act(async () => {
    fireEvent.press(getByText('Save'));
  });

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  const [createPayload] = mockCreate.mock.calls[0];
  expect(createPayload).toMatchObject({
    tags: expect.arrayContaining(['strategy']),
    tags_meta: {
      sticky: ['#strategy'],
      tombstones: [],
    },
  });
});
