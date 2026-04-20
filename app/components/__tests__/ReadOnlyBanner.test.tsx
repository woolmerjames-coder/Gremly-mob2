/**
 * Tests for ReadOnlyBanner component.
 *
 * Covers: hidden when not read-only, hidden on paywall route,
 * visible with correct text, navigation on press.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockNavigate = jest.fn();
let mockNavState: { routes: Array<{ name: string }>; index: number } = {
  routes: [{ name: 'Home' }],
  index: 0,
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    getState: () => mockNavState,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    FadeIn: { duration: () => undefined },
    FadeOut: { duration: () => undefined },
  };
});

let mockIsReadOnly = false;
jest.mock('../../../lib/store/lifecycleSelectors', () => ({
  useIsReadOnly: () => mockIsReadOnly,
}));

import { ReadOnlyBanner } from '../ReadOnlyBanner';

beforeEach(() => {
  mockIsReadOnly = false;
  mockNavState = { routes: [{ name: 'Home' }], index: 0 };
  mockNavigate.mockClear();
});

describe('ReadOnlyBanner', () => {
  it('renders nothing when user is NOT read-only', () => {
    mockIsReadOnly = false;
    const { toJSON } = render(<ReadOnlyBanner />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when on TrialEndPaywall route', () => {
    mockIsReadOnly = true;
    mockNavState = { routes: [{ name: 'TrialEndPaywall' }], index: 0 };
    const { toJSON } = render(<ReadOnlyBanner />);
    expect(toJSON()).toBeNull();
  });

  it('renders banner text when read-only and not on paywall', () => {
    mockIsReadOnly = true;
    const { getByText } = render(<ReadOnlyBanner />);
    expect(getByText(/Free access ended/)).toBeTruthy();
  });

  it('navigates to TrialEndPaywall on press', () => {
    mockIsReadOnly = true;
    const { getByLabelText } = render(<ReadOnlyBanner />);
    fireEvent.press(getByLabelText(/Tap to subscribe/));
    expect(mockNavigate).toHaveBeenCalledWith('TrialEndPaywall', { source: 'expiry' });
  });
});
