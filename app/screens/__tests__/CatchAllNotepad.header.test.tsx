import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('../../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({
    notes: { list: jest.fn(() => Promise.resolve([])) },
    todos: { list: jest.fn(() => Promise.resolve([])) },
    habits: { list: jest.fn(() => Promise.resolve([])) },
    remove: jest.fn(),
    getOrCreateList: jest.fn(),
    addListItem: jest.fn(),
    create: jest.fn(),
    writeEvent: jest.fn(() => Promise.resolve()),
  }),
}));

jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ userId: 'test-user' }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@/src/config/featureFlags', () => ({
  __esModule: true,
  MIND_DROP_V2: true,
  whenEnabled: (flag: boolean, on: () => any, off: () => any) => (flag ? on() : off()),
}));

jest.mock('../../../config/featureFlags', () => ({
  __esModule: true,
  shouldUseHaptics: () => false,
}));

jest.mock('../../../lib/haptics', () => ({
  haptics: {
    submitSuccess: jest.fn(),
    warning: jest.fn(),
  },
}));

// Mock navigation elements (useHeaderHeight)
jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100, // Mock header height
}));

jest.mock(
  '../../design-system/Button',
  () => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');
    return {
      __esModule: true,
      Button: ({ label, onPress, testID }: any) => (
        <Pressable testID={testID} onPress={onPress} accessibilityRole="button">
          <Text>{label}</Text>
        </Pressable>
      ),
    };
  },
  { virtual: true },
);

jest.mock('../../../lib/cortex/router', () => ({
  cortexRoute: jest.fn(() =>
    Promise.resolve({ actions: [], mode: 'keep', suggestions: [], explanation: '', confidence: 0 }),
  ),
}));

jest.mock('../../../src/hooks/useActionToast', () => ({
  __esModule: true,
  useActionToast: () => ({
    showToast: jest.fn(),
    Toast: null,
  }),
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    __esModule: true,
    ...actual,
    useNavigation: () => ({
      setOptions: jest.fn(),
      navigate: mockNavigate,
      canGoBack: () => false,
      goBack: mockGoBack,
    }),
  };
});

import CatchAllNotepad from '../CatchAllNotepad';

describe('CatchAllNotepad header + info sheet', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
  });

  it('renders header title from copy', () => {
    const screen = render(<CatchAllNotepad />);
    expect(screen.getByTestId('minddrop-header')).toBeTruthy();
    expect(screen.getByText('Mind Drop')).toBeTruthy();
  });

  it('opens info sheet when header icon is pressed', () => {
    const screen = render(<CatchAllNotepad />);
    expect(screen.queryByTestId('minddrop-info-sheet')).toBeNull();
    fireEvent.press(screen.getByTestId('minddrop-info-header'));
    expect(screen.getByTestId('minddrop-info-sheet')).toBeTruthy();
  });

  it.skip('invokes navigate when selecting View Recent Drops', async () => {
    const screen = render(<CatchAllNotepad />);

    fireEvent.press(screen.getByTestId('minddrop-info-header'));
    const openRecent = screen.getByTestId('minddrop-info-open-recent');

    fireEvent.press(openRecent);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('minddrop-info-sheet')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Hub',
      params: { filter: 'recent' },
    });
  });
});
