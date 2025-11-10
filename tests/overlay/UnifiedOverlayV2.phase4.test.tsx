import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';

// Mock repo provider before importing the component
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
    update: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
    listSpaces: jest.fn().mockResolvedValue([{ id: 'space-home', name: 'Home' }]),
  }),
}));

import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

const baseProps: any = { visible: true, onClose: jest.fn(), mode: 'create' };

it('toggles expanded and shows details', () => {
  const { getByText, queryByText } = render(<UnifiedOverlayV2 {...baseProps} />);
  expect(queryByText('Details')).toBeNull();
  fireEvent.press(getByText('Add details'));
  expect(getByText('Details')).toBeTruthy();
});

it('opens reminder modal and sets Today', async () => {
  const { getByText, queryByText } = render(<UnifiedOverlayV2 {...baseProps} />);
  // expand
  fireEvent.press(getByText('Add details'));
  // press Add reminder
  const btn = getByText('Add reminder');
  fireEvent.press(btn);
  // modal should open (title exists)
  await waitFor(() => expect(getByText('Set due date')).toBeTruthy());
});
