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

// Force feature flag ON for this file
jest.mock('@/src/config/featureFlags', () => ({
  __esModule: true,
  MIND_DROP_V2: true,
  whenEnabled: (flag: boolean, on: () => any, off: () => any) => (flag ? on() : off()),
}));

// Import after mocks
import CatchAllNotepad from '../CatchAllNotepad';

describe('CatchAllNotepad flag ON', () => {
  it('renders v2 path (currently legacy UI stub) with testIDs', () => {
    const { getByTestId } = render(<CatchAllNotepad />);
    expect(getByTestId('minddrop-screen')).toBeTruthy();
    expect(getByTestId('minddrop-input')).toBeTruthy();
  });
});
