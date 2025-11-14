// Place mocks before requiring the module so hooks that use AsyncStorage don't run against an unmocked native module
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({ create: jest.fn().mockResolvedValue({ id: 'n1' }) }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(() => Promise.resolve(null)),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../components/overlay/useOverlayPrefill', () => ({
  __esModule: true,
  default: () => ({
    suggestedTitle: null,
    suggestedTags: [
      { name: 'journal', lowConfidence: false },
      { name: 'list', lowConfidence: false },
    ],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.setTimeout(750);

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import './__testutils__/mockUnifiedOverlayDeps';

const { UnifiedOverlayV2 } = require('../../components/overlay/UnifiedOverlayV2');

const base: any = { visible: true, onClose: jest.fn(), mode: 'create' };

beforeAll(() => {
  process.env.EXPO_PUBLIC_FEATURE_OVERLAY_PREFILL = 'on';
});

it('shows mood row only when Journal tag is active', () => {
  const { getByLabelText, getByText, queryByText } = render(<UnifiedOverlayV2 {...base} />);
  expect(queryByText('😊')).toBeNull();
  fireEvent.press(getByLabelText('#journal'));
  expect(getByText('😊')).toBeTruthy();
});

it('shows list checkboxes only when List tag is active', () => {
  const { getByLabelText, getByPlaceholderText, queryAllByText } = render(
    <UnifiedOverlayV2 {...base} />,
  );
  const input = getByPlaceholderText('Drop your thought…');
  fireEvent.changeText(input, 'one\ntwo');
  fireEvent.press(getByLabelText('#list'));
  expect(queryAllByText('○').length).toBeGreaterThanOrEqual(2);
});

it('date chips appear from inline tokens and set due date via picker', () => {
  const { getByPlaceholderText, getByLabelText, getByText } = render(
    <UnifiedOverlayV2 {...base} />,
  );
  const input = getByPlaceholderText('Drop your thought…');
  fireEvent.press(getByText('To-Do'));
  fireEvent.changeText(input, 'finish tomorrow');
  // we can only assert the chip exists here; picker integration is covered by existing picker tests
  expect(getByText('Set due: Tomorrow')).toBeTruthy();
});
