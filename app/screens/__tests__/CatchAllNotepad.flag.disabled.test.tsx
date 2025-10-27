import React from 'react';
import { render } from '@testing-library/react-native';

// Mock provider hooks using the exact relative paths used by the screen
jest.mock('../../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({}) as any,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ userId: 'test-user' }),
}));

// Force feature flag OFF for this file
jest.mock('@/src/config/featureFlags', () => ({
  __esModule: true,
  MIND_DROP_V2: false,
  whenEnabled: (flag: boolean, on: () => any, off: () => any) => (flag ? on() : off()),
}));

// Mock navigation to avoid requiring a NavigationContainer
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    __esModule: true,
    ...actual,
    useNavigation: () => ({ setOptions: () => {} }),
  };
});

// Import after mocks
import CatchAllNotepad from '../CatchAllNotepad';

describe('CatchAllNotepad flag OFF', () => {
  it('renders legacy UI with testIDs', () => {
    const { getByTestId } = render(<CatchAllNotepad />);
    expect(getByTestId('minddrop-screen')).toBeTruthy();
    expect(getByTestId('minddrop-input')).toBeTruthy();
  });
});
