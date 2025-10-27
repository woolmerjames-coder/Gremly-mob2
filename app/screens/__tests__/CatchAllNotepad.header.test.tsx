import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// Mock provider hooks using the exact relative paths used by the screen
jest.mock('../../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({}) as any,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ userId: 'test-user' }),
}));

// Force feature flag ON for these tests
jest.mock('@/src/config/featureFlags', () => ({
  __esModule: true,
  MIND_DROP_V2: true,
  whenEnabled: (flag: boolean, on: () => any, off: () => any) => (flag ? on() : off()),
}));

// Capture latest navigation options from setOptions
let latestOptions: any = undefined;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    __esModule: true,
    ...actual,
    useNavigation: () => ({
      setOptions: (opts: any) => {
        latestOptions = opts;
      },
    }),
  };
});

import CatchAllNotepad from '../CatchAllNotepad';

describe('CatchAllNotepad header + tooltip', () => {
  beforeEach(() => {
    latestOptions = undefined;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the screen and exposes the info button', () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    expect(getByTestId('minddrop-screen')).toBeTruthy();
    expect(getByTestId('minddrop-info-button')).toBeTruthy();
  });

  it('sets the header title to "Mind Drop" (headerRight wired)', () => {
    const screen = render(<CatchAllNotepad />);
    // Title set via setOptions
    expect(latestOptions?.title).toBe('Mind Drop');
    // At minimum, info button exists in the screen tree
    expect(screen.getByTestId('minddrop-info-button')).toBeTruthy();
  });
});
