import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import './__testutils__/mockUnifiedOverlayDeps';

// Lightweight repo mock
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
    update: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
    listSpaces: jest.fn().mockResolvedValue([{ id: 'space-home', name: 'Home' }]),
  }),
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

import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

const baseProps: any = { visible: true, onClose: jest.fn(), mode: 'create' };

it.skip('details panel collapsed by default, expands to show controls, collapses and preserves state', async () => {
  const { getByText, queryByText, queryByPlaceholderText } = render(
    <UnifiedOverlayV2 {...baseProps} />,
  );

  // Panel collapsed by default
  expect(queryByText('Details')).toBeNull();

  // Expand
  fireEvent.press(getByText('Add details'));
  await waitFor(() => expect(getByText('Details')).toBeTruthy());

  // Controls visible: Reminder button, Space selector label, and format buttons (log default)
  expect(getByText('Add reminder')).toBeTruthy();
  // ScopeSelector renders a chevron; match substring
  expect(getByText(/Unassigned/)).toBeTruthy();
  const plain = getByText('Plain');
  const check = getByText('Checkboxes');
  const bullet = getByText('Bullet');

  // Enter some text so we can assert it persists across collapse/expand
  // Use the placeholder query to get the TextInput
  const textInput = queryByPlaceholderText('Drop your thought…') as any;
  if (textInput) {
    fireEvent.changeText(textInput, 'Persistent note');
  }

  // Collapse
  fireEvent.press(getByText('Hide details'));
  await waitFor(() => expect(queryByText('Details')).toBeNull());

  // Expand again
  fireEvent.press(getByText('Add details'));
  await waitFor(() => expect(getByText('Details')).toBeTruthy());

  // Ensure text persisted after collapsing/expanding
  const textInputAfter = queryByPlaceholderText('Drop your thought…') as any;
  if (textInputAfter) {
    expect(textInputAfter.props.value).toBe('Persistent note');
  }
});
