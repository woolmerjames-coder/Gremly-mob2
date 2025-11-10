import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Feature flag for commitments
process.env.EXPO_PUBLIC_FEATURE_COMMITMENTS = 'on';

const mockCreate = jest.fn().mockResolvedValue({ id: 'X' });
let mockCountActiveCommitments: (...args: any[]) => Promise<number> = async () => 0;

jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: (...args: any[]) => mockCreate(...args),
    update: (...args: any[]) => mockCreate(...args),
    listSpaces: jest.fn().mockResolvedValue([]),
    countActiveCommitments: (...args: any[]) => mockCountActiveCommitments(...args),
  }),
}));

// Mock PersonPicker to avoid modal/UI complexity
jest.mock('../../components/overlay/fields/PersonPicker', () => {
  const React = require('react');
  const Comp = () => null;
  return { __esModule: true, default: Comp };
});

import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

beforeEach(() => {
  mockCreate.mockClear();
  // default permissive
  mockCountActiveCommitments = async () => 0;
});

it('enables commitment for a To-Do and sends commitment fields in create payload', async () => {
  const { getByText, getByPlaceholderText } = render(
    <UnifiedOverlayV2 visible mode="create" onClose={jest.fn()} />,
  );

  fireEvent.press(getByText('To-Do'));
  fireEvent.changeText(getByPlaceholderText('Drop your thought…'), 'My todo body');
  fireEvent.press(getByText('Add details'));

  // enable commitment
  fireEvent.press(getByText('Make this a commitment'));

  // wait for the commitment note input to appear
  await waitFor(() =>
    expect(getByPlaceholderText('Why this matters (optional, 140 max)')).toBeTruthy(),
  );
  // type a short note
  const noteInput = getByPlaceholderText('Why this matters (optional, 140 max)');
  fireEvent.changeText(noteInput, 'Because it matters');

  // save
  fireEvent.press(getByText('Save'));

  await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  const payload = mockCreate.mock.calls[0][0];
  expect(payload.type).toBe('todo');
  expect(payload.commitment).toBe(true);
  expect(payload.commitment_note).toBe('Because it matters');
  expect(typeof payload.commitment_started_at).toBe('string');
  expect(!isNaN(Date.parse(payload.commitment_started_at))).toBe(true);
});

it('blocks commitment when soft limit reached (countActiveCommitments returns 3)', async () => {
  // set soft-limit to 3
  mockCountActiveCommitments = async () => 3;
  mockCreate.mockClear();

  const { getByText, getByPlaceholderText } = render(
    <UnifiedOverlayV2 visible mode="create" onClose={jest.fn()} />,
  );

  fireEvent.press(getByText('To-Do'));
  fireEvent.changeText(getByPlaceholderText('Drop your thought…'), 'Another todo');
  fireEvent.press(getByText('Add details'));

  // attempt to enable commitment (should be blocked)
  fireEvent.press(getByText('Make this a commitment'));

  // save
  fireEvent.press(getByText('Save'));

  await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  const payload = mockCreate.mock.calls[0][0];
  expect(payload.type).toBe('todo');
  // when blocked, the payload should not have commitment enabled
  expect(payload.commitment).not.toBe(true);
  expect(payload.commitment_note == null || payload.commitment_note === '').toBeTruthy();
  expect(
    payload.commitment_started_at == null || payload.commitment_started_at === '',
  ).toBeTruthy();
});
