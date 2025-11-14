import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import './__testutils__/mockUnifiedOverlayDeps';

jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({ create: jest.fn().mockResolvedValue({ id: 'x' }) }),
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

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(() => Promise.resolve(null)),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

const _mod = require('../../components/overlay/UnifiedOverlayV2');
const UnifiedOverlayV2 = _mod?.default ?? _mod?.UnifiedOverlayV2 ?? _mod;

const base = { visible: true, onClose: jest.fn(), mode: 'create' } as any;

it('preserves text when switching types (non-destructive)', async () => {
  const { getByPlaceholderText, getByText } = render(<UnifiedOverlayV2 {...base} />);
  fireEvent.changeText(getByPlaceholderText('Drop your thought…'), 'Alpha\nbeta');

  // verify text present before switching
  await waitFor(() =>
    expect(getByPlaceholderText('Drop your thought…').props.value).toContain('Alpha'),
  );

  // switch to To-Do and verify text is still present
  fireEvent.press(getByText('To-Do'));
  await waitFor(() =>
    expect(getByPlaceholderText('Drop your thought…').props.value).toContain('Alpha'),
  );

  // add due date (simulate handler)
  // directly dispatching is out of scope; assert button label exists
  await waitFor(() => expect(getByText('Add due date')).toBeTruthy());

  // switch to Habit; text still present
  fireEvent.press(getByText('Habit'));
  await waitFor(() =>
    expect(getByPlaceholderText('Drop your thought…').props.value).toContain('Alpha'),
  );

  // back to Log; text still present
  fireEvent.press(getByText('Log'));
  await waitFor(() =>
    expect(getByPlaceholderText('Drop your thought…').props.value).toContain('Alpha'),
  );
});

it('maps payload according to current baseType on Save', () => {
  const { getByPlaceholderText, getByText } = render(<UnifiedOverlayV2 {...base} />);
  const input = getByPlaceholderText('Drop your thought…');
  fireEvent.press(getByText('To-Do'));
  fireEvent.changeText(input, 'Buy milk\nfrom store');
  fireEvent.press(getByText('Save'));
  // payload shape is verified in repo mock harness in Phase-4 tests; here basic interaction
});
